from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints, field_validator

from app.models.enums import Role
from app.schemas.auth import _check_password, _Strict

FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool
    is_verified: bool
    created_at: datetime


class UserCreate(_Strict):
    """Admin-only: creates (invites) a staff account. The user must still verify the emailed OTP."""
    email: EmailStr
    full_name: FullName
    role: Role = Role.executive
    password: str

    _pw = field_validator("password")(_check_password)


class UserAdminUpdate(_Strict):
    full_name: Optional[FullName] = None
    role: Optional[Role] = None
    is_active: Optional[bool] = None


class UserSelfUpdate(_Strict):
    full_name: FullName
