#!/bin/bash

# Get the current working directory (assumed to be the project root)
CURRENT_DIR=$(pwd)

# Define the directories to add to PYTHONPATH
PROJECT_ROOT="$CURRENT_DIR"
APP_DIR="$CURRENT_DIR/app"


# Check if the APP_DIR exists
if [ ! -d "$APP_DIR" ]; then
  echo "Error: Directory '$APP_DIR' does not exist. Please check your project structure."
  exit 1
fi

# Export PYTHONPATH dynamically so that project root, app, and datapipeline are included
export PYTHONPATH="$PROJECT_ROOT:$APP_DIR:$PYTHONPATH"

# Print the PYTHONPATH for debugging
echo "PYTHONPATH set to: $PYTHONPATH"
