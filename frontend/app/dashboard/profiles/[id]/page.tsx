"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/recruitment-mvp-api";

type Role = "admin" | "recruiter";

type ProfileFile = {
  id: number;
  original_name: string;
  file_kind: string;
};

type ProfileDetail = {
  id: number;
  title: string;
  role_context: string | null;
  files: ProfileFile[];
};

const FILE_KIND_LABELS: Record<string, string> = {
  position: "профиль должности",
  test: "описание тестового задания",
  additional: "дополнительный файл",
};

export default function ProfileDetailsPage() {
  const params = useParams<{ id: string }>();
  const [token, setToken] = useState("");
  const [checked, setChecked] = useState(false);
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<number | null>(null);
  /** Сбрасывает форму после сохранения, чтобы defaultValue совпадал с ответом сервера. */
  const [profileFormKey, setProfileFormKey] = useState(0);

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
    setChecked(true);
  }, []);

  useEffect(() => {
    if (!checked || !token || !params?.id) return;
    loadProfile();
  }, [checked, token, params?.id]);

  async function loadProfile() {
    setError("");
    const response = await fetch(`${API_URL}/admin/profiles/${params.id}`, { headers: authHeaders });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось загрузить профиль");
      return;
    }
    setProfile(await response.json());
  }

  async function updateProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    if (isUpdatingProfile) return;
    setError("");
    setInfo("");
    setIsUpdatingProfile(true);
    const form = e.currentTarget;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value;
    const roleContext = (form.elements.namedItem("role_context") as HTMLTextAreaElement).value;
    const positionFile = (form.elements.namedItem("position_file") as HTMLInputElement).files?.[0];
    const testFile = (form.elements.namedItem("test_file") as HTMLInputElement).files?.[0];
    const additionalFiles = (form.elements.namedItem("additional_files") as HTMLInputElement).files;

    const payload = new FormData();
    payload.append("title", title);
    payload.append("role_context", roleContext);
    if (positionFile) payload.append("position_file", positionFile);
    if (testFile) payload.append("test_file", testFile);
    if (additionalFiles?.length) {
      Array.from(additionalFiles).forEach((file) => payload.append("additional_files", file));
    }

    const response = await fetch(`${API_URL}/admin/profiles/${profile.id}/files`, {
      method: "POST",
      headers: authHeaders,
      body: payload,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось обновить профиль");
      setIsUpdatingProfile(false);
      return;
    }
    setInfo("Профиль обновлен. AI-структура пересчитывается в фоне.");
    setProfile(await response.json());
    setProfileFormKey((k) => k + 1);
    setIsUpdatingProfile(false);
  }

  async function deleteAdditionalFile(fileId: number, fileName: string) {
    if (!profile) return;
    if (deletingFileId) return;
    setError("");
    setInfo("");
    const confirmed = window.confirm(`Удалить файл "${fileName}" из профиля должности?`);
    if (!confirmed) return;
    setDeletingFileId(fileId);
    const response = await fetch(`${API_URL}/admin/profiles/${profile.id}/files/${fileId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось удалить файл");
      setDeletingFileId(null);
      return;
    }
    setInfo("Файл удален");
    setProfile(await response.json());
    setDeletingFileId(null);
  }

  if (!checked) {
    return <p>Проверка прав...</p>;
  }

  return (
    <div>
      <h2>Профиль должности</h2>
      <button
        className="inline-button"
        onClick={() => {
          const basePath = window.location.pathname.startsWith("/recruitment-mvp") ? "/recruitment-mvp" : "";
          window.location.href = `${basePath}/dashboard/profiles`;
        }}
      >
        Назад к списку
      </button>
      {error && <p className="error">{error}</p>}
      {info && <p>{info}</p>}
      {profile && (
        <>
          <p>
            ID: #{profile.id} | Название: {profile.title}
          </p>
          <form key={profileFormKey} onSubmit={updateProfile}>
            <input name="title" defaultValue={profile.title} placeholder="Название профиля" />
            <label className="field-label">Контекст роли для анализа кандидатов</label>
            <p className="muted">
              Подставляется в промпт как <code>{`{{role_context}}`}</code>. Можно оставить пустым.
            </p>
            <textarea
              name="role_context"
              className="prompt-field"
              style={{ minHeight: "140px" }}
              defaultValue={profile.role_context ?? ""}
              placeholder="Уровень роли, акценты оценки..."
              spellCheck={false}
            />
            <label className="muted">Обновить файл: профиль должности (Word/Excel)</label>
            <input name="position_file" type="file" accept=".doc,.docx,.xls,.xlsx" />
            <label className="muted">Обновить файл: описание тестового задания (Word/Excel)</label>
            <input name="test_file" type="file" accept=".doc,.docx,.xls,.xlsx" />
            <label className="muted">Добавить: дополнительные файлы (можно несколько)</label>
            <input name="additional_files" type="file" accept=".doc,.docx,.xls,.xlsx,.pdf" multiple />
            <button type="submit" disabled={isUpdatingProfile}>
              {isUpdatingProfile ? "Сохраняем..." : "Сохранить изменения"}
            </button>
          </form>

          <h3>Файлы профиля</h3>
          {profile.files.length === 0 && <p className="muted">Файлы профиля отсутствуют.</p>}
          {profile.files.map((file) => (
            <div key={file.id} className="list-row">
              <span>{file.original_name}</span>
              <span className="role-chip">{FILE_KIND_LABELS[file.file_kind] || file.file_kind}</span>
              <button
                className="inline-button secondary"
                onClick={() => deleteAdditionalFile(file.id, file.original_name)}
                disabled={deletingFileId === file.id}
              >
                {deletingFileId === file.id ? "Удаляем..." : "Удалить файл"}
              </button>
            </div>
          ))}
          <p className="muted">Файл можно удалить из профиля кнопкой справа.</p>
        </>
      )}
    </div>
  );
}
