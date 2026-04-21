"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CandidateCheckForms } from "./candidate-check-forms";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/recruitment-mvp-api";

type CandidateListItem = {
  id: number;
  full_name: string;
  created_at: string;
};

function formatRuDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function CandidatesPage() {
  const [token, setToken] = useState("");
  const [checked, setChecked] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<CandidateListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const basePath = window.location.pathname.startsWith("/recruitment-mvp") ? "/recruitment-mvp" : "";
    const storedToken = window.localStorage.getItem("auth_token");
    const storedRole = window.localStorage.getItem("auth_role");
    if (!storedToken || !storedRole) {
      window.location.href = `${basePath}/`;
      return;
    }
    setToken(storedToken);
    setChecked(true);
  }, []);

  const loadInitial = useCallback(async () => {
    if (!token) return;
    setListError("");
    setListLoading(true);
    const params = new URLSearchParams({ q: debouncedSearch, skip: "0", limit: "10" });
    const response = await fetch(`${API_URL}/recruiter/candidates?${params}`, { headers: authHeaders });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setListError(data.detail || "Не удалось загрузить список кандидатов");
      setListLoading(false);
      return;
    }
    const data = await response.json();
    setItems(data.items);
    setTotal(data.total);
    setListLoading(false);
  }, [token, debouncedSearch, authHeaders]);

  useEffect(() => {
    if (!checked || !token) return;
    loadInitial();
  }, [checked, token, loadInitial]);

  async function loadMore() {
    if (!token || items.length >= total || moreLoading) return;
    setListError("");
    setMoreLoading(true);
    const params = new URLSearchParams({
      q: debouncedSearch,
      skip: String(items.length),
      limit: "10",
    });
    const response = await fetch(`${API_URL}/recruiter/candidates?${params}`, { headers: authHeaders });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setListError(data.detail || "Не удалось подгрузить кандидатов");
      setMoreLoading(false);
      return;
    }
    const data = await response.json();
    setItems((prev) => [...prev, ...data.items]);
    setTotal(data.total);
    setMoreLoading(false);
  }

  function openCandidate(id: number) {
    const basePath = window.location.pathname.startsWith("/recruitment-mvp") ? "/recruitment-mvp" : "";
    window.location.href = `${basePath}/dashboard/candidates/${id}`;
  }

  async function deleteCandidate(id: number) {
    if (deletingId != null) return;
    const ok = window.confirm("Удалить кандидата и все связанные файлы? Это действие нельзя отменить.");
    if (!ok) return;
    setListError("");
    setDeletingId(id);
    const response = await fetch(`${API_URL}/recruiter/candidates/${id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setListError(data.detail || "Не удалось удалить кандидата");
      setDeletingId(null);
      return;
    }
    setDeletingId(null);
    await loadInitial();
  }

  if (!checked) {
    return <p>Проверка авторизации...</p>;
  }

  const hasMore = items.length < total;

  return (
    <div>
      <h2>Ваши кандидаты</h2>

      <label className="field-label" htmlFor="candidate-search">
        Поиск по ФИО или email
      </label>
      <input
        id="candidate-search"
        type="search"
        placeholder="Начните вводить..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        autoComplete="off"
      />

      {listLoading && <p className="muted">Загрузка...</p>}

      {listError && <p className="error">{listError}</p>}

      {!listLoading && !listError && items.length === 0 && <p className="muted">Кандидаты не найдены.</p>}

      {items.map((c) => (
        <div key={c.id} className="list-row">
          <span>
            <strong>{c.full_name}</strong>
            <span className="muted" style={{ display: "block", fontSize: "0.9rem", marginTop: "4px" }}>
              {formatRuDate(c.created_at)}
            </span>
          </span>
          <span style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" className="inline-button" onClick={() => openCandidate(c.id)}>
              Открыть
            </button>
            <button
              type="button"
              className="inline-button secondary"
              onClick={() => deleteCandidate(c.id)}
              disabled={deletingId === c.id}
            >
              {deletingId === c.id ? "Удаляем..." : "Удалить"}
            </button>
          </span>
        </div>
      ))}

      {hasMore && (
        <p className="muted small-actions">
          <button type="button" className="link-button" onClick={loadMore} disabled={moreLoading}>
            {moreLoading ? "Загрузка..." : "Еще"}
          </button>
        </p>
      )}

      <h3 className="step-title" style={{ marginTop: "1.75rem" }}>
        Проверка кандидата
      </h3>

      <CandidateCheckForms token={token} initialCandidateId={null} onCandidateCreated={() => loadInitial()} />
    </div>
  );
}
