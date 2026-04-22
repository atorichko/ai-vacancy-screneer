"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CandidateAnalysisResult, CandidateDetail, STATUS_LABELS } from "./candidate-shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/recruitment-mvp-api";

type Profile = {
  id: number;
  title: string;
};

type Props = {
  token: string;
  initialCandidateId: number | null;
  onCandidateCreated?: (id: number) => void;
  mode?: "create_and_analyze" | "analyze_only";
  onCandidateLoaded?: (candidate: CandidateDetail) => void;
};

export function CandidateCheckForms({
  token,
  initialCandidateId,
  onCandidateCreated,
  mode = "create_and_analyze",
  onCandidateLoaded,
}: Props) {
  const isAnalyzeOnly = mode === "analyze_only";
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [candidateId, setCandidateId] = useState<number | null>(() =>
    initialCandidateId != null && initialCandidateId > 0 ? initialCandidateId : null,
  );
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isCreatingCandidate, setIsCreatingCandidate] = useState(false);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [isUploadingTests, setIsUploadingTests] = useState(false);
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisStartedAtRef = useRef<number | null>(null);

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

  const clearAnalysisTimers = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    analysisStartedAtRef.current = null;
  }, []);

  const startProgressTicker = useCallback(() => {
    if (progressIntervalRef.current) return;
    progressIntervalRef.current = setInterval(() => {
      setAnalysisProgress((prev) => {
        if (prev < 55) return prev + 5;
        if (prev < 80) return prev + 2;
        if (prev < 94) return prev + 1;
        return prev;
      });
    }, 1200);
  }, []);

  const startAnalysisPolling = useCallback(
    (id: number) => {
      if (pollIntervalRef.current) return;
      startProgressTicker();
      const startedAt = analysisStartedAtRef.current ?? Date.now();
      pollIntervalRef.current = setInterval(async () => {
        const response = await fetch(`${API_URL}/recruiter/candidates/${id}`, {
          headers: authHeaders,
        });
        if (!response.ok) return;
        const data: CandidateDetail = await response.json();
        setCandidate(data);
        onCandidateLoaded?.(data);
        const elapsedMs = Date.now() - startedAt;
        const stuckInDraftTooLong = data.status === "draft" && elapsedMs > 20_000;
        const stuckInProcessingTooLong = data.status === "processing" && elapsedMs > 10 * 60_000;
        if (stuckInDraftTooLong || stuckInProcessingTooLong) {
          clearAnalysisTimers();
          setIsRunningAnalysis(false);
          setAnalysisProgress(0);
          setError(
            "Анализ не стартовал или завис в очереди. Проверьте состояние worker/redis и перезапустите анализ.",
          );
          return;
        }
        if (data.status === "done" || data.status === "failed") {
          clearAnalysisTimers();
          setAnalysisProgress(100);
          setInfo(`Анализ завершен. Статус: ${STATUS_LABELS[data.status] || data.status}`);
          setIsRunningAnalysis(false);
        }
      }, 2500);
    },
    [authHeaders, clearAnalysisTimers, onCandidateLoaded, startProgressTicker],
  );

  const refreshCandidate = useCallback(
    async (id: number) => {
      const response = await fetch(`${API_URL}/recruiter/candidates/${id}`, { headers: authHeaders });
      if (!response.ok) return;
      const data: CandidateDetail = await response.json();
      setCandidate(data);
      onCandidateLoaded?.(data);
    },
    [authHeaders, onCandidateLoaded],
  );

  useEffect(() => {
    if (initialCandidateId != null && initialCandidateId > 0) {
      setCandidateId(initialCandidateId);
      refreshCandidate(initialCandidateId);
    }
  }, [initialCandidateId, refreshCandidate]);

  useEffect(() => {
    if (!token) return;
    if (isAnalyzeOnly) return;
    loadProfiles();
  }, [token, isAnalyzeOnly]);

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

  async function createCandidate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isCreatingCandidate) return;
    setError("");
    setInfo("");
    setIsCreatingCandidate(true);
    const form = e.currentTarget;
    const full_name = (form.elements.namedItem("full_name") as HTMLInputElement).value;
    const email = (form.elements.namedItem("cand_email") as HTMLInputElement).value;
    const position_profile_id = Number((form.elements.namedItem("profile_id") as HTMLSelectElement).value);
    const response = await fetch(`${API_URL}/recruiter/candidates`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, email, position_profile_id }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось создать карточку кандидата");
      setIsCreatingCandidate(false);
      return;
    }
    const data = await response.json();
    setCandidateId(data.id);
    await refreshCandidate(data.id);
    onCandidateCreated?.(data.id);
    setInfo("Карточка кандидата создана");
    setIsCreatingCandidate(false);
  }

  async function uploadResume(files: FileList | null) {
    setError("");
    setInfo("");
    if (!candidateId || !files || files.length === 0) return;
    setIsUploadingResume(true);
    const formData = new FormData();
    formData.append("file", files[0]);
    const response = await fetch(`${API_URL}/recruiter/candidates/${candidateId}/resume`, {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось загрузить резюме");
      setIsUploadingResume(false);
      return;
    }
    await refreshCandidate(candidateId);
    setInfo("Резюме кандидата загружено");
    setIsUploadingResume(false);
  }

  async function uploadTests(files: FileList | null) {
    setError("");
    setInfo("");
    if (!candidateId || !files || files.length === 0) return;
    setIsUploadingTests(true);
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));
    const response = await fetch(`${API_URL}/recruiter/candidates/${candidateId}/test-files`, {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось загрузить тестовое задание");
      setIsUploadingTests(false);
      return;
    }
    await refreshCandidate(candidateId);
    setInfo(`Файлы тестового задания загружены: ${files.length}`);
    setIsUploadingTests(false);
  }

  async function runAnalysis() {
    setError("");
    setInfo("");
    if (!candidateId) return;
    if (isRunningAnalysis) return;
    clearAnalysisTimers();
    setAnalysisProgress(6);
    setIsRunningAnalysis(true);
    analysisStartedAtRef.current = Date.now();
    const runResponse = await fetch(`${API_URL}/recruiter/candidates/${candidateId}/analyze`, {
      method: "POST",
      headers: authHeaders,
    });
    if (!runResponse.ok) {
      const data = await runResponse.json().catch(() => ({}));
      setError(data.detail || "Не удалось запустить анализ");
      clearAnalysisTimers();
      setAnalysisProgress(0);
      setIsRunningAnalysis(false);
      return;
    }
    setInfo("AI-анализ запущен");
    startAnalysisPolling(candidateId);
  }

  async function saveCandidateContext(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!candidateId || isSavingContext) return;
    setError("");
    setInfo("");
    setIsSavingContext(true);
    const form = e.currentTarget;
    const contextText = (form.elements.namedItem("candidate_context") as HTMLTextAreaElement).value;
    const contextFile = (form.elements.namedItem("context_file") as HTMLInputElement).files?.[0];
    const payload = new FormData();
    payload.append("candidate_context", contextText);
    if (contextFile) payload.append("context_file", contextFile);
    const response = await fetch(`${API_URL}/recruiter/candidates/${candidateId}/context`, {
      method: "POST",
      headers: authHeaders,
      body: payload,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось сохранить дополнительную информацию");
      setIsSavingContext(false);
      return;
    }
    const data: CandidateDetail = await response.json();
    setCandidate(data);
    setInfo("Дополнительная информация сохранена");
    setIsSavingContext(false);
  }

  async function exportReport() {
    if (!candidateId || isExportingReport) return;
    setError("");
    setInfo("");
    setIsExportingReport(true);
    const response = await fetch(`${API_URL}/recruiter/candidates/${candidateId}/report.docx`, {
      headers: authHeaders,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.detail || "Не удалось выгрузить отчет");
      setIsExportingReport(false);
      return;
    }
    const blob = await response.blob();
    const href = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `candidate_report_${candidateId}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(href);
    setInfo("Отчет выгружен в DOCX");
    setIsExportingReport(false);
  }

  useEffect(() => {
    if (candidate?.status === "processing" && candidateId != null) {
      setIsRunningAnalysis(true);
      setAnalysisProgress((prev) => (prev > 0 ? prev : 12));
      startAnalysisPolling(candidateId);
      return;
    }
    if (candidate?.status === "done" || candidate?.status === "failed") {
      clearAnalysisTimers();
      setIsRunningAnalysis(false);
      setAnalysisProgress(0);
    }
  }, [candidate?.status, candidateId, clearAnalysisTimers, startAnalysisPolling]);

  useEffect(() => {
    return () => {
      clearAnalysisTimers();
    };
  }, [clearAnalysisTimers]);

  const showAnalysisProgress = isRunningAnalysis || candidate?.status === "processing";
  const normalizedProgress = Math.max(1, Math.min(analysisProgress, 100));
  const analysisStageText =
    normalizedProgress < 20
      ? "Этап 1/4: подготовка данных кандидата"
      : normalizedProgress < 45
        ? "Этап 2/4: сбор и сжатие контекста для AI"
        : normalizedProgress < 80
          ? "Этап 3/4: AI анализирует резюме и тестовые файлы"
          : normalizedProgress < 100
            ? "Этап 4/4: формируем итоговый отчет"
            : "Завершаем анализ и сохраняем результат";

  return (
    <>
      {!isAnalyzeOnly && (
        <section className="card">
        <h3 className="step-title">Шаг 1. Карточка кандидата</h3>
        {profiles.length === 0 && !isLoadingProfiles && (
          <p className="muted">Список профилей пуст. Сначала создайте профиль должности в разделе «Профили должности».</p>
        )}
        {isLoadingProfiles && <p className="muted">Загружаем список профилей должностей...</p>}
        <form onSubmit={createCandidate}>
          <label className="field-label">ФИО кандидата</label>
          <input name="full_name" placeholder="Иванов Иван Иванович" required />
          <label className="field-label">Email кандидата</label>
          <input name="cand_email" type="email" placeholder="candidate@example.com" required />
          <label className="field-label">Профиль должности</label>
          <select name="profile_id" required disabled={isLoadingProfiles}>
            <option value="">{isLoadingProfiles ? "Загрузка..." : "Выберите профиль должности"}</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.title}
              </option>
            ))}
          </select>
          <button type="submit" disabled={isCreatingCandidate || isLoadingProfiles}>
            {isCreatingCandidate ? "Создаем карточку..." : "Создать карточку кандидата"}
          </button>
        </form>
        <p className="muted small-actions">
          <button type="button" className="link-button" onClick={loadProfiles} disabled={isLoadingProfiles}>
            Обновить список профилей
          </button>
        </p>
      </section>
      )}

      {candidateId != null && candidateId > 0 && (
        <section className="card">
          <h3 className="step-title">{isAnalyzeOnly ? "Карточка кандидата" : "Шаг 2. Файлы и анализ"}</h3>
          <p>
            <strong>ID кандидата:</strong> {candidateId}
          </p>
          {candidate && (
            <>
              <p className="muted">
                <strong>ФИО:</strong> {candidate.full_name}
              </p>
              <p className="muted">
                <strong>Email:</strong> {candidate.email}
              </p>
              <p className="muted">
                <strong>Профиль должности:</strong> {candidate.position_profile_title || `#${candidate.position_profile_id}`}
              </p>
            </>
          )}
          {candidate?.resume_original_name && (
            <p className="muted">
              <strong>Резюме:</strong> {candidate.resume_original_name}
            </p>
          )}
          {candidate && candidate.test_files.length > 0 && (
            <div className="muted" style={{ marginBottom: "10px" }}>
              <strong>Файлы тестового задания:</strong>
              <ul className="report-list" style={{ marginTop: "6px" }}>
                {candidate.test_files.map((f) => (
                  <li key={f.id}>{f.original_name}</li>
                ))}
              </ul>
            </div>
          )}
          <label className="field-label">Резюме кандидата</label>
          <p className="muted">Загрузите один файл: Word (.doc, .docx) или PDF.</p>
          <input
            type="file"
            accept=".doc,.docx,.pdf"
            disabled={isUploadingResume}
            onChange={(e) => uploadResume(e.target.files)}
          />
          <label className="field-label">Тестовое задание</label>
          <p className="muted">Можно выбрать несколько файлов: Word, Excel или PDF.</p>
          <input
            type="file"
            accept=".doc,.docx,.xls,.xlsx,.pdf"
            multiple
            disabled={isUploadingTests}
            onChange={(e) => uploadTests(e.target.files)}
          />
          <label className="field-label">Дополнительная информация о кандидате</label>
          <p className="muted">
            Можно указать текстом и/или приложить файл. Для промпта используйте плейсхолдер{" "}
            <code>{`{{candidate_context}}`}</code>.
          </p>
          <form onSubmit={saveCandidateContext}>
            <textarea
              name="candidate_context"
              className="prompt-field"
              style={{ minHeight: "120px" }}
              placeholder="Например: важные наблюдения рекрутера, ограничения по графику, детали коммуникации..."
              defaultValue={candidate?.candidate_context ?? ""}
              spellCheck={false}
            />
            <label className="muted">Файл с дополнительной информацией (Word/Excel/PDF)</label>
            <input name="context_file" type="file" accept=".doc,.docx,.xls,.xlsx,.pdf" />
            {candidate?.candidate_context_file_name && (
              <p className="muted">
                Текущий файл: <strong>{candidate.candidate_context_file_name}</strong>
              </p>
            )}
            <button type="submit" disabled={isSavingContext}>
              {isSavingContext ? "Сохраняем..." : "Сохранить дополнительную информацию"}
            </button>
          </form>
          <button type="button" onClick={runAnalysis} disabled={isRunningAnalysis}>
            {isRunningAnalysis ? "Анализ запущен, ожидайте..." : "Запустить AI-анализ"}
          </button>
          {showAnalysisProgress && (
            <div className="analysis-progress-box" role="status" aria-live="polite">
              <p className="muted analysis-progress-label">AI-анализ в процессе, это может занять до нескольких минут</p>
              <div
                className="analysis-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={normalizedProgress}
              >
                <div className="analysis-progress-fill" style={{ width: `${normalizedProgress}%` }} />
              </div>
              <p className="muted analysis-progress-stage">{analysisStageText}</p>
              <p className="muted">{normalizedProgress}%</p>
            </div>
          )}
        </section>
      )}

      {candidateId != null &&
        candidateId > 0 &&
        candidate?.status === "done" &&
        candidate.result &&
        Object.keys(candidate.result).length > 0 && (
          <section className="card">
            <div className="analysis-result-header">
              <h3 className="step-title">Результат AI-анализа</h3>
              <button type="button" className="inline-button" onClick={exportReport} disabled={isExportingReport}>
                {isExportingReport ? "Готовим DOCX..." : "Экспорт отчета"}
              </button>
            </div>
            <CandidateAnalysisResult result={candidate.result} />
          </section>
        )}

      {candidateId != null && candidateId > 0 && candidate?.status === "failed" && candidate.error && (
        <section className="card">
          <h3 className="step-title">Ошибка анализа</h3>
          <p className="error" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {candidate.error}
          </p>
        </section>
      )}

      {info && <p>{info}</p>}
      {error && <p className="error">{error}</p>}
      {candidate && (
        <p>
          Статус анализа: {STATUS_LABELS[candidate.status] || candidate.status}
        </p>
      )}
    </>
  );
}
