"""Logging setup with automatic PII redaction (emails / phone numbers)."""
import logging

from app.core.config import settings
from app.core.encryption import redact_text


class PIIMaskingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.msg = redact_text(record.getMessage())
            record.args = ()
        except Exception:  # never break logging
            pass
        return True


def setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    pii_filter = PIIMaskingFilter()
    for handler in logging.getLogger().handlers:
        handler.addFilter(pii_filter)
    # uvicorn.access is skipped on purpose: its formatter needs the original record.args
    for name in ("uvicorn", "uvicorn.error"):
        for handler in logging.getLogger(name).handlers:
            handler.addFilter(pii_filter)
        logging.getLogger(name).addFilter(pii_filter)
