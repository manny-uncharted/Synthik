import logging
from fastapi import FastAPI, HTTPException, Depends, APIRouter
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional, Dict
from datetime import datetime, timedelta

from app.campaigns.models import Campaign, Contribution, Activity
from app.campaigns.schemas import CampaignCreate, CampaignResponse, ContributionCreate, ContributionResponse, CampaignsActiveResponse, ContributionsListResponse, WalletCampaignsResponse, WeeklyAnalyticsResponse, DeleteResponse
from app.campaigns.services import serialize_campaign, track_campaign_activity_overall, track_contribution_activity, get_quality_score_category
from app.core.database import get_session


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()



@router.get("/all", response_model=List[CampaignResponse])
def get_all_campaigns(db: Session = Depends(get_session)):
    db_campaigns = (
        db.query(Campaign)
        .options(joinedload(Campaign.contributions))
        .order_by(Campaign.created_at.desc())
        .all()
    )
    result = []
    for campaign in db_campaigns:
        contributions_count = len(campaign.contributions)
        unique_count = db.query(func.count(func.distinct(Contribution.contributor))) \
                         .filter(Contribution.campaign_id == campaign.id).scalar()
        # Extend the serialized campaign with the unique contributions count.
        serialized = serialize_campaign(campaign, contributions_count)
        serialized["unique_contributions_count"] = unique_count
        result.append(serialized)
    return result


@router.get(
    "/{creator_wallet_address}/campaigns/created", 
    response_model=List[CampaignResponse],
    summary="Get all campaigns created by a creator wallet address"
)
def get_campaigns_created_by_wallet(
    creator_wallet_address: str, 
    db: Session = Depends(get_session)
):
    campaigns = (
        db.query(Campaign)
        .filter(Campaign.creator_wallet_address == creator_wallet_address)
        .options(joinedload(Campaign.contributions))
        .order_by(Campaign.created_at.desc())
        .all()
    )
    if not campaigns:
        raise HTTPException(
            status_code=404, 
            detail="No campaigns found for the given creator wallet address."
        )
    
    result = []
    for campaign in campaigns:
        contributions_count = len(campaign.contributions)
        unique_count = db.query(func.count(func.distinct(Contribution.contributor))) \
                         .filter(Contribution.campaign_id == campaign.id).scalar()
        serialized = serialize_campaign(campaign, contributions_count)
        serialized["unique_contributions_count"] = unique_count
        result.append(serialized)
    return result


@router.post("/create-campaigns", response_model=CampaignResponse)
def create_campaign(campaign: CampaignCreate, db: Session = Depends(get_session)):
    db_campaign = Campaign(**campaign.dict())
    db_campaign.is_active = True
    db.add(db_campaign)
    db.commit()
    db.refresh(db_campaign)
    # New campaign: no contributions, so both counts are 0.
    return {**serialize_campaign(db_campaign, 0), "unique_contributions_count": 0}


@router.get("/active", response_model=List[CampaignsActiveResponse])
def get_active_campaigns(db: Session = Depends(get_session)):
    db_campaigns = (
        db.query(Campaign)
        .options(joinedload(Campaign.contributions))
        .order_by(Campaign.created_at.desc())
        .filter(Campaign.is_active == True)
        .all()
    )
    result = []
    for campaign in db_campaigns:
        unique_count = db.query(func.count(func.distinct(Contribution.contributor))) \
                         .filter(Contribution.campaign_id == campaign.id).scalar()
        result.append({
            "campaign_id": campaign.id,
            "onchain_campaign_id": str(campaign.onchain_campaign_id),
            "creator_wallet_address": str(campaign.creator_wallet_address),
            "unit_price": campaign.unit_price,
            "campaign_type": campaign.campaign_type,
            "file_type": campaign.file_type,
            "total_budget": float(campaign.total_budget),
            "max_data_count": int(campaign.max_data_count),
            "current_contributions": len(campaign.contributions),
            "unique_contributions_count": unique_count,
            "title": campaign.title,
            "description": campaign.description,
            "is_active": campaign.is_active,
            "expiration": campaign.expiration
        })
    return result


