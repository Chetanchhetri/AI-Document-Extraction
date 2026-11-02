from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import require_executive, require_manager
from app.core.database import get_session
from app.core.encryption import read_field_value, store_field_value
from app.models import CheckStatus, CrossCheck, ExtractedField, ShipmentLineItem, ShipmentStatus, User
from app.schemas.auth import MessageResponse
from app.schemas.shipment import (CrossCheckRead, DocumentRead, DocumentReview, FieldRead, FieldUpdate,
                                  LineItemRead, OverrideRequest, ReviewResponse, ShipmentRead)
from app.core.config import settings
from app.services.cross_checker import run_cross_checks
from app.services.gatekeeper import collect_blockers
from app.services.shipment_service import audit, documents_of, field_to_read, get_shipment_or_404, refresh_status

router = APIRouter(prefix="/shipments/{shipment_id}", tags=["review"])


def _locked(shipment) -> None:
    if shipment.status == ShipmentStatus.exported:
        raise HTTPException(409, "Shipment already exported; it is locked")


@router.get("/review", response_model=ReviewResponse)
async def review(shipment_id: int, _user: User = Depends(require_executive),
                 session: AsyncSession = Depends(get_session)):
    """Side-by-side review payload: fields + confidence + bounding boxes per document, checks, line items."""
    shipment = await get_shipment_or_404(session, shipment_id)
    docs = await documents_of(session, shipment_id)
    fields = (await session.exec(select(ExtractedField).where(ExtractedField.shipment_id == shipment_id)
                                 .order_by(ExtractedField.id))).all()
    checks = (await session.exec(select(CrossCheck).where(CrossCheck.shipment_id == shipment_id)
                                 .order_by(CrossCheck.id))).all()
    items = (await session.exec(select(ShipmentLineItem).where(ShipmentLineItem.shipment_id == shipment_id)
                                .order_by(ShipmentLineItem.id))).all()
    blockers = await collect_blockers(session, shipment_id)
    return ReviewResponse(
        shipment=ShipmentRead.model_validate(shipment),
        bbox_reference={"unit": "pixels", "render_dpi": settings.AI_RENDER_DPI, "origin": "top-left",
                        "page_base": 1, "format": {"x": "int", "y": "int", "w": "int", "h": "int", "page": "int"}},
        documents=[DocumentReview(document=DocumentRead.model_validate(d),
                                  fields=[field_to_read(f) for f in fields if f.document_id == d.id]) for d in docs],
        cross_checks=[CrossCheckRead.model_validate(c) for c in checks],
        line_items=[LineItemRead.model_validate(i) for i in items],
        export_blockers=blockers, export_ready=not blockers,
    )


@router.patch("/fields/{field_id}", response_model=FieldRead)
async def update_field(shipment_id: int, field_id: int, body: FieldUpdate, user: User = Depends(require_executive),
                       session: AsyncSession = Depends(get_session)):
    shipment = await get_shipment_or_404(session, shipment_id)
    _locked(shipment)
    field = await session.get(ExtractedField, field_id)
    if field is None or field.shipment_id != shipment_id:
        raise HTTPException(404, "Field not found")
    previous = read_field_value(field.field_name, field.field_value)
    edited = body.value is not None and body.value.strip() != previous
    if edited:
        field.field_value = store_field_value(field.field_name, body.value.strip())
        field.is_human_verified = True  # a human typing the value is verification
        session.add(audit(user_id=user.id, action="FIELD_EDITED", shipment_id=shipment_id, field=field,
                          previous=previous, new=body.value.strip()))
    elif body.is_human_verified:
        field.is_human_verified = True
        session.add(audit(user_id=user.id, action="FIELD_VERIFIED", shipment_id=shipment_id, field=field,
                          previous=previous, new=previous))
    else:
        raise HTTPException(400, "Nothing to change")
    session.add(field)
    await session.flush()
    await run_cross_checks(session, shipment_id)  # a corrected weight may resolve a failed check
    await refresh_status(session, shipment)
    await session.commit()
    return field_to_read(field)


@router.post("/verify-all", response_model=MessageResponse)
async def verify_all(shipment_id: int, user: User = Depends(require_executive),
                     session: AsyncSession = Depends(get_session)):
    """Single-click verification of every still-unverified field (each one is audit-logged)."""
    shipment = await get_shipment_or_404(session, shipment_id)
    _locked(shipment)
    pending = (await session.exec(select(ExtractedField).where(
        ExtractedField.shipment_id == shipment_id, ExtractedField.is_human_verified == False))).all()  # noqa: E712
    blank = [f.field_name for f in pending if not read_field_value(f.field_name, f.field_value).strip()]
    if blank:
        raise HTTPException(422, f"Cannot verify empty fields; enter values first: {', '.join(sorted(blank))}")
    for f in pending:
        f.is_human_verified = True
        session.add(f)
        val = read_field_value(f.field_name, f.field_value)
        session.add(audit(user_id=user.id, action="FIELD_VERIFIED", shipment_id=shipment_id, field=f,
                          previous=val, new=val))
    await session.flush()
    await refresh_status(session, shipment)
    await session.commit()
    return MessageResponse(message=f"{len(pending)} field(s) verified; shipment status: {shipment.status.value}")


async def _override(session: AsyncSession, shipment_id: int, check_id: int, reason: str, user: User) -> CrossCheck:
    shipment = await get_shipment_or_404(session, shipment_id)
    _locked(shipment)
    check = await session.get(CrossCheck, check_id)
    if check is None or check.shipment_id != shipment_id:
        raise HTTPException(404, "Cross-check not found")
    if check.status != CheckStatus.failed:
        raise HTTPException(409, f"Only failed checks can be overridden (current status: {check.status.value})")
    check.status, check.overridden_by_id, check.override_reason = CheckStatus.overridden, user.id, reason
    session.add(check)
    session.add(audit(user_id=user.id, action="CHECK_OVERRIDDEN", shipment_id=shipment_id, cross_check_id=check.id,
                      previous=CheckStatus.failed.value, new=f"{CheckStatus.overridden.value}: {reason}"))
    await session.flush()
    await refresh_status(session, shipment)
    await session.commit()
    return check


@router.post("/cross-checks/{check_id}/override", response_model=CrossCheckRead)
async def override_check(shipment_id: int, check_id: int, body: OverrideRequest,
                         user: User = Depends(require_manager), session: AsyncSession = Depends(get_session)):
    return await _override(session, shipment_id, check_id, body.override_reason, user)


@router.post("/cross-checks/override", response_model=CrossCheckRead, include_in_schema=True)
async def override_check_body(shipment_id: int, body: OverrideRequest, user: User = Depends(require_manager),
                              session: AsyncSession = Depends(get_session)):
    """Variant from the endpoint matrix: the check id travels in the body."""
    if body.check_id is None:
        raise HTTPException(422, "check_id is required in the body for this route")
    return await _override(session, shipment_id, body.check_id, body.override_reason, user)
