#!/bin/bash
# faststream.sh
# This script starts the dedicated FastStream subscriber process.

echo "Starting FastStream subscriber process..."
faststream run app.task_manager.consumer:message_queue --workers 1
