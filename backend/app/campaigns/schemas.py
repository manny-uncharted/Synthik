from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class DeleteResponse(BaseModel):
    message: str
    deleted_count: int

class CampaignCreate(BaseModel):
    onchain_campaign_id: str
    title: str
    description: str
    data_requirements: str
    creator_wallet_address: str
    file_type: Optional[str]
    quality_criteria: str
    unit_price: float
    campaign_type: str
    total_budget: float
    min_data_count: int
    max_data_count: int
    expiration: int 
    metadata_uri: str
    transaction_hash: str
    platform_fee: float

class CampaignResponse(CampaignCreate):
    campaign_id: str
    is_active: bool
    filename: str
    current_contributions: int
    unique_contributions_count: int
    created_at: datetime

class ContributionCreate(BaseModel):
    onchain_contribution_id: str
    campaign_id: str
    contributor: str
    data_url: str
    file_type: Optional[str]
    transaction_hash: str
    quality_score: float 
    ai_verification_score: Optional[float] = None
    reputation_score: Optional[float] = None


class ContributionResponse(BaseModel):
    contribution_id: str
    onchain_contribution_id: str
    campaign_id: str
    contributor: str
    data_url: str
    filename: str
    file_type: Optional[str]
    transaction_hash: str
    ai_verification_score: Optional[float] = None
    reputation_score: Optional[float] = None
    is_verified: bool
    reward_claimed: bool
    created_at: datetime
    quality_score: str

class CampaignsActiveResponse(BaseModel):
    campaign_id: str
    onchain_campaign_id: str
    creator_wallet_address: str
    campaign_type: str
    unit_price: float
    total_budget: float
    max_data_count: int
    current_contributions: int
    unique_contributions_count: int
    title: str
    description: str
    is_active: bool
    expiration: int

class ContributionsListResponse(BaseModel):
    contributions: List[ContributionResponse]
    unique_contributions_count: int


class WalletCampaignsResponse(BaseModel):
    created: List[CampaignResponse]
    contributed: List[CampaignResponse]


class WeeklyAnalyticsResponse(BaseModel):
    date: str
    submissions: int
    avg_quality_score: float