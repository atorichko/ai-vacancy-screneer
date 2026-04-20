"use client";

import { FormEvent, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Profile = {
  id: number;
  title: string;
};

type Candidate = {
  id: number;
  status: string;
  result?: {
    short_report?: string;
    full_report?: string;
    strengths?: string[];
    risks?: string[];
    grey_zones?: string[];
    interview_questions?: string[];
  };
};

export default function HomePage() {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [token, setToken] = useState("");
  const [role, setRole] = useState<"admin" | "recruiter">("admin");

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

  async function login(e: FormEvent) {
    e.preventDefault();
    const body = new URLSearchParams({ username: email, password });
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const data = await response.json();
    setToken(data.access_token || "");
  }

  async function registerCurrentRole() {
    await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    });
    alert("User created");
  }

  async function loadProfiles() {
    const response = await fetch(`${API_URL}/profiles`, { headers: authHeaders });
    setProfiles(await response.json());
  }

  async function createProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value;
    const positionFile = (form.elements.namedItem("position_file") as HTMLInputElement).files?.[0];
    const testFile = (form.elements.namedItem("test_file") as HTMLInputElement).files?.[0];
    if (!positionFile || !testFile) return;
    const payload = new FormData();
    payload.append("title", title);
    payload.append("position_file", positionFile);
    payload.append("test_file", testFile);
    await fetch(`${API_URL}/admin/profiles`, {
      method: "POST",
      headers: authHeaders,
      body: payload,
    });
    await loadProfiles();
  }

  async function createCandidate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const full_name = (form.elements.namedItem("full_name") as HTMLInputElement).value;
    const emailValue = (form.elements.namedItem("cand_email") as HTMLInputElement).value;
    const position_profile_id = Number((form.elements.namedItem("profile_id") as HTMLSelectElement).value);
    const response = await fetch(`${API_URL}/recruiter/candidates`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, email: emailValue, position_profile_id }),
    });
    const data = await response.json();
    setCandidateId(data.id);
    setCandidate(data);
  }

  async function uploadFile(endpoint: string, files: FileList | null, multi = false) {
    if (!candidateId || !files || files.length === 0) return;
    const formData = new FormData();
    if (multi) {
      Array.from(files).forEach((file) => formData.append("files", file));
    } else {
      formData.append("file", files[0]);
    }
    await fetch(`${API_URL}/recruiter/candidates/${candidateId}/${endpoint}`, {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });
  }

  async function runAnalysis() {
    if (!candidateId) return;
    await fetch(`${API_URL}/recruiter/candidates/${candidateId}/analyze`, {
      method: "POST",
      headers: authHeaders,
    });
    const interval = setInterval(async () => {
      const response = await fetch(`${API_URL}/recruiter/candidates/${candidateId}`, {
        headers: authHeaders,
      });
      const data = await response.json();
      setCandidate(data);
      if (data.status === "done" || data.status === "failed") {
        clearInterval(interval);
      }
    }, 2500);
  }

  return (
    <main className="container">
      <h1>Recruitment MVP</h1>

      <section className="card">
        <h3>Auth</h3>
        <form onSubmit={login}>
          <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "recruiter")}>
            <option value="admin">admin</option>
            <option value="recruiter">recruiter</option>
          </select>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
          <button type="button" className="secondary" onClick={registerCurrentRole}>
            Register current role
          </button>
          <button type="submit">Login</button>
        </form>
        <small>Token: {token ? "received" : "not set"}</small>
      </section>

      <section className="card">
        <h3>Profiles</h3>
        <form onSubmit={createProfile}>
          <input name="title" placeholder="Profile title" />
          <input name="position_file" type="file" accept=".docx,.xlsx" />
          <input name="test_file" type="file" accept=".docx,.xlsx" />
          <button type="submit">Create profile (admin)</button>
        </form>
        <button onClick={loadProfiles}>Load profiles</button>
        {profiles.map((p) => (
          <div key={p.id}>
            {p.id}. {p.title}
          </div>
        ))}
      </section>

      <section className="card">
        <h3>Recruiter flow</h3>
        <form onSubmit={createCandidate}>
          <input name="full_name" placeholder="Candidate full name" required />
          <input name="cand_email" placeholder="Candidate email" required />
          <select name="profile_id" required>
            <option value="">Choose profile</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button type="submit">Create candidate card</button>
        </form>
        <p>Candidate ID: {candidateId ?? "none"}</p>

        <input type="file" accept=".pdf,.docx" onChange={(e) => uploadFile("resume", e.target.files)} />
        <input
          type="file"
          accept=".docx,.xlsx"
          multiple
          onChange={(e) => uploadFile("test-files", e.target.files, true)}
        />
        <button onClick={runAnalysis}>Run analysis</button>
      </section>

      <section className="card">
        <h3>Result</h3>
        <p>Status: {candidate?.status || "n/a"}</p>
        <p>{candidate?.result?.short_report}</p>
        <p>{candidate?.result?.full_report}</p>
        <p>Strong sides: {(candidate?.result?.strengths || []).join(", ")}</p>
        <p>Risks: {(candidate?.result?.risks || []).join(", ")}</p>
        <p>Grey zones: {(candidate?.result?.grey_zones || []).join(", ")}</p>
        <p>Interview Q: {(candidate?.result?.interview_questions || []).join(" | ")}</p>
      </section>
    </main>
  );
}
