# download_and_reconstruct.py

import asyncio
import argparse
import tarfile
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

# --- Project-specific Imports ---
# Assumes the script is run from the project root with PYTHONPATH=.
from app.core.database import get_session
from app.campaigns.models import Campaign, Contribution
from app.storage.walrus import WalrusClient

async def main(onchain_id: str, output_dir: str):
    """
    Main function to find a campaign by its onchain ID, download all its
    contribution files from Walrus, reconstruct the original directory
    structure, and create a compressed tar.gz archive.
    """
    print(f"--- Starting Download and Reconstruction for Campaign: {onchain_id} ---")
    
    db: Session = next(get_session())
    walrus_client = WalrusClient()

    # Define the temporary directory where files will be reconstructed.
    reconstruction_base_path = Path(output_dir) / f"reconstructed_{onchain_id}"
    
    try:
        # Step 1: Find the campaign in the database.
        campaign = db.query(Campaign).filter(Campaign.onchain_campaign_id == onchain_id).first()
        if not campaign:
            print(f"Error: Campaign with onchain_id '{onchain_id}' not found in the database.")
            return

        # Step 2: Fetch all contributions for this campaign.
        contributions = db.query(Contribution).filter(Contribution.campaign_id == campaign.id).all()
        if not contributions:
            print(f"No contributions found for campaign '{onchain_id}'. Nothing to do.")
            return
            
        print(f"Found {len(contributions)} contributions. Starting reconstruction in '{reconstruction_base_path}'...")
        reconstruction_base_path.mkdir(parents=True, exist_ok=True)
        
        # Step 3: Loop through each contribution, download, and place the file.
        for contribution in contributions:
            if not contribution.filename or not contribution.data_url:
                print(f"  > WARNING: Skipping contribution {contribution.contribution_id} due to missing filename or data_url.")
                continue

            # This is the key step: creating the full local path from the stored relative filename.
            target_file_path = reconstruction_base_path / contribution.filename
            
            # Ensure the parent directory exists before downloading the file.
            target_file_path.parent.mkdir(parents=True, exist_ok=True)
            
            print(f"  Reconstructing: {target_file_path}")

            try:
                # Extract the blob_id from the data_url.
                blob_id = contribution.data_url.split('/')[-1]
                
                # Download the file from Walrus and save it to the target path.
                await walrus_client.read_blob(blob_id=blob_id, output_path=target_file_path)

            except Exception as e:
                print(f"  > ERROR: Failed to download/save blob for {contribution.filename}. Reason: {e}")

        # Step 4: Create a compressed tar.gz archive of the reconstructed directory.
        archive_name = Path(output_dir) / f"{onchain_id}_reconstructed.tar.gz"
        print(f"\nAll files downloaded. Creating archive: {archive_name}")
        
        with tarfile.open(archive_name, "w:gz") as tar:
            # arcname='.' ensures the files are added from the root of the tarball.
            tar.add(reconstruction_base_path, arcname=reconstruction_base_path.name)
            
        print("Archive created successfully.")

    finally:
        # Step 5: Clean up by removing the temporary reconstruction directory.
        if reconstruction_base_path.exists():
            print(f"Cleaning up temporary directory: {reconstruction_base_path}")
            shutil.rmtree(reconstruction_base_path)
            
        db.close()
        await walrus_client.close()
        print("\n--- Process Finished ---")

if __name__ == "__main__":
    # Setup command-line argument parsing
    parser = argparse.ArgumentParser(description="Download and reconstruct campaign data from Walrus.")
    parser.add_argument(
        "--onchain-id",
        default="campaign_7e8d4cf5200006f7",
        required=True,
        help="The onchain_campaign_id of the campaign to download."
    )
    parser.add_argument(
        "--output-dir",
        default=".",
        help="The directory where the final .tar.gz archive will be saved. Defaults to the current directory."
    )
    args = parser.parse_args()

    # This setup allows the script to find your 'app' module
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    
    asyncio.run(main(onchain_id=args.onchain_id, output_dir=args.output_dir))