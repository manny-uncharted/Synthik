import argparse
import json
import logging
import os
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

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s'
)
logger = logging.getLogger(__name__)

BASE_URL = os.getenv(
    "MLOPS_BASE_URL", "https://filecoin.bnshub.org"
)
MODEL_ENDPOINT = f"{BASE_URL}/mlops/models"

# --- Argument Parsing ---
def parse_args():
    parser = argparse.ArgumentParser(description="LoRA Fine-tuning Script")

    # Core Paths
    parser.add_argument(
        "--data_path",
        type=str,
        required=True,
        help="URL/path to dataset (e.g., JSONL, CSV, S3/GCS URI, or HF dataset ID)."
    )
    parser.add_argument(
        "--model_output_dir",
        type=str,
        required=True,
        help="Directory to save LoRA adapter, tokenizer & metrics."
    )

    # Model and Task Configuration
    parser.add_argument(
        "--base_model_id",
        type=str,
        required=True,
        help="Base LLM ID from Hugging Face Hub."
    )
    parser.add_argument(
        "--model_task_type",
        type=str,
        default="CAUSAL_LM",
        choices=["CAUSAL_LM", "SEQ_2_SEQ_LM"],
        help="PEFT TaskType."
    )
    parser.add_argument(
        "--max_seq_length",
        type=int,
        default=512
    )
    parser.add_argument(
        "--text_column",
        type=str,
        default="text",
        help="Name of the text column for Causal LM."
    )

    # Training Hyperparameters
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--learning_rate", type=float, default=2e-4)
    parser.add_argument(
        "--batch_size",
        type=int,
        default=1,
        help="Per device train batch size."
    )
    parser.add_argument(
        "--gradient_accumulation_steps",
        type=int,
        default=4
    )
    parser.add_argument(
        "--optim",
        type=str,
        default=None,
        help="Optimizer (e.g., adamw_torch, paged_adamw_8bit). Defaults based on quantization."
    )

    # LoRA Specific Hyperparameters
    parser.add_argument(
        "--lora_r",
        type=int,
        default=8,
        help="LoRA attention dimension (rank)."
    )
    parser.add_argument(
        "--lora_alpha",
        type=int,
        default=16,
        help="LoRA alpha."
    )
    parser.add_argument(
        "--lora_dropout",
        type=float,
        default=0.05
    )
    parser.add_argument(
        "--lora_target_modules",
        type=str,
        default=None,
        help="Modules to apply LoRA to (e.g. 'q_proj,v_proj'). PEFT infers if None."
    )

    # Quantization
    parser.add_argument(
        "--load_in_8bit",
        action="store_true",
        help="Load base model in 8-bit (requires bitsandbytes)."
    )
    parser.add_argument(
        "--load_in_4bit",
        action="store_true",
        help="Load base model in 4-bit (QLoRA, requires bitsandbytes)."
    )

    # Configuration via JSON
    parser.add_argument(
        "--hyperparameters_json",
        type=str,
        default="{}",
        help="JSON string of additional hyperparameters. Overrides individual args if keys match."
    )
    parser.add_argument(
        "--training_script_config_json",
        type=str,
        default="{}",
        help="JSON string of training script configurations. Overrides individual args if keys match."
    )

    # ADD THIS ARGUMENT DEFINITION:
    parser.add_argument(
        "--runner_environment",
        type=str,
        default="huggingface",  # Default to 'local' if not specified
        choices=["local", "huggingface", "sagemaker", "vertexai"], # Add other environments as needed
        help="Specifies the environment where the script is being run (e.g., for conditional logic)."
    )

    args = parser.parse_args()

    # Apply JSON configurations
    additional_hyperparams = json.loads(args.hyperparameters_json)
    for key, value in additional_hyperparams.items():
        logger.info(f"Setting arg '{key}' from hyperparameters_json: {value}")
        setattr(args, key, value)

    script_configs = json.loads(args.training_script_config_json)
    for key, value in script_configs.items():
        logger.info(f"Setting arg '{key}' from training_script_config_json: {value}")
        setattr(args, key, value)

    if args.load_in_4bit and args.load_in_8bit:
        logger.error("Cannot use both --load_in_4bit and --load_in_8bit. Choose one.")
        raise ValueError("Cannot use both --load_in_4bit and --load_in_8bit.")
    return args

