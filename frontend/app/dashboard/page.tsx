"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Role = "admin" | "recruiter";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const storedRole = window.localStorage.getItem("auth_role") as Role | null;
    const token = window.localStorage.getItem("auth_token");
    const basePath = window.location.pathname.startsWith("/recruitment-mvp") ? "/recruitment-mvp" : "";
    if (!token || !storedRole) {
      window.location.href = `${basePath}/`;
      return;
    }
    if (storedRole === "admin") {
      window.location.href = `${basePath}/dashboard/users`;
      return;
    }
    window.location.href = `${basePath}/dashboard/candidates`;
  }, [router]);

  return (
    <div>
      <p>Перенаправление...</p>
    </div>
  );
}
