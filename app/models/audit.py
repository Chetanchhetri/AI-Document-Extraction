from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

from app.models.base import tz_column, utcnow
from app.models.enums import CheckStatus


class CrossCheck(SQLModel, table=True):
    __tablename__ = "cross_checks"

    id: Optional[int] = Field(default=None, primary_key=True)
    shipment_id: int = Field(foreign_key="shipments.id", index=True)
    check_name: str = Field(index=True, max_length=64)
    status: CheckStatus
    source_value_1: str = Field(default="", max_length=500)
    source_value_2: str = Field(default="", max_length=500)
    variance_note: Optional[str] = Field(default=None, max_length=1000)
    overridden_by_id: Optional[int] = Field(default=None, foreign_key="users.id")
    override_reason: Optional[str] = Field(default=None, max_length=1000)


class AuditLog(SQLModel, table=True):
    """Field-level and override audit trail. PII values are stored masked."""

    __tablename__ = "audit_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    # extracted_field_id is nullable (deviation from the base spec) so cross-check overrides
    # and bulk actions can be audited too.
    extracted_field_id: Optional[int] = Field(default=None, foreign_key="extracted_fields.id", index=True)
    cross_check_id: Optional[int] = Field(default=None, foreign_key="cross_checks.id", index=True)
    shipment_id: Optional[int] = Field(default=None, foreign_key="shipments.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    previous_value: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    new_value: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    action: str = Field(max_length=40, index=True)  # FIELD_VERIFIED, FIELD_EDITED, CHECK_OVERRIDDEN, ...
    timestamp: datetime = Field(default_factory=utcnow, sa_column=tz_column())
