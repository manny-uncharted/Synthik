#!/bin/bash
# main.sh - Unified Project Management Script
#
# This script merges the following functionalities:
#  1. brevo            - Send email using the Brevo API.
#  2. celery-worker    - Start one or more Celery worker instances.
#  3. create-feature   - Create a new feature folder with boilerplate files.
#  4. export-path      - Dynamically export and print PYTHONPATH.
#  5. faststream       - Start the FastStream subscriber process.
#  6. install-ffmpeg   - Install ffmpeg based on the operating system.
#  7. migrate          - Manage Alembic migrations.
#  8. pr-process       - Run pull request process commands.
#  9. setup-pre-commit - Update and install pre-commit hooks.
# 10. setup            - Set up the environment (via Poetry or venv/virtualenv).
# 11. activate         - Display instructions to activate your chosen virtual environment.
# 12. celery-beat      - Start the Celery beat scheduler.
#
# Usage:
#   ./main.sh <command> [options]
#
# For example:
#   ./main.sh brevo YOUR_API_KEY recipient@example.com
#   ./main.sh celery-worker -c 4 -w 2
#   ./main.sh create-feature -c user_profile
#   ./main.sh export-path
#   ./main.sh faststream
#   ./main.sh install-ffmpeg
#   ./main.sh migrate -r "Added new column to users table"
#   ./main.sh pr-process
#   ./main.sh setup-pre-commit
#   ./main.sh setup
#   ./main.sh activate
#   ./main.sh celery-beat -l debug -s celerybeat-schedule
#   ./main.sh help

############################
# 1. Brevo Email Functionality
############################
function brevo() {
    if [ $# -lt 2 ]; then
      echo "Usage: $0 brevo <BREVO_API_KEY> <RECIPIENT_EMAIL>"
      exit 1
    fi

    BREVO_API_KEY="$1"
    EMAIL="$2"

    curl --request POST \
      --url https://api.brevo.com/v3/smtp/email \
      --header "accept: application/json" \
      --header "api-key: $BREVO_API_KEY" \
      --header "content-type: application/json" \
      --data "{
        \"sender\": {
          \"name\": \"Poe.AI | Notifications\",
          \"email\": \"notifications@poeai.app\"
        },
        \"to\": [
          {
            \"email\": \"$EMAIL\",
            \"name\": \"John Doe\"
          }
        ],
        \"subject\": \"Hello world\",
        \"htmlContent\": \"<html><head></head><body><p>Hello,</p>This is my first transactional email sent from Brevo.</p></body></html>\"
      }"
}

############################
# 2. Celery Worker Functionality
############################
function celery_worker() {
    CONCURRENCY=2
    WORKERS=1

    while getopts "c:w:" opt; do
      case $opt in
        c)
          CONCURRENCY="$OPTARG"
          ;;
        w)
          WORKERS="$OPTARG"
          ;;
        *)
          echo "Usage: $0 celery-worker [-c concurrency] [-w workers]"
          exit 1
          ;;
      esac
    done

    echo "Starting $WORKERS Celery worker(s) with concurrency set to $CONCURRENCY..."

    for (( i=1; i<=WORKERS; i++ )); do
        WORKER_NAME="celery_worker${i}@%h"
        echo "Starting worker: $WORKER_NAME"
        celery -A app.task_manager.celery worker -n "$WORKER_NAME" --concurrency="$CONCURRENCY" --loglevel=info &
    done

    wait
}

############################
# 3. Create Feature Functionality
############################
function create_feature() {
    function display_help() {
      echo "Usage: $0 create-feature [option] <feature_name>"
      echo "Options:"
      echo "  -c, --create     Create a new feature folder with the specified name"
      echo "  -h, --help       Display this help message"
      exit 0
    }

    if [ $# -lt 1 ]; then
      display_help
    fi

    case "$1" in
      -c|--create)
          if [ -z "$2" ]; then
              echo "Error: Feature name is required."
              display_help
          fi
          FEATURE_NAME="$2"
          ;;
      -h|--help)
          display_help
          ;;
      *)
          echo "Error: Invalid option."
          display_help
          ;;
    esac

    if [ -d "$FEATURE_NAME" ]; then
      echo "Error: Feature folder '$FEATURE_NAME' already exists."
      exit 1
    fi

    mkdir -p "$FEATURE_NAME"
    touch "$FEATURE_NAME/__init__.py"

    cat <<EOL > "$FEATURE_NAME/models.py"
