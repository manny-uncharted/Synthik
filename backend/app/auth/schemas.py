from datetime import datetime
from pydantic import BaseModel

class LoginRequest(BaseModel):
    wallet_address: str


class TokenResponse(BaseModel):
    access_token: str
    expires_at: datetime