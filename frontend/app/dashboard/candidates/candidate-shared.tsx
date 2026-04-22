"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type CandidateDetail = {
  id: number;
  full_name: string;
  email: string;
  position_profile_id: number;
  position_profile_title?: string | null;
  candidate_context?: string | null;
  candidate_context_file_name?: string | null;
  status: string;
  created_at: string;
  result?: Record<string, unknown> | null;
  error?: string | null;
  resume_original_name?: string | null;
  test_files: { id: number; original_name: string }[];
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  processing: "В обработке",
  done: "Завершено",
  failed: "Ошибка",
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x));
}

function numVal(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

/** Новый формат: { markdown: string } */
export function CandidateAnalysisResult({ result }: { result: Record<string, unknown> }) {
  const md = result.markdown;
  if (typeof md === "string" && md.trim()) {
    return (
      <div className="markdown-analysis">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ node: _node, ...props }) => (
              <div className="markdown-table-scroll">
                <table {...props} />
              </div>
            ),
          }}
        >
          {md}
        </ReactMarkdown>
      </div>
    );
  }
  return <AnalysisResultBlockLegacy result={result} />;
}

/** Старый JSON-формат ответа модели */
export function AnalysisResultBlockLegacy({ result }: { result: Record<string, unknown> }) {
  const resume = numVal(result.resume_score);
  const test = numVal(result.test_score);
  const consistency = numVal(result.consistency_score);
  const hasScores = resume != null || test != null || consistency != null;

  const sections: { key: string; title: string; type: "text" | "list" }[] = [
    { key: "short_report", title: "Краткий отчёт", type: "text" },
    { key: "full_report", title: "Полный отчёт", type: "text" },
    { key: "strengths", title: "Сильные стороны", type: "list" },
    { key: "risks", title: "Риски", type: "list" },
    { key: "grey_zones", title: "Серые зоны", type: "list" },
    { key: "interview_questions", title: "Вопросы для интервью", type: "list" },
  ];

  const used = new Set(sections.map((s) => s.key));
  used.add("resume_score");
  used.add("test_score");
  used.add("consistency_score");
  const extraKeys = Object.keys(result).filter((k) => !used.has(k));

  return (
    <div className="analysis-result-inner">
      {hasScores && (
        <div className="analysis-scores">
          {resume != null && (
            <div className="analysis-score">
              <div className="analysis-score-value">{resume}</div>
              <div className="analysis-score-label">Оценка резюме</div>
            </div>
          )}
          {test != null && (
            <div className="analysis-score">
              <div className="analysis-score-value">{test}</div>
              <div className="analysis-score-label">Оценка теста</div>
            </div>
          )}
          {consistency != null && (
            <div className="analysis-score">
              <div className="analysis-score-value">{consistency}</div>
              <div className="analysis-score-label">Согласованность</div>
            </div>
          )}
        </div>
      )}

      {sections.map(({ key, title, type }) => {
        const val = result[key];
        if (val == null || val === "") return null;
        if (type === "text") {
          const text =
            typeof val === "string" ? val : typeof val === "object" ? JSON.stringify(val, null, 2) : String(val);
          if (!text.trim()) return null;
          return (
            <div key={key} className="report-section">
              <h4>{title}</h4>
              <p className="report-text">{text}</p>
            </div>
          );
        }
        if (type === "list") {
          const items = asStringList(val);
          if (items.length === 0) return null;
          return (
            <div key={key} className="report-section">
              <h4>{title}</h4>
              <ul className="report-list">
                {items.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          );
        }
        return null;
      })}

      {extraKeys.length > 0 && (
        <div className="report-section">
          <h4>Дополнительно</h4>
          <pre className="report-text" style={{ fontSize: "0.85rem", overflow: "auto" }}>
            {JSON.stringify(
              Object.fromEntries(extraKeys.map((k) => [k, result[k]])),
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
