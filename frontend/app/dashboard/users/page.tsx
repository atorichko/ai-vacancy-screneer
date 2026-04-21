"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/recruitment-mvp-api";

type Role = "admin" | "recruiter";

type UserItem = {
  id: number;
  email: string;
  role: Role;
};

export default function UsersPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [checked, setChecked] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
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
  }, [router]);

  useEffect(() => {
    if (!checked || !token) return;
    loadUsers();
  }, [checked, token]);

  async function loadUsers() {
    setError("");
    const response = await fetch(`${API_URL}/admin/users`, { headers: authHeaders });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось загрузить пользователей");
      return;
    }
    setUsers(await response.json());
  }

  async function updateUserRole(userId: number, newRole: Role) {
    setError("");
    setInfo("");
    const response = await fetch(`${API_URL}/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось изменить роль");
      return;
    }
    setInfo("Роль пользователя обновлена");
    await loadUsers();
  }

  if (!checked || !role) {
    return <p>Проверка прав...</p>;
  }

  return (
    <div>
      <h2>Пользователи</h2>
      <p className="muted">Раздел доступен только администратору.</p>
      <button onClick={loadUsers}>Обновить список</button>
      {info && <p>{info}</p>}
      {error && <p className="error">{error}</p>}
      {users.map((user) => (
        <div key={user.id} className="list-row">
          <span>
            #{user.id} {user.email}
          </span>
          <span className="role-chip">{user.role}</span>
          <button
            className="inline-button"
            onClick={() => updateUserRole(user.id, user.role === "admin" ? "recruiter" : "admin")}
          >
            Сделать {user.role === "admin" ? "recruiter" : "admin"}
          </button>
        </div>
      ))}
    </div>
  );
}
