#!/bin/bash

# Update all hooks to latest versions
pre-commit autoupdate

# Clean cache and reinstall
pre-commit clean
pre-commit install --install-hooks