from sqlalchemy import Column, Integer, String
from app.core.database import Base  # Assuming you have a Base model class

class Item(Base):
    __tablename__ = "${FEATURE_NAME}_items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String, index=True)
EOL

    cat <<EOL > "$FEATURE_NAME/schemas.py"
from pydantic import BaseModel

class ItemBase(BaseModel):
    title: str
    description: str | None = None

class ItemCreate(ItemBase):
    pass

class Item(ItemBase):
    id: int

    class Config:
        from_attributes = True
EOL

    cat <<EOL > "$FEATURE_NAME/services.py"
from sqlalchemy.orm import Session
from . import models, schemas

def get_items(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Item).offset(skip).limit(limit).all()

def create_user_item(db: Session, item: schemas.ItemCreate):
    db_item = models.Item(**item.dict())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item
EOL

    cat <<EOL > "$FEATURE_NAME/routes.py"
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_session
from . import schemas, services

router = APIRouter()

@router.get("/", response_model=list[schemas.Item])
def read_items(skip: int = 0, limit: int = 100, db: Session = Depends(get_session)):
    items = services.get_items(db, skip=skip, limit=limit)
    return items

@router.post("/", response_model=schemas.Item)
def create_item(item: schemas.ItemCreate, db: Session = Depends(get_session)):
    return services.create_user_item(db=db, item=item)
EOL

    echo "Feature folder '$FEATURE_NAME' created successfully with necessary files."
}

############################
# 4. Export PYTHONPATH Functionality
############################
function export_path() {
    CURRENT_DIR=$(pwd)
    PROJECT_ROOT="$CURRENT_DIR"
    APP_DIR="$CURRENT_DIR/app"

    if [ ! -d "$APP_DIR" ]; then
      echo "Error: Directory '$APP_DIR' does not exist. Please check your project structure."
      exit 1
    fi

    export PYTHONPATH="$PROJECT_ROOT:$APP_DIR:$PYTHONPATH"
    echo "PYTHONPATH set to: $PYTHONPATH"
}

############################
# 5. FastStream Functionality
############################
function faststream() {
    echo "Starting FastStream subscriber process..."
    faststream run app.task_manager.consumer:message_queue --workers 1
}

############################
# 6. Install ffmpeg Functionality
############################
function install_ffmpeg() {
    set -e
    set -u

    echo "Detecting operating system..."

    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            OS=$ID
            VERSION=$VERSION_ID
        else
            echo "Unsupported Linux distribution."
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "cygwin" || "$OSTYPE" == "msys" ]]; then
        OS="windows"
    else
        echo "Unsupported operating system: $OSTYPE"
        exit 1
    fi

    echo "Detected OS: $OS (Version: ${VERSION:-Unknown})"

    case "$OS" in
        ubuntu|debian)
            echo "Installing ffmpeg for Ubuntu/Debian..."
            apt-get update
            apt-get install -y ffmpeg
            ;;
        centos|fedora|rhel)
            echo "Installing ffmpeg for CentOS/Fedora/RHEL..."
            yum install -y epel-release
            yum install -y ffmpeg
            ;;
        macos)
            echo "Installing ffmpeg for macOS..."
            if ! command -v brew &> /dev/null; then
                echo "Homebrew not found. Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            brew install ffmpeg
            ;;
        windows)
            echo "Windows detected. Please download and install ffmpeg manually from https://ffmpeg.org/download.html."
            exit 1
            ;;
        *)
            echo "Unsupported operating system: $OS"
            exit 1
            ;;
    esac

    if command -v ffmpeg &> /dev/null; then
        echo "ffmpeg installed successfully."
        ffmpeg -version
    else
        echo "ffmpeg installation failed."
        exit 1
    fi
}

