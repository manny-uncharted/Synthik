import argparse
import json
import logging
import os
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_recall_fscore_support
import sys 

import torch
from datasets import Dataset, DatasetDict, load_from_disk
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    EarlyStoppingCallback
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s_%(process)d - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)] 
)
logger = logging.getLogger(__name__)

def is_sagemaker_environment():
    return "SM_MODEL_DIR" in os.environ

def is_vertex_ai_environment():
    """Checks if the script is running in a Vertex AI training environment."""
    return "AIP_MODEL_DIR" in os.environ  # AIP_JOB_ID is also a good indicator

def parse_json_string_if_needed(value: str) -> Any:
    """Tries to parse a string as JSON, otherwise returns the original string."""
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return value

def parse_hyperparameters_from_dict(raw_hyperparameters: dict) -> dict:
    """
    Parses hyperparameters where values might be strings that need type conversion.
    Especially useful for HPs coming from environments like SageMaker or Vertex AI (via CLI).
    """
    parsed_hp = {}
    for key, value_str in raw_hyperparameters.items():
        # Attempt to parse as JSON (handles dicts, lists, explicit bools/numbers in JSON string format)
        try:
            val = json.loads(value_str)
            parsed_hp[key] = val
            continue # Successfully parsed as JSON
        except (json.JSONDecodeError, TypeError):
            pass # Not a JSON string, try other conversions

        # Try common type conversions for simple string values
        if isinstance(value_str, str): # Ensure it's a string before lowercasing etc.
            if value_str.lower() == 'true':
                parsed_hp[key] = True
            elif value_str.lower() == 'false':
                parsed_hp[key] = False
            else:
                try:
                    parsed_hp[key] = int(value_str)
                except ValueError:
                    try:
                        parsed_hp[key] = float(value_str)
                    except ValueError:
                        parsed_hp[key] = value_str # Keep as string if no other parse works
        else: # If not a string initially (e.g. already parsed by argparse from JSON)
            parsed_hp[key] = value_str
    return parsed_hp


def parse_args():
    parser = argparse.ArgumentParser(description="Text Classification Training Script")
    
    # These arguments are always defined, but their 'required' status and defaults change by environment.
    parser.add_argument("--data-input-dir", type=str, help="Directory containing input data or GCS URI.")
    parser.add_argument("--model-output-dir", type=str, help="Directory to save the trained model and outputs.")
    parser.add_argument("--hyperparameters", type=str, help="JSON string of hyperparameters.") # Always passed as string from runners
    parser.add_argument("--training-script-config", type=str, help="JSON string of training script specific configurations.") # Always passed as string

    args = parser.parse_args()
    
    # Override paths and parse configs based on environment
    if is_vertex_ai_environment():
        logger.info("Vertex AI environment detected. Overriding paths and parsing configs.")
        args.data_input_dir = os.environ.get('AIP_TRAINING_DATA_URI', args.data_input_dir) # If set by pre-built container
        args.model_output_dir = os.environ.get('AIP_MODEL_DIR', args.model_output_dir) # Should be used by script to save model
        # Checkpoint dir might also be AIP_CHECKPOINT_DIR

        # Hyperparameters and training_script_config are passed as direct CLI args by vertex_ai_runner
        # The string values from CLI need parsing.
        args.hyperparameters = parse_json_string_if_needed(args.hyperparameters)
        args.training_script_config = parse_json_string_if_needed(args.training_script_config)

        # Ensure they are dicts after parsing
        if not isinstance(args.hyperparameters, dict):
            raise ValueError(f"Failed to parse --hyperparameters JSON string in Vertex AI. Got: {args.hyperparameters}")
        if not isinstance(args.training_script_config, dict):
            raise ValueError(f"Failed to parse --training-script-config JSON string in Vertex AI. Got: {args.training_script_config}")
        
        # Further parse individual hyperparameter values if they were stringified within the main JSON
        args.hyperparameters = parse_hyperparameters_from_dict(args.hyperparameters)


    elif is_sagemaker_environment():
        logger.info("SageMaker environment detected. Overriding paths and parsing configs.")
        args.data_input_dir = os.environ.get('SM_CHANNEL_TRAINING', '/opt/ml/input/data/training')
        args.model_output_dir = os.environ.get('SM_MODEL_DIR', '/opt/ml/model')
        
        sagemaker_hps_from_env = {k.replace('SM_HP_', '').lower(): v for k, v in os.environ.items() if k.startswith('SM_HP_')}
        args.hyperparameters = parse_hyperparameters_from_dict(sagemaker_hps_from_env)
        
        if 'TRAINING_SCRIPT_CONFIG_JSON' in os.environ: # Preferred for SageMaker
            args.training_script_config = json.loads(os.environ['TRAINING_SCRIPT_CONFIG_JSON'])
        elif '_training_script_config_json' in args.hyperparameters: # Fallback (check key casing)
            cfg_json_str = args.hyperparameters.pop('_training_script_config_json')
            args.training_script_config = json.loads(cfg_json_str) if isinstance(cfg_json_str, str) else cfg_json_str
        else:
            args.training_script_config = {}
        args.hyperparameters.pop('_platform_job_id', None) # Clean up internal HP

    else: # Local execution mode
        logger.info("Local environment detected. Parsing JSON string arguments.")
        args.hyperparameters = json.loads(args.hyperparameters)
        args.training_script_config = json.loads(args.training_script_config)
        # Further parse individual hyperparameter values
        args.hyperparameters = parse_hyperparameters_from_dict(args.hyperparameters)

    # Sanity check required paths
    if not args.data_input_dir:
        raise ValueError("--data-input-dir not set or found in environment.")
    if not args.model_output_dir:
        raise ValueError("--model-output-dir not set or found in environment.")

    logger.info(f"Effective data_input_dir: {args.data_input_dir}")
    logger.info(f"Effective model_output_dir: {args.model_output_dir}")
    logger.info(f"Effective Hyperparameters: {args.hyperparameters}")
    logger.info(f"Effective Training Script Config: {args.training_script_config}")
    
    return args

