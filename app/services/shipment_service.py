"""Shared shipment helpers: lookups, field serialisation, audit writes, status refresh."""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.encryption import mask_pii, read_field_value
from app.models import AuditLog, Document, ExtractedField, Shipment, ShipmentStatus
from app.schemas.shipment import FieldRead
from app.services.gatekeeper import collect_blockers

from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.models.shipment import Shipment
from app.schemas.shipment import (
    ShipmentQueryRequest, 
    ShipmentQueryResponse, 
    ShipmentCompareRequest, 
    ShipmentCompareResponse,
    ComparisonItem
)

async def get_shipment_or_404(session: AsyncSession, shipment_id: int) -> Shipment:
    shipment = await session.get(Shipment, shipment_id)
    if shipment is None:
        raise HTTPException(404, "Shipment not found")
    return shipment


def field_to_read(f: ExtractedField) -> FieldRead:
    return FieldRead(
        id=f.id, document_id=f.document_id, field_name=f.field_name,
        field_value=read_field_value(f.field_name, f.field_value),
        confidence_score=f.confidence_score, is_low_confidence=f.is_low_confidence,
        is_human_verified=f.is_human_verified, bounding_box=f.bounding_box,
    )


def audit(*, user_id: int, action: str, shipment_id: int, field: Optional[ExtractedField] = None,
          cross_check_id: Optional[int] = None, previous: Optional[str] = None, new: Optional[str] = None) -> AuditLog:
    """Build an audit row. Values for PII fields are masked before they ever reach the table."""
    name = field.field_name if field else ""
    return AuditLog(
        extracted_field_id=field.id if field else None, cross_check_id=cross_check_id, shipment_id=shipment_id,
        user_id=user_id, action=action, previous_value=mask_pii(name, previous), new_value=mask_pii(name, new),
    )


async def refresh_status(session: AsyncSession, shipment: Shipment) -> Shipment:
    """needs_review <-> approved, driven by the gatekeeper rules. Processing/exported are left alone."""
    if shipment.status in (ShipmentStatus.needs_review, ShipmentStatus.approved):
        blockers = await collect_blockers(session, shipment.id)
        shipment.status = ShipmentStatus.needs_review if blockers else ShipmentStatus.approved
        session.add(shipment)
    return shipment


async def documents_of(session: AsyncSession, shipment_id: int) -> list[Document]:
    return list((await session.exec(select(Document).where(Document.shipment_id == shipment_id).order_by(Document.id))).all())


class ShipmentService:
    @staticmethod
    async def query_single_shipment(
        db: Session, shipment_id: str, payload: ShipmentQueryRequest
    ) -> ShipmentQueryResponse:
        shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
        if not shipment:
            raise ValueError(f"Shipment '{shipment_id}' not found.")

        # Aggregate context from shipment metadata, extracted fields, and line items
        context_data = {
            "shipment_id": str(shipment.id),
            "tracking_code": getattr(shipment, "tracking_code", None),
            "supplier_name": getattr(shipment, "supplier_name", None),
            "status": getattr(shipment, "status", None),
            "fields": {field.key: field.value for field in getattr(shipment, "extracted_fields", [])},
            "line_items": [
                {
                    "description": item.description,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "total_value": item.total_value,
                    "hsn_code": item.hsn_code
                }
                for item in getattr(shipment, "line_items", [])
            ]
        }

        # Context-aware QA logic (pass context_data & payload.question to LLM / RAG pipeline)
        answer = (
            f"Analysis for shipment {context_data['tracking_code'] or shipment_id}: "
            f"Query '{payload.question}' processed against supplier '{context_data['supplier_name']}' "
            f"and {len(context_data['line_items'])} line items."
        )

        return ShipmentQueryResponse(
            shipment_id=shipment_id,
            question=payload.question,
            answer=answer,
            sources_used=["extracted_fields", "line_items"]
        )

    @staticmethod
    async def compare_shipments(
        db: Session, payload: ShipmentCompareRequest
    ) -> ShipmentCompareResponse:
        shipments = db.query(Shipment).filter(Shipment.id.in_(payload.shipment_ids)).all()
        if len(shipments) < 2:
            raise ValueError("At least two valid shipments are required for comparison.")

        compared_items: List[ComparisonItem] = []
        field_diffs: Dict[str, Dict[str, Any]] = {}

        for shp in shipments:
            fields_dict = {f.key: f.value for f in getattr(shp, "extracted_fields", [])}
            total_val = sum(item.total_value or 0.0 for item in getattr(shp, "line_items", []))
            
            compared_items.append(
                ComparisonItem(
                    shipment_id=str(shp.id),
                    tracking_code=getattr(shp, "tracking_code", None),
                    supplier_name=getattr(shp, "supplier_name", None),
                    status=getattr(shp, "status", None),
                    extracted_fields=fields_dict,
                    line_item_count=len(getattr(shp, "line_items", [])),
                    total_value=total_val
                )
            )

            # Map field differences across all compared shipments
            for k, v in fields_dict.items():
                if payload.fields_to_compare and k not in payload.fields_to_compare:
                    continue
                if k not in field_diffs:
                    field_diffs[k] = {}
                field_diffs[k][str(shp.id)] = v

        # Generate comparison summary report
        report = (
            f"Shipment Comparison Summary ({len(compared_items)} records):\n"
            f"- Tracking Codes: {', '.join([item.tracking_code or item.shipment_id for item in compared_items])}\n"
            f"- Evaluated Fields: {len(field_diffs)} common attributes mapped across shipments."
        ) if payload.generate_summary else None

        return ShipmentCompareResponse(
            compared_shipments=compared_items,
            field_differences=field_diffs,
            comparison_report=report
        )