############################
# 7. Migrate (Alembic) Functionality
############################
function migrate() {
    function generate_revision() {
        echo "Generating new Alembic revision..."
        alembic revision --autogenerate -m "$1"
        if [ $? -eq 0 ]; then
            echo "Revision generated successfully."
        else
            echo "Failed to generate revision."
            exit 1
        fi
    }

    function apply_migrations() {
        echo "Applying Alembic migrations..."
        alembic upgrade head
        if [ $? -eq 0 ]; then
            echo "Migrations applied successfully."
        else
            echo "Failed to apply migrations."
            exit 1
        fi
    }

    function downgrade_migration() {
        echo "Downgrading Alembic migration to $1..."
        alembic downgrade "$1"
        if [ $? -eq 0 ]; then
            echo "Migration downgraded successfully."
        else
            echo "Failed to downgrade migration."
            exit 1
        fi
    }

    function downgrade_last_migration() {
        echo "Downgrading the last Alembic migration..."
        alembic downgrade -1
        if [ $? -eq 0 ]; then
            echo "Last migration downgraded successfully."
        else
            echo "Failed to downgrade the last migration."
            exit 1
        fi
    }

    function repopulate_database() {
        echo "Dropping alembic version table (if it exists)..."
        alembic downgrade base
        echo "Repopulating database from migration history..."
        alembic upgrade head
        if [ $? -eq 0 ]; then
            echo "Database repopulated successfully."
        else
            echo "Failed to repopulate database."
            exit 1
        fi
    }

    function show_migrations() {
        echo "Listing all Alembic migrations..."
        alembic history
        if [ $? -eq 0 ]; then
            echo "Migrations listed successfully."
        else
            echo "Failed to list migrations."
            exit 1
        fi
    }

    function usage_migrate() {
        echo "Usage: $0 migrate [option] \"<revision message>\""
        echo "Options:"
        echo "  -r, --revision    Generate a new Alembic revision (requires a message)"
        echo "  -a, --apply       Apply Alembic migrations"
        echo "  -d, --downgrade   Downgrade Alembic migration by revision ID"
        echo "  -l, --last        Downgrade the last Alembic migration"
        echo "  -s, --show        Show all Alembic migrations"
        echo "  -p, --populate    Repopulate the database from migration history"
        echo "  -b, --both        Generate a new revision and apply migrations (requires a message)"
        echo "  -h, --help        Show this help message"
        exit 1
    }

    if [ $# -lt 1 ]; then
        usage_migrate
    fi

    case "$1" in
        -r|--revision)
            if [ -z "$2" ]; then
                echo "Please provide a revision message."
                usage_migrate
            fi
            generate_revision "$2"
            ;;
        -a|--apply)
            apply_migrations
            ;;
        -d|--downgrade)
            if [ -z "$2" ]; then
                echo "Please provide a revision ID."
                usage_migrate
            fi
            downgrade_migration "$2"
            ;;
        -l|--last)
            downgrade_last_migration
            ;;
        -s|--show)
            show_migrations
            ;;
        -p|--populate)
            repopulate_database
            ;;
        -b|--both)
            if [ -z "$2" ]; then
                echo "Please provide a revision message."
                usage_migrate
            fi
            generate_revision "$2"
            apply_migrations
            ;;
        -h|--help)
            usage_migrate
            ;;
        *)
            usage_migrate
            ;;
    esac
}

