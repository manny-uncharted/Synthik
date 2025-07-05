import enum

class StorageType(str, enum.Enum):
    AKAVE = "akave"
    LOCAL_FS = "local_fs"
    GCS = "gcs"
    AZURE_BLOB = "azure_blob"
    HUGGING_FACE = "hugging_face"


class ModelStorageType(str, enum.Enum):
    AKAVE = "akave"
    LOCAL_FS = "local_fs"
    GCS = "gcs"
    AZURE_BLOB = "azure_blob"
    HUGGING_FACE = "HUGGING_FACE"


class TrainingJobType(str, enum.Enum):
    TEXT_CLASSIFICATION = "TEXT_CLASSIFICATION"
    TEXT_GENERATION_LORA = "TEXT_GENERATION_LORA"
    IMAGE_CLASSIFICATION = "IMAGE_CLASSIFICATION"
    # IMAGE_SEGMENTATION = "IMAGE_SEGMENTATION"
    # IMAGE_GENERATION = "IMAGE_GENERATION"
    


class TrainingPlatform(str, enum.Enum):
    LOCAL_SERVER = "local_server"
    HUGGING_FACE = "hugging_face"
    AWS_SAGEMAKER = "aws_sagemaker"
    GOOGLE_VERTEX_AI = "google_vertex_ai"
    LIGHTNING_STUDIOS = "lightning_studios"
    CUSTOM_EXTERNAL = "custom_external"


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    PREPARING_DATA = "preparing_data"
    SUBMITTED = "submitted"
    INITIALIZING = "initializing"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLING = "cancelling"
    CANCELLED = "cancelled"
    FAILED = "failed"
    UNKNOWN = "unknown"
    UPDATING_METRICS = "updating_metrics"


class HFRepoType(str, enum.Enum):
    MODEL = "model"
    SPACE = "space"
    