# --- Data Loading and Tokenization ---
def load_and_tokenize_data(data_path, tokenizer, text_column, max_seq_length, model_task_type_str):
    logger.info(f"Loading dataset from: {data_path}")
    try:
        if data_path.endswith(".json") or data_path.endswith(".jsonl"):
            dataset = load_dataset("json", data_files=data_path, split="train")
        elif data_path.endswith(".csv"):
            dataset = load_dataset("csv", data_files=data_path, split="train")
        else:
            dataset = load_dataset(data_path, split="train")
    except Exception as e:
        logger.error(f"Failed to load dataset from {data_path}: {e}", exc_info=True)
        raise  # Re-raise the exception to halt execution if dataset loading fails

    # Ensure tokenizer and max_seq_length are accessible for the map function
    # These variables are effectively captured by the closure of the inner function.
    # No need to redefine tokenize_function_causal here, it's defined globally or passed.

    current_task_type = TaskType[model_task_type_str] # Convert string to PEFT Enum

    def tokenize_function_causal_local(examples): # Renamed to avoid conflict if global exists
        return tokenizer(examples[text_column], truncation=True, max_length=max_seq_length, padding=False)

    if current_task_type == TaskType.CAUSAL_LM:
        tokenized_dataset = dataset.map(
            tokenize_function_causal_local, # Use the locally defined version
            batched=True,
            remove_columns=dataset.column_names
        )
    # Add elif for SEQ_2_SEQ_LM if needed, with its own tokenize function
    # elif current_task_type == TaskType.SEQ_2_SEQ_LM:
    #     def tokenize_function_seq2seq_local(examples):
    #         # ... (Seq2Seq tokenization logic)
    #         pass
    #     tokenized_dataset = dataset.map(tokenize_function_seq2seq_local, ...)
    else:
        raise ValueError(f"Unsupported PEFT task type for tokenization: {current_task_type}")

    # Handle dataset splitting for validation
    if isinstance(tokenized_dataset, DatasetDict) and ('validation' in tokenized_dataset or 'test' in tokenized_dataset):
        dataset_dict = tokenized_dataset
        if 'validation' not in dataset_dict and 'test' in dataset_dict :
            dataset_dict['validation'] = dataset_dict['test'] # Use test as validation if val is missing
            logger.info("Using 'test' split as validation set.")
        elif 'validation' not in dataset_dict: # Neither validation nor test exists, must split from train
             logger.warning("No 'validation' or 'test' split found. Splitting from 'train'.")
             if len(tokenized_dataset['train']) < 2:
                dataset_dict['validation'] = tokenized_dataset['train'].select(range(min(1, len(tokenized_dataset['train']))))
                logger.warning("Training set too small for a split, using training set as validation set.")
             else:
                train_test_split_data = tokenized_dataset['train'].train_test_split(test_size=0.1, seed=42)
                dataset_dict['train'] = train_test_split_data['train']
                dataset_dict['validation'] = train_test_split_data['test']

    elif not isinstance(tokenized_dataset, DatasetDict): # It's a single dataset object
        if len(tokenized_dataset) < 2:
            dataset_dict = DatasetDict({
                'train': tokenized_dataset,
                'validation': tokenized_dataset.select(range(min(1, len(tokenized_dataset))))
            })
            logger.warning("Dataset too small for a split, using the full dataset for both train and validation.")
        else:
            train_test_split_data = tokenized_dataset.train_test_split(test_size=0.1, seed=42)
            dataset_dict = DatasetDict({
                'train': train_test_split_data['train'],
                'validation': train_test_split_data['test']
            })
    else: # It's a DatasetDict but doesn't satisfy above conditions (e.g. has train but no val/test)
        dataset_dict = tokenized_dataset # Keep as is and let trainer handle it or log warning
        if 'train' in dataset_dict and 'validation' not in dataset_dict:
            logger.warning("DatasetDict has 'train' but no 'validation' split. Trainer might use train for eval or error.")
            # You could force a split here if desired:
            # if len(dataset_dict['train']) > 1:
            #     split_output = dataset_dict['train'].train_test_split(test_size=0.1, seed=42)
            #     dataset_dict['train'] = split_output['train']
            #     dataset_dict['validation'] = split_output['test']
            # else:
            #     dataset_dict['validation'] = dataset_dict['train'] # fallback

    if 'train' not in dataset_dict:
        raise ValueError("No 'train' split found in the processed dataset.")
    if 'validation' not in dataset_dict: # Ensure validation exists, even if it's a copy of train for small sets
        logger.warning("No 'validation' split available after processing. Using 'train' split for validation.")
        dataset_dict['validation'] = dataset_dict['train']


    logger.info(f"Tokenized dataset splits: Train {len(dataset_dict['train'])}, Validation {len(dataset_dict['validation'])}")
    return dataset_dict

