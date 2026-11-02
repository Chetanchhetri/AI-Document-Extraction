"""Async SMTP sender for OTP emails (runs as a FastAPI background task)."""
from __future__ import annotations

import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_otp_email(email: str, full_name: str, code: str) -> None:
    if not settings.SMTP_HOST:
        if settings.is_production:
            logger.error("SMTP_HOST not configured - OTP email to %s NOT sent", email)
        else:
            logger.warning("[DEV ONLY] SMTP not configured. OTP for %s is %s", email, code)
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.SMTP_FROM, email, "Your verification code"
    msg.set_content(
        f"Hello {full_name},\n\nYour verification code is {code}. "
        f"It expires in {settings.OTP_TTL_SECONDS // 60} minutes.\n\n"
        "If you did not request this, you can ignore this email.\n"
    )
    try:
        await aiosmtplib.send(
            msg, hostname=settings.SMTP_HOST, port=settings.SMTP_PORT,
            username=settings.SMTP_USER or None, password=settings.SMTP_PASSWORD or None,
            use_tls=settings.SMTP_PORT == 465, start_tls=settings.SMTP_STARTTLS and settings.SMTP_PORT != 465,
            timeout=15,
        )
    except Exception as exc:  # never crash the request/worker because mail failed
        logger.error("Failed to send OTP email to %s: %s", email, type(exc).__name__)