@router.get("/{onchain_campaign_id}", response_model=CampaignResponse)
def get_campaign(onchain_campaign_id: str, db: Session = Depends(get_session)):
    db_campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == onchain_campaign_id).first()
    if db_campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    contributions_count = db.query(Contribution).filter(Contribution.campaign_id == db_campaign.id).count()
    unique_count = db.query(func.count(func.distinct(Contribution.contributor))) \
                     .filter(Contribution.campaign_id == db_campaign.id).scalar()
    serialized = serialize_campaign(db_campaign, contributions_count)
    serialized["unique_contributions_count"] = unique_count
    return serialized




@router.post("/submit-contributions", response_model=ContributionResponse)
def submit_contribution(contribution: ContributionCreate, db: Session = Depends(get_session)):
    try:
        # Look up the campaign by its onchain_campaign_id
        campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == contribution.campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found for given campaign_id")
        
        # Replace the submitted campaign_id (onchain_campaign_id) with the internal campaign id
        contribution_data = contribution.dict()
        contribution_data["campaign_id"] = campaign.id
        
        # Create and insert the contribution
        db_contribution = Contribution(**contribution_data)
        db.add(db_contribution)
        db.commit()
        db.refresh(db_contribution)

        # Track individual activity
        track_contribution_activity(campaign.id, db, db_contribution)

        # Track overall campaign activity
        track_campaign_activity_overall(campaign.id, db, db_contribution)
        
        # Prepare the response by mapping the quality score using our helper function.
        mapped_quality = get_quality_score_category(db_contribution.quality_score)
        
        # Remove SQLAlchemy's internal state from the __dict__
        contrib_data = {k: v for k, v in db_contribution.__dict__.items() if k != "_sa_instance_state"}
        contrib_data["quality_score"] = mapped_quality  # Override the quality_score with the category
        
        return ContributionResponse(**contrib_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit contribution: {str(e)}")




@router.get("/get-contributions/{onchain_campaign_id}", response_model=ContributionsListResponse)
def get_contributions(
    onchain_campaign_id: Optional[str] = None, 
    contributor: Optional[str] = None, 
    db: Session = Depends(get_session)
):
    # Log the incoming request parameters
    logger.info(f"Received get-contributions request. Parameters: onchain_campaign_id={onchain_campaign_id}, contributor={contributor}")

    # Find the campaign using onchain_campaign_id
    campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == onchain_campaign_id).first()
    logger.info(f"Campaign: {campaign}")
    if campaign is None:
        logger.warning(f"Campaign with onchain_campaign_id={onchain_campaign_id} not found.")
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Log the found campaign
    logger.info(f"Found campaign: {campaign.title} (ID: {campaign.id})")

    query = db.query(Contribution)

    # Filter by campaign.id
    if campaign:
        query = query.filter(Contribution.campaign_id == campaign.id)
        logger.info(f"Filtering contributions by campaign ID: {campaign.id}")
    
    if contributor:
        query = query.filter(Contribution.contributor == contributor)
        logger.info(f"Filtering contributions by contributor: {contributor}")
    
    query = query.order_by(Contribution.created_at.desc())
    contributions = query.all()

    # Calculate unique contributions (based on unique contributor)
    unique_contributors = {contrib.contributor for contrib in contributions}
    unique_count = len(unique_contributors)

    logger.info(f"Found {len(contributions)} contributions. Unique contributors: {unique_count}")

    # Map the quality scores for each contribution
    contributions_with_mapped_quality = []
    for contrib in contributions:
        # Map the quality score to a category (as a string)
        mapped_quality = get_quality_score_category(contrib.quality_score)
        # Copy contribution data
        contrib_data = contrib.__dict__.copy()
        contrib_data.pop("_sa_instance_state", None)  # Remove internal SQLAlchemy state
        # Ensure onchain_contribution_id is a valid string (default to empty string if None)
        contrib_data["onchain_contribution_id"] = contrib_data.get("onchain_contribution_id") or ""
        # Override quality_score with the mapped category
        contrib_data["quality_score"] = mapped_quality
        contrib_response = ContributionResponse(**contrib_data)
        contributions_with_mapped_quality.append(contrib_response)

    logger.info(f"Mapped quality scores for {len(contributions_with_mapped_quality)} contributions")

    return ContributionsListResponse(
        contributions=contributions_with_mapped_quality,
        unique_contributions_count=unique_count
    )



