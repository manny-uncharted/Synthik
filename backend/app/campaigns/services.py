from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from app.campaigns.models import Campaign, Contribution, Activity



def serialize_campaign(campaign: Campaign, contributions_count: int) -> dict:
    return {
        "campaign_id": campaign.id,
        "onchain_campaign_id": campaign.onchain_campaign_id,
        "title": campaign.title,
        "description": campaign.description,
        "campaign_type": campaign.campaign_type,
        "data_requirements": campaign.data_requirements,
        "quality_criteria": campaign.quality_criteria,
        "unit_price": campaign.unit_price,
        "total_budget": campaign.total_budget,
        "min_data_count": campaign.min_data_count,
        "file_type": campaign.file_type,    
        "max_data_count": campaign.max_data_count,
        "expiration": campaign.expiration,
        "metadata_uri": campaign.metadata_uri,
        "transaction_hash": campaign.transaction_hash,
        "platform_fee": campaign.platform_fee,
        "is_active": campaign.is_active,
        "created_at": campaign.created_at,
        "creator_wallet_address": campaign.creator_wallet_address or "",
        "current_contributions": contributions_count,
    }


def track_campaign_activity_overall(campaign_id: str, db: Session, contribution: Contribution):
    """
    Track overall activity for the given campaign when a new contribution is made.
    Activity level is determined based on contribution data and updates the campaign's aggregated activity level.
    """
    activity_level = calculate_activity_level(contribution)

    # Create a new Activity entry for the campaign
    new_activity = Activity(
        campaign_id=campaign_id,
        timestamp=datetime.utcnow(),
        activity_level=activity_level
    )

    # Save the new activity to the database
    db.add(new_activity)
    db.commit()
    db.refresh(new_activity)

    # Update campaign's overall activity level
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if campaign:
        # Calculate the average activity level for the campaign (optional)
        total_activity = db.query(func.sum(Activity.activity_level)).filter(Activity.campaign_id == campaign_id).scalar() or 0
        activity_count = db.query(func.count(Activity.id)).filter(Activity.campaign_id == campaign_id).scalar() or 1
        avg_activity_level = total_activity / activity_count
        campaign.current_activity_level = avg_activity_level
        db.commit()  # Save the updated activity level for the campaign


# def track_contribution_activity(campaign_id: str, db: Session, contribution: Contribution):
#     """
#     Track activity for the given campaign at the individual contribution level.
#     Activity level is determined based on contribution data, without affecting the overall campaign activity.
#     """
#     activity_level = calculate_activity_level(contribution)

#     # Create a new Activity entry for the campaign (individual contribution activity)
#     new_activity = Activity(
#         campaign_id=campaign_id,
#         timestamp=datetime.utcnow(),
#         activity_level=activity_level
#     )

#     # Save the new activity to the database
#     db.add(new_activity)
#     db.commit()
#     db.refresh(new_activity)


def track_contribution_activity(campaign_id: str, db: Session, contribution: Contribution):
    """
    Track activity for the given campaign at the individual contribution level.
    Activity level is determined based on contribution data, without affecting the overall campaign activity.
    """
    activity_level = calculate_activity_level(contribution)

    # Create a new Activity entry, linking it to the specific contribution via contribution_id
    new_activity = Activity(
        campaign_id=campaign_id,
        contribution_id=contribution.contribution_id,
        timestamp=datetime.utcnow(),
        activity_level=activity_level
    )

    # Save the new activity to the database
    db.add(new_activity)
    db.commit()
    db.refresh(new_activity)



def calculate_activity_level(contribution: Contribution) -> float:
    """
    Calculate the activity level for a given contribution based on its attributes.
    """
    base_activity = 30  # Default base activity level (neutral)

    # Adjust activity level based on whether the contribution is verified
    if contribution.is_verified:
        base_activity += 30  # Increase activity level for verified contributions

    # Add AI verification score influence (normalize it to fit within reasonable range)
    if contribution.ai_verification_score:
        base_activity += (contribution.ai_verification_score / 2)  # Add half of AI score to activity level

    # Add quality score influence (normalize by dividing by 10)
    if contribution.quality_score:
        base_activity += (contribution.quality_score / 10)  # Normalize the quality score

    # Cap the activity level to 100 (maximum)
    return min(base_activity, 100)  # Ensures activity level does not exceed 100



def get_quality_score_category(quality_score: float) -> str:
    """
    This function will return the quality score category based on the given score.
    """
    if quality_score > 95:
        return "High Quality"
    elif quality_score >= 80:
        return "Medium Quality"
    else:
        return "Low Quality"

