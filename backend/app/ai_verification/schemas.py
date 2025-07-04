from pydantic import BaseModel
from typing import Optional

class VerificationApiResponse(BaseModel):
    message: str
    onchain_campaign_id: str
    contributor_wallet_address: str
    decision: Optional[str] = None
    score: Optional[float] = None
    reasoning: Optional[str] = None
    file_type_processed: Optional[str] = None