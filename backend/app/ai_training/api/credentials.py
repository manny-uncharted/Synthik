from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.ai_training.models import UserExternalServiceCredential
from app.ai_training.schemas import (
    UserExternalServiceCredentialCreate,
    UserExternalServiceCredentialResponse
)

router = APIRouter(prefix="/user-credentials", tags=["User Credentials"])


@router.post(
    "",
    response_model=UserExternalServiceCredentialResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_credential(
    cred_in: UserExternalServiceCredentialCreate,
    db: Session = Depends(get_db),
):
    # conflict check
    exists = (
        db.query(UserExternalServiceCredential)
          .filter_by(
              user_wallet_address=cred_in.user_wallet_address,
              platform=cred_in.platform,
              credential_name=cred_in.credential_name
          )
          .first()
    )
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Credential name exists for user/platform.",
        )

    db_cred = UserExternalServiceCredential(**cred_in.model_dump())
    if cred_in.api_key:
        db_cred.set_api_key(cred_in.api_key.get_secret_value())
    if cred_in.secret_key:
        db_cred.set_secret_key(cred_in.secret_key.get_secret_value())

    db.add(db_cred)
    db.commit()
    db.refresh(db_cred)

    resp = UserExternalServiceCredentialResponse.from_orm(db_cred)
    resp.has_api_key = bool(db_cred.encrypted_api_key)
    resp.has_secret_key = bool(db_cred.encrypted_secret_key)
    return resp


@router.get(
    "/{credential_id}",
    response_model=UserExternalServiceCredentialResponse,
)
def get_credential(
    credential_id: str,
    db: Session = Depends(get_db),
):
    cred = db.get(UserExternalServiceCredential, credential_id)
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    resp = UserExternalServiceCredentialResponse.from_orm(cred)
    resp.has_api_key = bool(cred.encrypted_api_key)
    resp.has_secret_key = bool(cred.encrypted_secret_key)
    return resp


@router.get(
    "/by-user/{user_wallet}",
    response_model=list[UserExternalServiceCredentialResponse],
)
def list_credentials(
    user_wallet: str,
    db: Session = Depends(get_db),
):
    creds = (
        db.query(UserExternalServiceCredential)
          .filter_by(user_wallet_address=user_wallet)
          .all()
    )
    out = []
    for c in creds:
        resp = UserExternalServiceCredentialResponse.from_orm(c)
        resp.has_api_key = bool(c.encrypted_api_key)
        resp.has_secret_key = bool(c.encrypted_secret_key)
        out.append(resp)
    return out


@router.delete(
    "/{credential_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_credential(
    credential_id: str,
    db: Session = Depends(get_db),
):
    cred = db.get(UserExternalServiceCredential, credential_id)
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    # Check active jobs
    active = (
        db.query(AITrainingJob)
          .filter(
             AITrainingJob.user_credential_id == credential_id,
             AITrainingJob.status.in_([JobStatus.PENDING, JobStatus.RUNNING])
          )
          .count()
    )
    if active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credential in use by active job(s)."
        )
    db.delete(cred)
    db.commit()
