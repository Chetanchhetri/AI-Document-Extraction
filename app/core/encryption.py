"""Application-level AES-256-GCM encryption for PII + masking helpers (DPDP Act 2023).

Note: `cryptography.fernet` is AES-128-CBC + HMAC, so it does NOT satisfy "AES-256-GCM".
This module uses `AESGCM` with a 256-bit key and a random 96-bit nonce per value.
"""
from __future__ import annotations

import base64
import binascii
import os
import re

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import settings

PII_FIELD_NAMES = frozenset(
    {
        "importer_contact_name", "importer_email", "importer_phone",
        "exporter_contact_name", "exporter_email", "exporter_phone",
    }
)
_PREFIX = "enc:v1:"


def _load_key(raw: str) -> bytes:
    raw = (raw or "").strip()
    if len(raw) == 64:
        try:
            return bytes.fromhex(raw)
        except ValueError:
            pass
    try:
        decoded = base64.b64decode(raw + "=" * (-len(raw) % 4), altchars=b"-_")
        if len(decoded) == 32:
            return decoded
    except (binascii.Error, ValueError):
        pass
    if len(raw) < 32:
        # Dev-only fallback so the app boots; production is blocked by Settings validation.
        raw = (raw + settings.SECRET_KEY)[:64]
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"customs-idp-pii-v1").derive(raw.encode())


_aes = AESGCM(_load_key(settings.AES_ENCRYPTION_KEY))


def is_pii_field(field_name: str) -> bool:
    return field_name in PII_FIELD_NAMES


def is_encrypted(value: str | None) -> bool:
    return bool(value) and value.startswith(_PREFIX)


def encrypt_value(plaintext: str, context: str = "") -> str:
    nonce = os.urandom(12)
    ct = _aes.encrypt(nonce, plaintext.encode(), context.encode() or None)
    return _PREFIX + base64.urlsafe_b64encode(nonce + ct).decode()


def decrypt_value(token: str, context: str = "") -> str:
    if not is_encrypted(token):
        return token
    blob = base64.urlsafe_b64decode(token[len(_PREFIX):])
    return _aes.decrypt(blob[:12], blob[12:], context.encode() or None).decode()


def store_field_value(field_name: str, value: str) -> str:
    return encrypt_value(value, f"field:{field_name}") if is_pii_field(field_name) and value else value


def read_field_value(field_name: str, stored: str) -> str:
    return decrypt_value(stored, f"field:{field_name}") if is_encrypted(stored) else stored


# ---------------------------------------------------------------------------
# Masking
# ---------------------------------------------------------------------------
def mask_email(value: str) -> str:
    local, _, domain = value.partition("@")
    if not domain:
        return mask_name(value)
    tld = domain[domain.rfind("."):] if "." in domain else ""
    return f"{local[:1]}***@{domain[:1]}***{tld}"


def mask_phone(value: str) -> str:
    m = re.match(r"^\s*(\+\d{1,3})[-\s]?", value)
    prefix = f"{m.group(1)}-" if m else ""
    rest = value[m.end():] if m else value
    digits = re.sub(r"\D", "", rest)
    if len(digits) <= 4:
        return prefix + "*" * len(digits)
    return f"{prefix}{'*' * (len(digits) - 4)}{digits[-4:]}"


def mask_name(value: str) -> str:
    def _w(word: str) -> str:
        return word[0] + "*" if len(word) <= 2 else word[0] + "*" * (len(word) - 2) + word[-1]

    return " ".join(_w(w) for w in value.split())


def mask_pii(field_name: str, value: str | None) -> str | None:
    if not value or not is_pii_field(field_name):
        return value
    if field_name.endswith("_email"):
        return mask_email(value)
    if field_name.endswith("_phone"):
        return mask_phone(value)
    return mask_name(value)


_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE_RE = re.compile(r"(?<![\w])(?:\+\d{1,3}[-\s]?\d[\d\s-]{7,}\d|[6-9]\d{9})(?![\w])")


def redact_text(text: str) -> str:
    text = _EMAIL_RE.sub(lambda m: mask_email(m.group(0)), text)
    return _PHONE_RE.sub(lambda m: mask_phone(m.group(0)), text)
