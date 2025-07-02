from cryptography.fernet import Fernet

from app.core.constants import MLOPS_ENCRYPTION_KEY

fernet_cipher = Fernet(MLOPS_ENCRYPTION_KEY)