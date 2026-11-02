"""Export gatekeeper: single source of truth for 'can this shipment leave the building?'."""
from __future__ import annotations

from typing import Any

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import CheckStatus, CrossCheck, Document, DocType, ExtractedField, ExtractionStatus, Role, User

OVERRIDE_ROLES = {Role.manager, Role.super_admin}


async def collect_blockers(session: AsyncSession, shipment_id: int) -> list[dict[str, Any]]:
    blockers: list[dict[str, Any]] = []
    docs = (await session.exec(select(Document).where(Document.shipment_id == shipment_id))).all()
    if not any(d.doc_type == DocType.invoice for d in docs):
        blockers.append({"type": "MISSING_DOCUMENT", "detail": "An invoice is required before export"})
    for d in docs:
        if d.extraction_status in (ExtractionStatus.pending, ExtractionStatus.processing):
            blockers.append({"type": "EXTRACTION_IN_PROGRESS", "document_id": d.id,
                             "detail": f"{d.doc_type.value} is still being processed"})

    fields = (await session.exec(select(ExtractedField).where(ExtractedField.shipment_id == shipment_id))).all()
    for f in fields:
        if f.is_low_confidence and not f.is_human_verified:
            blockers.append({"type": "LOW_CONFIDENCE_UNVERIFIED", "field_id": f.id, "field_name": f.field_name,
                             "confidence_score": f.confidence_score,
                             "detail": f"Field '{f.field_name}' needs human verification"})

    checks = (await session.exec(select(CrossCheck).where(CrossCheck.shipment_id == shipment_id))).all()
    for c in checks:
        if c.status == CheckStatus.failed:
            blockers.append({"type": "CROSS_CHECK_FAILED", "check_id": c.id, "check_name": c.check_name,
                             "detail": c.variance_note or "Cross-check failed"})
        elif c.status == CheckStatus.overridden:
            approver = await session.get(User, c.overridden_by_id) if c.overridden_by_id else None
            if not c.override_reason or approver is None or approver.role not in OVERRIDE_ROLES:
                blockers.append({"type": "INVALID_OVERRIDE", "check_id": c.id, "check_name": c.check_name,
                                 "detail": "Override must carry a reason and come from a manager/super admin"})
    return blockers
