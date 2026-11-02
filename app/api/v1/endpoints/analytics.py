from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import require_manager
from app.core.database import get_session
from app.models import AuditLog, CheckStatus, CrossCheck, ExtractedField, Shipment, User

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/accuracy")
async def accuracy(_user: User = Depends(require_manager), session: AsyncSession = Depends(get_session)):
    """
    Field accuracy  = fields verified WITHOUT edits / total extracted fields x 100 (per field name).
    Supplier score  = edit (error) rate + weight/package mismatch counts per supplier.
    """
    fields = (await session.exec(select(ExtractedField))).all()
    edited_ids = {r for r in (await session.exec(
        select(AuditLog.extracted_field_id).where(AuditLog.action == "FIELD_EDITED"))).all() if r}
    shipments = {s.id: s for s in (await session.exec(select(Shipment))).all()}
    checks = (await session.exec(select(CrossCheck))).all()

    per_field = defaultdict(lambda: {"total": 0, "verified_without_edits": 0, "edited": 0, "verified": 0})
    per_supplier = defaultdict(lambda: {"shipments": set(), "fields_total": 0, "fields_edited": 0,
                                        "weight_mismatches": 0, "package_mismatches": 0, "failed_or_overridden_checks": 0})
    for f in fields:
        edited = f.id in edited_ids
        pf = per_field[f.field_name]
        pf["total"] += 1
        pf["verified"] += int(f.is_human_verified)
        pf["edited"] += int(edited)
        pf["verified_without_edits"] += int(f.is_human_verified and not edited)
        s = shipments.get(f.shipment_id)
        if s:
            ps = per_supplier[s.supplier_name]
            ps["shipments"].add(s.id)
            ps["fields_total"] += 1
            ps["fields_edited"] += int(edited)
    for c in checks:
        if c.status in (CheckStatus.failed, CheckStatus.overridden) and (s := shipments.get(c.shipment_id)):
            ps = per_supplier[s.supplier_name]
            ps["shipments"].add(s.id)
            ps["failed_or_overridden_checks"] += 1
            if c.check_name.startswith("WEIGHT"):
                ps["weight_mismatches"] += 1
            if c.check_name.startswith("PACKAGE"):
                ps["package_mismatches"] += 1

    field_rows = [{
        "field_name": name, "total_extracted": v["total"], "verified": v["verified"], "edited": v["edited"],
        "verified_without_edits": v["verified_without_edits"],
        "accuracy_rate_pct": round(100 * v["verified_without_edits"] / v["total"], 2) if v["total"] else None,
        "reviewed_accuracy_pct": round(100 * v["verified_without_edits"] / v["verified"], 2) if v["verified"] else None,
    } for name, v in sorted(per_field.items())]
    supplier_rows = [{
        "supplier_name": name, "shipments": len(v["shipments"]), "fields_total": v["fields_total"],
        "fields_edited": v["fields_edited"],
        "field_error_rate_pct": round(100 * v["fields_edited"] / v["fields_total"], 2) if v["fields_total"] else 0.0,
        "weight_mismatches": v["weight_mismatches"], "package_mismatches": v["package_mismatches"],
        "failed_or_overridden_checks": v["failed_or_overridden_checks"],
    } for name, v in sorted(per_supplier.items())]
    total = len(fields)
    clean = sum(1 for f in fields if f.is_human_verified and f.id not in edited_ids)
    return {"overall": {"total_fields": total, "verified_without_edits": clean,
                        "accuracy_rate_pct": round(100 * clean / total, 2) if total else None},
            "by_field": field_rows, "by_supplier": supplier_rows}
