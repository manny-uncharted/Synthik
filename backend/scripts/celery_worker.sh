#!/bin/bash
# start_celery_worker.sh
# This script starts one or more Celery workers for your application.
# You can specify the number of worker instances and the concurrency per worker.
#
# Usage: ./start_celery_worker.sh [-c concurrency] [-w workers]
#   -c    Set the number of concurrent processes per worker (default: 2)
#   -w    Set the number of worker instances to start (default: 1)

# Set default values
CONCURRENCY=2
WORKERS=1

# Parse command-line options
while getopts "c:w:" opt; do
  case $opt in
    c)
      CONCURRENCY="$OPTARG"
      ;;
    w)
      WORKERS="$OPTARG"
      ;;
    *)
      echo "Usage: $0 [-c concurrency] [-w workers]"
      exit 1
      ;;
  esac
done

echo "Starting $WORKERS Celery worker(s) with concurrency set to $CONCURRENCY..."

# Start the specified number of workers
for (( i=1; i<=WORKERS; i++ )); do
    WORKER_NAME="celery_worker${i}@%h"
    echo "Starting worker: $WORKER_NAME"
    celery -A app.task_manager.celery worker -n "$WORKER_NAME" --concurrency="$CONCURRENCY" --loglevel=info &
done

# Wait for all background workers to finish (they run until terminated)
wait
