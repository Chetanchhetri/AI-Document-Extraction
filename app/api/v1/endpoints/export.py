from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import require_executive
from app.core.database import get_session
from app.models import CrossCheck, ExtractedField, ShipmentLineItem, ShipmentStatus, User
from app.services.excel_exporter import build_workbook
from app.services.gatekeeper import collect_blockers
from app.services.shipment_service import audit, documents_of, get_shipment_or_404

router = APIRouter(prefix="/shipments/{shipment_id}", tags=["export"])
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/export")
async def export_shipment(shipment_id: int, user: User = Depends(require_executive),
                          session: AsyncSession = Depends(get_session)):
    shipment = await get_shipment_or_404(session, shipment_id)
    blockers = await collect_blockers(session, shipment_id)  # GATEKEEPER
    if blockers:
        raise HTTPException(422, detail={"message": "Export blocked by gatekeeper", "blockers": blockers})
    docs = await documents_of(session, shipment_id)
    fields = (await session.exec(select(ExtractedField).where(ExtractedField.shipment_id == shipment_id))).all()
    checks = (await session.exec(select(CrossCheck).where(CrossCheck.shipment_id == shipment_id))).all()
    items = (await session.exec(select(ShipmentLineItem).where(ShipmentLineItem.shipment_id == shipment_id))).all()
    content = await run_in_threadpool(build_workbook, shipment, docs, list(fields), list(checks), list(items))
    shipment.status = ShipmentStatus.exported
    session.add(shipment)
    session.add(audit(user_id=user.id, action="SHIPMENT_EXPORTED", shipment_id=shipment_id))
    await session.commit()
    return Response(content, media_type=XLSX, headers={
        "Content-Disposition": f'attachment; filename="{shipment.shipment_code}.xlsx"', "Cache-Control": "no-store"})