def register_model(
    model_name: str,
    description: str,
    provider: str,
    base_model: str,
    dataset_id: str,
    dataset_rows: int,
    training_config: dict,
    tags: list,
    metrics: dict,
    env: str
) -> None:
    payload = {
        'name': model_name,
        'description': description,
        'provider': provider,
        'base_model': base_model,
        'dataset_id': dataset_id,
        'training_config': training_config,
        'tags': tags or [],
        'metrics': metrics,
        'dataset_rows': dataset_rows,
        'environment': env
    }
    try:
        resp = requests.post(MODEL_ENDPOINT, json=payload)
        resp.raise_for_status()
        logger.info(f"Model registered: {resp.json()}")
    except Exception as e:
        logger.error("Failed to register model", exc_info=e)


# --- Main Training Logic ---
def main():
    args = parse_args()
    logger.info(f"Starting LoRA fine-tuning with resolved args: {args}")

    os.makedirs(args.model_output_dir, exist_ok=True)

    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.base_model_id, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        logger.info("Set tokenizer.pad_token to tokenizer.eos_token")

    peft_task_type = TaskType[args.model_task_type] # Convert string to PEFT Enum

    # Data
    tokenized_datasets = load_and_tokenize_data(
        args.data_path,
        tokenizer,
        args.text_column,
        args.max_seq_length,
        args.model_task_type # Pass the string version
    )

    # Model Kwargs & Quantization
    model_kwargs = {"trust_remote_code": True}
    bnb_config_params_for_logging = {} # For logging effective bnb config

    if args.load_in_4bit:
        logger.info("Loading base model in 4-bit mode (QLoRA).")
        bnb_params = {
            "load_in_4bit": True,
            "bnb_4bit_use_double_quant": getattr(args, 'bnb_4bit_use_double_quant', True),
            "bnb_4bit_quant_type": getattr(args, 'bnb_4bit_quant_type', "nf4"),
        }
        bnb_4bit_compute_dtype_str = getattr(args, 'bnb_4bit_compute_dtype', "bfloat16")
        dtype_map = {"bfloat16": torch.bfloat16, "float16": torch.float16, "float32": torch.float32}
        compute_dtype = dtype_map.get(bnb_4bit_compute_dtype_str.lower())

        if compute_dtype is None:
            logger.warning(f"Invalid bnb_4bit_compute_dtype '{bnb_4bit_compute_dtype_str}'. Defaulting to bfloat16.")
            compute_dtype = torch.bfloat16

        if compute_dtype == torch.bfloat16 and not torch.cuda.is_bf16_supported():
            logger.warning("bfloat16 is not supported on this GPU. Falling back to float16 for QLoRA compute_dtype.")
            bnb_params["bnb_4bit_compute_dtype"] = torch.float16
        else:
            bnb_params["bnb_4bit_compute_dtype"] = compute_dtype

        bnb_config_params_for_logging = bnb_params.copy() # Log this version
        logger.info(f"Using BitsAndBytesConfig: {bnb_config_params_for_logging}")
        model_kwargs["quantization_config"] = BitsAndBytesConfig(**bnb_params)

    elif args.load_in_8bit:
        logger.info("Loading base model in 8-bit mode.")
        model_kwargs["load_in_8bit"] = True

    # Load Model
    logger.info(f"Loading base model: {args.base_model_id} with kwargs: {model_kwargs}")
    if peft_task_type == TaskType.CAUSAL_LM:
        model = AutoModelForCausalLM.from_pretrained(args.base_model_id, **model_kwargs)
    # Add elif for SEQ_2_SEQ_LM if needed:
    # elif peft_task_type == TaskType.SEQ_2_SEQ_LM:
    #     model = AutoModelForSeq2SeqLM.from_pretrained(args.base_model_id, **model_kwargs)
    else:
        raise ValueError(f"Unsupported PEFT task type for model loading: {peft_task_type}")

    if args.load_in_8bit or args.load_in_4bit:
        logger.info("Preparing model for k-bit training.")
        model = prepare_model_for_kbit_training(model)

    # LoRA Configuration
    lora_target_modules_list = None
    if args.lora_target_modules:
        lora_target_modules_list = [m.strip() for m in args.lora_target_modules.split(",")]

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=lora_target_modules_list,
        bias="none",
        task_type=peft_task_type
    )
    logger.info(f"Applying LoRA with config: {lora_config}")
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Data Collator
    if peft_task_type == TaskType.CAUSAL_LM:
        data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)
    # Add elif for SEQ_2_SEQ_LM if needed
    else:
        raise ValueError(f"Unsupported PEFT task type for data collator: {peft_task_type}")

    # Optimizer
    effective_optim = args.optim
    if effective_optim is None: # Default optimizer logic
        if args.load_in_8bit or args.load_in_4bit:
            effective_optim = "paged_adamw_8bit" # QLoRA default
        else:
            effective_optim = "adamw_torch"
    logger.info(f"Using optimizer: {effective_optim}")

    # Training Arguments
    training_args_dict = {
        "output_dir": os.path.join(args.model_output_dir, "training_checkpoints"),
        "num_train_epochs": args.epochs,
        "learning_rate": args.learning_rate,
        "per_device_train_batch_size": args.batch_size,
        "per_device_eval_batch_size": args.batch_size, # Typically same as train for eval
        "gradient_accumulation_steps": args.gradient_accumulation_steps,
        "evaluation_strategy": "epoch",
        "save_strategy": "epoch",
        "logging_dir": os.path.join(args.model_output_dir, "training_logs"),
        "logging_steps": getattr(args, 'logging_steps', 10), # Allow override from JSON
        "optim": effective_optim,
        "report_to": getattr(args, 'report_to', "tensorboard"), # Allow override
        "remove_unused_columns": True,
    }

    # Handle fp16/bf16 based on args or QLoRA config
    use_fp16 = getattr(args, 'fp16', False)
    use_bf16 = getattr(args, 'bf16', False)

    if args.load_in_4bit and model_kwargs.get("quantization_config"):
        q_config = model_kwargs["quantization_config"]
        if q_config.bnb_4bit_compute_dtype == torch.bfloat16:
            use_bf16 = True
            logger.info("Setting TrainingArguments.bf16 = True based on QLoRA compute_dtype.")
        elif q_config.bnb_4bit_compute_dtype == torch.float16:
            use_fp16 = True
            logger.info("Setting TrainingArguments.fp16 = True based on QLoRA compute_dtype.")

    if use_fp16 and use_bf16:
        logger.warning("Both fp16 and bf16 are set. bf16 will take precedence if supported, else fp16.")
        if torch.cuda.is_bf16_supported():
            training_args_dict["bf16"] = True
            training_args_dict["fp16"] = False
        elif torch.cuda.is_available():
            training_args_dict["fp16"] = True
            training_args_dict["bf16"] = False
    elif use_bf16:
        training_args_dict["bf16"] = torch.cuda.is_bf16_supported()
        if not training_args_dict["bf16"]:
            logger.warning("bf16 requested but not supported. Training in fp32 or fp16 if available.")
    elif use_fp16:
        training_args_dict["fp16"] = torch.cuda.is_available()
        if not training_args_dict["fp16"]:
            logger.warning("fp16 requested but not supported/available. Training in fp32.")


    training_args = TrainingArguments(**training_args_dict)

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["validation"],
        tokenizer=tokenizer,
        data_collator=data_collator
    )
    if hasattr(model, 'config') and hasattr(model.config, 'use_cache'):
      model.config.use_cache = False # Recommended for LoRA

    # Train
    logger.info("Starting LoRA fine-tuning...")
    trainer.train()
    logger.info("LoRA fine-tuning complete.")

    # Save Model
    logger.info(f"Saving LoRA adapter model to: {args.model_output_dir}")
    # This saves the adapter model and tokenizer to the root of model_output_dir
    trainer.save_model(args.model_output_dir)

    # Save Metrics
    final_metrics_to_save = {}
    if trainer.state.log_history:
        # Try to find the last evaluation log
        for log_entry in reversed(trainer.state.log_history):
            if any(key.startswith("eval_") for key in log_entry):
                final_metrics_to_save = {k: v for k, v in log_entry.items() if isinstance(v, (int, float, str, bool))}
                break
        # If no eval logs, use the last training log
        if not final_metrics_to_save and trainer.state.log_history:
            final_metrics_to_save = {k: v for k, v in trainer.state.log_history[-1].items() if isinstance(v, (int, float, str, bool))}
    else:
        logger.warning("trainer.state.log_history is empty. No detailed metrics to save.")

    if final_metrics_to_save:
        metrics_output_path = os.path.join(args.model_output_dir, "training_metrics.json")
        try:
            with open(metrics_output_path, "w") as f:
                json.dump(final_metrics_to_save, f, indent=4)
            logger.info(f"Saved training metrics to {metrics_output_path}: {final_metrics_to_save}")
        except Exception as e:
            logger.error(f"Failed to save training metrics: {e}", exc_info=True)
    else:
        # Create an empty metrics file if runners expect it
        metrics_output_path = os.path.join(args.model_output_dir, "training_metrics.json")
        try:
            with open(metrics_output_path, "w") as f:
                json.dump({"status": "No metrics logged by trainer"}, f, indent=4)
            logger.info(f"Saved empty/status metrics file to {metrics_output_path}")
        except Exception as e:
            logger.error(f"Failed to save empty/status metrics file: {e}", exc_info=True)

    # Register model with MLOps
    register_model(
        model_name=args.model_name,
        description="Text generation model fine-tuned on a custom dataset.",
        model_uri=args.model_output_dir,
        metrics=metrics,
        env=args.runner_environment,
        dataset_id=args.data_path,
        dataset_rows=len(ds['train']),
        training_config=args.hyperparameters,
        tags=args.tags,
        base_model=args.base_model_id,
        provider="hugging_face",
    )


    logger.info("Script finished.")

# --- Example Local Run ---
if __name__ == "__main__":
    try:
        main()
        logger.info(f"--- Example Local Run Completed. Check output in /tmp/lora_output_example ---")
    except Exception as e:
        logger.error(f"--- Example Local Run Failed: {e} ---", exc_info=True)