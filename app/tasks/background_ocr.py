"""Background pipeline: vision extraction -> field/line-item persistence -> embeddings -> cross-checks."""
from __future__ import annotations

import logging
from pathlib import Path

from sqlmodel import delete, select

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.encryption import store_field_value
from app.models import (Document, DocType, ExtractedField, ExtractionStatus, Shipment, ShipmentLineItem,
                        ShipmentStatus)
from app.services.cross_checker import run_cross_checks
from app.services.embeddings import embed_texts, model_id
from app.services.shipment_service import refresh_status
from app.services.vision_extractor import ALLOWED_FIELDS, ExtractionError, extract_document

logger = logging.getLogger(__name__)


async def process_document(document_id: int) -> None:
    async with async_session_factory() as session:
        doc = await session.get(Document, document_id)
        if doc is None:
            return
        shipment = await session.get(Shipment, doc.shipment_id)
        doc.extraction_status = ExtractionStatus.processing
        shipment.status = ShipmentStatus.processing
        session.add_all([doc, shipment])
        await session.commit()

        try:
            data = Path(doc.file_path).read_bytes()
            result = await extract_document(data, doc.mime_type, doc.doc_type)
            await session.exec(delete(ExtractedField).where(ExtractedField.document_id == doc.id))
            for f in result.fields:
                session.add(ExtractedField(
                    shipment_id=doc.shipment_id, document_id=doc.id, field_name=f.name,
                    field_value=store_field_value(f.name, f.value), confidence_score=f.confidence,
                    is_low_confidence=f.confidence < settings.LOW_CONFIDENCE_THRESHOLD,
                    is_human_verified=False, bounding_box=f.bbox))
            if doc.doc_type == DocType.invoice:
                await session.exec(delete(ShipmentLineItem).where(ShipmentLineItem.shipment_id == doc.shipment_id))
                try:
                    vectors = await embed_texts([i.description for i in result.line_items])
                except Exception as exc:  # embeddings are an enhancement; never fail extraction because of them
                    logger.warning("Embedding failed: %s", type(exc).__name__)
                    vectors = [None] * len(result.line_items)
                for item, vec in zip(result.line_items, vectors):
                    session.add(ShipmentLineItem(
                        shipment_id=doc.shipment_id, item_description=item.description, hsn_code=item.hsn_code,
                        quantity=item.quantity, unit_price=item.unit_price, currency=item.currency,
                        total_amount=round(item.quantity * item.unit_price, 2), gross_weight_kg=item.gross_weight_kg,
                        embedding={"model": model_id(), "vector": [round(x, 6) for x in vec]} if vec else None))
            doc.extraction_status, doc.extraction_error = ExtractionStatus.done, None
        except Exception as exc:
            await session.rollback()
            doc = await session.get(Document, document_id)
            reason = str(exc)[:300] if isinstance(exc, ExtractionError) else "Unexpected extraction failure"
            logger.warning("Extraction failed for document %s: %s", document_id, reason)
            await session.exec(delete(ExtractedField).where(ExtractedField.document_id == doc.id))
            for name in ALLOWED_FIELDS[doc.doc_type]:  # blank, low-confidence fields => manual keying
                if name.endswith(("_email", "_phone", "_contact_name")):
                    continue
                session.add(ExtractedField(shipment_id=doc.shipment_id, document_id=doc.id, field_name=name,
                                           field_value="", confidence_score=0.0, is_low_confidence=True))
            doc.extraction_status, doc.extraction_error = ExtractionStatus.manual_review, reason
        session.add(doc)
        await session.commit()  # commit before looking at siblings so the last finisher always sees all

        # Shipment-level state once every document has settled
        shipment = await session.get(Shipment, doc.shipment_id)
        others = (await session.exec(select(Document).where(Document.shipment_id == doc.shipment_id))).all()
        if any(d.extraction_status in (ExtractionStatus.pending, ExtractionStatus.processing) for d in others):
            await session.commit()
            return
        await run_cross_checks(session, doc.shipment_id)
        shipment.status = ShipmentStatus.needs_review
        await session.flush()
        await refresh_status(session, shipment)
        await session.commit()
