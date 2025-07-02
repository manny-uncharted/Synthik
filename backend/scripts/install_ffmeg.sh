#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status
set -u  # Treat unset variables as an error

echo "Detecting operating system..."

# Determine the OS type
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

# Install ffmpeg based on the OS
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

# Verify ffmpeg installation
if command -v ffmpeg &> /dev/null; then
    echo "ffmpeg installed successfully."
    ffmpeg -version
else
    echo "ffmpeg installation failed."
    exit 1
fi

exec "$@"
