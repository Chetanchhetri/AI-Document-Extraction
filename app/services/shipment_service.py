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
