from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    require_role,
    verify_password,
)
from app.db import Base, SessionLocal, engine, get_db
from app.models import CandidateCard, CandidateStatus, CandidateTestFile, PositionProfile, PositionProfileFile, Role, User
from app.prompt_settings import get_unified_analysis_prompt, save_unified_analysis_prompt
from app.schemas import (
    CandidateCreate,
    CandidateDetailOut,
    CandidateListItemOut,
    CandidateListOut,
    CandidateOut,
    CandidateTestFileOut,
    PositionProfileDetailOut,
    PositionProfileFileOut,
    PositionProfileOut,
    PromptSettingsOut,
    PromptSettingsPut,
    RegisterRequest,
    TokenResponse,
    UserRoleUpdate,
    UserOut,
)
from app.storage import delete_object_s3, ensure_bucket, read_bytes_object, upload_bytes
from app.parsers import parse_by_extension
from app.tasks import analyze_candidate_task, build_profile_struct_task
from app.config import settings

app = FastAPI(title="MVP подбора персонала", root_path=settings.api_root_path)
DEFAULT_ADMIN_EMAIL = "info@artsofte.digital"
DEFAULT_ADMIN_PASSWORD = "NOzv6}Ap"


def _resume_original_name(resume_key: str | None) -> str | None:
    if not resume_key:
        return None
    base = resume_key.rsplit("/", 1)[-1]
    if "_" in base:
        return base.split("_", 1)[1]
    return base


def ensure_single_admin() -> None:
    db = SessionLocal()
    try:
        default_admin = db.query(User).filter(User.email == DEFAULT_ADMIN_EMAIL).first()
        if not default_admin:
            default_admin = User(
                email=DEFAULT_ADMIN_EMAIL,
                hashed_password=get_password_hash(DEFAULT_ADMIN_PASSWORD),
                role=Role.admin,
            )
            db.add(default_admin)
        elif default_admin.role != Role.admin:
            default_admin.role = Role.admin
        db.commit()
    finally:
        db.close()


def profile_detail_payload(db: Session, profile: PositionProfile) -> PositionProfileDetailOut:
    additional_files = (
        db.query(PositionProfileFile)
        .filter(PositionProfileFile.profile_id == profile.id)
        .order_by(PositionProfileFile.id.asc())
        .all()
    )
    files: list[PositionProfileFileOut] = []
    if profile.position_source_key:
        files.append(
            PositionProfileFileOut(id=0, original_name=profile.position_source_key.split("_", 1)[-1], file_kind="position")
        )
    if profile.test_source_key:
        files.append(PositionProfileFileOut(id=-1, original_name=profile.test_source_key.split("_", 1)[-1], file_kind="test"))
    files.extend([PositionProfileFileOut.model_validate(row) for row in additional_files])
    return PositionProfileDetailOut(
        id=profile.id,
        title=profile.title,
        position_struct=profile.position_struct,
        test_struct=profile.test_struct,
        role_context=profile.role_context,
        created_at=profile.created_at,
        files=files,
    )


def ensure_position_profile_role_context_column() -> None:
    """Для существующих БД без колонки role_context."""
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE position_profiles ADD COLUMN IF NOT EXISTS role_context TEXT"))


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_position_profile_role_context_column()
    ensure_bucket()
    ensure_single_admin()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/auth/register", response_model=UserOut)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Пользователь уже существует")
    user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        role=Role.recruiter,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный логин или пароль")
    token = create_access_token(user.id, user.role)
    return TokenResponse(access_token=token, role=user.role)


@app.post("/admin/users", response_model=UserOut)
def create_user_by_admin(
    payload: RegisterRequest,
    role: Role = Role.recruiter,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.admin)),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Пользователь уже существует")
    user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.get("/admin/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.admin)),
):
    return db.query(User).order_by(User.id.asc()).all()


@app.patch("/admin/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.admin)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.email == DEFAULT_ADMIN_EMAIL and payload.role != Role.admin:
        raise HTTPException(status_code=400, detail="Роль основного администратора изменить нельзя")
    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user


@app.get("/admin/settings/prompts", response_model=PromptSettingsOut, tags=["Настройки"])
def get_prompt_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.admin)),
):
    """
    Единый промпт анализа кандидата. Плейсхолдеры:
    `{{profile_json}}`, `{{test_tasks}}`, `{{resume_text}}`, `{{candidate_test_assignment}}`.
    """
    return PromptSettingsOut(
        candidate_analysis_prompt=get_unified_analysis_prompt(db),
    )


@app.put("/admin/settings/prompts", response_model=PromptSettingsOut, tags=["Настройки"])
def put_prompt_settings(
    payload: PromptSettingsPut,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.admin)),
):
    ca = payload.candidate_analysis_prompt.strip()
    if not ca:
        raise HTTPException(status_code=400, detail="Промпт анализа не может быть пустым")
    save_unified_analysis_prompt(db, ca)
    db.commit()
    return PromptSettingsOut(
        candidate_analysis_prompt=get_unified_analysis_prompt(db),
    )


