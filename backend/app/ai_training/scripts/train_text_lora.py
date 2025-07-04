# train_text_lora.py
import argparse
import json
import logging
import os
import torch
from datasets import load_dataset, DatasetDict
from transformers import (
    AutoModelForCausalLM, # Or AutoModelForSeq2SeqLM for tasks like summarization
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    DataCollatorForLanguageModeling, # Or DataCollatorForSeq2Seq
)
from peft import (
    LoraConfig,
    get_peft_model,
    prepare_model_for_kbit_training, # For QLoRA with bitsandbytes
    TaskType
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_url", type=str, required=True, help="URL/path to dataset (e.g., JSONL or CSV).")
    parser.add_argument("--output_dir", type=str, required=True, help="Directory to save LoRA adapter & tokenizer.")
    # Model and LoRA Hyperparameters
    parser.add_argument("--base_model_id", type=str, required=True, help="Base LLM ID from Hugging Face Hub.")
    parser.add_argument("--model_task_type", type=str, default="CAUSAL_LM", choices=["CAUSAL_LM", "SEQ_2_SEQ_LM"], help="PEFT TaskType.")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--learning_rate", type=float, default=2e-4)
    parser.add_argument("--batch_size", type=int, default=1, help="Effective batch size (per_device_train_batch_size * gradient_accumulation_steps).")
    parser.add_argument("--gradient_accumulation_steps", type=int, default=4)
    parser.add_argument("--lora_r", type=int, default=8, help="LoRA attention dimension (rank).")
    parser.add_argument("--lora_alpha", type=int, default=16, help="LoRA alpha.")
    parser.add_argument("--lora_dropout", type=float, default=0.05)
    # Comma-separated list of module names to apply LoRA to, e.g., "q_proj,v_proj"
    # If None, PEFT will try to infer target modules for common model types.
    parser.add_argument("--lora_target_modules", type=str, default=None, help="Modules to apply LoRA to (e.g. 'q_proj,v_proj').")
    parser.add_argument("--max_seq_length", type=int, default=512)
    parser.add_argument("--text_column", type=str, default="text", help="Name of the text column for Causal LM.")
    # For Seq2Seq, you might have input_text_column and target_text_column
    parser.add_argument("--load_in_8bit", action="store_true", help="Load base model in 8-bit (requires bitsandbytes).")
    parser.add_argument("--load_in_4bit", action="store_true", help="Load base model in 4-bit (QLoRA, requires bitsandbytes).")
    parser.add_argument("--hyperparameters_json", type=str, default="{}", help="JSON string of additional hyperparameters.")

    args = parser.parse_args()
    additional_hyperparams = json.loads(args.hyperparameters_json)
    for key, value in additional_hyperparams.items(): setattr(args, key, value)
    
    if args.load_in_4bit and args.load_in_8bit:
        raise ValueError("Cannot use both --load_in_4bit and --load_in_8bit. Choose one.")
    return args

def load_and_tokenize_data(data_url, tokenizer, text_column, max_seq_length, task_type):
    logger.info(f"Loading dataset from {data_url}")
    # Similar to text classification, adapt for S3/GCS/Akave or HF datasets
    # This example assumes a single text column for Causal LM.
    # For Seq2Seq, you'd have an input and target text column.
    try:
        if data_url.endswith(".json") or data_url.endswith(".jsonl"):
            dataset = load_dataset("json", data_files=data_url, split="train")
        elif data_url.endswith(".csv"):
            dataset = load_dataset("csv", data_files=data_url, split="train")
        else: # Try to load as HF dataset ID or from local path if no extension
            dataset = load_dataset(data_url, split="train") # Adjust split name if needed
    except Exception as e:
        logger.error(f"Failed to load dataset from {data_url}: {e}", exc_info=True)
        raise

    def tokenize_function_causal(examples):
        # For Causal LM, we just tokenize the text. The labels will be the input_ids shifted.
        return tokenizer(examples[text_column], truncation=True, max_length=max_seq_length, padding=False) # No padding here, collator handles it

    # def tokenize_function_seq2seq(examples):
    #     inputs = tokenizer(examples[input_text_column], truncation=True, max_length=max_seq_length, padding=False)
    #     with tokenizer.as_target_tokenizer(): # Important for T5 style models
    #         labels = tokenizer(examples[target_text_column], truncation=True, max_length=max_seq_length, padding=False)
    #     inputs["labels"] = labels["input_ids"]
    #     return inputs

    if task_type == TaskType.CAUSAL_LM:
        tokenized_dataset = dataset.map(tokenize_function_causal, batched=True, remove_columns=dataset.column_names)
    # elif task_type == TaskType.SEQ_2_SEQ_LM:
    #     tokenized_dataset = dataset.map(tokenize_function_seq2seq, batched=True, remove_columns=dataset.column_names)
    else:
        raise ValueError(f"Unsupported PEFT task type for tokenization: {task_type}")

    # Basic split for validation, can be more sophisticated
    if 'validation' not in tokenized_dataset.column_names and 'test' not in tokenized_dataset.column_names: # Check if already split
        train_test_split_data = tokenized_dataset.train_test_split(test_size=0.1) # Small validation set for fine-tuning
        dataset_dict = DatasetDict({
            'train': train_test_split_data['train'],
            'validation': train_test_split_data['test']
        })
    else: # Assume already split DatasetDict loaded
        dataset_dict = tokenized_dataset

    logger.info(f"Tokenized dataset splits: Train {len(dataset_dict['train'])}, Validation {len(dataset_dict['validation'])}")
    return dataset_dict

def main():
    args = parse_args()
    logger.info(f"Starting LoRA fine-tuning with args: {args}")
    os.makedirs(args.output_dir, exist_ok=True)

    # Tokenizer
    # For Llama and some other models, ensure use_fast=False if the fast version has issues.
    # trust_remote_code=True might be needed for some models.
    tokenizer = AutoTokenizer.from_pretrained(args.base_model_id, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token # Common practice for Causal LMs

    # Determine PEFT TaskType
    peft_task_type = TaskType[args.model_task_type]

    # Load and tokenize data
    tokenized_datasets = load_and_tokenize_data(
        args.data_url, tokenizer, args.text_column, args.max_seq_length, peft_task_type
    )

    # Model loading options (8-bit, 4-bit QLoRA)
    model_kwargs = {"trust_remote_code": True}
    if args.load_in_8bit:
        logger.info("Loading base model in 8-bit mode.")
        model_kwargs["load_in_8bit"] = True
    elif args.load_in_4bit:
        logger.info("Loading base model in 4-bit mode (QLoRA).")
        from transformers import BitsAndBytesConfig
        #bnb_config = BitsAndBytesConfig( # Common QLoRA settings
        #    load_in_4bit=True,
        #    bnb_4bit_use_double_quant=True,
        #    bnb_4bit_quant_type="nf4",
        #    bnb_4bit_compute_dtype=torch.bfloat16 # or torch.float16
        #)
        #model_kwargs["quantization_config"] = bnb_config
        model_kwargs["load_in_4bit"] = True # Simpler for now, specific bnb_config can be added via hyperparams_json

    logger.info(f"Loading base model: {args.base_model_id} with kwargs: {model_kwargs}")
    if peft_task_type == TaskType.CAUSAL_LM:
        model = AutoModelForCausalLM.from_pretrained(args.base_model_id, **model_kwargs)
    # elif peft_task_type == TaskType.SEQ_2_SEQ_LM:
    #    model = AutoModelForSeq2SeqLM.from_pretrained(args.base_model_id, **model_kwargs)
    else:
        raise ValueError(f"Unsupported PEFT task type for model loading: {peft_task_type}")

    if args.load_in_8bit or args.load_in_4bit:
        logger.info("Preparing model for k-bit training (gradient checkpointing, etc.).")
        model = prepare_model_for_kbit_training(model)

    # LoRA Configuration
    lora_target_modules_list = None
    if args.lora_target_modules:
        lora_target_modules_list = [m.strip() for m in args.lora_target_modules.split(",")]
    
    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=lora_target_modules_list, # PEFT can often infer this for common models if None
        bias="none", # Common setting
        task_type=peft_task_type
    )
    logger.info(f"Applying LoRA with config: {lora_config}")
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Data Collator
    if peft_task_type == TaskType.CAUSAL_LM:
        # For Causal LM, labels are input_ids shifted. mlm=False means standard CLM.
        data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)
    # elif peft_task_type == TaskType.SEQ_2_SEQ_LM:
    #     data_collator = DataCollatorForSeq2Seq(tokenizer=tokenizer, model=model)
    else:
        raise ValueError(f"Unsupported PEFT task type for data collator: {peft_task_type}")


    # Training Arguments
    training_args = TrainingArguments(
        output_dir=os.path.join(args.output_dir, "training_checkpoints"),
        num_train_epochs=args.epochs,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size, # This is the actual per-device batch size
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        evaluation_strategy="epoch", # Or steps
        save_strategy="epoch",       # Or steps
        logging_dir=os.path.join(args.output_dir, "training_logs"),
        logging_steps=10,
        # optim="paged_adamw_8bit" if (args.load_in_8bit or args.load_in_4bit) else "adamw_torch", # For QLoRA
        report_to="tensorboard",
        # Other args: warmup_ratio, lr_scheduler_type, etc.
        # For float16/bfloat16 training if supported and desired:
        # fp16=torch.cuda.is_available(), # or bf16=torch.cuda.is_bf16_supported(),
    )

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["validation"],
        tokenizer=tokenizer,
        data_collator=data_collator
    )
    model.config.use_cache = False # Recommended for LoRA training

    # Train
    logger.info("Starting LoRA fine-tuning...")
    trainer.train()

    # Save adapter model (LoRA weights) and tokenizer
    # The main output for LoRA is the adapter_model.bin/safetensors and adapter_config.json
    logger.info(f"Saving LoRA adapter model to: {args.output_dir}")
    # This will save the adapter weights and config to args.output_dir
    # (e.g. /opt/ml/model on SageMaker)
    trainer.save_model(args.output_dir) # PEFT's save_model saves adapter, not full model
    # tokenizer.save_pretrained(args.output_dir) # Already done by trainer.save_model if tokenizer passed

    # Optionally, save full model if needed (can be large)
    # from peft import PeftModel
    # base_model_for_merge = AutoModelForCausalLM.from_pretrained(args.base_model_id, torch_dtype=torch.float16, device_map="auto")
    # merged_model = PeftModel.from_pretrained(base_model_for_merge, args.output_dir)
    # merged_model = merged_model.merge_and_unload() # Merge LoRA weights
    # merged_model.save_pretrained(os.path.join(args.output_dir, "merged_model"))
    # logger.info(f"Full merged model (optional) saved to {args.output_dir}/merged_model")

    logger.info("LoRA fine-tuning complete.")

if __name__ == "__main__":
    # Example local run (conceptual, requires dataset and powerful GPU for LLMs):
    # Assuming a JSONL file at /tmp/dummy_text_data.jsonl with {"text": "some long text..."} entries
    # sys.argv = [
    #    "train_text_lora.py",
    #    "--data_url", "/tmp/dummy_text_data.jsonl",
    #    "--output_dir", "/tmp/lora_output",
    #    "--base_model_id", "EleutherAI/pythia-70m", # Small model for testing
    #    "--epochs", "1",
    #    "--batch_size", "1",
    #    "--gradient_accumulation_steps", "1",
    #    "--lora_r", "4",
    #    "--lora_alpha", "8"
    # ]
    # main()
    logger.warning("This script needs a suitable dataset and often a GPU. The __main__ block is for conceptual testing.")
    pass