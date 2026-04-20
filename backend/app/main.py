from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.ai import build_position_and_test_struct
from app.auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    require_role,
    verify_password,
)
from app.db import Base, engine, get_db
from app.models import CandidateCard, CandidateTestFile, PositionProfile, Role, User
from app.schemas import (
    CandidateCreate,
    CandidateOut,
    PositionProfileOut,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.storage import ensure_bucket, upload_bytes
from app.parsers import parse_by_extension
from app.tasks import analyze_candidate_task
from app.config import settings

app = FastAPI(title="Recruitment MVP", root_path=settings.api_root_path)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_bucket()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/auth/register", response_model=UserOut)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="User exists")
    user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    token = create_access_token(user.id, user.role)
    return TokenResponse(access_token=token)


@app.post("/admin/profiles", response_model=PositionProfileOut)
async def create_profile(
    title: str = Form(...),
    position_file: UploadFile = File(...),
    test_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.admin)),
):
    position_bytes = await position_file.read()
    test_bytes = await test_file.read()
    position_text = parse_by_extension(position_file.filename, position_bytes)
    test_text = parse_by_extension(test_file.filename, test_bytes)

    struct = build_position_and_test_struct(position_text, test_text)
    profile = PositionProfile(
        title=title,
        position_source_key=upload_bytes(position_bytes, position_file.filename, "profiles/position"),
        test_source_key=upload_bytes(test_bytes, test_file.filename, "profiles/test"),
        position_struct=struct.get("position", {}),
        test_struct=struct.get("test_template", {}),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@app.get("/profiles", response_model=list[PositionProfileOut])
def list_profiles(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(PositionProfile).order_by(PositionProfile.created_at.desc()).all()


@app.post("/recruiter/candidates", response_model=CandidateOut)
def create_candidate(
    payload: CandidateCreate,
    db: Session = Depends(get_db),
    recruiter: User = Depends(require_role(Role.recruiter)),
):
    profile = db.query(PositionProfile).filter(PositionProfile.id == payload.position_profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    card = CandidateCard(
        full_name=payload.full_name,
        email=payload.email,
        position_profile_id=payload.position_profile_id,
        recruiter_id=recruiter.id,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@app.post("/recruiter/candidates/{candidate_id}/resume", response_model=CandidateOut)
async def upload_resume(
    candidate_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    recruiter: User = Depends(require_role(Role.recruiter)),
):
    card = db.query(CandidateCard).filter(CandidateCard.id == candidate_id, CandidateCard.recruiter_id == recruiter.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Candidate not found")
    payload = await file.read()
    card.resume_key = upload_bytes(payload, file.filename, "candidates/resume")
    db.commit()
    db.refresh(card)
    return card


@app.post("/recruiter/candidates/{candidate_id}/test-files")
async def upload_test_files(
    candidate_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    recruiter: User = Depends(require_role(Role.recruiter)),
):
    card = db.query(CandidateCard).filter(CandidateCard.id == candidate_id, CandidateCard.recruiter_id == recruiter.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Candidate not found")
    for file in files:
        payload = await file.read()
        row = CandidateTestFile(
            candidate_id=candidate_id,
            object_key=upload_bytes(payload, file.filename, "candidates/tests"),
            original_name=file.filename,
        )
        db.add(row)
    db.commit()
    return {"uploaded": len(files)}


@app.post("/recruiter/candidates/{candidate_id}/analyze")
def run_analysis(
    candidate_id: int,
    db: Session = Depends(get_db),
    recruiter: User = Depends(require_role(Role.recruiter)),
):
    card = db.query(CandidateCard).filter(CandidateCard.id == candidate_id, CandidateCard.recruiter_id == recruiter.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if not card.resume_key:
        raise HTTPException(status_code=400, detail="Resume is required")
    task = analyze_candidate_task.delay(candidate_id)
    return {"task_id": task.id}


@app.get("/recruiter/candidates/{candidate_id}", response_model=CandidateOut)
def get_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    recruiter: User = Depends(require_role(Role.recruiter)),
):
    card = db.query(CandidateCard).filter(CandidateCard.id == candidate_id, CandidateCard.recruiter_id == recruiter.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return card
