"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { CandidateCheckForms } from "../candidate-check-forms";

export default function CandidateDetailPage() {
  const params = useParams();
  const raw = params?.id;
  const id = typeof raw === "string" ? Number(raw) : NaN;
  const [token, setToken] = useState("");
  const [checked, setChecked] = useState(false);

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

  useEffect(() => {
    if (!checked) return;
    if (Number.isNaN(id) || id <= 0) {
      const basePath = window.location.pathname.startsWith("/recruitment-mvp") ? "/recruitment-mvp" : "";
      window.location.href = `${basePath}/dashboard/candidates`;
    }
  }, [checked, id]);

  if (!checked) {
    return <p>Проверка авторизации...</p>;
  }

  if (Number.isNaN(id) || id <= 0) {
    return <p>Перенаправление...</p>;
  }

  return (
    <div>
      <p className="muted small-actions">
        <button
          type="button"
          className="link-button"
          onClick={() => {
            const basePath = window.location.pathname.startsWith("/recruitment-mvp") ? "/recruitment-mvp" : "";
            window.location.href = `${basePath}/dashboard/candidates`;
          }}
        >
          ← К списку кандидатов
        </button>
      </p>
      <CandidateCheckForms token={token} initialCandidateId={id} mode="analyze_only" />
    </div>
  );
}