# --- load_and_preprocess_data, compute_metrics, main (largely same as before) ---
# Key change in main(): Ensure checkpoint_dir logic works with AIP_CHECKPOINT_DIR if set.
# The script already saves outputs to args.model_output_dir, which will be AIP_MODEL_DIR in Vertex.
# The `load_and_preprocess_data` function needs to handle GCS URIs for `data_input_dir`.
# Hugging Face `datasets` library can often load directly from `gs://` paths if `gcsfs` is installed.

def load_and_preprocess_data(data_input_dir: str, text_column: str, label_column: str, tokenizer, test_size=0.2, seed=42):
    logger.info(f"Loading data from: {data_input_dir}")
    
    # If data_input_dir is a GCS URI, HuggingFace datasets can load it if gcsfs is installed.
    # For Vertex AI, AIP_TRAINING_DATA_URI will be a GCS path.
    # If using pre-built containers, they often handle downloading GCS data to a local path first.
    # If our container/script needs to read directly from GCS:
    load_path = data_input_dir
    if data_input_dir.startswith("gs://"):
        try:
            import gcsfs # Check if available
            logger.info("gcsfs available. Will attempt direct load from GCS URI.")
        except ImportError:
            logger.error("gcsfs not installed. Cannot directly load from GCS URI. Script will likely fail if data is not localized by Vertex AI.")
            # In many Vertex pre-built containers, data from GCS URIs specified in CustomJob
            # is often copied to a local directory on the VM first. The path to this local directory
            # is then exposed via an environment variable like `AIP_DATA_<CHANNEL_NAME>_PATH`.
            # If using such a setup, data_input_dir should point to that local path.
            # Our current runner passes the GCS URI directly as data_input_dir.
            # This implies the training script OR the container it runs in must handle GCS.
            # If HF datasets fails, this indicates an issue.
            pass # Let load_dataset attempt it.

    try:
        # Try loading as HF dataset (works for GCS URIs if gcsfs installed, or local paths)
        logger.info(f"Attempting to load dataset using load_from_disk or direct load for: {load_path}")
        if os.path.isdir(load_path) or (load_path.startswith("gs://") and not load_path.endswith((".csv",".json",".jsonl",".txt"))): # Heuristic for saved HF dataset dir
            raw_dataset_hf = load_from_disk(load_path)
        elif load_path.endswith(".csv"):
            raw_dataset_hf = Dataset.from_csv(load_path)
        elif load_path.endswith((".json", ".jsonl")):
             raw_dataset_hf = Dataset.from_json(load_path)
        else: # General path, let datasets try to infer
            raw_dataset_hf = Dataset.load_from_file(load_path) # Or some other load_dataset variant

        if isinstance(raw_dataset_hf, DatasetDict):
            if 'train' in raw_dataset_hf: raw_dataset_hf = raw_dataset_hf['train']
            else: raw_dataset_hf = raw_dataset_hf[list(raw_dataset_hf.keys())[0]]
        logger.info(f"Successfully loaded dataset. Features: {raw_dataset_hf.features}")

    except Exception as e_load:
        logger.error(f"Failed to load dataset from {load_path}: {e_load}", exc_info=True)
        raise

    # ... (rest of label mapping and preprocessing logic from Part 4.2, it should be fine) ...
    if text_column not in raw_dataset_hf.column_names:
        raise ValueError(f"Text column '{text_column}' not found in dataset. Available columns: {raw_dataset_hf.column_names}")
    if label_column not in raw_dataset_hf.column_names:
        raise ValueError(f"Label column '{label_column}' not found in dataset. Available columns: {raw_dataset_hf.column_names}")

    if isinstance(raw_dataset_hf[0][label_column], str):
        unique_labels = sorted(list(set(raw_dataset_hf[label_column])))
        label2id = {label: i for i, label in enumerate(unique_labels)}
        id2label = {i: label for i, label in enumerate(unique_labels)}
        def map_labels_to_ids(example): example[label_column] = label2id[example[label_column]]; return example
        raw_dataset_hf = raw_dataset_hf.map(map_labels_to_ids)
    else:
        unique_labels_ids = sorted(list(set(raw_dataset_hf[label_column])))
        id2label = {i: f"LABEL_{i}" for i in unique_labels_ids} # Consider passing label map for better names
        label2id = {v: k for k,v in id2label.items()}
    num_labels = len(id2label)
    logger.info(f"Number of unique labels: {num_labels}; Label2id: {label2id}")

    def preprocess_function(examples):
        tokenized_inputs = tokenizer(examples[text_column], truncation=True, padding=False, max_length=tokenizer.model_max_length if hasattr(tokenizer, 'model_max_length') else 512)
        tokenized_inputs["label"] = examples[label_column]
        return tokenized_inputs
    processed_dataset = raw_dataset_hf.map(preprocess_function, batched=True, remove_columns=raw_dataset_hf.column_names)
    
    # Split data
    # If the input was a DatasetDict (e.g. from load_from_disk of a dict), it might already be split.
    if 'train' in processed_dataset.column_names and 'validation' in processed_dataset.column_names : 
        # This check is a bit off, Dataset objects don't have splits as columns.
        # This would be true if `processed_dataset` was already a DatasetDict.
        # Let's assume `processed_dataset` here is a single Dataset that needs splitting.
        pass # This needs re-evaluation if `load_from_disk` returns a dict.
             # For now, assume it's one dataset needing split.

    # Correct splitting logic if `processed_dataset` is a single HuggingFace Dataset
    # If `load_from_disk` returned a DatasetDict, and we selected one split, we might not have 'validation'.
    # The data prep should ideally provide distinct train/eval sets if available.
    # For now, simple split:
    if len(processed_dataset) > 1 : # Ensure there's enough data to split
        train_test_split_data = processed_dataset.train_test_split(test_size=test_size, seed=seed, stratify_by_column="label" if "label" in processed_dataset.features and len(set(processed_dataset['label'])) > 1 else None)
        dataset_dict = DatasetDict({'train': train_test_split_data['train'], 'validation': train_test_split_data['test']})
    else: # Not enough data to split, use the whole dataset for both (not ideal for real training)
        logger.warning("Dataset too small to split. Using the same data for train and validation.")
        dataset_dict = DatasetDict({'train': processed_dataset, 'validation': processed_dataset})

    logger.info(f"Dataset splits: Train {len(dataset_dict['train'])}, Validation {len(dataset_dict['validation'])}")
    return dataset_dict, num_labels, label2id, id2label