@router.delete("/delete-contributions/{onchain_campaign_id}", response_model=DeleteResponse)
def delete_contributions(onchain_campaign_id: str, db: Session = Depends(get_session)):
    """
    Deletes all contributions associated with a given onchain_campaign_id.
    """
    logger.info(f"Received request to delete contributions for onchain_campaign_id: {onchain_campaign_id}")

    try:
        # Step 1: Find the campaign using the onchain_campaign_id to get its internal ID.
        campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == onchain_campaign_id).first()

        if not campaign:
            logger.warning(f"Delete failed: Campaign with onchain_id '{onchain_campaign_id}' not found.")
            raise HTTPException(status_code=404, detail="Campaign not found")

        logger.info(f"Found campaign '{campaign.title}' (Internal ID: {campaign.id}). Preparing to delete associated contributions.")

        # Step 2: Build a query to target the contributions for deletion.
        contributions_query = db.query(Contribution).filter(Contribution.campaign_id == campaign.id)
        
        # Get a count of records that will be deleted for the response message.
        num_to_delete = contributions_query.count()

        if num_to_delete == 0:
            logger.info("No contributions found for this campaign. Nothing to delete.")
            return DeleteResponse(
                message="No contributions found for the specified campaign. Nothing was deleted.",
                deleted_count=0
            )

        # Step 3: Execute the bulk delete operation.
        # `synchronize_session=False` is an efficient strategy for bulk deletes.
        contributions_query.delete(synchronize_session=False)

        # Step 4: Commit the transaction to make the deletion permanent.
        db.commit()

        logger.info(f"Successfully deleted {num_to_delete} contributions for campaign ID {campaign.id}.")

        return DeleteResponse(
            message=f"Successfully deleted all {num_to_delete} contributions for campaign '{onchain_campaign_id}'.",
            deleted_count=num_to_delete
        )

    except Exception as e:
        # In case of any error during the process, roll back the transaction.
        db.rollback()
        logger.error(f"An error occurred during deletion: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal server error occurred during the deletion process.")


@router.get("/wallet/{wallet_address}/campaign-details", response_model=WalletCampaignsResponse, summary="Get campaigns created and contributed to by a wallet")
def get_wallet_campaigns_details(wallet_address: str, db: Session = Depends(get_session)):
    """
    Returns all campaigns related to the given wallet address. 
    This includes:
      - Campaigns created by the wallet (where the wallet is the creator)
      - Campaigns the wallet has contributed to (where the wallet appears in contributions)
    Each campaign is serialized using serialize_campaign and includes the unique_contributions_count.
    """
    # Campaigns created by the wallet
    created_campaigns = (
        db.query(Campaign)
        .filter(Campaign.creator_wallet_address == wallet_address)
        .options(joinedload(Campaign.contributions))
        .order_by(Campaign.created_at.desc())
        .all()
    )
    created_serialized = []
    for campaign in created_campaigns:
        contributions_count = len(campaign.contributions)
        unique_count = db.query(func.count(func.distinct(Contribution.contributor)))\
                         .filter(Contribution.campaign_id == campaign.id).scalar()
        serialized = serialize_campaign(campaign, contributions_count)
        serialized["unique_contributions_count"] = unique_count
        created_serialized.append(serialized)

    # Campaigns contributed to by the wallet
    contributions = db.query(Contribution).filter(Contribution.contributor == wallet_address).all()
    campaign_ids = list({contribution.campaign_id for contribution in contributions})
    contributed_serialized = []
    if campaign_ids:
        contributed_campaigns = db.query(Campaign).filter(Campaign.id.in_(campaign_ids)).all()
        for campaign in contributed_campaigns:
            contributions_count = len(campaign.contributions)
            unique_count = db.query(func.count(func.distinct(Contribution.contributor)))\
                             .filter(Contribution.campaign_id == campaign.id).scalar()
            serialized = serialize_campaign(campaign, contributions_count)
            serialized["unique_contributions_count"] = unique_count
            contributed_serialized.append(serialized)
    
    return {
        "created": created_serialized,
        "contributed": contributed_serialized
    }



