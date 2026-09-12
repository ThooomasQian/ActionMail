import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Database,
  Download,
  FileCheck2,
  FileImage,
  FileText,
  FolderOpen,
  Inbox,
  Languages,
  LoaderCircle,
  LockKeyhole,
  Plus,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type { DraftAction, ExtractionResult } from "../lib/actionmail-types";
import {
  extractDocument,
  type ExtractionProgress,
  type OcrLanguage,
} from "../lib/client-extraction";
import { extractActionCandidates, SAMPLE_DOCUMENT } from "../lib/extract-actions";

const STORAGE_KEY = "actionmail.demo.tasks.v1";
const ACCEPTED_FILES = ".pdf,.png,.jpg,.jpeg,.webp,.txt";
const CURRENCIES = ["USD", "CNY", "EUR", "GBP", "CAD", "AUD"];

type ReviewAction = {
  clientKey: string;
  title: string;
  organization: string;
  dueDate: string;
  amount: string;
  currency: string;
  confidence: number;
  sourceQuote: string;
};

type ReviewDocument = {
  name: string;
  size: number;
  result: ExtractionResult;
  actions: ReviewAction[];
};

type StoredTask = DraftAction & {
  id: string;
  documentName: string;
  createdAt: string;
  completedAt: string | null;
};

type TaskFilter = "open" | "completed" | "all";

function makeId(prefix: string) {
  const suffix =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function toReviewAction(action: DraftAction): ReviewAction {
  return {
    clientKey: action.clientKey,
    title: action.title,
    organization: action.organization ?? "",
    dueDate: action.dueDate ?? "",
    amount:
      action.amountMinor === null || action.amountMinor === undefined
        ? ""
        : (action.amountMinor / 100).toFixed(2),
    currency: action.currency ?? "USD",
    confidence: action.confidence,
    sourceQuote: action.sourceQuote,
  };
}

function toDraftAction(action: ReviewAction): DraftAction {
  const numericAmount = action.amount.trim() === "" ? null : Number(action.amount);
  const amountMinor =
    numericAmount !== null && Number.isFinite(numericAmount) && numericAmount >= 0
      ? Math.round(numericAmount * 100)
      : null;
  return {
    clientKey: action.clientKey,
    title: action.title.trim(),
    organization: action.organization.trim() || null,
    dueDate: action.dueDate || null,
    amountMinor,
    currency: amountMinor === null ? null : action.currency || "USD",
    confidence: Math.max(0, Math.min(100, Math.round(action.confidence))),
    sourceQuote: action.sourceQuote.trim(),
  };
}

function loadStoredTasks(): StoredTask[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredTask =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as StoredTask).id === "string" &&
        typeof (item as StoredTask).title === "string" &&
        typeof (item as StoredTask).documentName === "string",
    );
  } catch {
    return [];
  }
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No due date";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatAmount(amountMinor: number | null | undefined, currency: string | null | undefined) {
  if (amountMinor === null || amountMinor === undefined) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
    }).format(amountMinor / 100);
  } catch {
    return `${currency ?? "USD"} ${(amountMinor / 100).toFixed(2)}`;
  }
}

function modeLabel(mode: ExtractionResult["mode"]) {
  if (mode === "pdf-text") return "Embedded PDF text";
  if (mode === "image-ocr") return "Local OCR";
  return "Plain text";
}

function confidenceTone(confidence: number) {
  if (confidence >= 85) return "strong";
  if (confidence >= 65) return "medium";
  return "low";
}

function escapeIcs(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  const output: string[] = [];
  let current = "";
  for (const character of line) {
    if (encoder.encode(current + character).length > 73 && current) {
      output.push(current);
      current = ` ${character}`;
    } else {
      current += character;
    }
  }
  if (current) output.push(current);
  return output.join("\r\n");
}

