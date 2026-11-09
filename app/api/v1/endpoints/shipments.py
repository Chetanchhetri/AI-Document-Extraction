import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import require_executive
from app.core.database import get_session
from app.models import AuditLog, CrossCheck, Document, ExtractedField, Shipment, ShipmentLineItem, ShipmentStatus, User
from app.schemas.shipment import (
    ShipmentCompareRequest,
    ShipmentCompareResponse,
    ShipmentCreate,
    ShipmentQueryRequest,
    ShipmentQueryResponse,
    ShipmentRead,
)
from app.services.shipment_service import ShipmentService

router = APIRouter(prefix="/shipments", tags=["shipments"])


async def generate_next_shipment_code(session: AsyncSession) -> str:
    """Generates sequential tracking codes (e.g., SHP-24813, SHP-24814)."""
    statement = select(Shipment.shipment_code).order_by(Shipment.id.desc()).limit(1)
    last_code = (await session.exec(statement)).first()
    
    if last_code:
        match = re.search(r"(\d+)$", last_code)
        if match:
            next_num = int(match.group(1)) + 1
            prefix = last_code[:match.start(1)]
            return f"{prefix}{next_num}"
            
    max_id_res = await session.exec(select(func.max(Shipment.id)))
    max_id = max_id_res.one_or_none() or 0
    return f"SHP-{24800 + max_id + 1}"


@router.get("", response_model=List[ShipmentRead])
async def list_shipments(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    _user: User = Depends(require_executive),
    session: AsyncSession = Depends(get_session),
):
    query = select(Shipment)
    if status:
        query = query.where(Shipment.status == status)
    query = query.order_by(Shipment.id.desc()).offset(skip).limit(limit)
    result = await session.exec(query)
    return result.all()


@router.post("", response_model=ShipmentRead, status_code=status.HTTP_201_CREATED)
async def create_shipment(
    body: ShipmentCreate,
    user: User = Depends(require_executive),
    session: AsyncSession = Depends(get_session),
):
    """Creates a new shipment with sequential reference code generation."""
    supplier_val = body.effective_supplier
    next_code = await generate_next_shipment_code(session)

    shipment = None
    try:
        from app.services.shipment_service import create_shipment_record
        try:
            shipment = await create_shipment_record(session, supplier=supplier_val, user_id=user.id, shipment_code=next_code)
        except TypeError:
            try:
                shipment = await create_shipment_record(session, supplier=supplier_val, user_id=user.id)
            except TypeError:
                pass
    except Exception:
        pass

    if not shipment:
        shipment = Shipment(
            shipment_code=next_code,
            supplier_name=supplier_val,
            status=ShipmentStatus.needs_review,
            created_by_id=user.id,
        )
        session.add(shipment)
        await session.commit()
        await session.refresh(shipment)

    return ShipmentRead.model_validate(shipment)


@router.post(
    "/compare",
    response_model=ShipmentCompareResponse,
    status_code=status.HTTP_200_OK,
    summary="Compare multiple shipments",
    description="Compare extracted data fields, line item totals, and compliance status across multiple shipments."
)
async def compare_shipments(
    payload: ShipmentCompareRequest,
    _user: User = Depends(require_executive),
    session: AsyncSession = Depends(get_session),
):
    try:
        return await ShipmentService.compare_shipments(session=session, payload=payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate shipment comparison.")


@router.get("/{shipment_id}", response_model=ShipmentRead)
async def get_shipment(
    shipment_id: int,
    _user: User = Depends(require_executive),
    session: AsyncSession = Depends(get_session),
):
    shipment = await session.get(Shipment, shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return shipment


@router.post(
    "/{shipment_id}/query",
    response_model=ShipmentQueryResponse,
    status_code=status.HTTP_200_OK,
    summary="Query a single shipment",
    description="Ask natural language questions evaluated against extracted fields, line items, and documents of a shipment."
)
async def query_shipment(
    shipment_id: int,
    payload: ShipmentQueryRequest,
    _user: User = Depends(require_executive),
    session: AsyncSession = Depends(get_session),
):
    try:
        return await ShipmentService.query_single_shipment(session=session, shipment_id=str(shipment_id), payload=payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to process shipment query.")


@router.delete("/{shipment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shipment(
    shipment_id: int,
    _user: User = Depends(require_executive),
    session: AsyncSession = Depends(get_session),
):
    """Deletes a shipment and performs cascading removal of all linked child entities without FK conflicts."""
    shipment = await session.get(Shipment, shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    # 1. Nullify foreign keys on audit_logs referencing extracted fields of this shipment
    field_ids = (await session.exec(
        select(ExtractedField.id).where(ExtractedField.shipment_id == shipment_id)
    )).all()
    if field_ids:
        logs_to_nullify = (await session.exec(
            select(AuditLog).where(AuditLog.extracted_field_id.in_(field_ids))
        )).all()
        for log in logs_to_nullify:
            log.extracted_field_id = None
            session.add(log)

    # 2. Delete audit_logs linked to this shipment and flush changes before deleting extracted_fields
    logs = (await session.exec(select(AuditLog).where(AuditLog.shipment_id == shipment_id))).all()
    for l in logs:
        await session.delete(l)
    await session.flush()

    # 3. Delete extracted fields
    fields = (await session.exec(select(ExtractedField).where(ExtractedField.shipment_id == shipment_id))).all()
    for f in fields:
        await session.delete(f)

    # 4. Delete documents
    docs = (await session.exec(select(Document).where(Document.shipment_id == shipment_id))).all()
    for d in docs:
        await session.delete(d)

    # 5. Delete cross-checks
    checks = (await session.exec(select(CrossCheck).where(CrossCheck.shipment_id == shipment_id))).all()
    for c in checks:
        await session.delete(c)

    # 6. Delete line items
    items = (await session.exec(select(ShipmentLineItem).where(ShipmentLineItem.shipment_id == shipment_id))).all()
    for i in items:
        await session.delete(i)

    # 7. Delete main shipment record
    await session.delete(shipment)
    await session.commit()
    return None