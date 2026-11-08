from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import Field
from app.models.enums import CheckStatus, DocType, ExtractionStatus, ShipmentStatus
from app.schemas.base import BaseSchema


class ShipmentCreate(BaseSchema):
    supplier: Optional[str] = None
    supplier_name: Optional[str] = None
    notes: Optional[str] = None

    @property
    def effective_supplier(self) -> str:
        return self.supplier or self.supplier_name or "Unknown Supplier"


class ShipmentRead(BaseSchema):
    id: int
    shipment_code: str
    supplier_name: str
    status: ShipmentStatus
    created_by_id: int
    created_at: datetime
    updated_at: datetime


class DocumentRead(BaseSchema):
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


class FieldRead(BaseSchema):
    id: int
    document_id: int
    shipment_id: Optional[int] = None
    field_name: str
    field_value: str
    confidence_score: float
    is_low_confidence: Optional[bool] = False
    is_human_verified: bool
    bounding_box: Optional[Dict[str, Any]] = Field(default=None, alias="bbox")
    bbox: Optional[Dict[str, Any]] = None


class FieldUpdate(BaseSchema):
    value: Optional[str] = None
    field_value: Optional[str] = None
    is_human_verified: Optional[bool] = True

    @property
    def effective_value(self) -> Optional[str]:
        return self.value if self.value is not None else self.field_value


class CrossCheckRead(BaseSchema):
    id: int
    shipment_id: Optional[int] = None
    check_name: Optional[str] = None
    rule_name: Optional[str] = None
    description: Optional[str] = None
    status: CheckStatus
    source_value_1: Optional[str] = None
    source_value_2: Optional[str] = None
    variance_note: Optional[str] = None
    overridden_by_id: Optional[int] = None
    override_reason: Optional[str] = None


class OverrideRequest(BaseSchema):
    check_id: Optional[int] = None
    override_reason: str


class LineItemRead(BaseSchema):
    id: int
    shipment_id: Optional[int] = None
    item_description: str
    hsn_code: Optional[str] = None
    quantity: float
    unit_price: float
    currency: Optional[str] = "USD"
    total_amount: float
    gross_weight_kg: Optional[float] = None


class DocumentReview(BaseSchema):
    document: DocumentRead
    fields: List[FieldRead]


class ReviewResponse(BaseSchema):
    shipment: ShipmentRead
    bbox_reference: Dict[str, Any]
    documents: List[DocumentReview]
    cross_checks: List[CrossCheckRead]
    line_items: List[LineItemRead]
    export_blockers: List[Dict[str, Any]]
    export_ready: bool


class HSNSuggestRequest(BaseSchema):
    description: Optional[str] = None
    item_description: Optional[str] = None
    top_k: int = Field(default=5, ge=1, le=20)
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)

    @property
    def effective_description(self) -> str:
        return self.description or self.item_description or ""


class HSNSuggestion(BaseSchema):
    hsn_code: str
    score: float
    matched_description: str
    shipment_code: str
    occurrences: int