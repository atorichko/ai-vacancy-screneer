"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/recruitment-mvp-api";

type Role = "admin" | "recruiter";

type Profile = {
  id: number;
  title: string;
};

export default function ProfilesPage() {
  const [token, setToken] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [checked, setChecked] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [deletingProfileId, setDeletingProfileId] = useState<number | null>(null);

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

  useEffect(() => {
    if (!checked || !token) return;
    loadProfiles();
  }, [checked, token]);

  async function loadProfiles() {
    setError("");
    setIsLoadingProfiles(true);
    const response = await fetch(`${API_URL}/profiles`, { headers: authHeaders });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось загрузить профили должностей");
      setIsLoadingProfiles(false);
      return;
    }
    setProfiles(await response.json());
    setIsLoadingProfiles(false);
  }

  async function createProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isCreatingProfile) return;
    setError("");
    setInfo("");
    setIsCreatingProfile(true);
    const form = e.currentTarget;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value;
    const positionFile = (form.elements.namedItem("position_file") as HTMLInputElement).files?.[0];
    const testFile = (form.elements.namedItem("test_file") as HTMLInputElement).files?.[0];
    const additionalFiles = (form.elements.namedItem("additional_files") as HTMLInputElement).files;
    if (!positionFile || !testFile) {
      setError("Загрузите оба файла для профиля должности");
      setIsCreatingProfile(false);
      return;
    }
    const payload = new FormData();
    payload.append("title", title);
    const roleContext = (form.elements.namedItem("role_context") as HTMLTextAreaElement).value;
    payload.append("role_context", roleContext);
    payload.append("position_file", positionFile);
    payload.append("test_file", testFile);
    if (additionalFiles?.length) {
      Array.from(additionalFiles).forEach((file) => payload.append("additional_files", file));
    }
    const response = await fetch(`${API_URL}/admin/profiles`, {
      method: "POST",
      headers: authHeaders,
      body: payload,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось создать профиль должности");
      setIsCreatingProfile(false);
      return;
    }
    setInfo("Профиль создан. AI-структура формируется в фоне, список можно обновить через несколько секунд.");
    form.reset();
    await loadProfiles();
    setIsCreatingProfile(false);
  }

  async function deleteProfile(profileId: number) {
    if (deletingProfileId) return;
    setError("");
    setInfo("");
    const confirmed = window.confirm("Удалить профиль должности?");
    if (!confirmed) return;
    setDeletingProfileId(profileId);
    const response = await fetch(`${API_URL}/admin/profiles/${profileId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось удалить профиль");
      setDeletingProfileId(null);
      return;
    }
    setInfo("Профиль удален");
    await loadProfiles();
    setDeletingProfileId(null);
  }

  if (!checked || !role) {
    return <p>Проверка прав...</p>;
  }

  return (
    <div>
      <h2>Профили должности</h2>

      <p className="muted small-actions">
        <button
          type="button"
          className="link-button"
          onClick={loadProfiles}
          disabled={isLoadingProfiles || isCreatingProfile}
        >
          {isLoadingProfiles ? "Обновляем список..." : "Обновить список"}
        </button>
      </p>

      {isLoadingProfiles && profiles.length === 0 && <p className="muted">Загружаем профили...</p>}

      {!isLoadingProfiles && profiles.length === 0 && <p className="muted">Пока нет ни одного профиля.</p>}

      {profiles.map((profile) => (
        <div key={profile.id} className="list-row">
          <span>
            #{profile.id} {profile.title}
          </span>
          <button
            className="inline-button"
            onClick={() => {
              const basePath = window.location.pathname.startsWith("/recruitment-mvp") ? "/recruitment-mvp" : "";
              window.location.href = `${basePath}/dashboard/profiles/${profile.id}`;
            }}
          >
            Открыть
          </button>
          <button
            className="inline-button secondary"
            onClick={() => deleteProfile(profile.id)}
            disabled={deletingProfileId === profile.id}
          >
            {deletingProfileId === profile.id ? "Удаляем..." : "Удалить"}
          </button>
        </div>
      ))}

      <h3 className="step-title" style={{ marginTop: "1.5rem" }}>
        Создать профиль должности
      </h3>

      <form onSubmit={createProfile}>
        <input name="title" placeholder="Название профиля" required />
        <label className="field-label">Контекст роли для анализа кандидатов (необязательно)</label>
        <p className="muted">
          Короткие вводные для AI: уровень роли, что важно оценить. В промпт анализа подставляется как{" "}
          <code>{`{{role_context}}`}</code>.
        </p>
        <textarea
          name="role_context"
          className="prompt-field"
          style={{ minHeight: "140px" }}
          placeholder="Например: senior performance marketing manager; важно: медиапланирование, воронка, KPI..."
          spellCheck={false}
        />
        <label className="muted">Файл: профиль должности (Word/Excel)</label>
        <input name="position_file" type="file" accept=".doc,.docx,.xls,.xlsx" required />
        <label className="muted">Файл: описание тестового задания (Word/Excel)</label>
        <input name="test_file" type="file" accept=".doc,.docx,.xls,.xlsx" required />
        <label className="muted">Файлы: дополнительные материалы (можно несколько)</label>
        <input name="additional_files" type="file" accept=".doc,.docx,.xls,.xlsx,.pdf" multiple />
        <button type="submit" disabled={isCreatingProfile}>
          {isCreatingProfile ? "Создаем профиль..." : "Создать профиль"}
        </button>
      </form>

      {info && <p>{info}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