############################
# 8. Pull Request Process Functionality
############################
function pr_process() {
    read -p "Do you want to switch to a different branch? (y/n): " switch_choice

    if [[ "$switch_choice" =~ ^[Yy]$ ]]; then
        read -p "Enter the branch name to switch to: " branch_name
        echo "Switching to branch: $branch_name"
        git checkout "$branch_name"
    else
        branch_name=$(git rev-parse --abbrev-ref HEAD)
        echo "Using current branch: $branch_name"
    fi

    commands=(
      "git pull origin main"
      "git add ."
      "pre-commit run --all-files"
      "poetry run cz commit"
      "git push origin ${branch_name}"
    )

    RUN_ALL=false

    function run_command() {
      local cmd="$1"
      if [ "$RUN_ALL" = true ]; then
        echo "Running: $cmd"
        eval "$cmd"
        local status=$?
        if [[ "$cmd" == "pre-commit run --all-files" && $status -ne 0 ]]; then
          echo "Reformatting detected. Rerunning 'git add .' to stage modified files..."
          git add .
        fi
      else
        echo "Next command: $cmd"
        read -p "Choose an option - (y)es to run, (n)o to skip, (a)ll to run all remaining commands, (q)uit: " choice
        case "$choice" in
          a|A)
            RUN_ALL=true
            echo "Running: $cmd"
            eval "$cmd"
            local status=$?
            if [[ "$cmd" == "pre-commit run --all-files" && $status -ne 0 ]]; then
              echo "Reformatting detected. Rerunning 'git add .' to stage modified files..."
              git add .
            fi
            ;;
          q|Q)
            echo "Exiting..."
            exit 0
            ;;
          y|Y)
            echo "Running: $cmd"
            eval "$cmd"
            local status=$?
            if [[ "$cmd" == "pre-commit run --all-files" && $status -ne 0 ]]; then
              echo "Reformatting detected. Rerunning 'git add .' to stage modified files..."
              git add .
            fi
            ;;
          n|N)
            echo "Skipping command: $cmd"
            ;;
          *)
            echo "Invalid option. Skipping command: $cmd"
            ;;
        esac
      fi
    }

    for cmd in "${commands[@]}"; do
      run_command "$cmd"
      if [ "$RUN_ALL" = false ]; then
        read -p "Press Enter to continue to the next command..."
      fi
    done

    echo "All commands processed."
}

############################
# 9. Setup Pre-commit Functionality
############################
function setup_pre_commit() {
    echo "Updating pre-commit hooks..."
    pre-commit autoupdate
    pre-commit clean
    pre-commit install --install-hooks
    echo "Pre-commit hooks set up successfully."
}

############################
# 10. Environment Setup Functionality
############################
function setup_env() {
    # Helper functions
    function command_exists() {
      command -v "$1" >/dev/null 2>&1
    }
    function get_python_command() {
        if command_exists python && python --version 2>&1 | grep -q "Python 3"; then
            echo "python"
        elif command_exists python3; then
            echo "python3"
        else
            echo "Python 3 is not installed. Please install Python 3 to continue."
            exit 1
        fi
    }
    PYTHON_CMD=$(get_python_command)

    echo "Select the virtual environment you want to set up:"
    echo "1) Poetry"
    echo "2) venv/virtualenv"
    read -p "Enter your choice [1 or 2]: " env_choice

    if [ "$env_choice" = "1" ]; then
        if command_exists poetry; then
            echo "Setting up environment with Poetry..."
            poetry install --no-root
            echo "Installing pre-commit hooks..."
            poetry run pre-commit install
        else
            echo "Poetry is not installed. Please install Poetry or choose option 2."
            exit 1
        fi
    elif [ "$env_choice" = "2" ]; then
        read -p "Enter your virtual environment directory name (default: venv): " venv_dir
        if [ -z "$venv_dir" ]; then
            venv_dir="venv"
        fi
        if [ ! -d "$venv_dir" ]; then
            echo "Virtual environment '$venv_dir' not found. Creating a new virtual environment..."
            if command_exists virtualenv; then
                virtualenv "$venv_dir"
            else
                $PYTHON_CMD -m venv "$venv_dir"
            fi
        fi
        echo "Setting up environment in virtual environment '$venv_dir'..."
        # Note: Activation is not done here—please use the separate 'activate' command.
        if [ -f requirements.txt ]; then
            echo "Installing dependencies..."
            pip install -r requirements.txt
        else
            echo "requirements.txt not found!"
            exit 1
        fi
        echo "Downloading nltk 'punkt' model..."
        $PYTHON_CMD -m nltk.downloader punkt
        echo "Installing pre-commit hooks..."
        pre-commit install --hook-type commit-msg
    else
        echo "Invalid selection. Exiting."
        exit 1
    fi
}

