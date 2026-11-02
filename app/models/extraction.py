from typing import Any, Optional

from sqlalchemy import JSON, Column, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class ExtractedField(SQLModel, table=True):
    __tablename__ = "extracted_fields"
    __table_args__ = (UniqueConstraint("document_id", "field_name", name="uq_field_per_document"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    shipment_id: int = Field(foreign_key="shipments.id", index=True)
    document_id: int = Field(foreign_key="documents.id", index=True)
    field_name: str = Field(index=True, max_length=64)
    field_value: str = Field(default="", sa_column=Column(Text, nullable=False, default=""))  # AES-GCM if PII
    confidence_score: float = 0.0
    is_low_confidence: bool = True
    is_human_verified: bool = False
    bounding_box: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON, nullable=True))


class ShipmentLineItem(SQLModel, table=True):
    __tablename__ = "shipment_line_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    shipment_id: int = Field(foreign_key="shipments.id", index=True)
    item_description: str = Field(sa_column=Column(Text, nullable=False))
    hsn_code: Optional[str] = Field(default=None, max_length=16, index=True)
    quantity: float = 0.0
    unit_price: float = 0.0
    currency: str = Field(default="", max_length=8)
    total_amount: float = 0.0
    gross_weight_kg: Optional[float] = None
    # {"model": "<embedding model id>", "vector": [floats]} produced by the embedding engine
    embedding: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON, nullable=True))
