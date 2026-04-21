"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/recruitment-mvp-api";

type Role = "admin" | "recruiter";

type PromptPayload = {
  candidate_analysis_prompt: string;
};

export default function SettingsPage() {
  const [token, setToken] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [checked, setChecked] = useState(false);
  const [candidatePrompt, setCandidatePrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

  useEffect(() => {
    const basePath = window.location.pathname.startsWith("/recruitment-mvp") ? "/recruitment-mvp" : "";
    const storedToken = window.localStorage.getItem("auth_token");
    const storedRole = window.localStorage.getItem("auth_role") as Role | null;
    if (!storedToken || !storedRole) {
      window.location.href = `${basePath}/`;
      return;
    }
    if (storedRole !== "admin") {
      window.location.href = `${basePath}/dashboard/candidates`;
      return;
    }
    setToken(storedToken);
    setRole(storedRole);
    setChecked(true);
  }, []);

  const loadPrompts = useCallback(async () => {
    setError("");
    setInfo("");
    setIsLoading(true);
    const response = await fetch(`${API_URL}/admin/settings/prompts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось загрузить настройки");
      setIsLoading(false);
      return;
    }
    const data: PromptPayload = await response.json();
    setCandidatePrompt(data.candidate_analysis_prompt);
    setIsLoading(false);
  }, [token]);

  useEffect(() => {
    if (!checked || !token) return;
    loadPrompts();
  }, [checked, token, loadPrompts]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSaving) return;
    setError("");
    setInfo("");
    setIsSaving(true);
    const response = await fetch(`${API_URL}/admin/settings/prompts`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_analysis_prompt: candidatePrompt,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось сохранить");
      setIsSaving(false);
      return;
    }
    const data: PromptPayload = await response.json();
    setCandidatePrompt(data.candidate_analysis_prompt);
    setInfo("Настройки сохранены");
    setIsSaving(false);
  }

  if (!checked || !role) {
    return <p>Проверка прав...</p>;
  }

  return (
    <div>
      <h2>Настройки</h2>
      <p className="muted">Единый промпт анализа кандидата (Markdown-ответ). Доступно только администратору.</p>

      {isLoading && !candidatePrompt && <p className="muted">Загрузка...</p>}

      <form onSubmit={onSubmit}>
        <label className="field-label" htmlFor="prompt-candidate">
          Промпт анализа кандидата
        </label>
        <p className="muted small-actions">
          Плейсхолдеры: <code>{`{{profile_json}}`}</code> (JSON профиля должности), <code>{`{{test_tasks}}`}</code>{" "}
          (сырой текст описания тестового задания из файла профиля), <code>{`{{resume_text}}`}</code>,{" "}
          <code>{`{{candidate_test_assignment}}`}</code> (тексты файлов ответа кандидата),{" "}
          <code>{`{{role_context}}`}</code> (короткий контекст роли из карточки профиля должности).
        </p>
        <textarea
          id="prompt-candidate"
          className="prompt-field"
          value={candidatePrompt}
          onChange={(e) => setCandidatePrompt(e.target.value)}
          disabled={isLoading}
          required
          spellCheck={false}
        />

        <button type="submit" disabled={isSaving || isLoading}>
          {isSaving ? "Сохранение..." : "Сохранить"}
        </button>
        <button type="button" className="secondary" onClick={() => loadPrompts()} disabled={isLoading || isSaving}>
          Сбросить из базы
        </button>
      </form>

      {info && <p>{info}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
