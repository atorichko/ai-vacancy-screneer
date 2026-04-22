"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/recruitment-mvp-api";

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Вход | MVP подбора персонала";
    const token = window.localStorage.getItem("auth_token");
    const role = window.localStorage.getItem("auth_role");
    if (token && role) {
      router.replace("/dashboard");
    }
  }, [router]);

  async function login(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setError("");
    setInfo("");
    setIsSubmitting(true);
    try {
      const body = new URLSearchParams({ username: email, password });
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.detail || "Ошибка входа");
        return;
      }
      const data = await response.json();
      if (data.access_token && data.role) {
        window.localStorage.setItem("auth_token", data.access_token);
        window.localStorage.setItem("auth_role", data.role);
        window.localStorage.setItem("auth_email", email);
      }
      setInfo(`Вход выполнен. Роль: ${data.role || "неизвестна"}`);
      router.push("/dashboard");
    } catch {
      setError(`Не удалось подключиться к API: ${API_URL}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function registerRecruiter() {
    if (isSubmitting) return;
    setError("");
    setInfo("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.detail || "Ошибка регистрации");
        return;
      }
      const body = new URLSearchParams({ username: email, password });
      const loginResponse = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!loginResponse.ok) {
        const data = await loginResponse.json().catch(() => ({}));
        setError(data.detail || "Пользователь создан, но вход выполнить не удалось");
        return;
      }
      const data = await loginResponse.json();
      if (data.access_token && data.role) {
        window.localStorage.setItem("auth_token", data.access_token);
        window.localStorage.setItem("auth_role", data.role);
        window.localStorage.setItem("auth_email", email);
      }
      setInfo(`Рекрутер создан и авторизован. Роль: ${data.role || "неизвестна"}`);
      router.push("/dashboard");
    } catch {
      setError(`Не удалось подключиться к API: ${API_URL}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="container">
      <h1>MVP подбора персонала</h1>

      <section className="card">
        <h3>Авторизация</h3>
        <form onSubmit={login}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Логин (email)" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" />
          <button type="button" className="secondary" onClick={registerRecruiter}>
            {isSubmitting ? "Подождите..." : "Зарегистрировать рекрутера"}
          </button>
          <button type="submit">{isSubmitting ? "Подождите..." : "Войти"}</button>
        </form>
        <small>API URL: {API_URL}</small>
        <br />
        <small>Администратор: info@artsofte.digital</small>
        {info && <p>{info}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