@app.post("/admin/profiles", response_model=PositionProfileOut)
async def create_profile(
    title: str = Form(...),
    role_context: str = Form(""),
    position_file: UploadFile = File(...),
    test_file: UploadFile = File(...),
    additional_files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.admin)),
):
    position_bytes = await position_file.read()
    test_bytes = await test_file.read()
    rc = role_context.strip() or None
    profile = PositionProfile(
        title=title,
        position_source_key=upload_bytes(position_bytes, position_file.filename, "profiles/position"),
        test_source_key=upload_bytes(test_bytes, test_file.filename, "profiles/test"),
        position_struct={},
        test_struct={},
        role_context=rc,
    )
    db.add(profile)
    db.flush()
    for file in additional_files:
        payload = await file.read()
        db.add(
            PositionProfileFile(
                profile_id=profile.id,
                object_key=upload_bytes(payload, file.filename, "profiles/additional"),
                original_name=file.filename,
                file_kind="additional",
            )
        )
    db.commit()
    db.refresh(profile)
    build_profile_struct_task.delay(profile.id)
    return profile


@app.get("/profiles", response_model=list[PositionProfileOut])
def list_profiles(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(PositionProfile).order_by(PositionProfile.created_at.desc()).all()


@app.get("/admin/profiles/{profile_id}", response_model=PositionProfileDetailOut)
def get_profile_detail(
    profile_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.admin)),
):
    profile = db.query(PositionProfile).filter(PositionProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль должности не найден")
    return profile_detail_payload(db, profile)


@app.post("/admin/profiles/{profile_id}/files", response_model=PositionProfileDetailOut)
async def update_profile_files(
    profile_id: int,
    title: str | None = Form(default=None),
    role_context: str | None = Form(default=None),
    position_file: UploadFile | None = File(default=None),
    test_file: UploadFile | None = File(default=None),
    additional_files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.admin)),
):
    profile = db.query(PositionProfile).filter(PositionProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль должности не найден")

    if title is not None and title.strip():
        profile.title = title.strip()
    if role_context is not None:
        profile.role_context = role_context.strip() or None

    should_rebuild_struct = False
    if position_file:
        position_bytes = await position_file.read()
        profile.position_source_key = upload_bytes(position_bytes, position_file.filename, "profiles/position")
        should_rebuild_struct = True
    if test_file:
        test_bytes = await test_file.read()
        profile.test_source_key = upload_bytes(test_bytes, test_file.filename, "profiles/test")
        should_rebuild_struct = True

    for file in additional_files:
        payload = await file.read()
        db.add(
            PositionProfileFile(
                profile_id=profile.id,
                object_key=upload_bytes(payload, file.filename, "profiles/additional"),
                original_name=file.filename,
                file_kind="additional",
            )
        )

    db.commit()
    db.refresh(profile)
    if should_rebuild_struct and profile.position_source_key and profile.test_source_key:
        build_profile_struct_task.delay(profile.id)
    return profile_detail_payload(db, profile)


@app.delete("/admin/profiles/{profile_id}")
def delete_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.admin)),
):
    profile = db.query(PositionProfile).filter(PositionProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль должности не найден")
    candidates_count = db.query(CandidateCard).filter(CandidateCard.position_profile_id == profile_id).count()
    if candidates_count > 0:
        raise HTTPException(status_code=400, detail="Нельзя удалить профиль, который уже используется в карточках кандидатов")
    db.query(PositionProfileFile).filter(PositionProfileFile.profile_id == profile_id).delete()
    db.delete(profile)
    db.commit()
    return {"deleted": True}


@app.delete("/admin/profiles/{profile_id}/files/{file_id}", response_model=PositionProfileDetailOut)
def delete_profile_file(
    profile_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.admin)),
):
    profile = db.query(PositionProfile).filter(PositionProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль должности не найден")

    if file_id == 0:
        profile.position_source_key = ""
        profile.position_struct = {}
        profile.test_struct = {}
    elif file_id == -1:
        profile.test_source_key = ""
        profile.test_struct = {}
        profile.position_struct = {}
    else:
        file_row = (
            db.query(PositionProfileFile)
            .filter(
                PositionProfileFile.id == file_id,
                PositionProfileFile.profile_id == profile_id,
                PositionProfileFile.file_kind == "additional",
            )
            .first()
        )
        if not file_row:
            raise HTTPException(status_code=404, detail="Файл не найден")
        db.delete(file_row)

    db.commit()
    db.refresh(profile)
    return profile_detail_payload(db, profile)


@app.get("/recruiter/candidates", response_model=CandidateListOut)
def list_candidates(
    q: str = "",
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(Role.recruiter, Role.admin)),
):
    if limit < 1:
        limit = 10
    if limit > 100:
        limit = 100
    if skip < 0:
        skip = 0
    query = db.query(CandidateCard)
    if actor.role != Role.admin:
        query = query.filter(CandidateCard.recruiter_id == actor.id)
    search = (q or "").strip()
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                CandidateCard.full_name.ilike(term),
                CandidateCard.email.ilike(term),
            )
        )
    total = query.count()
    rows = query.order_by(CandidateCard.created_at.desc()).offset(skip).limit(limit).all()
    items = [CandidateListItemOut.model_validate(r) for r in rows]
    return CandidateListOut(items=items, total=total)


