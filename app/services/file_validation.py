"""Upload hardening: size cap, magic-byte MIME sniffing, PDF integrity/bomb checks, JS stripping."""
from __future__ import annotations

import re
import struct
import unicodedata
from dataclasses import dataclass

import pymupdf
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

ALLOWED_MIME = {"application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg"}
_CHUNK = 1024 * 1024


@dataclass
class ValidatedFile:
    data: bytes
    mime_type: str
    extension: str
    page_count: int


def _reject(code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


async def read_upload_limited(upload: UploadFile) -> bytes:
    """Stream the upload and abort as soon as the size cap is exceeded (no unbounded buffering)."""
    buf = bytearray()
    while chunk := await upload.read(_CHUNK):
        buf.extend(chunk)
        if len(buf) > settings.MAX_UPLOAD_BYTES:
            raise _reject(413,
                          f"File exceeds the {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit")
    if not buf:
        raise _reject(status.HTTP_400_BAD_REQUEST, "Empty file")
    return bytes(buf)


def sniff_mime(head: bytes) -> str | None:
    """Detect the real type from magic bytes. Extension and client Content-Type are ignored."""
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


def safe_display_name(name: str | None) -> str:
    """Display-only name. NEVER used to build a filesystem/S3 path."""
    name = (name or "upload").replace("\\", "/").split("/")[-1]
    name = unicodedata.normalize("NFKC", name)
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    name = re.sub(r"[^\w.\- ()]", "_", name).strip(" .") or "upload"
    return name[:120]


def _png_size(data: bytes) -> tuple[int, int]:
    return struct.unpack(">II", data[16:24])


def _jpeg_size(data: bytes) -> tuple[int, int]:
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seg_len = struct.unpack(">H", data[i + 2:i + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        i += 2 + seg_len
    raise ValueError("no SOF marker")


def _sanitize_pdf(data: bytes) -> tuple[bytes, int]:
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise _reject(422, "Corrupt or unsupported PDF") from exc
    try:
        if doc.needs_pass or doc.is_encrypted:
            raise _reject(422, "Encrypted/password-protected PDFs are not accepted")
        if not doc.is_pdf or doc.page_count < 1:
            raise _reject(422, "PDF has no pages")
        if doc.page_count > settings.MAX_PDF_PAGES:
            raise _reject(422, f"PDF has too many pages (max {settings.MAX_PDF_PAGES})")
        for page in doc:  # absurd page geometry == render bomb
            r = page.rect
            if r.width <= 0 or r.height <= 0 or r.width > 5000 or r.height > 5000:
                raise _reject(422, "PDF page dimensions are not acceptable")
        # Strip active content: JavaScript, embedded/attached files, link & form actions.
        try:
            doc.scrub(javascript=True, embedded_files=True, attached_files=True, metadata=True,
                      remove_links=True, reset_fields=True, reset_responses=True, thumbnails=True,
                      xml_metadata=True)
        except Exception:
            # scrub is best effort across PyMuPDF versions; fall back to catalog surgery below
            pass
        try:
            cat = doc.pdf_catalog()
            for key in ("OpenAction", "AA", "Names", "AcroForm", "Perms"):
                doc.xref_set_key(cat, key, "null")
        except Exception:
            pass
        pages = doc.page_count
        out = doc.tobytes(garbage=4, deflate=True, clean=True)
    except HTTPException:
        raise
    except Exception as exc:
        raise _reject(422, "PDF failed integrity validation") from exc
    finally:
        doc.close()
    if len(out) > settings.MAX_UPLOAD_BYTES:
        raise _reject(413, "Sanitised PDF exceeds the size limit")
    if re.search(rb"/(JavaScript|JS|Launch|EmbeddedFile)\b", out):
        raise _reject(422, "PDF contains active content that could not be removed")
    return out, pages


def validate_and_sanitize(data: bytes) -> ValidatedFile:
    mime = sniff_mime(data[:16])
    if mime is None:
        raise _reject(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PDF, PNG and JPEG files are accepted")
    if mime == "application/pdf":
        clean, pages = _sanitize_pdf(data)
        return ValidatedFile(clean, mime, ".pdf", pages)
    try:
        w, h = _png_size(data) if mime == "image/png" else _jpeg_size(data)
    except Exception as exc:
        raise _reject(422, "Corrupt image") from exc
    if w < 1 or h < 1 or w * h > settings.MAX_IMAGE_PIXELS:
        raise _reject(422, "Image dimensions are not acceptable")
    try:
        pymupdf.Pixmap(data)  # full decode proves the image is structurally valid
    except Exception as exc:
        raise _reject(422, "Corrupt image") from exc
    return ValidatedFile(data, mime, ALLOWED_MIME[mime], 1)
