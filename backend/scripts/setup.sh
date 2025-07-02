#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

install_homebrew() {
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # ensure brew is on PATH for this session
    eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /home/linuxbrew/.linuxbrew/bin/brew shellenv)"
}

# -----------------------------------------------------------------------------
# 1. Detect OS
# -----------------------------------------------------------------------------
OS_TYPE=""
case "${OSTYPE:-}" in
  darwin*)  OS_TYPE="macOS" ;;
  linux-gnu*)
    if [ -f /etc/redhat-release ]; then
      OS_TYPE="RedHat"
    else
      OS_TYPE="Debian"
    fi
    ;;
  msys*|cygwin*|win32*) OS_TYPE="Windows" ;;
  *)
    echo "❌ Unsupported OS: $OSTYPE" >&2
    exit 1
    ;;
esac

echo "🖥  Detected OS: $OS_TYPE"

# -----------------------------------------------------------------------------
# 2. Install Python 3.11
# -----------------------------------------------------------------------------
install_python_3_11() {
  case "$OS_TYPE" in
    macOS)
      if ! command_exists brew; then
        install_homebrew
      fi
      echo "🔄 Updating Homebrew..."
      brew update
      echo "🍺 Installing Python 3.11 via Homebrew..."
      brew install python@3.11
      echo "🔗 Forcing link to python3.11"
      brew link --force python@3.11
      PYTHON_CMD="python3.11"
      ;;
    Debian)
      echo "🔄 Updating apt…"
      sudo apt-get update
      echo "🐍 Installing Python 3.11 and venv/dev headers…"
      sudo apt-get install -y python3.11 python3.11-venv python3.11-dev
      PYTHON_CMD="python3.11"
      ;;
    RedHat)
      if command_exists dnf; then
        PM="dnf"
      else
        PM="yum"
      fi
      echo "🔄 Installing via $PM…"
      sudo $PM install -y python3.11 python3.11-devel
      PYTHON_CMD="python3.11"
      ;;
    Windows)
      # try Chocolatey first
      if command_exists choco; then
        echo "🍫 Installing Python 3.11 via Chocolatey…"
        choco install -y python --version=3.11
        PYTHON_CMD="python"
      elif command_exists winget; then
        echo "🪟 Installing Python 3.11 via Winget…"
        winget install --id=Python.Python.3.11 -e --silent
        PYTHON_CMD="python"
      else
        echo "❌ Neither Chocolatey nor Winget found. Please install Python 3.11 manually."
        exit 1
      fi
      ;;
  esac
}

# If no python3.11 available, install it
if ! ( command_exists python3.11 ); then
  install_python_3_11
else
  PYTHON_CMD="python3.11"
fi

echo "✅ Using Python: $($PYTHON_CMD --version)"

# -----------------------------------------------------------------------------
# 3. Virtual env / Poetry setup
# -----------------------------------------------------------------------------
if command_exists poetry; then
  echo "📦 Poetry detected. Installing dependencies…"
  poetry install --no-root

  echo "🔧 Installing pre-commit hooks…"
  poetry run pre-commit install

  echo "🚀 Activating Poetry environment…"
  eval "$(poetry env activate)"
else
  echo "🔄 Poetry not found. Falling back to venv…"

  if command_exists virtualenv; then
    echo "🌐 Setting up virtualenv…"
    virtualenv -p "$PYTHON_CMD" venv
  else
    echo "🌐 Creating venv via built-in module…"
    $PYTHON_CMD -m venv venv
  fi

  echo "🚪 Activating venv…"
  # shellcheck disable=SC1091
  source venv/bin/activate

  if [ -f requirements.txt ]; then
    echo "📥 Installing pip dependencies…"
    pip install -r requirements.txt
  else
    echo "❌ requirements.txt not found!" >&2
    deactivate
    exit 1
  fi

  echo "🐍 Downloading NLTK 'punkt' model…"
  $PYTHON_CMD -m nltk.downloader punkt

  echo "🔧 Installing pre-commit hooks…"
  pre-commit install --hook-type commit-msg
fi

echo "🎉 Setup complete!"