function nextCalendarDay(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function compactDate(isoDate: string) {
  return isoDate.replaceAll("-", "");
}

function buildCalendar(tasks: StoredTask[]) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events = tasks.map((task) => {
    const details = [
      task.organization ? `Organization: ${task.organization}` : "",
      formatAmount(task.amountMinor, task.currency)
        ? `Amount: ${formatAmount(task.amountMinor, task.currency)}`
        : "",
      task.sourceQuote ? `Evidence: ${task.sourceQuote}` : "",
      `Source document: ${task.documentName}`,
    ]
      .filter(Boolean)
      .join("\n");
    return [
      "BEGIN:VEVENT",
      `UID:${escapeIcs(task.id)}@actionmail.local`,
      `DTSTAMP:${timestamp}`,
      `DTSTART;VALUE=DATE:${compactDate(task.dueDate!)}`,
      `DTEND;VALUE=DATE:${compactDate(nextCalendarDay(task.dueDate!))}`,
      `SUMMARY:${escapeIcs(task.title)}`,
      `DESCRIPTION:${escapeIcs(details)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    ];
  });
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ActionMail//Local Document Actions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.flat(),
    "END:VCALENDAR",
  ]
    .map(foldIcsLine)
    .join("\r\n");
}

export function DemoApp() {
  const [language, setLanguage] = useState<OcrLanguage>("eng");
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [review, setReview] = useState<ReviewDocument | null>(null);
  const [tasks, setTasks] = useState<StoredTask[]>(loadStoredTasks);
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageWarning] = useState(() => {
    try {
      const probeKey = `${STORAGE_KEY}.probe`;
      window.localStorage.setItem(probeKey, "1");
      window.localStorage.removeItem(probeKey);
      return false;
    } catch {
      return true;
    }
  });
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (storageWarning) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // Storage can become unavailable after the initial capability check.
    }
  }, [storageWarning, tasks]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const processFile = useCallback(
    async (file: File) => {
      setProcessing(true);
      setError(null);
      setNotice(null);
      setReview(null);
      setProgress({ stage: "reading", progress: 0.01, detail: "Preparing document" });
      try {
        const result = await extractDocument(file, language, setProgress);
        const confidenceLimit = result.ocrConfidence ?? 100;
        const actions = extractActionCandidates(result.text).map((action) =>
          toReviewAction({
            ...action,
            confidence: Math.min(action.confidence, confidenceLimit),
          }),
        );
        setReview({ name: file.name, size: file.size, result, actions });
        setNotice(
          actions.length
            ? `${actions.length} action${actions.length === 1 ? "" : "s"} ready for review.`
            : "Reading complete. No explicit actions were detected.",
        );
      } catch (fileError) {
        setError(messageFrom(fileError, "ActionMail could not read that document."));
      } finally {
        setProcessing(false);
      }
    },
    [language],
  );

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    if (processing) return;
    const file = event.dataTransfer.files[0];
    if (file) void processFile(file);
  };

  const loadSample = () => {
    const sample = new File([SAMPLE_DOCUMENT], "north-harbor-energy-notice.txt", {
      type: "text/plain",
    });
    void processFile(sample);
  };

  const updateReviewAction = (clientKey: string, patch: Partial<ReviewAction>) => {
    setReview((current) =>
      current
        ? {
            ...current,
            actions: current.actions.map((action) =>
              action.clientKey === clientKey ? { ...action, ...patch } : action,
            ),
          }
        : current,
    );
  };

  const removeReviewAction = (clientKey: string) => {
    setReview((current) =>
      current
        ? { ...current, actions: current.actions.filter((item) => item.clientKey !== clientKey) }
        : current,
    );
  };

  const addReviewAction = () => {
    setReview((current) =>
      current
        ? {
            ...current,
            actions: [
              ...current.actions,
              {
                clientKey: makeId("manual"),
                title: "",
                organization: "",
                dueDate: "",
                amount: "",
                currency: "USD",
                confidence: 100,
                sourceQuote: "Added manually during review.",
              },
            ],
          }
        : current,
    );
  };

  const saveReviewedActions = () => {
    if (!review) return;
    const selected = review.actions.map(toDraftAction).filter((action) => action.title);
    if (!selected.length) {
      setError("Add at least one action with a title before saving.");
      return;
    }
    const createdAt = new Date().toISOString();
    const saved = selected.map<StoredTask>((action) => ({
      ...action,
      id: makeId("task"),
      documentName: review.name,
      createdAt,
      completedAt: null,
    }));
    setTasks((current) => [...saved, ...current]);
    setReview(null);
    setError(null);
    setFilter("open");
    setNotice(`${saved.length} reviewed action${saved.length === 1 ? "" : "s"} saved locally.`);
  };

  const toggleTask = (id: string) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? { ...task, completedAt: task.completedAt ? null : new Date().toISOString() }
          : task,
      ),
    );
  };

  const removeTask = (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
    setNotice("Action removed from this browser.");
  };

  const clearTasks = () => {
    if (!tasks.length) return;
    if (!window.confirm("Remove every saved ActionMail task from this browser?")) return;
    setTasks([]);
    setNotice("All locally saved actions were cleared.");
  };

  const calendarTasks = useMemo(
    () => tasks.filter((task) => !task.completedAt && Boolean(task.dueDate)),
    [tasks],
  );

  const exportCalendar = () => {
    if (!calendarTasks.length) {
      setError("There are no open actions with due dates to export.");
      return;
    }
    const blob = new Blob([buildCalendar(calendarTasks)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "actionmail-deadlines.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setNotice(`${calendarTasks.length} deadline${calendarTasks.length === 1 ? "" : "s"} exported.`);
  };

  const openCount = tasks.filter((task) => !task.completedAt).length;
  const completedCount = tasks.length - openCount;
  const visibleTasks = tasks.filter((task) => {
    if (filter === "open") return !task.completedAt;
    if (filter === "completed") return Boolean(task.completedAt);
    return true;
  });

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="ActionMail home">
          <span className="brand-mark" aria-hidden="true">
            <ScanLine size={20} strokeWidth={2.1} />
          </span>
          <span>ActionMail</span>
        </a>
        <div className="header-actions">
          <span className="local-status">
            <span className="status-dot" /> Local-only processing
          </span>
          <button className="button button-quiet header-button" type="button" onClick={loadSample}>
            <Sparkles size={16} /> Try sample
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow">
              <span>Document intelligence</span>
              <span className="eyebrow-divider" />
              <span>Evidence first</span>
            </div>
            <h1 id="hero-title">Turn important documents into clear next steps.</h1>
            <p>
              Read notices, bills, forms, and scans. ActionMail finds dates, amounts, and
              requested actions—then keeps you in control before anything is saved.
            </p>
            <div className="hero-points" aria-label="Product capabilities">
              <span><FileImage size={16} /> PDF + image OCR</span>
              <span><Languages size={16} /> English + Chinese</span>
              <span><FileCheck2 size={16} /> Evidence-linked review</span>
            </div>
          </div>

          <div className="privacy-card">
            <div className="privacy-icon"><ShieldCheck size={24} /></div>
            <div>
              <strong>Your file never leaves this browser.</strong>
              <p>
                OCR and document analysis run on this device. Original files are discarded;
                only actions you approve are stored in local browser storage.
              </p>
            </div>
          </div>
        </section>

        <section className="dashboard-summary" aria-label="Local action summary">
          <div className="summary-item">
            <span className="summary-icon navy"><Inbox size={18} /></span>
            <div><strong>{openCount}</strong><span>Open actions</span></div>
          </div>
          <div className="summary-item">
            <span className="summary-icon green"><CheckCircle2 size={18} /></span>
            <div><strong>{completedCount}</strong><span>Completed</span></div>
          </div>
          <div className="summary-item">
            <span className="summary-icon amber"><CalendarDays size={18} /></span>
            <div><strong>{calendarTasks.length}</strong><span>Calendar-ready</span></div>
          </div>
          <div className="summary-privacy">
            <LockKeyhole size={16} /> No account · no upload · no API key
          </div>
        </section>

        {(error || storageWarning) && (
          <div className="alert alert-error" role="alert">
            <AlertTriangle size={18} />
            <span>
              {error ?? "Browser storage is unavailable. Actions will last only for this session."}
            </span>
            {error && (
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {notice && <div className="toast" aria-live="polite"><Check size={16} /> {notice}</div>}

        <section className="workspace-grid" aria-label="Document processing workspace">
          <aside className="panel intake-panel">
            <div className="panel-heading">
              <div>
                <span className="step-label">01 · Add a document</span>
                <h2>Choose what to read</h2>
              </div>
              <FolderOpen size={21} />
            </div>

            <label className="field-label" htmlFor="ocr-language">Reading language</label>
            <div className="select-wrap">
              <Languages size={17} aria-hidden="true" />
              <select
                id="ocr-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value as OcrLanguage)}
                disabled={processing}
              >
                <option value="eng">English (eng)</option>
                <option value="eng+chi_sim">English + 简体中文 (chi_sim)</option>
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </div>

            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept={ACCEPTED_FILES}
              onChange={handleFileInput}
              tabIndex={-1}
            />
            <button
              className={`dropzone${dragging ? " is-dragging" : ""}`}
              type="button"
              disabled={processing}
              onClick={() => fileInput.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
              }}
              onDrop={handleDrop}
            >
              <span className="dropzone-icon">
                {processing ? <LoaderCircle className="spin" size={27} /> : <UploadCloud size={27} />}
              </span>
              <strong>{processing ? "Reading locally…" : "Drop a file here"}</strong>
              <span>{processing ? "Keep this tab open" : "or click to browse"}</span>
              <small>PDF, PNG, JPEG, WebP, or TXT · up to 12 MB</small>
            </button>

            {progress && (
              <div className="progress-card">
                <div className="progress-copy">
                  <span>{progress.detail}</span>
                  <strong>{Math.round(progress.progress * 100)}%</strong>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress.progress * 100)}
                >
                  <span style={{ width: `${Math.max(2, progress.progress * 100)}%` }} />
                </div>
              </div>
            )}

            <button className="sample-link" type="button" onClick={loadSample} disabled={processing}>
              <Sparkles size={15} /> No document handy? Load the sample notice
            </button>

            <div className="local-note">
              <LockKeyhole size={16} />
              <p><strong>Private by design.</strong> This static demo has no upload endpoint.</p>
            </div>
          </aside>

          <section className="panel review-panel">
            <div className="panel-heading review-heading">
              <div>
                <span className="step-label">02 · Verify suggestions</span>
                <h2>Review every action</h2>
              </div>
              {review && <span className="result-count">{review.actions.length} found</span>}
            </div>

            {!review ? (
              <div className="review-empty">
                <div className="review-illustration" aria-hidden="true">
                  <FileText size={50} strokeWidth={1.3} />
                  <span><Check size={18} /></span>
                </div>
                <h3>Your review queue is ready</h3>
                <p>
                  Add a document to see extracted text, OCR confidence, suggested fields,
                  and the exact evidence behind each action.
                </p>
                <div className="empty-flow" aria-hidden="true">
                  <span>Read</span><i /><span>Find</span><i /><span>Verify</span>
                </div>
              </div>
            ) : (
              <div className="review-content">
                <div className="document-summary">
                  <span className="document-icon">
                    {review.result.mode === "image-ocr" ? <FileImage size={22} /> : <FileText size={22} />}
                  </span>
                  <div className="document-name">
                    <strong title={review.name}>{review.name}</strong>
                    <span>
                      {formatBytes(review.size)} · {modeLabel(review.result.mode)}
                      {review.result.pageCount ? ` · ${review.result.pageCount} page${review.result.pageCount === 1 ? "" : "s"}` : ""}
                    </span>
                  </div>
                  {review.result.ocrConfidence !== undefined && (
                    <div className={`confidence-badge ${confidenceTone(review.result.ocrConfidence)}`}>
                      <span>OCR</span><strong>{review.result.ocrConfidence}%</strong>
                    </div>
                  )}
                </div>

                {review.result.ocrConfidence !== undefined && review.result.ocrConfidence < 65 && (
                  <div className="low-confidence-note">
                    <AlertTriangle size={17} />
                    <span>Low OCR confidence—compare each suggestion with the original document.</span>
                  </div>
                )}

                <details className="text-evidence">
                  <summary>
                    <span><FileText size={16} /> Extracted document text</span>
                    <ChevronDown size={16} />
                  </summary>
                  <pre>{review.result.text || "No readable text was found."}</pre>
                </details>

                <div className="candidate-list">
                  {review.actions.length === 0 ? (
                    <div className="no-actions">
                      <CheckCircle2 size={28} />
                      <div>
                        <strong>No explicit action found</strong>
                        <p>That can be the correct result for receipts or informational documents.</p>
                      </div>
                    </div>
                  ) : (
                    review.actions.map((action, index) => (
                      <article className="candidate-card" key={action.clientKey}>
                        <div className="candidate-topline">
                          <span className="candidate-number">{String(index + 1).padStart(2, "0")}</span>
                          <span className={`confidence-pill ${confidenceTone(action.confidence)}`}>
                            {action.confidence}% confidence
                          </span>
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => removeReviewAction(action.clientKey)}
                            aria-label={`Remove ${action.title || "draft action"}`}
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <label className="form-field field-wide">
                          <span>Action</span>
                          <input
                            value={action.title}
                            maxLength={160}
                            placeholder="What needs to happen?"
                            onChange={(event) => updateReviewAction(action.clientKey, { title: event.target.value })}
                          />
                        </label>

                        <div className="candidate-fields">
                          <label className="form-field">
                            <span>Organization</span>
                            <input
                              value={action.organization}
                              maxLength={120}
                              placeholder="Optional"
                              onChange={(event) => updateReviewAction(action.clientKey, { organization: event.target.value })}
                            />
                          </label>
                          <label className="form-field">
                            <span>Due date</span>
                            <input
                              type="date"
                              value={action.dueDate}
                              onChange={(event) => updateReviewAction(action.clientKey, { dueDate: event.target.value })}
                            />
                          </label>
                          <label className="form-field amount-field">
                            <span>Amount</span>
                            <div>
                              <select
                                aria-label="Currency"
                                value={action.currency}
                                onChange={(event) => updateReviewAction(action.clientKey, { currency: event.target.value })}
                              >
                                {CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
                              </select>
                              <input
                                inputMode="decimal"
                                type="number"
                                min="0"
                                step="0.01"
                                value={action.amount}
                                placeholder="0.00"
                                onChange={(event) => updateReviewAction(action.clientKey, { amount: event.target.value })}
                              />
                            </div>
                          </label>
                        </div>

                        <div className="evidence-quote">
                          <span><ScanLine size={14} /> Source evidence</span>
                          <blockquote>“{action.sourceQuote || "No source quote available."}”</blockquote>
                        </div>
                      </article>
                    ))
                  )}
                </div>

                <div className="review-actions">
                  <button className="button button-quiet" type="button" onClick={addReviewAction}>
                    <Plus size={16} /> Add action
                  </button>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={saveReviewedActions}
                    disabled={!review.actions.length}
                  >
                    <Database size={16} /> Save reviewed actions
                  </button>
                </div>
              </div>
            )}
          </section>
        </section>

        <section className="panel tasks-panel" aria-labelledby="saved-actions-heading">
          <div className="tasks-header">
            <div>
              <span className="step-label">03 · Keep track</span>
              <h2 id="saved-actions-heading">Saved actions</h2>
              <p>Stored only in this browser. Mark work complete or export dated actions.</p>
            </div>
            <div className="tasks-toolbar">
              <button
                className="button button-secondary"
                type="button"
                onClick={exportCalendar}
                disabled={!calendarTasks.length}
              >
                <Download size={16} /> Export ICS
              </button>
              <button
                className="button button-danger-quiet"
                type="button"
                onClick={clearTasks}
                disabled={!tasks.length}
              >
                <Trash2 size={16} /> Clear data
              </button>
            </div>
          </div>

          <div className="task-filter" role="group" aria-label="Filter saved actions">
            {(["open", "completed", "all"] as const).map((value) => (
              <button
                key={value}
                className={filter === value ? "active" : ""}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
              >
                {value[0].toUpperCase() + value.slice(1)}
                <span>
                  {value === "open" ? openCount : value === "completed" ? completedCount : tasks.length}
                </span>
              </button>
            ))}
          </div>

          {visibleTasks.length ? (
            <div className="task-list">
              {visibleTasks.map((task) => {
                const amount = formatAmount(task.amountMinor, task.currency);
                return (
                  <article className={`task-row${task.completedAt ? " is-complete" : ""}`} key={task.id}>
                    <button
                      className="task-check"
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      aria-label={task.completedAt ? `Reopen ${task.title}` : `Complete ${task.title}`}
                      aria-pressed={Boolean(task.completedAt)}
                    >
                      {task.completedAt ? <Check size={17} /> : <Circle size={17} />}
                    </button>
                    <div className="task-main">
                      <div className="task-title-line">
                        <h3>{task.title}</h3>
                        <span className={`confidence-dot ${confidenceTone(task.confidence)}`} title={`${task.confidence}% confidence`} />
                      </div>
                      <div className="task-meta">
                        {task.dueDate && <span><CalendarDays size={14} /> {formatDate(task.dueDate)}</span>}
                        {amount && <span className="amount-tag">{amount}</span>}
                        {task.organization && <span>{task.organization}</span>}
                      </div>
                      <details className="task-evidence">
                        <summary>Evidence from {task.documentName}</summary>
                        <p>“{task.sourceQuote}”</p>
                      </details>
                    </div>
                    <button
                      className="icon-button task-delete"
                      type="button"
                      onClick={() => removeTask(task.id)}
                      aria-label={`Delete ${task.title}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="tasks-empty">
              <span><Inbox size={28} /></span>
              <div>
                <strong>{tasks.length ? `No ${filter} actions` : "Nothing saved yet"}</strong>
                <p>{tasks.length ? "Choose another filter to see your saved work." : "Review a document above, then save only the actions you want."}</p>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer>
        <div className="footer-brand"><span className="brand-mark"><ScanLine size={17} /></span> ActionMail</div>
        <p>Local document intelligence with human review at every step.</p>
        <span><ShieldCheck size={15} /> Files stay on this device</span>
      </footer>
    </div>
  );
}
