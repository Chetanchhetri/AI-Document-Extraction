from datetime import datetime
from typing import Annotated, Any, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.enums import CheckStatus, DocType, ExtractionStatus, ShipmentStatus
from app.schemas.auth import _Strict

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=1000)]


class ShipmentCreate(_Strict):
    supplier_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ShipmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    shipment_code: str
    supplier_name: str
    status: ShipmentStatus
    created_by_id: int
    created_at: datetime
    updated_at: datetime


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    shipment_id: int
    doc_type: DocType
    file_name: str
    file_size_bytes: int
    mime_type: str
    page_count: int
    extraction_status: ExtractionStatus
    extraction_error: Optional[str] = None
    uploaded_at: datetime


class FieldRead(BaseModel):
    id: int
    document_id: int
    field_name: str
    field_value: str
    confidence_score: float
    is_low_confidence: bool
    is_human_verified: bool
    bounding_box: Optional[dict[str, Any]] = None


class FieldUpdate(_Strict):
    value: Optional[Annotated[str, StringConstraints(max_length=2000)]] = None
    is_human_verified: bool = True


class CrossCheckRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    check_name: str
    status: CheckStatus
    source_value_1: str
    source_value_2: str
    variance_note: Optional[str] = None
    overridden_by_id: Optional[int] = None
    override_reason: Optional[str] = None


class OverrideRequest(_Strict):
    override_reason: Reason
    check_id: Optional[int] = Field(default=None, description="Only needed for the body-based route")


class LineItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item_description: str
    hsn_code: Optional[str] = None
    quantity: float
    unit_price: float
    currency: str
    total_amount: float
    gross_weight_kg: Optional[float] = None


class DocumentReview(BaseModel):
    document: DocumentRead
    fields: list[FieldRead]


class ReviewResponse(BaseModel):
    shipment: ShipmentRead
    bbox_reference: dict[str, Any]
    documents: list[DocumentReview]
    cross_checks: list[CrossCheckRead]
    line_items: list[LineItemRead]
    export_blockers: list[dict[str, Any]]
    export_ready: bool


class HSNSuggestRequest(_Strict):
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]
    top_k: int = Field(default=5, ge=1, le=20)
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class HSNSuggestion(BaseModel):
    hsn_code: str
    score: float
    matched_description: str
    shipment_code: str
    occurrences: int
