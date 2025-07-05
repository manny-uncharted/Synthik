# mlops_sdk/utils.py

import os
from typing import Optional

def get_api_url() -> str:
    return os.getenv("MLOPS_API_URL", "http://localhost:8000")

def get_wallet_address() -> str:
    addr = os.getenv("USER_WALLET_ADDRESS")
    if not addr:
        raise RuntimeError("Environment variable USER_WALLET_ADDRESS is required")
    return addr
