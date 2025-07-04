# train_text_classifier.py
import argparse
import json
import logging
import os
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

import torch
from datasets import Dataset, DatasetDict
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    EarlyStoppingCallback
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

def parse_args():
    parser = argparse.ArgumentParser()
    # Paths and URLs
    parser.add_argument("--data_url", type=str, required=True, help="URL/path to the input dataset (e.g., CSV file).")
    parser.add_argument("--output_dir", type=str, required=True, help="Directory to save the trained model and outputs.")
    # Model and Training Hyperparameters (passed via job.hyperparameters)
    parser.add_argument("--base_model_id", type=str, default="distilbert-base-uncased", help="Base model ID from Hugging Face Hub.")
    parser.add_argument("--epochs", type=int, default=3, help="Number of training epochs.")
    parser.add_argument("--learning_rate", type=float, default=5e-5, help="Learning rate.")
    parser.add_argument("--batch_size", type=int, default=16, help="Training batch size.")
    parser.add_argument("--text_column", type=str, default="text", help="Name of the text column in the CSV.")
    parser.add_argument("--label_column", type=str, default="label", help="Name of the label column in the CSV.")
    # For other hyperparameters passed as a JSON string
    parser.add_argument("--hyperparameters_json", type=str, default="{}", help="JSON string of additional hyperparameters.")

    args = parser.parse_args()

    # Update args with hyperparameters_json
    # This allows flexible passing of any other hyperparams defined in the AITrainingJob
    additional_hyperparams = json.loads(args.hyperparameters_json)
    for key, value in additional_hyperparams.items():
        setattr(args, key, value) # Add them to the args namespace
    return args

def load_and_preprocess_data(data_url, text_column, label_column, tokenizer, test_size=0.2):
    logger.info(f"Loading data from: {data_url}")
    # This is a simplified loader. In reality, handle S3/GCS/Akave URIs.
    # For example, if data_url is S3, use s3fs or boto3 to download, then pd.read_csv.
    # If using HF datasets, it can often load directly from s3:// or http://
    try:
        if data_url.startswith("s3://") or data_url.startswith("gs://") or data_url.startswith("http"):
            # Using HF datasets to load common formats. Assumes public or presigned URL for HTTP.
            # For private S3/GCS with HF datasets, env vars for credentials (AWS_ACCESS_KEY_ID, etc.)
            # or gcloud auth application-default login would be needed in the environment.
            raw_dataset = Dataset.from_csv(data_url)
        else: # Assume local path
            raw_dataset = Dataset.from_csv(data_url)
    except Exception as e:
        logger.error(f"Failed to load data from {data_url}: {e}")
        # Fallback for simple local CSV if HF datasets fails for local path
        if os.path.exists(data_url):
            df = pd.read_csv(data_url)
            raw_dataset = Dataset.from_pandas(df)
        else:
            raise

    # Assuming labels are integers or can be converted. For string labels:
    unique_labels = sorted(list(set(raw_dataset[label_column])))
    label2id = {label: i for i, label in enumerate(unique_labels)}
    id2label = {i: label for i, label in enumerate(unique_labels)}
    num_labels = len(unique_labels)

    logger.info(f"Found labels: {unique_labels}, num_labels: {num_labels}")
    logger.info(f"Label2id mapping: {label2id}")

    def preprocess_function(examples):
        tokenized_inputs = tokenizer(examples[text_column], truncation=True, padding="max_length", max_length=512)
        # Convert labels to numerical IDs
        tokenized_inputs["label"] = [label2id[label] for label in examples[label_column]]
        return tokenized_inputs

    processed_dataset = raw_dataset.map(preprocess_function, batched=True, remove_columns=raw_dataset.column_names)
    
    # Split data
    train_test_split_data = processed_dataset.train_test_split(test_size=test_size, stratify_by_column="label")
    dataset_dict = DatasetDict({
        'train': train_test_split_data['train'],
        'validation': train_test_split_data['test']
    })
    
    logger.info(f"Dataset splits: Train {len(dataset_dict['train'])}, Validation {len(dataset_dict['validation'])}")
    return dataset_dict, num_labels, label2id, id2label

def compute_metrics(pred):
    labels = pred.label_ids
    preds = pred.predictions.argmax(-1)
    precision, recall, f1, _ = precision_recall_fscore_support(labels, preds, average='weighted', zero_division=0)
    acc = accuracy_score(labels, preds)
    return {
        'accuracy': acc,
        'f1': f1,
        'precision': precision,
        'recall': recall
    }

def main():
    args = parse_args()
    logger.info(f"Starting text classification training with args: {args}")

    # Ensure output directory exists
    os.makedirs(args.output_dir, exist_ok=True)

    # Load tokenizer and model
    logger.info(f"Loading tokenizer and model from: {args.base_model_id}")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model_id)
    
    # Data loading and preprocessing
    # The tokenizer is needed here if labels are derived from data (which they often are)
    # But if num_labels is fixed, it can be passed. Here, derived from data.
    tokenized_datasets, num_labels, label2id, id2label = load_and_preprocess_data(
        args.data_url, args.text_column, args.label_column, tokenizer
    )

    model = AutoModelForSequenceClassification.from_pretrained(
        args.base_model_id,
        num_labels=num_labels,
        label2id=label2id,
        id2label=id2label
    )

    # Training arguments
    # On SageMaker, args.output_dir might be /opt/ml/model
    # Checkpoints will go into a subdirectory of output_dir
    training_args = TrainingArguments(
        output_dir=os.path.join(args.output_dir, "training_checkpoints"),
        num_train_epochs=args.epochs,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1", # Or accuracy
        logging_dir=os.path.join(args.output_dir, "training_logs"),
        logging_steps=10, # Log more frequently
        report_to="tensorboard", # or "wandb" if configured
        # Add other arguments as needed, e.g., weight_decay, warmup_steps
    )

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["validation"],
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)] # Example callback
    )

    # Train
    logger.info("Starting training...")
    trainer.train()

    # Evaluate
    logger.info("Evaluating model...")
    eval_results = trainer.evaluate()
    logger.info(f"Evaluation results: {eval_results}")

    # Save model, tokenizer, and config
    # This typically saves to args.output_dir (e.g., /opt/ml/model on SageMaker)
    # The platform (SageMaker/Vertex) then zips this directory for output.
    logger.info(f"Saving model and tokenizer to: {args.output_dir}")
    trainer.save_model(args.output_dir) # Saves model, tokenizer, training_args, etc.
    # tokenizer.save_pretrained(args.output_dir) # Already done by trainer.save_model

    with open(os.path.join(args.output_dir, "eval_results.json"), "w") as f:
        json.dump(eval_results, f)

    logger.info("Training complete.")

if __name__ == "__main__":
    main()