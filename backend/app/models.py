import enum
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db import Base


class Role(str, enum.Enum):
    admin = "admin"
    recruiter = "recruiter"


class CandidateStatus(str, enum.Enum):
    draft = "draft"
    processing = "processing"
    done = "done"
    failed = "failed"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(Role), nullable=False)


class PositionProfile(Base):
    __tablename__ = "position_profiles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    position_source_key = Column(String(255), nullable=False)
    test_source_key = Column(String(255), nullable=False)
    position_struct = Column(JSON, nullable=False, default=dict)
    test_struct = Column(JSON, nullable=False, default=dict)
    role_context = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    files = relationship("PositionProfileFile", back_populates="profile", cascade="all, delete-orphan")


class PositionProfileFile(Base):
    __tablename__ = "position_profile_files"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("position_profiles.id"), nullable=False)
    object_key = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_kind = Column(String(50), nullable=False)

    profile = relationship("PositionProfile", back_populates="files")


class CandidateCard(Base):
    __tablename__ = "candidate_cards"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    position_profile_id = Column(Integer, ForeignKey("position_profiles.id"), nullable=False)
    recruiter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    resume_key = Column(String(255), nullable=True)
    status = Column(Enum(CandidateStatus), default=CandidateStatus.draft, nullable=False)
    result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    profile = relationship("PositionProfile")
    recruiter = relationship("User")


class CandidateTestFile(Base):
    __tablename__ = "candidate_test_files"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidate_cards.id"), nullable=False)
    object_key = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(128), primary_key=True)
    value = Column(Text, nullable=False)

