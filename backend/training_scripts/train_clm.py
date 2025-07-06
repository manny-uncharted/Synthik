import argparse
import json
import logging
import os
import sys
import shutil
import torch

from datasets import load_dataset, DatasetDict
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    DataCollatorForLanguageModeling,
    BitsAndBytesConfig
)
from peft import (
    LoraConfig,
    get_peft_model,
    prepare_model_for_kbit_training,
    TaskType
)

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s'
)
logger = logging.getLogger(__name__)

# --- Argument Parsing ---
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="LoRA Fine-tuning Script with Causal LM")

    # Core Paths
    parser.add_argument(
        "--data_path", type=str, required=True,
        help="Path/URI to dataset (CSV/JSONL or HF dataset ID)."
    )
    parser.add_argument(
        "--model_output_dir", type=str, required=True,
        help="Directory to save LoRA adapter, tokenizer & metrics."
    )

    # Model
    parser.add_argument(
        "--base_model_id", type=str, required=True,
        help="Pretrained model ID from HF Hub."
    )
    parser.add_argument(
        "--model_task_type", type=str, default="CAUSAL_LM",
        choices=["CAUSAL_LM","SEQ_2_SEQ_LM"],
        help="PEFT TaskType."
    )
    parser.add_argument(
        "--runner_environment", type=str, default="local",
        choices=["local","huggingface","sagemaker","vertexai"],
        help="Environment where script runs."
    )

    # Sequence & Text
    parser.add_argument("--text_column", type=str, default="text",
                        help="Name of text column.")
    parser.add_argument("--max_seq_length", type=int, default=512)

    # Training Hyperparams
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--learning_rate", type=float, default=2e-4)
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--gradient_accumulation_steps", type=int, default=1)
    parser.add_argument("--optim", type=str, default=None,
                        help="Optimizer override.")

    # LoRA Hyperparams
    parser.add_argument("--lora_r", type=int, default=8)
    parser.add_argument("--lora_alpha", type=int, default=16)
    parser.add_argument("--lora_dropout", type=float, default=0.05)
    parser.add_argument("--lora_target_modules", type=str, required=True,
                        help="Comma-separated module names to apply LoRA (e.g., 'q_proj,k_proj').")

    # Quantization Flags
    parser.add_argument("--load_in_8bit", action="store_true",
                        help="Enable 8-bit quantization via bitsandbytes.")
    parser.add_argument("--load_in_4bit", action="store_true",
                        help="Enable 4-bit quantization via bitsandbytes.")
    parser.add_argument("--no_quant", action="store_true",
                        help="Disable bitsandbytes quantization/backends.")

    # JSON Overrides
    parser.add_argument("--hyperparameters_json", type=str, default="{}",
                        help="JSON string overriding hyperparams.")
    parser.add_argument("--training_script_config_json", type=str, default="{}",
                        help="JSON string overriding script configs.")

    args = parser.parse_args()
    # Apply JSON overrides
    for cfg, attr in [(args.hyperparameters_json, 'hyperparameters'),
                      (args.training_script_config_json, 'script_config')]:
        try:
            overrides = json.loads(cfg)
            for k, v in overrides.items():
                logger.info(f"Overriding {k} from JSON: {v}")
                setattr(args, k, v)
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON for {attr}: {cfg}")

    if args.load_in_4bit and args.load_in_8bit:
        raise ValueError("Cannot enable both 4-bit and 8-bit quantization.")
    return args

# --- Utility to ensure C compiler ---
def ensure_c_compiler():
    """
    Ensure a C compiler is available or specified via CC.
    """
    if os.getenv('CC'):
        logger.info(f"Using C compiler from CC: {os.getenv('CC')}")
        return
    for exe in ('gcc', 'cc'):
        path = shutil.which(exe)
        if path:
            os.environ['CC'] = path
            logger.info(f"Auto-configured CC to '{path}'")
            return
    logger.error(
        "No C compiler found. Quantization requires a C compiler. "
        "Install 'gcc' or disable quantization with --no_quant."
    )
    sys.exit(1)

