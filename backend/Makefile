# Makefile

SHELL := /usr/bin/env bash
export GOOGLE_APPLICATION_CREDENTIALS := $(PWD)/auth.json
export GRPC_POLL_STRATEGY=poll

.PHONY: install run clean ngrok

install:
	@echo "↳ Installing Poetry dependencies…"
	poetry install --no-root

run:
	@echo "↳ Starting API server via Poetry…"
	poetry run uvicorn app.main:app --reload


clean:
	@echo "↳ Cleaning up virtualenv…"
	poetry env remove --all || rm -rf .venv

ngrok:
	@echo "↳ Starting ngrok…"
	ngrok http 8000