@router.get("/analytics/campaign/{onchain_campaign_id}")
def get_campaign_analytics(onchain_campaign_id: str, db: Session = Depends(get_session)):
    """
    Returns analytics for a given campaign identified by onchain_campaign_id, including:
      - Total contributions
      - Average cost per submission (campaign total_budget / number of contributions)
      - Peak activity hours (hour(s) with highest submission counts)
      - Top 10 contributors for that campaign
      - Unique contributor count
      - Total rewards paid
    """
    campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == onchain_campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Total contributions
    total_contribs = db.query(Contribution).filter(Contribution.campaign_id == campaign.id).count()

    # Average cost per submission (if no contributions, return 0)
    avg_cost = float(campaign.total_budget) / total_contribs if total_contribs > 0 else 0

    # Peak activity hours (group contributions by hour)
    peak_results = (
        db.query(
            func.extract('hour', Contribution.created_at).label("hour"),
            func.count(Contribution.contribution_id).label("count")
        )
        .filter(Contribution.campaign_id == campaign.id)
        .group_by("hour")
        .all()
    )
    if peak_results:
        max_count = max(r.count for r in peak_results)
        peak_hours = [int(r.hour) for r in peak_results if r.count == max_count]
    else:
        max_count = 0
        peak_hours = []

    # Top 10 contributors for this campaign
    top_contributors_q = (
        db.query(
            Contribution.contributor,
            func.count(Contribution.contribution_id).label("submissions")
        )
        .filter(Contribution.campaign_id == campaign.id)
        .group_by(Contribution.contributor)
        .order_by(func.count(Contribution.contribution_id).desc())
        .limit(10)
        .all()
    )
    top_contributors = [{"contributor": r.contributor, "submissions": r.submissions} for r in top_contributors_q]

    # Unique contributor count
    unique_contributors = (
        db.query(func.count(func.distinct(Contribution.contributor)))
        .filter(Contribution.campaign_id == campaign.id)
        .scalar()
    )

    # Total rewards paid (reward_claimed == True)
    total_rewards_paid = db.query(Contribution).filter(
        Contribution.campaign_id == campaign.id, Contribution.reward_claimed == True
    ).count()

    return {
        "total_contributions": total_contribs,
        "average_cost_per_submission": avg_cost,
        "peak_activity": {
            # "peak_hours": peak_hours,
            "max_submissions": max_count
        },
        "top_contributors": top_contributors,
        "unique_contributor_count": unique_contributors,
        "total_rewards_paid": total_rewards_paid,
    }


