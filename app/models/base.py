from datetime import datetime, timezone

from sqlalchemy import Column, DateTime


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def tz_column(*, onupdate: bool = False) -> Column:
    kwargs = {"onupdate": utcnow} if onupdate else {}
    return Column(DateTime(timezone=True), nullable=False, **kwargs)
