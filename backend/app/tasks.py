import json

from app.ai import analyze_candidate_unified, build_position_and_test_struct
from app.celery_app import celery
from app.prompt_settings import get_unified_analysis_prompt
from app.db import SessionLocal
from app.models import CandidateCard, CandidateStatus, CandidateTestFile, PositionProfile
from app.parsers import parse_by_extension
from app.storage import s3
from app.config import settings


def _read_s3(key: str) -> bytes:
    obj = s3.get_object(Bucket=settings.s3_bucket, Key=key)
    return obj["Body"].read()


def _test_tasks_raw_text(profile: PositionProfile) -> str:
    """Сырой текст описания тестового задания из файла профиля (без ИИ)."""
    if not profile.test_source_key:
        return ""
    return parse_by_extension(profile.test_source_key, _read_s3(profile.test_source_key))


def _candidate_test_assignment_text(db, candidate_id: int) -> str:
    """Тексты ответов кандидата по файлам теста, склеенные с заголовками."""
    rows = (
        db.query(CandidateTestFile)
        .filter(CandidateTestFile.candidate_id == candidate_id)
        .order_by(CandidateTestFile.id.asc())
        .all()
    )
    parts: list[str] = []
    for row in rows:
        body = parse_by_extension(row.original_name, _read_s3(row.object_key))
        parts.append(f"### Файл: {row.original_name}\n\n{body}")
    return "\n\n---\n\n".join(parts)


def _candidate_context_text(card: CandidateCard) -> str:
    """Дополнительный контекст кандидата: ручной текст + опциональный файл."""
    parts: list[str] = []
    text = (card.candidate_context or "").strip()
    if text:
        parts.append(f"### Комментарий рекрутера\n\n{text}")
    if card.candidate_context_file_key and card.candidate_context_file_name:
        body = parse_by_extension(card.candidate_context_file_name, _read_s3(card.candidate_context_file_key))
        parts.append(f"### Файл с дополнительной информацией: {card.candidate_context_file_name}\n\n{body}")
    return "\n\n---\n\n".join(parts)


@celery.task(name="analyze_candidate_task")
def analyze_candidate_task(candidate_id: int):
    db = SessionLocal()
    try:
        card = db.query(CandidateCard).filter(CandidateCard.id == candidate_id).first()
        if not card:
            return
        card.status = CandidateStatus.processing
        db.commit()

        profile = db.query(PositionProfile).filter(PositionProfile.id == card.position_profile_id).first()
        if not profile:
            raise RuntimeError("Профиль должности не найден")
        resume_text = parse_by_extension(card.resume_key, _read_s3(card.resume_key))
        test_tasks = _test_tasks_raw_text(profile)
        candidate_assignment = _candidate_test_assignment_text(db, card.id)

        profile_json_str = json.dumps(
            {"title": profile.title, "position": profile.position_struct},
            ensure_ascii=False,
        )

        role_context = (profile.role_context or "").strip()
        candidate_context = _candidate_context_text(card)

        prompt_template = get_unified_analysis_prompt(db)
        result = analyze_candidate_unified(
            profile_json_str=profile_json_str,
            test_tasks=test_tasks,
            resume_text=resume_text,
            candidate_test_assignment=candidate_assignment,
            role_context=role_context,
            candidate_context=candidate_context,
            prompt_template=prompt_template,
        )
        card.result = result
        card.status = CandidateStatus.done
        db.commit()
    except Exception as exc:  # noqa: BLE001
        card = db.query(CandidateCard).filter(CandidateCard.id == candidate_id).first()
        if card:
            card.status = CandidateStatus.failed
            card.error = str(exc)
            db.commit()
        raise
    finally:
        db.close()


@celery.task(name="build_profile_struct_task")
def build_profile_struct_task(profile_id: int):
    db = SessionLocal()
    try:
        profile = db.query(PositionProfile).filter(PositionProfile.id == profile_id).first()
        if not profile:
            return
        if not profile.position_source_key or not profile.test_source_key:
            profile.position_struct = {}
            profile.test_struct = {}
            db.commit()
            return

        position_text = parse_by_extension(profile.position_source_key, _read_s3(profile.position_source_key))
        test_text = parse_by_extension(profile.test_source_key, _read_s3(profile.test_source_key))
        struct = build_position_and_test_struct(position_text, test_text)
        profile.position_struct = struct.get("position", {})
        profile.test_struct = struct.get("test_template", {})
        db.commit()
    finally:
        db.close()
