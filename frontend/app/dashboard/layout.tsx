"use client";

import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";

type Role = "admin" | "recruiter";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const basePath = window.location.pathname.startsWith("/recruitment-mvp") ? "/recruitment-mvp" : "";
    const token = window.localStorage.getItem("auth_token");
    const storedRole = window.localStorage.getItem("auth_role") as Role | null;
    const storedEmail = window.localStorage.getItem("auth_email") || "";
    if (!token || !storedRole) {
      window.location.href = `${basePath}/`;
      return;
    }
    setRole(storedRole);
    setEmail(storedEmail);
    setChecked(true);
  }, []);

  const menuItems = useMemo(() => {
    const items: Array<{ path: string; label: string; adminOnly?: boolean }> = [
      { path: "/dashboard/users", label: "Пользователи", adminOnly: true },
      { path: "/dashboard/profiles", label: "Профили должности", adminOnly: true },
      { path: "/dashboard/candidates", label: "Проверка кандидата" },
      { path: "/dashboard/settings", label: "Настройки", adminOnly: true },
    ];
    return items.filter((item) => !item.adminOnly || role === "admin");
  }, [role]);

  function logout() {
    window.localStorage.removeItem("auth_token");
    window.localStorage.removeItem("auth_role");
    window.localStorage.removeItem("auth_email");
    const basePath = window.location.pathname.startsWith("/recruitment-mvp") ? "/recruitment-mvp" : "";
    window.location.href = `${basePath}/`;
  }

  if (!checked || !role) {
    return (
      <main className="container">
        <p>Проверка авторизации...</p>
      </main>
    );
  }

  return (
    <main className="container dashboard-shell">
      <header className="card dashboard-header">
        <h1 className="dashboard-title">Рабочий кабинет</h1>
        <div className="dashboard-user-box">
          <span>{email || "Пользователь"} </span>
          <span className="muted">({role})</span>
          <button className="small-button" onClick={logout}>
            Выход
          </button>
        </div>
      </header>

      <div className="dashboard-columns">
        <aside className="card dashboard-menu">
          {menuItems.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`menu-link ${pathname === item.path ? "active" : ""}`}
              onClick={() => {
                const basePath = window.location.pathname.startsWith("/recruitment-mvp") ? "/recruitment-mvp" : "";
                window.location.href = `${basePath}${item.path}`;
              }}
            >
              {item.label}
            </button>
          ))}
        </aside>
        <section className="card dashboard-content">{children}</section>
      </div>
    </main>
  );
}
