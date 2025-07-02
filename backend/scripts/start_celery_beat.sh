#!/bin/bash
# start_celery_beat.sh
# This script starts the Celery beat scheduler for your application.
# You can specify the logging level and a custom schedule file.
#
# Usage: ./start_celery_beat.sh [-l loglevel] [-s schedule_file]
#   -l    Set the logging level (default: info)
#   -s    Specify a custom schedule file (optional)
#
# Example:
#   ./start_celery_beat.sh -l debug -s celerybeat-schedule

# Default values
LOGLEVEL="info"
SCHEDULE_FILE=""

# Parse command-line options
while getopts "l:s:" opt; do
  case $opt in
    l)
      LOGLEVEL="$OPTARG"
      ;;
    s)
      SCHEDULE_FILE="$OPTARG"
      ;;
    *)
      echo "Usage: $0 [-l loglevel] [-s schedule_file]"
      exit 1
      ;;
  esac
done

echo "Starting Celery beat with loglevel '${LOGLEVEL}'..."
if [ -n "$SCHEDULE_FILE" ]; then
    echo "Using custom schedule file: ${SCHEDULE_FILE}"
    celery -A app.task_manager.celery beat --loglevel="${LOGLEVEL}" --schedule="${SCHEDULE_FILE}"
else
    celery -A app.task_manager.celery beat --loglevel="${LOGLEVEL}"
fi
