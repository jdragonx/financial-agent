#!/bin/bash

# Ensure dependencies are installed
uv sync

# Run the FastAPI application using uv
uv run python -m app.main


