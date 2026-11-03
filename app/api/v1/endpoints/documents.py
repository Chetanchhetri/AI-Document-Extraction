import hashlib
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlmodel import delete, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import require_executive
from app.core.config import settings
from app.core.database import get_session
from app.models import (
    DocType,
    Document,
    ExtractedField,
    ExtractionStatus,
    ShipmentLineItem,
    ShipmentStatus,
    User,
)
from app.schemas.shipment import DocumentRead
from app.services.file_validation import read_upload_limited, safe_display_name, validate_and_sanitize
from app.services.shipment_service import documents_of, get_shipment_or_404
from app.tasks.background_ocr import process_document

# Router 1: Shipment-Scoped Document Ingestion Endpoints
router = APIRouter(prefix="/shipments/{shipment_id}/documents", tags=["documents"])

# Router 2: Direct Document Access Endpoints (Matches Postman Collection Route)
direct_router = APIRouter(prefix="/documents", tags=["documents"])


def _storage_path(shipment_id: int, extension: str) -> Path:
    """Server-generated path: UUID filename only; user-supplied names never touch the filesystem."""
    base = Path(settings.UPLOAD_DIR).resolve()
    target = (base / "shipments" / str(shipment_id) / f"{uuid.uuid4().hex}{extension}").resolve()
    if base not in target.parents:  # defense in depth
        raise HTTPException(status_code=500, detail="Invalid storage path")
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


@router.post("", response_model=DocumentRead, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    shipment_id: int,
    bg: BackgroundTasks,
    doc_type: DocType = Form(...),
    file: UploadFile = File(...),
    replace: bool = Query(False, description="Replace an existing document of the same type"),
    _user: User = Depends(require_executive),
    session: AsyncSession = Depends(get_session),
):
    shipment = await get_shipment_or_404(session, shipment_id)
    if shipment.status == ShipmentStatus.exported:
        raise HTTPException(status_code=409, detail="Shipment already exported; documents are locked")

    raw = await read_upload_limited(file)
    validated = await run_in_threadpool(validate_and_sanitize, raw)
    digest = hashlib.sha256(validated.data).hexdigest()

    existing = await documents_of(session, shipment_id)
    if any(d.sha256 == digest for d in existing):
        raise HTTPException(status_code=409, detail="This exact document was already uploaded to the shipment")
    same_type = next((d for d in existing if d.doc_type == doc_type), None)
    if same_type and not replace:
        raise HTTPException(
            status_code=409, detail=f"A {doc_type.value} already exists; pass ?replace=true to replace it"
        )

    if same_type:
        await session.exec(delete(ExtractedField).where(ExtractedField.document_id == same_type.id))
        if doc_type == DocType.invoice:
            await session.exec(delete(ShipmentLineItem).where(ShipmentLineItem.shipment_id == shipment_id))
        Path(same_type.file_path).unlink(missing_ok=True)
        await session.delete(same_type)
        await session.flush()

    path = _storage_path(shipment_id, validated.extension)
    await run_in_threadpool(path.write_bytes, validated.data)
    doc = Document(
        shipment_id=shipment_id,
        doc_type=doc_type,
        file_path=str(path),
        file_name=safe_display_name(file.filename),
        file_size_bytes=len(validated.data),
        mime_type=validated.mime_type,
        sha256=digest,
        page_count=validated.page_count,
        extraction_status=ExtractionStatus.pending,
    )
    session.add(doc)
    shipment.status = ShipmentStatus.processing
    session.add(shipment)
    await session.commit()
    bg.add_task(process_document, doc.id)
    return doc


@router.get("", response_model=list[DocumentRead])
async def list_documents(
    shipment_id: int,
    _user: User = Depends(require_executive),
    session: AsyncSession = Depends(get_session),
):
    await get_shipment_or_404(session, shipment_id)
    return await documents_of(session, shipment_id)


@router.get("/{document_id}/file")
async def download_shipment_document(
    shipment_id: int,
    document_id: int,
    _user: User = Depends(require_executive),
    session: AsyncSession = Depends(get_session),
):
    """Serves the original document for side-by-side view (shipment-scoped route)."""
    doc = await session.get(Document, document_id)
    if doc is None or doc.shipment_id != shipment_id:
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(doc.file_path)
    if not path.is_file():
        raise HTTPException(status_code=410, detail="Original file is no longer available on this instance")
    return FileResponse(
        path,
        media_type=doc.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{doc.id}{path.suffix}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


# ------------------------------------------------------------------
# DIRECT DOCUMENT FILE ACCESS ROUTE (GET /api/v1/documents/{document_id}/file)
# Matches Postman request: GET {{baseUrl}}/api/v1/documents/{{documentId}}/file
# ------------------------------------------------------------------
@direct_router.get("/{document_id}/file")
async def download_document_direct(
    document_id: int,
    _user: User = Depends(require_executive),
    session: AsyncSession = Depends(get_session),
):
    """Serves the document file directly by document_id."""
    doc = await session.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(doc.file_path)
    if not path.is_file():
        raise HTTPException(status_code=410, detail="Original file is no longer available on this instance")
    return FileResponse(
        path,
        media_type=doc.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{doc.id}{path.suffix}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )