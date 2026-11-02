"""Structured .xlsx export (openpyxl)."""
from __future__ import annotations

import io
from typing import Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.core.encryption import read_field_value
from app.models import CheckStatus, CrossCheck, DocType, Document, ExtractedField, Shipment, ShipmentLineItem

HEAD = PatternFill("solid", fgColor="1F3864")
SUB = PatternFill("solid", fgColor="D9E2F3")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _safe(v):
    """Neutralise spreadsheet formula injection (=, +, -, @ at the start of text)."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def _num(v: Optional[str]):
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return v if v not in (None, "") else "n/a"


def build_workbook(shipment: Shipment, documents: list[Document], fields: list[ExtractedField],
                   checks: list[CrossCheck], items: list[ShipmentLineItem]) -> bytes:
    doc_type_by_id = {d.id: d.doc_type for d in documents}
    vals: dict[tuple[DocType, str], str] = {}
    for f in fields:
        t = doc_type_by_id.get(f.document_id)
        if t:
            vals[(t, f.field_name)] = read_field_value(f.field_name, f.field_value)

    def g(t: DocType, name: str) -> str:
        return vals.get((t, name), "")

    wb = Workbook()
    ws = wb.active
    ws.title = "Shipment"
    row = 1

    def section(title: str) -> None:
        nonlocal row
        ws.cell(row=row, column=1, value=title).font = Font(bold=True, color="FFFFFF", size=12)
        for c in range(1, 8):
            ws.cell(row=row, column=c).fill = HEAD
        row += 1

    def kv(label: str, value) -> None:
        nonlocal row
        a = ws.cell(row=row, column=1, value=label)
        a.font, a.fill, a.border = Font(bold=True), SUB, BORDER
        b = ws.cell(row=row, column=2, value=_safe(value))
        b.border, b.alignment = BORDER, Alignment(horizontal="left")
        row += 1

    section("SHIPMENT HEADER")
    kv("Shipment Code", shipment.shipment_code)
    kv("Supplier Name", shipment.supplier_name)
    kv("Invoice No", g(DocType.invoice, "invoice_no"))
    kv("Invoice Date", g(DocType.invoice, "invoice_date"))
    kv("Currency", g(DocType.invoice, "currency"))
    kv("Incoterm", g(DocType.invoice, "incoterms"))
    kv("Invoice Total", _num(g(DocType.invoice, "total_amount")))
    row += 1

    overall = "PASSED"
    if any(c.status == CheckStatus.overridden for c in checks):
        overall = "PASSED WITH MANAGER OVERRIDE"
    if any(c.status == CheckStatus.failed for c in checks):
        overall = "FAILED"
    section("PACKING LIST & BILL OF LADING")
    kv("Total Cartons", _num(g(DocType.packing_list, "total_packages") or g(DocType.invoice, "total_packages")))
    kv("Gross Weight (Invoice) kg", _num(g(DocType.invoice, "gross_weight_kg")))
    kv("Gross Weight (Packing List) kg", _num(g(DocType.packing_list, "gross_weight_kg")))
    kv("Gross Weight (BL) kg", _num(g(DocType.bill_of_lading, "gross_weight_kg")))
    kv("Cross-Check Verification Status", overall)
    for c in sorted(checks, key=lambda x: x.check_name):
        note = f"{c.status.value.upper()}" + (f" - {c.variance_note}" if c.variance_note else "")
        if c.status == CheckStatus.overridden:
            note += f" | Override reason: {c.override_reason}"
        kv(f"  {c.check_name}", note)
    row += 1

    section("LINE ITEMS")
    headers = ["Item Description", "HSN Code", "Quantity", "Unit Price", "Line Total Amount", "Gross Weight (kg)", "Currency"]
    for i, h in enumerate(headers, 1):
        cell = ws.cell(row=row, column=i, value=h)
        cell.font, cell.fill, cell.border = Font(bold=True), SUB, BORDER
    row += 1
    for it in items:
        data = [it.item_description, it.hsn_code or "", it.quantity, it.unit_price,
                round(it.quantity * it.unit_price, 2), it.gross_weight_kg if it.gross_weight_kg is not None else "", it.currency]
        for i, v in enumerate(data, 1):
            cell = ws.cell(row=row, column=i, value=_safe(v))
            cell.border = BORDER
            if i in (3, 4, 5, 6) and isinstance(v, (int, float)):
                cell.number_format = "#,##0.00"
        row += 1

    ws.column_dimensions["A"].width = 38
    for col in range(2, 8):
        ws.column_dimensions[get_column_letter(col)].width = 22
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