@router.get("/analytics/campaign/{onchain_campaign_id}/weekly")
def get_weekly_campaign_analytics(onchain_campaign_id: str, db: Session = Depends(get_session)):
    """
    Returns weekly analytics for a given campaign identified by onchain_campaign_id, including:
      - Total submissions for each day of the week
      - Average quality score for submissions on each day of the week
    """
    # Get the campaign from the database
    campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == onchain_campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Get today's date and calculate the start of the week (Monday)
    today = datetime.now()
    start_of_week = today - timedelta(days=today.weekday())  # This will give us Monday
    end_of_week = start_of_week + timedelta(days=6)  # This gives us Sunday of the current week

    # Query to get all submissions within the current week
    result = (
        db.query(
            func.extract('dow', Contribution.created_at).label('day_of_week'),  # Day of the week (0=Monday, 6=Sunday)
            func.count(Contribution.contribution_id).label('submissions'),
            func.avg(Contribution.quality_score).label('avg_quality_score')
        )
        .filter(
            Contribution.campaign_id == campaign.id,
            Contribution.created_at >= start_of_week,
            Contribution.created_at <= end_of_week
        )
        .group_by(func.extract('dow', Contribution.created_at))
        .order_by(func.extract('dow', Contribution.created_at))
        .all()
    )

    # Create a list of dates for each day of the week (starting from Monday)
    dates = [(start_of_week + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(7)]  # Get dates from Monday to Sunday

    # Create a dictionary with all days initialized with 0 submissions and quality score 0
    weekly_data = {date: {'submissions': 0, 'avg_quality_score': 0} for date in dates}

    # Map the query result to the expected response format
    for day, submissions, avg_quality_score in result:
        adjusted_day = int(day)  # day is in range 0 (Monday) to 6 (Sunday)
        specific_date = dates[adjusted_day]  # Get the corresponding date
        weekly_data[specific_date] = {
            'submissions': submissions,
            'avg_quality_score': avg_quality_score or 0,  # Default to 0 if no data
        }

    # Return the weekly data in the correct order
    return [
        {
            'date': date,
            'submissions': data['submissions'],
            'avg_quality_score': data['avg_quality_score']
        } 
        for date, data in weekly_data.items()
    ]


@router.get("/analytics/wallet/{wallet_address}")
def get_wallet_analytics(wallet_address: str, db: Session = Depends(get_session)):
    """
    Returns analytics for a given contributor (wallet_address), including:
      - Average reputation (total reputation score divided by number of contributions)
      - Total submissions across all campaigns
      - Campaigns created by the wallet
      - Campaigns contributed to by the wallet
    """
    # Average reputation
    total_rep = db.query(func.sum(Contribution.reputation_score)).filter(
        Contribution.contributor == wallet_address
    ).scalar() or 0

    contrib_count = db.query(func.count(Contribution.contribution_id)).filter(
        Contribution.contributor == wallet_address
    ).scalar() or 0

    average_reputation = total_rep / contrib_count if contrib_count > 0 else 0

    # Total submissions
    total_submissions = contrib_count

    # Campaigns created by the wallet (assuming Campaign.creator_wallet_address)
    created_campaigns = db.query(Campaign).filter(
        Campaign.creator_wallet_address == wallet_address
    ).options(joinedload(Campaign.contributions)).order_by(Campaign.created_at.desc()).all()
    created_campaigns_serialized = [
        serialize_campaign(c, len(c.contributions)) for c in created_campaigns
    ]

    # Campaigns contributed to by the wallet
    contributions = db.query(Contribution).filter(
        Contribution.contributor == wallet_address
    ).all()
    campaign_ids = list({c.campaign_id for c in contributions})
    contributed_campaigns = db.query(Campaign).filter(Campaign.id.in_(campaign_ids)).all()
    contributed_campaigns_serialized = [
        serialize_campaign(c, len(c.contributions)) for c in contributed_campaigns
    ]

    return {
        "average_reputation": average_reputation,
        "total_submissions": total_submissions,
        "campaigns_created": created_campaigns_serialized,
        "campaigns_contributed": contributed_campaigns_serialized,
    }


@router.get("/analytics/leaderboard/global")
def get_global_leaderboard(db: Session = Depends(get_session)):
    results = (
        db.query(
            Contribution.contributor,
            func.count(Contribution.contribution_id).label("submissions")
        )
        .group_by(Contribution.contributor)
        .order_by(func.count(Contribution.contribution_id).desc())
        .limit(10)
        .all()
    )
    return [{"contributor": r.contributor, "submissions": r.submissions} for r in results]


@router.get("/analytics/average-ai-verification/{wallet_address}/{onchain_campaign_id}")
def get_average_ai_verification(
    wallet_address: str, 
    onchain_campaign_id: str, 
    db: Session = Depends(get_session)
):
    campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == onchain_campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    total_ai_score, contrib_count = db.query(
        func.sum(Contribution.ai_verification_score).label('total_ai_score'),
        func.count(Contribution.contribution_id).label('contrib_count')
    ).filter(
        Contribution.contributor == wallet_address,
        Contribution.campaign_id == campaign.id
    ).first()

    if contrib_count == 0:
        return {"average_ai_verification": 0}

    avg_ai_verification = total_ai_score / contrib_count if total_ai_score is not None else 0
    return {"average_ai_verification": avg_ai_verification}



@router.get("/analytics/leaderboard/global/contributors")
def get_top_global_contributors(db: Session = Depends(get_session)):
    """
    Returns top 5 global contributors across all campaigns.
    For each contributor, returns:
      - address
      - total contributions (count)
      - success rate (average AI verification score)
      - total amount earned (sum of campaign.unit_price for each contribution)
    """
    results = (
        db.query(
            Contribution.contributor.label("address"),
            func.count(Contribution.contribution_id).label("total_contributions"),
            func.avg(Contribution.ai_verification_score).label("success_rate"),
            func.sum(Campaign.unit_price).label("total_amount_earned")
        )
        .join(Campaign, Campaign.id == Contribution.campaign_id)
        .group_by(Contribution.contributor)
        .order_by(func.count(Contribution.contribution_id).desc())  # Order by total contributions (descending)
        .limit(5)
        .all()
    )
    # Use the _mapping attribute to convert each row to a dict.
    return [dict(r._mapping) for r in results]



@router.get("/analytics/leaderboard/global/creators")
def get_top_campaign_creators(db: Session = Depends(get_session)):
    """
    Returns top 5 campaign creators.
    For each creator, returns:
      - creator wallet address
      - total number of campaigns created
      - total amount spent (sum of campaign.total_budget for campaigns they created)
      - reputation score (average reputation_score from contributions on their campaigns)
    """
    # First, build a subquery to compute the average reputation score for each creator.
    creator_reputation_subq = (
        db.query(
            Campaign.creator_wallet_address.label("creator"),
            func.avg(Contribution.reputation_score).label("avg_reputation")
        )
        .join(Contribution, Contribution.campaign_id == Campaign.id)
        .group_by(Campaign.creator_wallet_address)
        .subquery()
    )

    results = (
        db.query(
            Campaign.creator_wallet_address.label("creator"),
            func.count(Campaign.id).label("total_campaigns"),
            func.sum(Campaign.total_budget).label("total_amount_spent"),
            creator_reputation_subq.c.avg_reputation.label("reputation_score")
        )
        .outerjoin(creator_reputation_subq, Campaign.creator_wallet_address == creator_reputation_subq.c.creator)
        .group_by(Campaign.creator_wallet_address, creator_reputation_subq.c.avg_reputation)
        .order_by(func.count(Campaign.id).desc())
        .limit(5)
        .all()
    )
    return [dict(r._mapping) for r in results]




@router.post("/calculate-peak-activity")
def calculate_peak_activity_hours(onchain_campaign_id: str, db: Session = Depends(get_session)):
    # Get the current date (today's date)
    today = datetime.utcnow().date()  # Use UTC to ensure the current date is consistent across time zones

    # Generate the 6-hour time intervals for the current day
    timeframes = []
    for i in range(0, 24, 6):
        start_time = datetime.combine(today, datetime.min.time()) + timedelta(hours=i)
        end_time = start_time + timedelta(hours=6)
        timeframes.append({
            "start_time": start_time,
            "end_time": end_time
        })

    peak_activity_by_campaign = {}

    # Loop over each timeframe and calculate activity for the specified campaign
    for timeframe in timeframes:
        start_time = timeframe["start_time"]
        end_time = timeframe["end_time"]

        # Query to get the campaign by onchain_campaign_id
        campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == onchain_campaign_id).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found for the given onchain_campaign_id")

        # Get the campaign ID
        campaign_id = campaign.id

        # Query to fetch activities within the time range for the specific campaign
        activity_data = (
            db.query(func.avg(Activity.activity_level).label("avg_activity"))
            .filter(
                Activity.timestamp >= start_time,
                Activity.timestamp < end_time,  # Ensure it's strictly within the time range
                Activity.campaign_id == campaign_id  # Filter by campaign ID
            )
            .scalar()
        )

        # Store the activity level for the specific campaign and timeframe
        if activity_data is not None:
            if campaign_id not in peak_activity_by_campaign:
                peak_activity_by_campaign[campaign_id] = {}

            peak_activity_by_campaign[campaign_id][f"{start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}"] = activity_data
        else:
            # If no activity data is found for this timeframe, set it to 0
            if campaign_id not in peak_activity_by_campaign:
                peak_activity_by_campaign[campaign_id] = {}

            peak_activity_by_campaign[campaign_id][f"{start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}"] = 0

    return peak_activity_by_campaign


