"""Единый промпт анализа кандидата; дефолт из файла или встроенный короткий fallback."""

from pathlib import Path

from sqlalchemy.orm import Session

from app.models import AppSetting

KEY_UNIFIED_ANALYSIS = "prompt_unified_candidate_analysis"

LEGACY_KEY_CANDIDATE = "prompt_candidate_analysis"

_PROMPT_DIR = Path(__file__).resolve().parent
_DEFAULT_SINGLE = _PROMPT_DIR / "default_unified_analysis_prompt.txt"
_DEFAULT_PARTS = (
    _PROMPT_DIR / "default_unified_analysis_prompt.part1.txt",
    _PROMPT_DIR / "default_unified_analysis_prompt.part2.txt",
)

_FALLBACK_MINIMAL = """
Ты — опытный рекрутер. Проведи анализ по входным данным и ответь на русском в формате Markdown.

Входные данные:

Профиль кандидата:
{{profile_json}}

Описание тестового задания:
{{test_tasks}}

Резюме кандидата:
{{resume_text}}

выполненное кандидатом тестовое задание:
{{candidate_test_assignment}}

Дополнительный контекст по роли (из настроек профиля должности):
{{role_context}}

Дополнительная информация по кандидату (комментарий рекрутера и/или файл):
{{candidate_context}}

Следуй структуре из полной версии промпта (разделы 1–11): краткий итог, скоринг, анализ резюме, анализ теста, сопоставление, сильные/слабые стороны, red flags, вопросы для интервью, hiring verdict, резюме для менеджера.
""".strip()


def _load_builtin_default() -> str:
    if _DEFAULT_SINGLE.is_file():
        return _DEFAULT_SINGLE.read_text(encoding="utf-8").strip()
    parts: list[str] = []
    for fp in _DEFAULT_PARTS:
        if fp.is_file():
            parts.append(fp.read_text(encoding="utf-8"))
    if parts:
        return "\n\n".join(parts).strip()
    return _FALLBACK_MINIMAL


def get_unified_analysis_prompt(db: Session) -> str:
    row = db.query(AppSetting).filter(AppSetting.key == KEY_UNIFIED_ANALYSIS).first()
    if row and row.value and str(row.value).strip():
        return str(row.value).strip()
    legacy = db.query(AppSetting).filter(AppSetting.key == LEGACY_KEY_CANDIDATE).first()
    if legacy and legacy.value and str(legacy.value).strip():
        return str(legacy.value).strip()
    return _load_builtin_default()


def save_unified_analysis_prompt(db: Session, text: str) -> None:
    text = text.strip()
    row = db.query(AppSetting).filter(AppSetting.key == KEY_UNIFIED_ANALYSIS).first()
    if row:
        row.value = text
    else:
        db.add(AppSetting(key=KEY_UNIFIED_ANALYSIS, value=text))
