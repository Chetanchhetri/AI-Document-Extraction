"""Deterministic cross-document reconciliation (no AI involved)."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Optional

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import CheckStatus, CrossCheck, Document, DocType, ExtractedField, ExtractionStatus, ShipmentLineItem
from app.core.encryption import read_field_value

TOLERANCE = Decimal("0.01")
LABEL = {DocType.invoice: "Invoice", DocType.packing_list: "Packing List", DocType.bill_of_lading: "Bill of Lading"}


@dataclass
class CheckResult:
    check_name: str
    status: CheckStatus
    source_value_1: str
    source_value_2: str
    variance_note: Optional[str] = None


def parse_decimal(value: Optional[str]) -> Optional[Decimal]:
    if value is None or str(value).strip() == "":
        return None
    cleaned = "".join(ch for ch in str(value) if ch.isdigit() or ch in ".-")
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def fmt(n: Decimal) -> str:
    s = f"{n:f}"
    return s.rstrip("0").rstrip(".") if "." in s else s


def evaluate(
    docs: dict[DocType, Document],
    values: dict[DocType, dict[str, Optional[str]]],
    line_items: list[ShipmentLineItem],
) -> list[CheckResult]:
    """Pure function: given extracted values per document, return the reconciliation results."""
    results: list[CheckResult] = []
    ready = {t for t, d in docs.items() if d.extraction_status in (ExtractionStatus.done, ExtractionStatus.manual_review)}

    # 1. Mathematical consistency: sum(qty * unit price) == invoice total
    if DocType.invoice in ready:
        total = parse_decimal(values[DocType.invoice].get("total_amount"))
        if total is None or not line_items:
            results.append(CheckResult("MATH_LINE_ITEMS_VS_INVOICE_TOTAL", CheckStatus.failed,
                                       "n/a" if not line_items else fmt(sum(Decimal(str(i.quantity)) * Decimal(str(i.unit_price)) for i in line_items)),
                                       "n/a" if total is None else fmt(total),
                                       "Cannot evaluate: invoice total or line items are missing"))
        else:
            calc = sum((Decimal(str(i.quantity)) * Decimal(str(i.unit_price)) for i in line_items), Decimal(0))
            diff = abs(calc - total)
            failed = diff > TOLERANCE
            results.append(CheckResult(
                "MATH_LINE_ITEMS_VS_INVOICE_TOTAL", CheckStatus.failed if failed else CheckStatus.passed,
                fmt(calc), fmt(total),
                f"Line items sum to {fmt(calc)} but invoice total is {fmt(total)} (variance {fmt(diff)})" if failed else None))

    # 2. Gross weight: Invoice vs PL, PL vs BL
    def weight(a: DocType, b: DocType, name: str) -> None:
        if a not in ready or b not in ready:
            return
        wa, wb = parse_decimal(values[a].get("gross_weight_kg")), parse_decimal(values[b].get("gross_weight_kg"))
        if wa is None or wb is None:
            results.append(CheckResult(name, CheckStatus.failed, "n/a" if wa is None else f"{fmt(wa)} kg",
                                       "n/a" if wb is None else f"{fmt(wb)} kg",
                                       f"Gross weight missing on {LABEL[a] if wa is None else LABEL[b]}"))
        elif abs(wa - wb) > TOLERANCE:
            results.append(CheckResult(
                name, CheckStatus.failed, f"{fmt(wa)} kg", f"{fmt(wb)} kg",
                f"Mismatch of {fmt(abs(wa - wb))} kg between {LABEL[a]} ({fmt(wa)} kg) and {LABEL[b]} ({fmt(wb)} kg)"))
        else:
            results.append(CheckResult(name, CheckStatus.passed, f"{fmt(wa)} kg", f"{fmt(wb)} kg"))

    weight(DocType.invoice, DocType.packing_list, "WEIGHT_MATCH_INV_VS_PL")
    weight(DocType.packing_list, DocType.bill_of_lading, "WEIGHT_MATCH_PL_VS_BL")

    # 3. Package count across all documents that are present
    present = [t for t in (DocType.invoice, DocType.packing_list, DocType.bill_of_lading) if t in ready]
    if len(present) >= 2:
        counts = {t: parse_decimal(values[t].get("total_packages")) for t in present}
        label = "; ".join(f"{LABEL[t]}: {fmt(c) if c is not None else 'n/a'}" for t, c in counts.items())
        first, rest = present[0], present[1:]
        s1 = f"{LABEL[first]}: {fmt(counts[first]) if counts[first] is not None else 'n/a'}"
        s2 = "; ".join(f"{LABEL[t]}: {fmt(counts[t]) if counts[t] is not None else 'n/a'}" for t in rest)
        known = {c for c in counts.values() if c is not None}
        if None in counts.values() or len(known) > 1:
            results.append(CheckResult("PACKAGE_COUNT_MATCH", CheckStatus.failed, s1, s2,
                                       f"Package count mismatch or missing value - {label}"))
        else:
            results.append(CheckResult("PACKAGE_COUNT_MATCH", CheckStatus.passed, s1, s2))
    return results


async def run_cross_checks(session: AsyncSession, shipment_id: int) -> list[CrossCheck]:
    """Re-evaluate all checks for a shipment and upsert them (manager overrides survive while still failing)."""
    docs = {d.doc_type: d for d in (await session.exec(select(Document).where(Document.shipment_id == shipment_id))).all()}
    fields = (await session.exec(select(ExtractedField).where(ExtractedField.shipment_id == shipment_id))).all()
    by_doc = {d.id: t for t, d in docs.items()}
    values: dict[DocType, dict[str, Optional[str]]] = {t: {} for t in docs}
    for f in fields:
        if f.document_id in by_doc:
            values[by_doc[f.document_id]][f.field_name] = read_field_value(f.field_name, f.field_value)
    items = list((await session.exec(select(ShipmentLineItem).where(ShipmentLineItem.shipment_id == shipment_id))).all())

    results = evaluate(docs, values, items)
    existing = {c.check_name: c for c in (await session.exec(select(CrossCheck).where(CrossCheck.shipment_id == shipment_id))).all()}
    current_names = {r.check_name for r in results}
    for name, row in existing.items():
        if name not in current_names:
            await session.delete(row)  # a document was removed/replaced; check no longer applicable
    out: list[CrossCheck] = []
    for r in results:
        row = existing.get(r.check_name)
        if row is None:
            row = CrossCheck(shipment_id=shipment_id, check_name=r.check_name, status=r.status)
        was_overridden = row.status == CheckStatus.overridden
        row.source_value_1, row.source_value_2, row.variance_note = r.source_value_1, r.source_value_2, r.variance_note
        if r.status == CheckStatus.passed:
            row.status = CheckStatus.passed
            row.overridden_by_id = row.override_reason = None
        elif was_overridden and row.override_reason:
            row.status = CheckStatus.overridden  # still failing -> keep the manager's decision
        else:
            row.status = CheckStatus.failed
        session.add(row)
        out.append(row)
    await session.flush()
    return out
