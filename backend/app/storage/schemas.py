from typing import Optional, Dict, Union # Ensure Optional is imported
from pydantic import BaseModel

class BlobObject(BaseModel):
    id: str
    registeredEpoch: int
    blobId: str
    size: int
    encodingType: str
    certifiedEpoch: Optional[int] = None
    storage: Dict
    deletable: bool

class ResourceOperationDetail(BaseModel): # Defined for clarity, assuming structure
    encodedLength: int
    epochsAhead: int
    # Add other fields if present in registerFromScratch

class ResourceOperation(BaseModel):
    registerFromScratch: ResourceOperationDetail # Or Dict if structure varies wildly

class NewlyCreatedResponse(BaseModel):
    blobObject: BlobObject
    resourceOperation: ResourceOperation # Or Dict if structure varies
    cost: int

class EventDetail(BaseModel): # Defined for clarity, assuming structure for 'event'
    # Define fields that are expected within the 'event' dictionary
    # For example:
    # type: str
    # message: str
    pass # Replace with actual fields if known

class AlreadyCertifiedResponse(BaseModel):
    blobId: str
    event: EventDetail # Or Dict if structure varies or is unknown
    endEpoch: int

# Your WalrusStoreResponse definition remains the same conceptually
# It should be a dictionary where the key is a string (like "newlyCreated" or "alreadyCertified")
# and the value is one of the Pydantic models defined above.
WalrusStoreResponse = Dict[str, Union[NewlyCreatedResponse, AlreadyCertifiedResponse]]