# --- Data Loading & Tokenization ---
def load_and_tokenize(
    data_path: str,
    tokenizer,
    text_col: str,
    max_len: int,
    task_str: str
) -> DatasetDict:
    logger.info(f"Loading dataset from {data_path}")
    ext = data_path.split('.')[-1]
    if ext in ('json','jsonl'):
        ds = load_dataset('json', data_files=data_path, split='train')
    elif ext == 'csv':
        ds = load_dataset('csv', data_files=data_path, split='train')
    else:
        ds = load_dataset(data_path, split='train')

    task = TaskType[task_str]
    def tokenize_causal(examples):
        return tokenizer(
            examples[text_col], truncation=True,
            max_length=max_len
        )
    if task == TaskType.CAUSAL_LM:
        tok_ds = ds.map(
            tokenize_causal,
            batched=True,
            remove_columns=ds.column_names
        )
    else:
        raise ValueError(f"Unsupported task: {task}")

    if 'validation' not in tok_ds:
        splits = tok_ds.train_test_split(test_size=0.1, seed=42)
        ds_dict = DatasetDict({
            'train': splits['train'],
            'validation': splits['test']
        })
    else:
        ds_dict = DatasetDict(tok_ds)

    logger.info(
        f"Dataset sizes: train={len(ds_dict['train'])}, val={len(ds_dict['validation'])}"
    )
    return ds_dict

# --- Main ---
def main() -> None:
    args = parse_args()
    logger.info(f"Starting LoRA fine-tuning (env={args.runner_environment})")
    os.makedirs(args.model_output_dir, exist_ok=True)
    os.environ['TRITON_CACHE_DIR'] = os.path.join(args.model_output_dir, 'triton_cache')

    # Quantization config
    quant_config = None
    if not args.no_quant:
        if args.load_in_4bit or args.load_in_8bit:
            ensure_c_compiler()
            quant_kwargs = {
                'bnb_4bit_use_double_quant': True,
                'bnb_4bit_quant_type': 'nf4',
                'bnb_4bit_compute_dtype': (
                    torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
                )
            }
            if args.load_in_4bit:
                quant_kwargs['load_in_4bit'] = True
            else:
                quant_kwargs['load_in_8bit'] = True
            quant_config = BitsAndBytesConfig(**quant_kwargs)
        else:
            logger.info("Quantization disabled; neither --load_in_4bit nor --load_in_8bit set.")
    else:
        logger.info("Quantization disabled via --no_quant.")

    # Tokenizer
    try:
        tokenizer = AutoTokenizer.from_pretrained(
            args.base_model_id, trust_remote_code=True
        )
    except ValueError as e:
        logger.warning(f"Fast tokenizer error: {e}. Retrying without fast.")
        tokenizer = AutoTokenizer.from_pretrained(
            args.base_model_id, trust_remote_code=True, use_fast=False
        )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Model Load
    model_kwargs = {'trust_remote_code': True}
    if quant_config:
        model_kwargs['quantization_config'] = quant_config
    try:
        model = AutoModelForCausalLM.from_pretrained(
            args.base_model_id, **model_kwargs
        )
    except Exception as e:
        logger.warning(f"Quantized load failed: {e}. Retrying without quant.")
        model = AutoModelForCausalLM.from_pretrained(
            args.base_model_id, trust_remote_code=True
        )

    if quant_config:
        model = prepare_model_for_kbit_training(model)

    # LoRA setup
    target_modules = [m.strip() for m in args.lora_target_modules.split(',')]
    lora_cfg = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=target_modules,
        bias="none",
        task_type=TaskType[args.model_task_type]
    )
    model = get_peft_model(model, lora_cfg)
    model.print_trainable_parameters()

    # Data
    ds = load_and_tokenize(
        args.data_path, tokenizer, args.text_column,
        args.max_seq_length, args.model_task_type
    )
    data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    # Optimizer
    optim_name = args.optim or ('paged_adamw_8bit' if quant_config else 'adamw_torch')
    logger.info(f"Using optimizer: {optim_name}")

    # Training arguments
    ta = TrainingArguments(
        output_dir=os.path.join(args.model_output_dir, 'checkpoints'),
        num_train_epochs=args.epochs,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        evaluation_strategy='epoch',
        save_strategy='epoch',
        logging_dir=os.path.join(args.model_output_dir, 'logs'),
        logging_steps=10,
        optim=optim_name,
        fp16=torch.cuda.is_available(),
        bf16=torch.cuda.is_bf16_supported(),
        report_to='tensorboard'
    )
    trainer = Trainer(
        model=model,
        args=ta,
        train_dataset=ds['train'],
        eval_dataset=ds['validation'],
        tokenizer=tokenizer,
        data_collator=data_collator
    )
    model.config.use_cache = False

    trainer.train()
    trainer.save_model(args.model_output_dir)

    # Metrics
    history = trainer.state.log_history
    metrics = {}
    for entry in reversed(history):
        if any(k.startswith('eval') for k in entry):
            metrics = {k: v for k, v in entry.items() if isinstance(v, (int, float))}
            break
    metrics_path = os.path.join(args.model_output_dir, 'metrics.json')
    with open(metrics_path, 'w') as f:
        json.dump(metrics or {'status': 'no eval logs'}, f, indent=4)
    logger.info(f"Metrics saved to {metrics_path}")

if __name__ == '__main__':
    main()
