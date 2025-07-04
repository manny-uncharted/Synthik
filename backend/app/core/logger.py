import structlog
from structlog.stdlib import LoggerFactory

structlog.configure(
    logger_factory=LoggerFactory(),
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
)

logger = structlog.get_logger()