@router.get("/analytics/campaign/{onchain_campaign_id}/activity")
def get_campaign_activity(onchain_campaign_id: str, db: Session = Depends(get_session)):
    """
    Returns the overall activity level for the given campaign identified by onchain_campaign_id.
    """
    campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == onchain_campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Retrieve the current overall activity level for the campaign
    if campaign.current_activity_level is None:
        raise HTTPException(status_code=404, detail="No activity recorded for this campaign yet")

    return {"campaign_id": campaign.id, "overall_activity_level": campaign.current_activity_level}



@router.get("/analytics/contribution/{contribution_id}/activity")
def get_contribution_activity(contribution_id: str, db: Session = Depends(get_session)):
    """
    Returns the activity level of a specific contribution identified by its contribution_id.
    """
    # Retrieve the contribution by its contribution_id
    contribution = db.query(Contribution).filter(Contribution.contribution_id == contribution_id).first()
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    
    # Retrieve the associated activity record using the contribution_id
    activity = db.query(Activity).filter(Activity.contribution_id == contribution.contribution_id).first()
    
    if not activity:
        raise HTTPException(status_code=404, detail="Activity for this contribution not found")

    return {
        "contribution_id": contribution.contribution_id,
        "activity_level": activity.activity_level,
        "timestamp": activity.timestamp
    }



