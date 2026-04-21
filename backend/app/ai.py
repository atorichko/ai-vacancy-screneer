import json
import os

from openai import OpenAI

from app.config import settings

client = OpenAI(
    base_url=os.getenv("POLZA_BASE_URL", settings.polza_base_url),
    api_key=os.getenv("POLZA_API_KEY", settings.polza_api_key),
)


def _chat_json(prompt: str) -> dict:
    response = client.chat.completions.create(
        model=settings.polza_model,
        messages=[
            {"role": "system", "content": "Return only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )
    raw = response.choices[0].message.content or "{}"
    return json.loads(raw)


def build_position_and_test_struct(position_text: str, test_text: str) -> dict:
    prompt = f"""
Сформируй JSON с ключами:
- position: {{title, hard_skills[], soft_skills[], expectations[]}}
- test_template: {{blocks:[{{name, criteria[]}}]}}

Текст профиля должности:
{position_text[:15000]}

Текст тестового задания:
{test_text[:15000]}
"""
    return _chat_json(prompt)


def _truncate(s: str, max_len: int) -> str:
    if len(s) <= max_len:
        return s
    return s[:max_len] + "\n\n[… текст обрезан по лимиту …]"


def _apply_unified_prompt(
    template: str,
    profile_json_str: str,
    test_tasks: str,
    resume_text: str,
    candidate_test_assignment: str,
    role_context: str,
) -> str:
    return (
        template.replace("{{profile_json}}", _truncate(profile_json_str, 120_000))
        .replace("{{test_tasks}}", _truncate(test_tasks, 120_000))
        .replace("{{resume_text}}", _truncate(resume_text, 80_000))
        .replace("{{candidate_test_assignment}}", _truncate(candidate_test_assignment, 250_000))
        .replace("{{role_context}}", _truncate(role_context, 50_000))
    )


def _chat_markdown(user_prompt: str) -> str:
    response = client.chat.completions.create(
        model=settings.polza_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Ты помощник рекрутера. Отвечай на русском языке в формате Markdown "
                    "(заголовки #, таблицы, списки). Следуй структуре и требованиям из запроса пользователя. "
                    "Не оборачивай ответ в JSON."
                ),
            },
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
    )
    return (response.choices[0].message.content or "").strip()


def analyze_candidate_unified(
    profile_json_str: str,
    test_tasks: str,
    resume_text: str,
    candidate_test_assignment: str,
    role_context: str,
    prompt_template: str,
) -> dict:
    """Возвращает result для сохранения в БД: { \"markdown\": str }."""
    prompt = _apply_unified_prompt(
        prompt_template,
        profile_json_str,
        test_tasks,
        resume_text,
        candidate_test_assignment,
        role_context,
    )
    text = _chat_markdown(prompt)
    return {"markdown": text}
