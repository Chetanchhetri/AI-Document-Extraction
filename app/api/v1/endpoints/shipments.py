import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import require_executive
from app.core.database import get_session
from app.models import Shipment, ShipmentStatus, User
from app.schemas.shipment import ShipmentCreate, ShipmentRead
from app.services.shipment_service import get_shipment_or_404

router = APIRouter(prefix="/shipments", tags=["shipments"])
_CODE_RE = re.compile(r"^SHP-(\d+)$")


async def _next_code(session: AsyncSession) -> str:
    codes = (await session.exec(select(Shipment.shipment_code))).all()
    top = max((int(m.group(1)) for c in codes if (m := _CODE_RE.match(c))), default=24810)
    return f"SHP-{top + 1}"


@router.get("", response_model=list[ShipmentRead])
async def list_shipments(status_filter: ShipmentStatus | None = Query(None, alias="status"),
                         supplier: str | None = Query(None, max_length=200),
                         skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                         _user: User = Depends(require_executive), session: AsyncSession = Depends(get_session)):
    stmt = select(Shipment).order_by(Shipment.id.desc()).offset(skip).limit(limit)
    if status_filter:
        stmt = stmt.where(Shipment.status == status_filter)
    if supplier:
        stmt = stmt.where(func.lower(Shipment.supplier_name).contains(supplier.lower()))
    return (await session.exec(stmt)).all()


@router.post("", response_model=ShipmentRead, status_code=status.HTTP_201_CREATED)
async def create_shipment(body: ShipmentCreate, user: User = Depends(require_executive),
                          session: AsyncSession = Depends(get_session)):
    for _ in range(3):  # retry on the (rare) concurrent code collision
        shipment = Shipment(shipment_code=await _next_code(session), supplier_name=body.supplier_name,
                            status=ShipmentStatus.ingested, created_by_id=user.id)
        session.add(shipment)
        try:
            await session.commit()
            return shipment
        except IntegrityError:
            await session.rollback()
    raise HTTPException(status.HTTP_409_CONFLICT, "Could not allocate a shipment code, retry")


@router.get("/{shipment_id}", response_model=ShipmentRead)
async def get_shipment(shipment_id: int, _user: User = Depends(require_executive),
                       session: AsyncSession = Depends(get_session)):
    return await get_shipment_or_404(session, shipment_id)