@router.get("/analytics/contributor/{wallet_address}")
def get_contributor_analytics(wallet_address: str, db: Session = Depends(get_session)):
    """
    Returns analytics for a given contributor (by wallet address), including:
      - average quality score category across campaigns (calculated from the average raw quality score)
      - average AI verification score across contributions
      - unique contributions (distinct campaign IDs contributed to)
      - total contributions (count of all contributions)
      - average reputation score across contributions
    """
    # Query all contributions for this contributor
    contributions = db.query(Contribution).filter(Contribution.contributor == wallet_address).all()
    
    if not contributions:
        raise HTTPException(status_code=404, detail="No contributions found for this contributor")
    
    total_contributions = len(contributions)
    unique_contributions = len({c.campaign_id for c in contributions})
    
    # Average quality score
    quality_scores = [c.quality_score for c in contributions if c.quality_score is not None]
    average_quality = sum(quality_scores) / len(quality_scores) if quality_scores else 0
    overall_quality_category = get_quality_score_category(average_quality) if quality_scores else "No Data"
    
    # Average AI verification score
    ai_scores = [c.ai_verification_score for c in contributions if c.ai_verification_score is not None]
    average_ai = sum(ai_scores) / len(ai_scores) if ai_scores else 0

    # Average reputation score
    rep_scores = [c.reputation_score for c in contributions if c.reputation_score is not None]
    average_reputation = sum(rep_scores) / len(rep_scores) if rep_scores else 0

    return {
        "average_quality_category": overall_quality_category,
        "average_ai_verification_score": average_ai,
        "unique_contributions": unique_contributions,
        "total_contributions": total_contributions,
        "average_reputation_score": average_reputation
    }