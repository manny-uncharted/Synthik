# upload_and_register.py

import asyncio
import random
import string
import uuid
import mimetypes
from pathlib import Path
from typing import List
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

# --- Project-specific Imports ---
# These assume the script is run from the project root with PYTHONPATH=.
from app.core.database import get_session
from app.campaigns.models import Campaign, Contribution
from app.ai_training.models import ProcessedDataset
from app.storage.walrus import WalrusClient

# --- Configuration ---
# The root directory containing the data to be uploaded (e.g., MELD.Raw)
BASE_DATA_DIR = Path("MELD.Raw") 
# The specific onchain_campaign_id we are targeting for these contributions.
TARGET_ONCHAIN_CAMPAIGN_ID = "campaign_7e8d4cf5200006f7"
# The manifest file that lists the directory structure.
STRUCTURE_FILE = "directory_structure.txt"

IGNORED_FILES = {'.DS_Store', 'Thumbs.db', 'README.txt'}
# A list of wallet addresses to be randomly assigned as contributors.
WALLET_ADDRESSES = [
    "0xc23a5982f816b56873694aacb5a437c3620c700d47118e197a6eb046ac04b7e3",
    "0x394f7556d9c9e83cd8adddf20562fe7949b6cc7ab22d68e94523a59de6ca491b",
    "0x0fff91b2d45dcd18454cfff5ad42ca217cb77d897998581dbc76ecc9ef729d0c",
    "0x38f688dde04e92bc18f94f29524cc4f6d6cb56cd0fd2dfa00e92e2ff2a5fcea0",
    "0x91bf699a1747f9c6a79229e84c46eb14f80b8d6dd65fb388eaa09a30010e3219",
    "0xa3ffd85c4c4ea5ec79102aa2c511016a63aff30b11e039e4fdd22f22175b3f5a",
    "0xd0e5deadb9ee18f76da3598d9c136238af17240bc4353d89d9af02d1a3bcc8d8",
]

def generate_random_hash(length: int = 64) -> str:
    """Generates a random hex string to simulate a transaction hash."""
    return '0x' + ''.join(random.choices(string.hexdigits.lower(), k=length))


def get_or_create_campaign(db: Session, onchain_id: str) -> Campaign:
    """
    Retrieves a campaign by its onchain_id, creating it if it doesn't exist.
    """
    campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == onchain_id).first()

    if not campaign:
        print(f"Campaign with onchain_id '{onchain_id}' not found. Creating it now.")
        expiration_date = datetime.utcnow() + timedelta(days=90)
        expiration_timestamp = int(expiration_date.timestamp())

        campaign = Campaign(
            id=str(uuid.uuid4()),
            onchain_campaign_id=onchain_id,
            title=f"MELD Dataset Campaign ({onchain_id})",
            description="Campaign for the MELD dataset including raw video and audio.",
            campaign_type="data_collection",
            creator_wallet_address="0xCREATOR_WALLET_ADDRESS_HERE",
            data_requirements="Video and audio files.",
            quality_criteria="Clear audio and video.",
            unit_price=0.1,
            total_budget=1000.0,
            min_data_count=1,
            max_data_count=10000,
            expiration=expiration_timestamp,
            metadata_uri="",
            transaction_hash=generate_random_hash(),
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)
        print(f"Created new campaign with internal ID: {campaign.id}")
    else:
        print(f"Found existing campaign with internal ID: {campaign.id}")

    return campaign


async def main():
    """
    Main function to find, upload, and register files.
    It skips files already in the database for this campaign.
    """
    print("--- Starting Upload and Registration Process ---")

    db: Session = next(get_session())
    walrus_client = WalrusClient()
    total_files_processed = 0
    total_files_skipped = 0

    try:
        campaign = get_or_create_campaign(db, TARGET_ONCHAIN_CAMPAIGN_ID)
        print(f"Scanning for files in '{BASE_DATA_DIR}' and its subdirectories...")

        for local_file_path in BASE_DATA_DIR.rglob('*'):
            if not local_file_path.is_file():
                continue
            if local_file_path.name in IGNORED_FILES:
                # This check is for user-ignored files like .DS_Store
                continue

            # --- FINAL FEATURE: Check if file already exists in DB ---
            relative_path_str = str(local_file_path.relative_to(BASE_DATA_DIR))
            
            existing_contribution = db.query(Contribution).filter_by(
                campaign_id=campaign.id,
                filename=relative_path_str
            ).first()

            if existing_contribution:
                total_files_skipped += 1
                continue # Skip to the next file
            # -------------------------------------------------------------

            print(f"\nProcessing new file: {local_file_path}")

            try:
                # Step 1: Upload the file
                upload_response = await walrus_client.store_blob(data=local_file_path)
                if 'newlyCreated' in upload_response:
                    blob_id = upload_response['newlyCreated']['blobObject']['blobId']
                elif 'alreadyCertified' in upload_response:
                    blob_id = upload_response['alreadyCertified']['blobId']
                else:
                    print(f"Error: Could not determine blobId for {local_file_path}. Response: {upload_response}")
                    continue
                print(f"  > Uploaded to Walrus. Blob ID: {blob_id}")

                # Step 2: Prepare the Contribution object
                file_type, _ = mimetypes.guess_type(local_file_path)
                now = datetime.utcnow()
                start_date = now - timedelta(days=30)
                random_seconds = random.uniform(0, 30 * 24 * 60 * 60)
                random_created_at = start_date + timedelta(seconds=random_seconds)

                new_contribution = Contribution(
                    campaign_id=campaign.id,
                    contributor=random.choice(WALLET_ADDRESSES),
                    data_url=f"https://publisher.walrus-testnet.walrus.space/{blob_id}",
                    filename=relative_path_str,
                    file_type=file_type or 'application/octet-stream',
                    onchain_contribution_id=f"contrib_{uuid.uuid4().hex[:12]}",
                    transaction_hash=generate_random_hash(),
                    quality_score=random.uniform(90.0, 100.0),
                    ai_verification_score=random.uniform(90.0, 100.0),
                    reputation_score=random.uniform(85.0, 99.0),
                    is_verified=True,
                    reward_claimed=False,
                    created_at=random_created_at,
                )

                # Step 3: Add and commit the single contribution immediately
                print(f"  > Preparing contribution for DB with filename: '{new_contribution.filename}' on {random_created_at.date()}")
                db.add(new_contribution)
                db.commit()
                total_files_processed += 1
                print(f"  > Successfully committed contribution to database.")

            except Exception as e:
                print(f"  > ERROR: Failed to process {local_file_path}. Reason: {e}")
                print("  > Rolling back transaction for this file.")
                db.rollback()

        # Final summary message
        print("\n--- Summary ---")
        if total_files_skipped > 0:
            print(f"Skipped {total_files_skipped} file(s) that were already in the database.")
        if total_files_processed > 0:
            print(f"Successfully processed and committed {total_files_processed} new file(s).")
        
        if total_files_processed == 0 and total_files_skipped > 0:
             print("No new files to process. All contributions are up to date.")
        elif total_files_processed == 0 and total_files_skipped == 0:
            print("No valid files were found to process.")

    finally:
        db.close()
        await walrus_client.close()
        print("\n--- Process Finished ---")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    asyncio.run(main())