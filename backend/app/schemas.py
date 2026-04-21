from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr

from app.models import CandidateStatus, Role


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    role: Role

    model_config = {"from_attributes": True}


class UserRoleUpdate(BaseModel):
    role: Role


class PositionProfileOut(BaseModel):
    id: int
    title: str
    position_struct: dict[str, Any]
    test_struct: dict[str, Any]
    role_context: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PositionProfileFileOut(BaseModel):
    id: int
    original_name: str
    file_kind: str

    model_config = {"from_attributes": True}


class PositionProfileDetailOut(PositionProfileOut):
    files: list[PositionProfileFileOut]


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
    created_at: datetime

    model_config = {"from_attributes": True}


class CandidateListItemOut(BaseModel):
    id: int
    full_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CandidateListOut(BaseModel):
    items: list[CandidateListItemOut]
    total: int


class CandidateTestFileOut(BaseModel):
    id: int
    original_name: str

    model_config = {"from_attributes": True}


class CandidateDetailOut(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    position_profile_id: int
    status: CandidateStatus
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime
    resume_original_name: str | None = None
    test_files: list[CandidateTestFileOut]

    model_config = {"from_attributes": True}


class PromptSettingsOut(BaseModel):
    """Единый промпт анализа кандидата. Плейсхолдеры: {{profile_json}}, {{test_tasks}}, {{resume_text}}, {{candidate_test_assignment}}."""

    candidate_analysis_prompt: str


class PromptSettingsPut(BaseModel):
    candidate_analysis_prompt: str