def compute_metrics(pred):
    labels = pred.label_ids
    preds = pred.predictions.argmax(-1)
    precision, recall, f1, _ = precision_recall_fscore_support(labels, preds, average='weighted', zero_division=0)
    acc = accuracy_score(labels, preds)
    return {'accuracy': acc, 'f1': f1, 'precision': precision, 'recall': recall}

def main():
    args = parse_args()
    env_type = "Vertex AI" if is_vertex_ai_environment() else "SageMaker" if is_sagemaker_environment() else "Local"
    logger.info(f"Starting text classification training. Environment: {env_type}")

    os.makedirs(args.model_output_dir, exist_ok=True)
    logger.info(f"Model output directory: {args.model_output_dir}")
    if is_vertex_ai_environment() and os.environ.get('AIP_CHECKPOINT_DIR'):
        logger.info(f"Vertex AI Checkpoint directory: {os.environ['AIP_CHECKPOINT_DIR']}")
        # Trainer's output_dir (for checkpoints) could be set to AIP_CHECKPOINT_DIR
        # but HF Trainer saves final model to output_dir too.
        # SageMaker also has SM_CHECKPOINT_DIR.
        # For simplicity, let HF Trainer manage checkpoints within its own output_dir,
        # which is a subdir of args.model_output_dir. Platform will then save args.model_output_dir.

    base_model_id = args.training_script_config.get("base_model_id", "distilbert-base-uncased")
    text_column = args.training_script_config.get("text_column", "text")
    label_column = args.training_script_config.get("label_column", "label")
    
    epochs = int(args.hyperparameters.get("epochs", 3))
    learning_rate = float(args.hyperparameters.get("learning_rate", 5e-5))
    batch_size = int(args.hyperparameters.get("batch_size", 16))
    early_stopping_patience = int(args.hyperparameters.get("early_stopping_patience", 3))
    seed = int(args.hyperparameters.get("seed", 42))

    logger.info(f"Hyperparameters: epochs={epochs}, lr={learning_rate}, batch_size={batch_size}, seed={seed}")
    logger.info(f"Script Config: base_model_id='{base_model_id}', text_col='{text_column}', label_col='{label_column}'")

    tokenizer = AutoTokenizer.from_pretrained(base_model_id)
    tokenized_datasets, num_labels, label2id, id2label = load_and_preprocess_data(
        args.data_input_dir, text_column, label_column, tokenizer, seed=seed
    )
    model = AutoModelForSequenceClassification.from_pretrained(
        base_model_id, num_labels=num_labels, label2id=label2id, id2label=id2label
    )

    training_checkpoint_dir = os.path.join(args.model_output_dir, "training_checkpoints")
    training_logs_dir = os.path.join(args.model_output_dir, "training_logs")

    training_args_dict = {
        "output_dir": training_checkpoint_dir, 
        "num_train_epochs": epochs, "learning_rate": learning_rate,
        "per_device_train_batch_size": batch_size, "per_device_eval_batch_size": batch_size,
        "evaluation_strategy": "epoch", "save_strategy": "epoch",
        "load_best_model_at_end": True, "metric_for_best_model": "f1",
        "logging_dir": training_logs_dir, 
        "logging_steps": max(1, int(len(tokenized_datasets["train"]) / (batch_size * 10))), # Adjust if dataset small
        "report_to": "tensorboard", "save_total_limit": 2, "seed": seed,
        "fp16": torch.cuda.is_available(),
    }
    training_args = TrainingArguments(**training_args_dict)

    trainer = Trainer(
        model=model, args=training_args,
        train_dataset=tokenized_datasets["train"], eval_dataset=tokenized_datasets["validation"],
        tokenizer=tokenizer, compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=early_stopping_patience)]
    )

    logger.info("Starting training...")
    train_result = trainer.train()
    logger.info(f"Training finished. Train Output: {train_result}")
    final_train_metrics = train_result.metrics
    logger.info(f"Final Training Metrics: {final_train_metrics}")

    logger.info("Evaluating model on validation set...")
    eval_results = trainer.evaluate(eval_dataset=tokenized_datasets["validation"])
    logger.info(f"Final Evaluation results: {eval_results}")

    all_metrics = {**final_train_metrics, **{"eval_"+k: v for k,v in eval_results.items()}}
    
    metrics_output_path = os.path.join(args.model_output_dir, "training_metrics.json")
    with open(metrics_output_path, "w") as f: json.dump(all_metrics, f, indent=4)
    logger.info(f"All metrics saved to: {metrics_output_path}")

    logger.info(f"Saving best model and tokenizer to: {args.model_output_dir}")
    trainer.save_model(args.model_output_dir) 

    logger.info("Text classification training script completed successfully.")


if __name__ == "__main__":
    try:
        main()
        logger.info("Script finished successfully, exiting with code 0.")
        sys.exit(0)
    except FileNotFoundError as fnf_e: logger.error(f"File Not Found Error: {fnf_e}", exc_info=False); sys.exit(2)
    except ValueError as val_e: logger.error(f"Value Error / Configuration Error: {val_e}", exc_info=False); sys.exit(3)
    except Exception as e: logger.error(f"Unhandled exception in training script: {e}", exc_info=True); sys.exit(1)