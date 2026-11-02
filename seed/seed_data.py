"""Seed operational test data.

    python -m seed.seed_data

Creates (idempotently):
  * SHP-24811  Company B (China)  - weight mismatch 3120 vs 3165 kg  -> export LOCKED (HTTP 422)
  * SHP-24812  Company C (Sweden) - all checks PASSED                 -> ready for verify-all + export
  * SHP-24800 / SHP-24801 (history, exported/approved) so /hsn/suggest has verified data to match against
Optional demo logins (manager@ / executive@) are created only if SEED_DEMO_PASSWORD is set.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path

import pymupdf
from sqlmodel import select

from app.core.config import settings
from app.core.database import async_session_factory, create_all_tables
from app.core.encryption import mask_pii, store_field_value
from app.core.redis import init_store
from app.models import (AuditLog, CheckStatus, CrossCheck, Document, DocType, ExtractedField, ExtractionStatus, Role,
                        Shipment, ShipmentLineItem, ShipmentStatus, User)
from app.services.embeddings import embed_one
from app.services.user_service import create_user, ensure_super_admin, get_user_by_email

logger = logging.getLogger("seed")


def _make_pdf(shipment_code: str, doc_type: DocType, lines: list[str]) -> tuple[str, bytes]:
    folder = Path(settings.UPLOAD_DIR).resolve() / "seed"
    folder.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((60, 70), f"{doc_type.value.replace('_', ' ').upper()} - {shipment_code}", fontsize=16)
    for i, line in enumerate(lines):
        page.insert_text((60, 110 + i * 22), line, fontsize=11)
    data = doc.tobytes()
    doc.close()
    path = folder / f"{shipment_code}_{doc_type.value}.pdf"
    path.write_bytes(data)
    return str(path), data


def F(name, value, conf, verified=False, bbox=None):
    return dict(name=name, value=value, conf=conf, verified=verified, bbox=bbox)


async def _add_shipment(session, *, code, supplier, status, owner_id, docs, items, checks=(), audits=()):
    if (await session.exec(select(Shipment).where(Shipment.shipment_code == code))).first():
        logger.info("%s already seeded", code)
        return
    shipment = Shipment(shipment_code=code, supplier_name=supplier, status=status, created_by_id=owner_id)
    session.add(shipment)
    await session.flush()
    doc_rows: dict[DocType, Document] = {}
    field_rows: dict[tuple[DocType, str], ExtractedField] = {}
    for doc_type, fields in docs.items():
        path, data = _make_pdf(code, doc_type, [f"{f['name']}: {f['value']}" for f in fields
                                                if not f["name"].startswith(("importer_", "exporter_"))])
        d = Document(shipment_id=shipment.id, doc_type=doc_type, file_path=path, file_name=Path(path).name,
                     file_size_bytes=len(data), mime_type="application/pdf", sha256=hashlib.sha256(data).hexdigest(),
                     page_count=1, extraction_status=ExtractionStatus.done)
        session.add(d)
        await session.flush()
        doc_rows[doc_type] = d
        for i, f in enumerate(fields):
            row = ExtractedField(
                shipment_id=shipment.id, document_id=d.id, field_name=f["name"],
                field_value=store_field_value(f["name"], f["value"]), confidence_score=f["conf"],
                is_low_confidence=f["conf"] < settings.LOW_CONFIDENCE_THRESHOLD, is_human_verified=f["verified"],
                bounding_box=f["bbox"] or {"x": 100 + 10 * i, "y": 120 + 30 * i, "w": 180, "h": 24, "page": 1})
            session.add(row)
            field_rows[(doc_type, f["name"])] = row
    for it in items:
        vec = await embed_one(it["description"])
        session.add(ShipmentLineItem(shipment_id=shipment.id, item_description=it["description"], hsn_code=it.get("hsn"),
                                     quantity=it["qty"], unit_price=it["price"], currency=it["currency"],
                                     total_amount=round(it["qty"] * it["price"], 2), gross_weight_kg=it.get("weight"),
                                     embedding=vec))
    await session.flush()
    for c in checks:
        session.add(CrossCheck(shipment_id=shipment.id, **c))
    await session.flush()
    for a in audits:
        fld = field_rows[(a["doc"], a["field"])]
        session.add(AuditLog(extracted_field_id=fld.id, shipment_id=shipment.id, user_id=owner_id, action=a["action"],
                             previous_value=mask_pii(a["field"], a["prev"]), new_value=mask_pii(a["field"], a["new"])))
    logger.info("Seeded %s", code)


async def seed_demo() -> None:
    init_store()
    async with async_session_factory() as session:
        await ensure_super_admin(session)
        admin = (await session.exec(select(User).where(User.role == Role.super_admin))).first()
        if admin is None:
            raise SystemExit("No super_admin exists. Set SUPERADMIN_EMAIL and SUPERADMIN_INIT_PASSWORD first.")
        owner = admin
        if settings.SEED_DEMO_PASSWORD:
            for email, name, role in (("manager@customs.example", "Demo Manager", Role.manager),
                                      ("executive@customs.example", "Demo Executive", Role.executive)):
                user = await get_user_by_email(session, email)
                if user is None:
                    user = await create_user(session, email=email, password=settings.SEED_DEMO_PASSWORD,
                                             full_name=name, role=role, verified=True)
                    logger.info("Created demo user %s", role.value)
                if role == Role.executive:
                    owner = user
            await session.commit()

        pii = lambda: [  # noqa: E731
            F("importer_contact_name", "Rahul Sharma", 0.95, True),
            F("importer_email", "rahul.sharma@importer.example", 0.93, True),
            F("importer_phone", "+91-9876541234", 0.92, True),
        ]

        # --- SHP-24811: discrepancy & locked export -------------------------------------------------
        await _add_shipment(
            session, code="SHP-24811", supplier="Company B (China)", status=ShipmentStatus.needs_review, owner_id=owner.id,
            docs={
                DocType.invoice: [F("invoice_no", "INV-2024-0815", 0.98), F("invoice_date", "2024-11-05", 0.97),
                                  F("incoterms", "FOB", 0.91), F("currency", "USD", 0.99),
                                  F("total_amount", "16320.00", 0.97), F("gross_weight_kg", "3120", 0.96),
                                  F("total_packages", "120", 0.95)] + pii(),
                DocType.packing_list: [F("packing_list_no", "PL-2024-0815", 0.97), F("gross_weight_kg", "3165", 0.96),
                                       F("total_packages", "120", 0.96)],
                DocType.bill_of_lading: [F("bl_number", "NSA-BL-778812", 0.97), F("gross_weight_kg", "3165", 0.95),
                                         F("total_packages", "120", 0.95)],
            },
            items=[dict(description="LED panel light 40W", qty=2400, price=6.80, currency="USD", weight=3120)],
            checks=[
                dict(check_name="MATH_LINE_ITEMS_VS_INVOICE_TOTAL", status=CheckStatus.passed,
                     source_value_1="16320", source_value_2="16320"),
                dict(check_name="WEIGHT_MATCH_INV_VS_PL", status=CheckStatus.failed, source_value_1="3120 kg",
                     source_value_2="3165 kg",
                     variance_note="Mismatch of 45 kg between Invoice (3120 kg) and Packing List (3165 kg)"),
                dict(check_name="WEIGHT_MATCH_PL_VS_BL", status=CheckStatus.passed, source_value_1="3165 kg",
                     source_value_2="3165 kg"),
                dict(check_name="PACKAGE_COUNT_MATCH", status=CheckStatus.passed, source_value_1="Invoice: 120",
                     source_value_2="Packing List: 120; Bill of Lading: 120"),
            ])

        # --- SHP-24812: valid baseline --------------------------------------------------------------
        await _add_shipment(
            session, code="SHP-24812", supplier="Company C (Sweden)", status=ShipmentStatus.needs_review, owner_id=owner.id,
            docs={
                DocType.invoice: [F("invoice_no", "INV-SE-2024-331", 0.99), F("invoice_date", "2024-11-08", 0.98),
                                  F("incoterms", "CIF", 0.81),  # low confidence -> exercised by verify-all
                                  F("currency", "EUR", 0.99), F("total_amount", "7650.00", 0.98),
                                  F("gross_weight_kg", "1460", 0.97), F("total_packages", "36", 0.96)],
                DocType.packing_list: [F("packing_list_no", "PL-SE-331", 0.97), F("gross_weight_kg", "1460", 0.97),
                                       F("total_packages", "36", 0.97)],
                DocType.bill_of_lading: [F("bl_number", "NSA-BL-779001", 0.96), F("gross_weight_kg", "1460", 0.96),
                                         F("total_packages", "36", 0.96)],
            },
            items=[dict(description="Steel ball valve DN50", qty=180, price=42.50, currency="EUR", weight=1460)],
            checks=[
                dict(check_name="MATH_LINE_ITEMS_VS_INVOICE_TOTAL", status=CheckStatus.passed,
                     source_value_1="7650", source_value_2="7650"),
                dict(check_name="WEIGHT_MATCH_INV_VS_PL", status=CheckStatus.passed, source_value_1="1460 kg",
                     source_value_2="1460 kg"),
                dict(check_name="WEIGHT_MATCH_PL_VS_BL", status=CheckStatus.passed, source_value_1="1460 kg",
                     source_value_2="1460 kg"),
                dict(check_name="PACKAGE_COUNT_MATCH", status=CheckStatus.passed, source_value_1="Invoice: 36",
                     source_value_2="Packing List: 36; Bill of Lading: 36"),
            ])

        # --- Verified history for HSN suggestions + analytics ---------------------------------------
        # HSN codes below are illustrative sample data - confirm real classification with your broker.
        await _add_shipment(
            session, code="SHP-24800", supplier="Company B (China)", status=ShipmentStatus.exported, owner_id=admin.id,
            docs={DocType.invoice: [F("invoice_no", "INV-2024-0612", 0.97, True), F("currency", "USD", 0.99, True),
                                    F("total_amount", "9000.00", 0.96, True), F("gross_weight_kg", "1800", 0.9, True),
                                    F("total_packages", "60", 0.95, True)]},
            items=[dict(description="LED panel light 36W", hsn="940542", qty=1500, price=6.0, currency="USD", weight=1800)],
            checks=[dict(check_name="WEIGHT_MATCH_INV_VS_PL", status=CheckStatus.overridden, source_value_1="1800 kg",
                         source_value_2="1812 kg", variance_note="Mismatch of 12 kg between Invoice (1800 kg) and Packing List (1812 kg)",
                         overridden_by_id=admin.id, override_reason="Pallet weight included on packing list - approved")],
            audits=[dict(doc=DocType.invoice, field="gross_weight_kg", action="FIELD_EDITED", prev="1080", new="1800")])
        await _add_shipment(
            session, code="SHP-24801", supplier="Company C (Sweden)", status=ShipmentStatus.approved, owner_id=admin.id,
            docs={DocType.invoice: [F("invoice_no", "INV-SE-2024-290", 0.98, True), F("currency", "EUR", 0.99, True),
                                    F("total_amount", "3400.00", 0.98, True)]},
            items=[dict(description="Steel ball valve DN40", hsn="848180", qty=100, price=34.0, currency="EUR")])
        await session.commit()


async def _main() -> None:
    logging.basicConfig(level=logging.INFO)
    if settings.AUTO_CREATE_TABLES:
        await create_all_tables()
    await seed_demo()


if __name__ == "__main__":
    asyncio.run(_main())
