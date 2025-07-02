# train_image_classifier.py
import argparse
import json
import logging
import os
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import transforms
from torch.utils.data import DataLoader
from datasets import load_dataset # For loading from imagefolder or hub

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

# Consider timm for a wide variety of models
try:
    import timm
except ImportError:
    logger.warning("timm library not found. Please install it for diverse image models.")
    timm = None




def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_url", type=str, required=True, help="URL/path to the dataset (e.g., path to image folder, or HF dataset ID).")
    parser.add_argument("--output_dir", type=str, required=True, help="Directory to save the model.")
    parser.add_argument("--base_model_id", type=str, default="resnet18", help="Base model ID (e.g., from timm or torchvision).")
    parser.add_argument("--num_classes", type=int, required=True, help="Number of classes.") # Must be known for image classification
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--learning_rate", type=float, default=1e-3)
    parser.add_argument("--batch_size", type=int, default=32)
    parser.add_argument("--image_size", type=int, default=224)
    parser.add_argument("--hyperparameters_json", type=str, default="{}", help="JSON string of additional hyperparameters.")
    args = parser.parse_args()
    additional_hyperparams = json.loads(args.hyperparameters_json)
    for key, value in additional_hyperparams.items(): setattr(args, key, value)
    return args

def get_dataloaders(data_url, image_size, batch_size):
    logger.info(f"Loading image data from: {data_url} with image_size: {image_size}")

    # Define transforms
    # These are typical transforms, can be adjusted
    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(image_size),
        transforms.RandomHorizontalFlip(),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    val_transform = transforms.Compose([
        transforms.Resize(image_size + 32), # image_size * 256 // 224
        transforms.CenterCrop(image_size),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    # Load dataset using Hugging Face datasets library
    # It supports "imagefolder" type for local directories structured as class/image.jpg
    # It can also load from S3 if the URL is s3:// and permissions are set
    # For a custom dataset (e.g. CSV with image paths and labels), you'd implement a custom torch.utils.data.Dataset
    try:
        # Example: data_url = "s3://my-bucket/my-image-dataset/" (if structured as imagefolder)
        # Example: data_url = "/path/to/local_image_folder/"
        # Example: data_url = "hf_user/hf_image_dataset_name"
        if "://" in data_url or os.path.isdir(data_url) or "/" in data_url and not data_url.endswith(".csv"): # Heuristic for imagefolder/HF dataset ID
            logger.info(f"Attempting to load as imagefolder or HF Hub dataset: {data_url}")
            # dataset = load_dataset("imagefolder", data_dir=data_url, split=['train', 'validation']) # For local/S3 imagefolder
            # For this example, assuming 'train' and 'validation' splits are available.
            # This is a simplification. Real data prep might be more complex.
            # Using a dummy structure for now for the skeleton to run conceptually.
            # In a real scenario, ensure data_url points to a valid dataset structure.
            # This part needs robust implementation based on actual data format.
            logger.warning("Dataloader part is highly conceptual. Replace with actual data loading for your image dataset format.")
            # Conceptual: if data_url is a directory, use ImageFolder from torchvision.datasets directly.
            from torchvision.datasets import ImageFolder # Example if data_url is a local path to imagefolder
            if os.path.isdir(data_url): # Simplistic check
                 # Assume data_url has 'train' and 'val' subdirectories
                train_dataset_raw = ImageFolder(root=os.path.join(data_url, "train"), transform=train_transform)
                val_dataset_raw = ImageFolder(root=os.path.join(data_url, "val"), transform=val_transform)
                num_classes_detected = len(train_dataset_raw.classes)
                logger.info(f"Detected {num_classes_detected} classes from ImageFolder.")
            else: # Placeholder if not a local dir, HF datasets logic for remote/hub would be more complex
                raise NotImplementedError(f"Data loading for {data_url} needs specific implementation. This is a placeholder.")

        else: # Assume CSV, custom logic needed
            raise NotImplementedError("CSV-based image dataset loading needs custom torch.utils.data.Dataset.")

        train_loader = DataLoader(train_dataset_raw, batch_size=batch_size, shuffle=True, num_workers=4)
        val_loader = DataLoader(val_dataset_raw, batch_size=batch_size, shuffle=False, num_workers=4)
        
        return train_loader, val_loader, num_classes_detected # Return detected num_classes

    except Exception as e:
        logger.error(f"Error loading dataset: {e}", exc_info=True)
        raise

def main():
    args = parse_args()
    logger.info(f"Starting image classification training: {args}")
    os.makedirs(args.output_dir, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Using device: {device}")

    train_loader, val_loader, num_classes_from_data = get_dataloaders(args.data_url, args.image_size, args.batch_size)
    
    if args.num_classes != num_classes_from_data:
        logger.warning(f"Provided num_classes ({args.num_classes}) differs from detected ({num_classes_from_data}). Using detected.")
        actual_num_classes = num_classes_from_data
    else:
        actual_num_classes = args.num_classes

    # Load model
    logger.info(f"Loading model: {args.base_model_id} for {actual_num_classes} classes.")
    if timm:
        model = timm.create_model(args.base_model_id, pretrained=True, num_classes=actual_num_classes)
    else: # Fallback to a simple torchvision model if timm not available
        from torchvision import models
        if args.base_model_id == "resnet18":
            model = models.resnet18(pretrained=True)
            model.fc = nn.Linear(model.fc.in_features, actual_num_classes)
        else:
            raise ValueError(f"Model {args.base_model_id} not supported without timm or specific torchvision handling.")
    model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=args.learning_rate)
    # scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=7, gamma=0.1) # Example scheduler

    # Training loop
    for epoch in range(args.epochs):
        model.train()
        running_loss = 0.0
        for i, (inputs, labels) in enumerate(train_loader):
            inputs, labels = inputs.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()
            if i % 100 == 99: # Log every 100 mini-batches
                logger.info(f"[Epoch {epoch+1}, Batch {i+1}] loss: {running_loss / 100:.3f}")
                running_loss = 0.0
        # scheduler.step()

        # Validation loop
        model.eval()
        correct = 0
        total = 0
        val_loss = 0.0
        with torch.no_grad():
            for inputs, labels in val_loader:
                inputs, labels = inputs.to(device), labels.to(device)
                outputs = model(inputs)
                loss = criterion(outputs, labels)
                val_loss += loss.item()
                _, predicted = torch.max(outputs.data, 1)
                total += labels.size(0)
                correct += (predicted == labels).sum().item()
        accuracy = 100 * correct / total
        avg_val_loss = val_loss / len(val_loader)
        logger.info(f"Epoch {epoch+1} Validation Accuracy: {accuracy:.2f}%, Avg Val Loss: {avg_val_loss:.3f}")

    # Save model
    # On SageMaker, this saves to /opt/ml/model/model.pth
    # On Vertex, this saves to a GCS path that gets packaged.
    model_save_path = os.path.join(args.output_dir, "model.pth")
    torch.save(model.state_dict(), model_save_path)
    logger.info(f"Model saved to {model_save_path}")
    
    # Save class mapping if available (from ImageFolder)
    if hasattr(train_loader.dataset, 'classes'):
        class_to_idx = train_loader.dataset.class_to_idx
        with open(os.path.join(args.output_dir, "class_to_idx.json"), "w") as f:
            json.dump(class_to_idx, f)
        logger.info(f"Saved class_to_idx mapping to {args.output_dir}/class_to_idx.json")


    logger.info("Image classification training complete.")

if __name__ == "__main__":
    # Example of how to run locally (replace with actual paths/params):
    # Create dummy data for local test:
    # mkdir -p /tmp/dummy_images/train/class_a /tmp/dummy_images/train/class_b
    # mkdir -p /tmp/dummy_images/val/class_a /tmp/dummy_images/val/class_b
    # touch /tmp/dummy_images/train/class_a/img1.jpg /tmp/dummy_images/train/class_b/img2.jpg
    # touch /tmp/dummy_images/val/class_a/img3.jpg /tmp/dummy_images/val/class_b/img4.jpg
    # (Actual images needed for transforms to work)

    # For a real local run, you'd need actual image files in the dummy folders.
    # The following is a conceptual command.
    # sys.argv = [
    #    "train_image_classifier.py",
    #    "--data_url", "/tmp/dummy_images_for_test_structure", # Path to 'train' and 'val' subdirs
    #    "--output_dir", "/tmp/img_output",
    #    "--base_model_id", "resnet18", # or a timm model if installed
    #    "--num_classes", "2", # This should match classes in dummy_images
    #    "--epochs", "1",
    #    "--batch_size", "1" # Small for dummy data
    # ]
    # main()
    logger.warning("This script needs actual image data to run. The __main__ block is for conceptual testing.")
    pass