@app.post("/recruiter/candidates", response_model=CandidateOut)
def create_candidate(
    payload: CandidateCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(Role.recruiter, Role.admin)),
):
    profile = db.query(PositionProfile).filter(PositionProfile.id == payload.position_profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль должности не найден")
    card = CandidateCard(
        full_name=payload.full_name,
        email=payload.email,
        position_profile_id=payload.position_profile_id,
        recruiter_id=actor.id,
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
    actor: User = Depends(require_role(Role.recruiter, Role.admin)),
):
    query = db.query(CandidateCard).filter(CandidateCard.id == candidate_id)
    if actor.role != Role.admin:
        query = query.filter(CandidateCard.recruiter_id == actor.id)
    card = query.first()
    if not card:
        raise HTTPException(status_code=404, detail="Кандидат не найден")
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
    actor: User = Depends(require_role(Role.recruiter, Role.admin)),
):
    query = db.query(CandidateCard).filter(CandidateCard.id == candidate_id)
    if actor.role != Role.admin:
        query = query.filter(CandidateCard.recruiter_id == actor.id)
    card = query.first()
    if not card:
        raise HTTPException(status_code=404, detail="Кандидат не найден")
    if not files:
        raise HTTPException(status_code=400, detail="Нужно загрузить хотя бы один файл")
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
    actor: User = Depends(require_role(Role.recruiter, Role.admin)),
):
    query = db.query(CandidateCard).filter(CandidateCard.id == candidate_id)
    if actor.role != Role.admin:
        query = query.filter(CandidateCard.recruiter_id == actor.id)
    card = query.first()
    if not card:
        raise HTTPException(status_code=404, detail="Кандидат не найден")
    if not card.resume_key:
        raise HTTPException(status_code=400, detail="Сначала загрузите резюме")
    test_files_count = db.query(CandidateTestFile).filter(CandidateTestFile.candidate_id == candidate_id).count()
    if test_files_count == 0:
        raise HTTPException(status_code=400, detail="Сначала загрузите хотя бы один файл тестового задания")
    if card.status == CandidateStatus.processing:
        raise HTTPException(status_code=400, detail="Анализ уже выполняется")
    task = analyze_candidate_task.delay(candidate_id)
    return {"task_id": task.id}


@app.get("/recruiter/candidates/{candidate_id}", response_model=CandidateDetailOut)
def get_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(Role.recruiter, Role.admin)),
):
    query = db.query(CandidateCard).filter(CandidateCard.id == candidate_id)
    if actor.role != Role.admin:
        query = query.filter(CandidateCard.recruiter_id == actor.id)
    card = query.first()
    if not card:
        raise HTTPException(status_code=404, detail="Кандидат не найден")
    test_rows = (
        db.query(CandidateTestFile)
        .filter(CandidateTestFile.candidate_id == candidate_id)
        .order_by(CandidateTestFile.id.asc())
        .all()
    )
    return CandidateDetailOut(
        id=card.id,
        full_name=card.full_name,
        email=card.email,
        position_profile_id=card.position_profile_id,
        status=card.status,
        result=card.result,
        error=card.error,
        created_at=card.created_at,
        resume_original_name=_resume_original_name(card.resume_key),
        test_files=[CandidateTestFileOut.model_validate(t) for t in test_rows],
    )


@app.delete("/recruiter/candidates/{candidate_id}")
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(Role.recruiter, Role.admin)),
):
    query = db.query(CandidateCard).filter(CandidateCard.id == candidate_id)
    if actor.role != Role.admin:
        query = query.filter(CandidateCard.recruiter_id == actor.id)
    card = query.first()
    if not card:
        raise HTTPException(status_code=404, detail="Кандидат не найден")
    test_rows = db.query(CandidateTestFile).filter(CandidateTestFile.candidate_id == candidate_id).all()
    keys_to_delete: list[str] = []
    if card.resume_key:
        keys_to_delete.append(card.resume_key)
    keys_to_delete.extend(row.object_key for row in test_rows)
    db.query(CandidateTestFile).filter(CandidateTestFile.candidate_id == candidate_id).delete()
    db.delete(card)
    db.commit()
    for key in keys_to_delete:
        delete_object_s3(key)
    return {"deleted": True}
