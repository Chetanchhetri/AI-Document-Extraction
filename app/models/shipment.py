from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import tz_column, utcnow
from app.models.enums import DocType, ExtractionStatus, ShipmentStatus


class Shipment(SQLModel, table=True):
    __tablename__ = "shipments"

    id: Optional[int] = Field(default=None, primary_key=True)
    shipment_code: str = Field(index=True, unique=True, max_length=32)
    supplier_name: str = Field(index=True, max_length=200)
    status: ShipmentStatus = Field(default=ShipmentStatus.ingested)
    created_by_id: int = Field(foreign_key="users.id", index=True)
    created_at: datetime = Field(default_factory=utcnow, sa_column=tz_column())
    updated_at: datetime = Field(default_factory=utcnow, sa_column=tz_column(onupdate=True))


class Document(SQLModel, table=True):
    __tablename__ = "documents"

    id: Optional[int] = Field(default=None, primary_key=True)
    shipment_id: int = Field(foreign_key="shipments.id", index=True)
    doc_type: DocType
    file_path: str  # server-generated UUID path, never derived from user input
    file_name: str = Field(max_length=255)  # sanitised display name only
    file_size_bytes: int
    mime_type: str = Field(max_length=100)
    uploaded_at: datetime = Field(default_factory=utcnow, sa_column=tz_column())
    # --- additions beyond the base spec (pipeline bookkeeping) ---
    sha256: str = Field(index=True, max_length=64)
    page_count: int = 1
    extraction_status: ExtractionStatus = Field(default=ExtractionStatus.pending)
    extraction_error: Optional[str] = Field(default=None, max_length=500)
