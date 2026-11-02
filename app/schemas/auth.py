import re
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints, field_validator

OTP = Annotated[str, StringConstraints(pattern=r"^\d{6}$")]


def _check_password(v: str) -> str:
    if len(v) < 10 or len(v) > 128:
        raise ValueError("Password must be 10-128 characters")
    if not (re.search(r"[a-z]", v) and re.search(r"[A-Z]", v) and re.search(r"\d", v)):
        raise ValueError("Password must contain upper-case, lower-case and a digit")
    return v


class _Strict(BaseModel):
    # extra="forbid": a body containing e.g. {"role": "super_admin"} is rejected with 422
    # instead of being silently ignored -> mass-assignment attempts are loud.
    model_config = ConfigDict(extra="forbid")


class SignupRequest(_Strict):
    email: EmailStr
    password: str
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]

    _pw = field_validator("password")(_check_password)


class VerifyOtpRequest(_Strict):
    email: EmailStr
    otp: OTP


class ResendOtpRequest(_Strict):
    email: EmailStr


class LoginRequest(_Strict):
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class RefreshRequest(_Strict):
    refresh_token: str


class LogoutRequest(_Strict):
    refresh_token: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class MessageResponse(BaseModel):
    message: str
