from sqlalchemy.orm import Session

from app.ai import analyze_candidate
from app.celery_app import celery
from app.db import SessionLocal
from app.models import CandidateCard, CandidateStatus, CandidateTestFile, PositionProfile
from app.parsers import parse_by_extension
from app.storage import s3
from app.config import settings


def _read_s3(key: str) -> bytes:
    obj = s3.get_object(Bucket=settings.s3_bucket, Key=key)
    return obj["Body"].read()


def _parse_test_files(db: Session, candidate_id: int, test_struct: dict) -> dict:
    rows = db.query(CandidateTestFile).filter(CandidateTestFile.candidate_id == candidate_id).all()
    blocks = test_struct.get("blocks", [])
    assigned = []
    for row in rows:
        text = parse_by_extension(row.original_name, _read_s3(row.object_key))
        block = blocks[0]["name"] if blocks else "general"
        assigned.append(
            {
                "file": row.original_name,
                "block": block,
                "summary": text[:1200],
            }
        )
    return {"assigned_files": assigned}


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
        resume_text = parse_by_extension(card.resume_key, _read_s3(card.resume_key))
        test_payload = _parse_test_files(db, card.id, profile.test_struct)
        result = analyze_candidate(
            profile_json={"position": profile.position_struct, "test_template": profile.test_struct},
            resume_text=resume_text,
            test_payload=test_payload,
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
