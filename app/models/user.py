from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import tz_column, utcnow
from app.models.enums import Role


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=320)
    hashed_password: str
    full_name: str = Field(max_length=200)
    role: Role = Field(default=Role.executive)
    is_active: bool = True
    is_verified: bool = False
    created_at: datetime = Field(default_factory=utcnow, sa_column=tz_column())
    updated_at: datetime = Field(default_factory=utcnow, sa_column=tz_column(onupdate=True))
