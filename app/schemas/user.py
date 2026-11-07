from datetime import datetime
from typing import Annotated, Optional

from app.schemas.base import BaseSchema
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

class UserCreate(BaseSchema):
    email: str
    password: str
    full_name: str
    role: Optional[str] = "executive"
    is_verified: Optional[bool] = True
    is_active: Optional[bool] = True


class UserAdminUpdate(_Strict):
    full_name: Optional[FullName] = None
    role: Optional[Role] = None
    is_active: Optional[bool] = None


class UserSelfUpdate(_Strict):
    full_name: FullName

class UserUpdate(BaseSchema):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None