############################
# 11. Activate Virtual Environment
############################
function activate_env() {
    # Helper functions (if needed)
    function command_exists() {
      command -v "$1" >/dev/null 2>&1
    }

    echo "Select the virtual environment you want to activate:"
    echo "1) Poetry"
    echo "2) venv/virtualenv"
    read -p "Enter your choice [1 or 2]: " env_choice

    if [ "$env_choice" = "1" ]; then
        if command_exists poetry; then
            echo "Run the following command to activate the Poetry environment:"
            echo "eval \$(poetry env activate)"
        else
            echo "Poetry is not installed."
            exit 1
        fi
    elif [ "$env_choice" = "2" ]; then
        read -p "Enter your virtual environment directory name (default: venv): " venv_dir
        if [ -z "$venv_dir" ]; then
            venv_dir="venv"
        fi
        if [ ! -d "$venv_dir" ]; then
            echo "Virtual environment '$venv_dir' not found."
            exit 1
        fi
        echo "To activate your virtual environment, run:"
        echo "  source $venv_dir/bin/activate"
    else
        echo "Invalid selection. Exiting."
        exit 1
    fi
}

############################
# 12. Celery Beat Functionality
############################
function celery_beat() {
    LOGLEVEL="info"
    SCHEDULE_FILE=""

    while getopts "l:s:" opt; do
      case $opt in
        l)
          LOGLEVEL="$OPTARG"
          ;;
        s)
          SCHEDULE_FILE="$OPTARG"
          ;;
        *)
          echo "Usage: $0 celery-beat [-l loglevel] [-s schedule_file]"
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
}

############################
# Help and Command Dispatcher
############################
function display_help() {
  echo "Usage: $0 <command> [options]"
  echo "Available commands:"
  echo "  brevo            - Send email using the Brevo API"
  echo "  celery-worker    - Start Celery worker(s)"
  echo "  create-feature   - Create a new feature folder"
  echo "  export-path      - Export and display PYTHONPATH"
  echo "  faststream       - Start FastStream subscriber process"
  echo "  install-ffmpeg   - Install ffmpeg based on OS"
  echo "  migrate          - Manage Alembic migrations"
  echo "  pr-process       - Run pull request process commands"
  echo "  setup-pre-commit - Update and install pre-commit hooks"
  echo "  setup            - Set up the environment"
  echo "  activate         - Display instructions to activate your virtual environment"
  echo "  celery-beat      - Start the Celery beat scheduler"
  echo "  help             - Display this help message"
}

if [ $# -lt 1 ]; then
    display_help
    exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
    brevo)
        brevo "$@"
        ;;
    celery-worker)
        celery_worker "$@"
        ;;
    create-feature)
        create_feature "$@"
        ;;
    export-path)
        export_path
        ;;
    faststream)
        faststream "$@"
        ;;
    install-ffmpeg)
        install_ffmpeg "$@"
        ;;
    migrate)
        migrate "$@"
        ;;
    pr-process)
        pr_process "$@"
        ;;
    setup-pre-commit)
        setup_pre_commit "$@"
        ;;
    setup)
        setup_env "$@"
        ;;
    activate)
        activate_env "$@"
        ;;
    celery-beat)
        celery_beat "$@"
        ;;
    help)
        display_help
        ;;
    *)
        echo "Unknown command: $COMMAND"
        display_help
        exit 1
        ;;
esac
