import argparse
import json
import logging
import os
import shutil
import sys
import torch
import requests

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

# --- Configuration ---
BASE_URL = os.getenv("MLOPS_BASE_URL", "https://filecoin.bnshub.org")
MODEL_ENDPOINT = f"{BASE_URL}/mlops/models"

# Hard-coded metadata for MLOps registration
MODEL_NAME = "qwen2.5-lora"
DESCRIPTION = "LoRA fine-tuned Qwen2.5 model for text generation."
PROVIDER = "hugging_face"
TAGS = ["text-generation", "qwen2.5", "lora"]
# LoRA-specific modules to update
LORA_TARGET_MODULES = ["q_proj", "k_proj", "v_proj"]

triton_cache_dir = os.getenv("TRITON_CACHE_DIR", "/tmp/.triton_cache")
os.makedirs(triton_cache_dir, exist_ok=True)
os.environ["TRITON_CACHE_DIR"] = triton_cache_dir

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s'
)
logger = logging.getLogger(__name__)

# --- Argument Parsing ---
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="LoRA Fine-tuning Script with Causal LM"
    )
    parser.add_argument("--data_path", type=str, required=True,
                        help="Path/URI to dataset (HF dataset ID).")
    parser.add_argument("--model_output_dir", type=str, required=True,
                        help="Directory to save LoRA adapter, tokenizer & metrics.")
    parser.add_argument("--base_model_id", type=str, required=True,
                        help="Pretrained model ID from HF Hub.")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--learning_rate", type=float, default=2e-4)
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--gradient_accumulation_steps", type=int, default=1)
    parser.add_argument("--runner_environment", type=str, default="local",
                        choices=["local","huggingface","sagemaker","vertexai"],
                        help="Environment where script runs.")
    parser.add_argument("--load_in_4bit", action="store_true",
                        help="Enable 4-bit quantization.")
    parser.add_argument("--load_in_8bit", action="store_true",
                        help="Enable 8-bit quantization.")
    parser.add_argument("--no_quant", action="store_true",
                        help="Disable quantization.")
    # JSON for overrides
    parser.add_argument("--hyperparameters_json", type=str, default="{}",
                        help="JSON string overriding hyperparameters.")

    parser.add_argument("--lora_r", type=int, default=8,
                        help="LoRA rank.")
    parser.add_argument("--lora_alpha", type=int, default=16,
                        help="LoRA alpha.")
    parser.add_argument("--lora_dropout", type=float, default=0.1,
                        help="LoRA dropout.")

    # Use parse_known_args to ignore any extra flags (like training_script_config_json)
    args, unknown = parser.parse_known_args()
    if unknown:
        logger.warning(f"Ignoring unrecognized arguments: {unknown}")

    # Apply JSON overrides to attributes
    try:
        overrides = json.loads(args.hyperparameters_json)
        for k, v in overrides.items():
            logger.info(f"Overriding {k} from JSON: {v}")
            setattr(args, k, v)
    except json.JSONDecodeError:
        logger.warning("Invalid JSON for hyperparameters_json.")

    if args.load_in_4bit and args.load_in_8bit:
        raise ValueError("Cannot enable both 4-bit and 8-bit quantization.")
    return args

# --- Ensure C Compiler for Quantization ---
def ensure_c_compiler():
    if os.getenv('CC'):
        return
    for exe in ('gcc', 'cc'):
        path = shutil.which(exe)
        if path:
            os.environ['CC'] = path
            return
    logger.error("Quantization requires a C compiler. Install 'gcc' or disable quant.")
    sys.exit(1)

# --- Data Loading & Tokenization ---
def load_and_tokenize(data_path: str, tokenizer, max_len: int) -> DatasetDict:
    ext = data_path.split('.')[-1]
    if ext in ('json','jsonl'):
        ds = load_dataset('json', data_files=data_path, split='train')
    elif ext == 'csv':
        ds = load_dataset('csv', data_files=data_path, split='train')
    else:
        ds = load_dataset(data_path, split='train')
    tok_ds = ds.map(
        lambda ex: tokenizer(ex['text'], truncation=True, max_length=max_len),
        batched=True, remove_columns=ds.column_names
    )
    splits = tok_ds.train_test_split(test_size=0.1, seed=42)
    return DatasetDict({'train': splits['train'], 'validation': splits['test']})

# --- Register Model with MLOps ---
def register_model(dataset_id: str, training_config: dict) -> None:
    payload = {
        'name': MODEL_NAME,
        'description': DESCRIPTION,
        'provider': PROVIDER,
        'base_model': BASE_MODEL_ID,
        'dataset_id': dataset_id,
        'training_config': training_config,
        'tags': TAGS
    }
    try:
        resp = requests.post(MODEL_ENDPOINT, json=payload)
        resp.raise_for_status()
        logger.info(f"Model registered: {resp.json()}")
    except Exception:
        logger.error("Failed to register model with MLOps.", exc_info=True)

# --- Main Entry Point ---
def main() -> None:
    args = parse_args()
    global BASE_MODEL_ID; BASE_MODEL_ID = args.base_model_id

    os.makedirs(args.model_output_dir, exist_ok=True)
    os.environ['TRITON_CACHE_DIR'] = os.path.join(args.model_output_dir, '.triton')

    # Setup quantization
    quant_config = None
    if not args.no_quant and (args.load_in_4bit or args.load_in_8bit):
        ensure_c_compiler()
        q_kwargs = {
            'bnb_4bit_use_double_quant': True,
            'bnb_4bit_quant_type': 'nf4',
            'bnb_4bit_compute_dtype': torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        }
        if args.load_in_4bit:
            q_kwargs['load_in_4bit'] = True
        else:
            q_kwargs['load_in_8bit'] = True
        quant_config = BitsAndBytesConfig(**q_kwargs)

    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token

    # Model Load
    model_kwargs = {'trust_remote_code': True}
    if quant_config:
        model_kwargs['quantization_config'] = quant_config
    model = AutoModelForCausalLM.from_pretrained(BASE_MODEL_ID, **model_kwargs)
    if quant_config:
        model = prepare_model_for_kbit_training(model)

    # LoRA Integration
    lora_cfg = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=LORA_TARGET_MODULES,
        bias="none",
        task_type=TaskType.CAUSAL_LM
    )
    model = get_peft_model(model, lora_cfg)
    model.print_trainable_parameters()

    # Data & Training
    ds = load_and_tokenize(args.data_path, tokenizer, args.max_seq_length)
    data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)
    ta = TrainingArguments(
        output_dir=os.path.join(args.model_output_dir, 'checkpoints'),
        num_train_epochs=args.epochs,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        evaluation_strategy='epoch',
        save_strategy='epoch',
        logging_steps=10,
        optim='paged_adamw_8bit' if quant_config else 'adamw_torch',
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
    metrics = next((
        {k: v for k, v in entry.items() if isinstance(v, (int, float))}
        for entry in reversed(history) if any(k.startswith('eval') for k in entry)
    ), {})
    with open(os.path.join(args.model_output_dir, 'metrics.json'), 'w') as f:
        json.dump(metrics or {'status': 'no eval logs'}, f, indent=4)

    # Register with MLOps
    register_model(dataset_id=args.data_path, training_config=json.loads(args.hyperparameters_json))

if __name__ == '__main__':
    main()