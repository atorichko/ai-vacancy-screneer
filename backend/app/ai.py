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


def analyze_candidate(
    profile_json: dict,
    resume_text: str,
    test_payload: dict,
) -> dict:
    prompt = f"""
Ты оцениваешь кандидата для рекрутера.
Верни JSON:
{{
 "short_report": "...",
 "full_report": "...",
 "strengths": ["..."],
 "risks": ["..."],
 "grey_zones": ["..."],
 "interview_questions": ["...", "..."],
 "resume_score": 0-100,
 "test_score": 0-100,
 "consistency_score": 0-100
}}

Профиль и шаблон теста:
{json.dumps(profile_json, ensure_ascii=False)}

Резюме:
{resume_text[:18000]}

Анализ блоков теста:
{json.dumps(test_payload, ensure_ascii=False)[:18000]}
"""
    return _chat_json(prompt)
