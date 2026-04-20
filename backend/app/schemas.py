from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr

from app.models import CandidateStatus, Role


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    role: Role


class UserOut(BaseModel):
    id: int
    email: EmailStr
    role: Role

    model_config = {"from_attributes": True}


class PositionProfileOut(BaseModel):
    id: int
    title: str
    position_struct: dict[str, Any]
    test_struct: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class CandidateCreate(BaseModel):
    full_name: str
    email: EmailStr
    position_profile_id: int


class CandidateOut(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    position_profile_id: int
    status: CandidateStatus
    result: dict[str, Any] | None = None
    error: str | None = None

    model_config = {"from_attributes": True}
