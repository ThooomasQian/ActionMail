"use client";

import {
  Archive,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileImage,
  FileText,
  Inbox,
  Languages,
  LoaderCircle,
  LockKeyhole,
  MailCheck,
  Plus,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import type { DragEvent, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractDocument } from "@/lib/client-extraction";
import type { ExtractionProgress, OcrLanguage } from "@/lib/client-extraction";
import { extractActionCandidates, SAMPLE_DOCUMENT } from "@/lib/extract-actions";
import type {
  ActionItemView,
  DraftAction,
  ExtractionResult,
  InboxResponse,
} from "@/lib/actionmail-types";

type Props = {
  user: { displayName: string; email: string };
  signOutHref: string;
};

type DraftDocument = {
  file: File;
  result: ExtractionResult;
  actions: DraftAction[];
};

type View = "inbox" | "documents" | "upload";
type Filter = "open" | "week" | "completed";

const emptyInbox: InboxResponse = { documents: [], actionItems: [] };

export function ActionMailApp({ user, signOutHref }: Props) {
  const [view, setView] = useState<View>("inbox");
  const [filter, setFilter] = useState<Filter>("open");
  const [inbox, setInbox] = useState<InboxResponse>(emptyInbox);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [language, setLanguage] = useState<OcrLanguage>("eng");
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [draft, setDraft] = useState<DraftDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadInbox = useCallback(async () => {
    try {
      const response = await fetch("/api/inbox", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response));
      setInbox((await response.json()) as InboxResponse);
      setError(null);
    } catch (loadError) {
      setError(messageFrom(loadError, "Could not load your private inbox."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadInbox(), 0);
    const refresh = () => {
      setNotice("Your inbox was updated by a connected assistant.");
      void loadInbox();
    };
    window.addEventListener("actionmail:refresh", refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("actionmail:refresh", refresh);
    };
  }, [loadInbox]);

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) return;
    const controller = new AbortController();
    modelContext.registerTool(
      {
        name: "list_actionmail_items",
        description: "List the signed-in user's ActionMail tasks and deadlines.",
        inputSchema: {
          type: "object",
          properties: {
            includeCompleted: {
              type: "boolean",
              description: "Include completed items when true.",
            },
          },
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: true,
          untrustedContentHint: true,
        },
        execute: async (input: unknown) => {
          const response = await fetch("/api/inbox", { cache: "no-store" });
          if (!response.ok) throw new Error("ActionMail inbox is unavailable.");
          const data = (await response.json()) as InboxResponse;
          const includeCompleted =
            typeof input === "object" &&
            input !== null &&
            "includeCompleted" in input &&
            Boolean((input as { includeCompleted?: boolean }).includeCompleted);
          return {
            actionItems: data.actionItems
              .filter((item) => includeCompleted || !item.completedAtMs)
              .map((item) => ({
                id: item.id,
                title: item.title,
                dueDate: item.dueDate,
                organization: item.organization,
              })),
          };
        },
      },
      { signal: controller.signal },
    );
    modelContext.registerTool(
      {
        name: "complete_actionmail_item",
        description: "Mark one ActionMail action item complete after the user chooses it.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Exact ActionMail item id." },
          },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: false,
          consequentialHint: true,
          untrustedContentHint: true,
        },
        execute: async (input: unknown) => {
          const id =
            typeof input === "object" && input !== null && "id" in input
              ? String((input as { id: unknown }).id)
              : "";
          if (!id) throw new Error("An ActionMail item id is required.");
          const response = await fetch("/api/actions/" + encodeURIComponent(id), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completed: true }),
          });
          if (!response.ok) throw new Error(await responseMessage(response));
          window.dispatchEvent(new Event("actionmail:refresh"));
          return { ok: true, id };
        },
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openItems = useMemo(
    () => inbox.actionItems.filter((item) => !item.completedAtMs),
    [inbox.actionItems],
  );
  const weekEnd = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const visibleItems = inbox.actionItems.filter((item) => {
    if (filter === "completed") return Boolean(item.completedAtMs);
    if (item.completedAtMs) return false;
    if (filter === "week") return Boolean(item.dueDate && item.dueDate <= weekEnd);
    return true;
  });
  const dueThisWeek = openItems.filter(
    (item) => item.dueDate && item.dueDate <= weekEnd,
  ).length;

  async function processFile(file: File) {
    setView("upload");
    setDraft(null);
    setError(null);
    setProcessing(true);
    setProgress({ stage: "reading", progress: 0.04, detail: "Opening " + file.name });
    try {
      if (file.size > 12 * 1024 * 1024) {
        throw new Error("Choose a file smaller than 12 MB.");
      }
      const result = await extractDocument(file, language, setProgress);
      const actions = extractActionCandidates(result.text).map((action) => ({
        ...action,
        confidence: result.ocrConfidence === undefined
          ? action.confidence
          : Math.min(action.confidence, Math.max(35, result.ocrConfidence)),
      }));
      setDraft({ file, result, actions });
      setProgress({
        stage: "done",
        progress: 1,
        detail: actions.length ? actions.length + " action items found" : "No explicit actions found",
      });
    } catch (processError) {
      setError(messageFrom(processError, "This document could not be read."));
      setProgress(null);
    } finally {
      setProcessing(false);
    }
  }

  function loadSample() {
    const file = new File([SAMPLE_DOCUMENT], "sample-energy-notice.txt", {
      type: "text/plain",
    });
    void processFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void processFile(file);
  }

  function updateDraftAction(clientKey: string, changes: Partial<DraftAction>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            actions: current.actions.map((action) =>
              action.clientKey === clientKey ? { ...action, ...changes } : action,
            ),
          }
        : null,
    );
  }

  function removeDraftAction(clientKey: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            actions: current.actions.filter((action) => action.clientKey !== clientKey),
          }
        : null,
    );
  }

  function addDraftAction() {
    setDraft((current) =>
      current
        ? {
            ...current,
            actions: [
              ...current.actions,
              {
                clientKey: "manual-" + crypto.randomUUID(),
                title: "",
                organization: null,
                dueDate: null,
                amountMinor: null,
                currency: "USD",
                confidence: 100,
                sourceQuote: "",
              },
            ],
          }
        : null,
    );
  }

  async function saveDraft() {
    if (!draft || !draft.actions.length) return;
    if (draft.actions.some((action) => !action.title.trim())) {
      setError("Give every action a short title before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    const form = new FormData();
    form.set("file", draft.file);
    form.set("extractedText", draft.result.text);
    form.set("extractionMode", draft.result.mode);
    form.set("actions", JSON.stringify(draft.actions));
    try {
      const response = await fetch("/api/documents", { method: "POST", body: form });
      if (!response.ok) throw new Error(await responseMessage(response));
      setNotice("Document saved. Your action inbox is up to date.");
      setDraft(null);
      setProgress(null);
      setView("inbox");
      await loadInbox();
    } catch (saveError) {
      setError(messageFrom(saveError, "The document could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleComplete(item: ActionItemView) {
    const completed = !item.completedAtMs;
    const optimisticTime = completed ? Date.now() : null;
    setInbox((current) => ({
      ...current,
      actionItems: current.actionItems.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, completedAtMs: optimisticTime }
          : candidate,
      ),
    }));
    try {
      const response = await fetch("/api/actions/" + encodeURIComponent(item.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setNotice(completed ? "Action completed." : "Action reopened.");
    } catch (updateError) {
      setInbox((current) => ({
        ...current,
        actionItems: current.actionItems.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, completedAtMs: item.completedAtMs }
            : candidate,
        ),
      }));
      setError(messageFrom(updateError, "The action could not be updated."));
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[#10233f]/10 bg-[#f8f5ed]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between px-4 sm:px-7">
          <button
            type="button"
            onClick={() => setView("inbox")}
            className="flex items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#356c64]"
          >
            <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#10233f] text-[#fffaf1] shadow-[0_7px_18px_rgb(16_35_63/18%)]">
              <MailCheck size={22} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-[17px] font-bold tracking-[-0.02em]">ActionMail</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.13em] text-[#69737a]">
                Private life admin
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-1.5 rounded-full border border-[#356c64]/20 bg-[#e6eee9] px-3 py-1.5 text-xs font-semibold text-[#285a53] sm:flex">
              <LockKeyhole size={13} />
              Files stay private
            </span>
            <div className="group relative">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full bg-[#10233f] text-sm font-bold text-white ring-2 ring-white"
                aria-label={"Account for " + user.displayName}
              >
                {initials(user.displayName)}
              </button>
              <div className="invisible absolute right-0 top-11 w-64 translate-y-1 rounded-2xl border bg-[#fffdf8] p-3 opacity-0 shadow-xl group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <p className="truncate text-sm font-semibold">{user.displayName}</p>
                <p className="truncate text-xs text-[#737b80]">{user.email}</p>
                <a
                  href={signOutHref}
                  target="_top"
                  className="mt-3 block rounded-lg border px-3 py-2 text-center text-sm font-semibold hover:bg-[#eee9df]"
                >
                  Sign out
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-7 lg:grid-cols-[210px_minmax(0,1fr)_280px] lg:gap-8 lg:py-8">
        <aside className="hidden lg:block">
          <nav className="sticky top-28 space-y-1" aria-label="Main navigation">
            <NavButton active={view === "inbox"} icon={<Inbox size={18} />} label="Action inbox" count={openItems.length} onClick={() => setView("inbox")} />
            <NavButton active={view === "documents"} icon={<FileText size={18} />} label="Documents" count={inbox.documents.length} onClick={() => setView("documents")} />
            <NavButton active={view === "upload"} icon={<ScanLine size={18} />} label="New scan" onClick={() => setView("upload")} />
            <div className="my-5 h-px bg-[#10233f]/10" />
            <a
              href="/api/calendar"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#536069] hover:bg-white/65 hover:text-[#10233f]"
            >
              <CalendarDays size={18} />
              Export calendar
            </a>
          </nav>
        </aside>

        <main className="min-w-0">
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            <MobileNav active={view === "inbox"} onClick={() => setView("inbox")} label="Inbox" />
            <MobileNav active={view === "documents"} onClick={() => setView("documents")} label="Documents" />
            <MobileNav active={view === "upload"} onClick={() => setView("upload")} label="New scan" />
          </div>

          {error ? (
            <div role="alert" className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-[#a83a2f]/20 bg-[#fff1ed] px-4 py-3 text-sm text-[#8d2f27]">
              <span>{error}</span>
              <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>
                <X size={17} />
              </button>
            </div>
          ) : null}
          {notice ? (
            <div role="status" className="mb-5 flex items-center gap-2 rounded-2xl border border-[#356c64]/20 bg-[#e6f0eb] px-4 py-3 text-sm font-semibold text-[#285a53]">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          ) : null}

          {view === "upload" ? (
            <UploadWorkspace
              draft={draft}
              processing={processing}
              saving={saving}
              dragging={dragging}
              language={language}
              progress={progress}
              inputRef={inputRef}
              onLanguage={setLanguage}
              onDrag={setDragging}
              onDrop={onDrop}
              onFile={(file) => void processFile(file)}
              onSample={loadSample}
              onSave={() => void saveDraft()}
              onCancel={() => {
                setDraft(null);
                setProgress(null);
                setView("inbox");
              }}
              onUpdate={updateDraftAction}
              onRemove={removeDraftAction}
              onAdd={addDraftAction}
            />
          ) : view === "documents" ? (
            <DocumentsView documents={inbox.documents} loading={loading} onUpload={() => setView("upload")} />
          ) : (
            <InboxView
              loading={loading}
              items={visibleItems}
              allItems={inbox.actionItems}
              filter={filter}
              onFilter={setFilter}
              onUpload={() => setView("upload")}
              onSample={loadSample}
              onToggle={(item) => void toggleComplete(item)}
              today={today}
            />
          )}
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-4">
            <section className="rounded-[22px] border bg-[#fffdf8]/85 p-5 shadow-[0_12px_35px_rgb(16_35_63/5%)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#737b80]">This week</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Metric value={String(openItems.length)} label="open actions" />
                <Metric value={String(dueThisWeek)} label="due soon" accent />
              </div>
              <a href="/api/calendar" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#10233f]/15 bg-white px-3 py-2.5 text-sm font-semibold hover:border-[#10233f]/30">
                <Download size={16} />
                Download .ics
              </a>
            </section>
            <section className="rounded-[22px] bg-[#10233f] p-5 text-[#fffaf1] shadow-[0_16px_35px_rgb(16_35_63/18%)]">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                <ShieldCheck size={19} />
              </div>
              <h2 className="font-bold tracking-[-0.01em]">Private by design</h2>
              <p className="mt-2 text-sm leading-6 text-white/68">
                Text extraction runs in your browser. Nothing is saved until you review and confirm it.
              </p>
            </section>
            <section className="rounded-[22px] border border-[#f1ad4a]/25 bg-[#fff7e7] p-5">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Sparkles size={16} className="text-[#ad6a0b]" />
                Built for messy mail
              </div>
              <p className="mt-2 text-sm leading-6 text-[#695a43]">
                Utility bills, appointment letters, renewals, notices, and scanned forms.
              </p>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

function InboxView({
  loading,
  items,
  allItems,
  filter,
  onFilter,
  onUpload,
  onSample,
  onToggle,
  today,
}: {
  loading: boolean;
  items: ActionItemView[];
  allItems: ActionItemView[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
  onUpload: () => void;
  onSample: () => void;
  onToggle: (item: ActionItemView) => void;
  today: string;
}) {
  const open = allItems.filter((item) => !item.completedAtMs).length;
  const completed = allItems.length - open;
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.13em] text-[#69737a]">Your next moves</p>
          <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-[38px]">Action inbox</h1>
          <p className="mt-2 text-base text-[#687079]">Deadlines and follow-ups, pulled out of the documents that hide them.</p>
        </div>
        <button type="button" onClick={onUpload} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#10233f] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgb(16_35_63/18%)] hover:bg-[#193656]">
          <Plus size={17} />
          Scan a document
        </button>
      </div>
      <div className="mb-5 flex gap-2 overflow-x-auto">
        <FilterButton active={filter === "open"} label="Open" count={open} onClick={() => onFilter("open")} />
        <FilterButton active={filter === "week"} label="Next 7 days" onClick={() => onFilter("week")} />
        <FilterButton active={filter === "completed"} label="Completed" count={completed} onClick={() => onFilter("completed")} />
      </div>
      {loading ? (
        <LoadingList />
      ) : items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <ActionRow key={item.id} item={item} today={today} onToggle={() => onToggle(item)} />
          ))}
        </div>
      ) : allItems.length ? (
        <section className="rounded-[24px] border border-dashed bg-[#fffdf8]/75 px-6 py-12 text-center">
          <CheckCircle2 className="mx-auto text-[#356c64]" size={32} />
          <h2 className="mt-4 text-xl font-bold">Nothing in this view</h2>
          <p className="mt-2 text-sm text-[#687079]">Your other action items are still available in the filters above.</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[28px] border bg-[#fffdf8] shadow-[0_16px_50px_rgb(16_35_63/7%)]">
          <div className="grid items-center gap-7 p-6 sm:grid-cols-[1.1fr_.9fr] sm:p-9">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#e4eee9] px-3 py-1.5 text-xs font-bold text-[#285a53]">
                <Sparkles size={14} />
                A calmer document inbox
              </span>
              <h2 className="mt-5 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Stop rereading mail to remember what matters.</h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-[#657078]">
                Drop in a bill, notice, or appointment letter. ActionMail reads it locally, finds the next steps, and lets you verify every detail before saving.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={onUpload} className="inline-flex items-center gap-2 rounded-xl bg-[#10233f] px-4 py-3 text-sm font-bold text-white">
                  <UploadCloud size={17} />
                  Choose a document
                </button>
                <button type="button" onClick={onSample} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:border-[#10233f]/35">
                  Try a sample notice
                </button>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[290px] py-2">
              <div className="absolute inset-5 rotate-3 rounded-2xl border bg-[#ebe5d8]" />
              <div className="relative -rotate-2 rounded-2xl border bg-white p-5 shadow-xl">
                <div className="mb-5 flex items-center justify-between">
                  <div className="h-2.5 w-28 rounded-full bg-[#10233f]/12" />
                  <FileText size={18} className="text-[#356c64]" />
                </div>
                <div className="space-y-2">
                  <div className="h-2 w-full rounded-full bg-[#10233f]/8" />
                  <div className="h-2 w-5/6 rounded-full bg-[#10233f]/8" />
                  <div className="h-2 w-3/4 rounded-full bg-[#10233f]/8" />
                </div>
                <div className="mt-6 rounded-xl border border-[#f1ad4a]/40 bg-[#fff4dc] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#9b630f]">Due Sep 24</p>
                  <p className="mt-1 text-sm font-bold">Pay outstanding balance</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function ActionRow({ item, today, onToggle }: { item: ActionItemView; today: string; onToggle: () => void }) {
  const due = dueLabel(item.dueDate, today);
  return (
    <article className={"group rounded-[20px] border bg-[#fffdf8] p-4 shadow-[0_7px_22px_rgb(16_35_63/4%)] hover:border-[#10233f]/22 " + (item.completedAtMs ? "opacity-65" : "")}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={item.completedAtMs ? "Reopen " + item.title : "Complete " + item.title}
          className={"mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 " + (item.completedAtMs ? "border-[#356c64] bg-[#356c64] text-white" : "border-[#aab0ae] bg-white text-transparent hover:border-[#356c64]")}
        >
          <Check size={15} strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className={"text-[16px] font-bold leading-6 tracking-[-0.01em] " + (item.completedAtMs ? "line-through" : "")}>{item.title}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[#727a7f]">
                {item.organization ? <span>{item.organization}</span> : null}
                <span className="inline-flex items-center gap-1">
                  <FileText size={12} />
                  {item.documentName}
                </span>
              </p>
            </div>
            {item.dueDate ? (
              <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + due.className}>
                {due.text}
              </span>
            ) : (
              <span className="rounded-full bg-[#eeeae1] px-2.5 py-1 text-xs font-semibold text-[#70777a]">No date</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {item.amountMinor !== null && item.amountMinor !== undefined ? (
              <span className="rounded-lg border bg-white px-2 py-1 text-xs font-bold">
                {formatMoney(item.amountMinor, item.currency)}
              </span>
            ) : null}
            <details className="text-xs text-[#687079]">
              <summary className="cursor-pointer select-none font-semibold hover:text-[#10233f]">Why this was found</summary>
              <p className="mt-2 max-w-2xl rounded-lg bg-[#f1eee6] p-3 leading-5">{item.sourceQuote || "Added manually"}</p>
            </details>
          </div>
        </div>
      </div>
    </article>
  );
}

function UploadWorkspace(props: {
  draft: DraftDocument | null;
  processing: boolean;
  saving: boolean;
  dragging: boolean;
  language: OcrLanguage;
  progress: ExtractionProgress | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onLanguage: (language: OcrLanguage) => void;
  onDrag: (dragging: boolean) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onFile: (file: File) => void;
  onSample: () => void;
  onSave: () => void;
  onCancel: () => void;
  onUpdate: (clientKey: string, changes: Partial<DraftAction>) => void;
  onRemove: (clientKey: string) => void;
  onAdd: () => void;
}) {
  const { draft, processing, saving, dragging, language, progress, inputRef } = props;
  return (
    <>
      <div className="mb-6">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.13em] text-[#69737a]">Local document intelligence</p>
        <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-[38px]">Scan a document</h1>
        <p className="mt-2 text-base text-[#687079]">Review the extracted actions before anything is saved.</p>
      </div>
      {!draft ? (
        <section className="rounded-[28px] border bg-[#fffdf8] p-4 shadow-[0_16px_50px_rgb(16_35_63/7%)] sm:p-7">
          <div
            onDragOver={(event) => { event.preventDefault(); props.onDrag(true); }}
            onDragLeave={() => props.onDrag(false)}
            onDrop={props.onDrop}
            className={"relative grid min-h-[360px] place-items-center rounded-[22px] border-2 border-dashed px-6 py-12 text-center " + (dragging ? "border-[#356c64] bg-[#e8f0eb]" : "border-[#10233f]/18 bg-[#f8f5ed]/60")}
          >
            {processing ? (
              <div className="w-full max-w-md">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#10233f] text-white">
                  <LoaderCircle className="animate-spin" size={25} />
                </div>
                <h2 className="mt-5 text-xl font-bold">Reading your document</h2>
                <p className="mt-2 text-sm text-[#687079]">{progress?.detail ?? "Preparing local extraction"}</p>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#dcd8cf]">
                  <div className="progress-shimmer relative h-full rounded-full bg-[#356c64]" style={{ width: Math.max(5, (progress?.progress ?? 0) * 100) + "%" }} />
                </div>
                <p className="mt-3 text-xs font-semibold text-[#737b80]">Runs on this device · your file has not been uploaded</p>
              </div>
            ) : (
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] bg-[#e7eee9] text-[#285a53]">
                  <UploadCloud size={28} />
                </div>
                <h2 className="mt-5 text-xl font-bold">Drop a PDF, photo, or text file here</h2>
                <p className="mt-2 text-sm text-[#687079]">PDF · PNG · JPEG · WebP · TXT, up to 12 MB</p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button type="button" onClick={() => inputRef.current?.click()} className="rounded-xl bg-[#10233f] px-4 py-3 text-sm font-bold text-white">
                    Choose a file
                  </button>
                  <button type="button" onClick={props.onSample} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:border-[#10233f]/35">
                    Use sample notice
                  </button>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  className="sr-only"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) props.onFile(file);
                    event.target.value = "";
                  }}
                />
                <label className="mx-auto mt-7 flex w-fit items-center gap-2 text-sm font-semibold text-[#5d686e]">
                  <Languages size={16} />
                  OCR language
                  <select value={language} onChange={(event) => props.onLanguage(event.target.value as OcrLanguage)} className="rounded-lg border bg-white px-2 py-1.5 text-sm text-[#10233f] outline-none focus:border-[#356c64]">
                    <option value="eng">English</option>
                    <option value="eng+chi_sim">English + 中文</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-5">
          <div className="flex flex-col justify-between gap-4 rounded-[22px] border bg-[#fffdf8] p-5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e7eee9] text-[#285a53]">
                {draft.file.type.startsWith("image/") ? <FileImage size={21} /> : <FileText size={21} />}
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold">{draft.file.name}</p>
                <p className="text-xs text-[#70787d]">
                  {formatBytes(draft.file.size)} · {modeLabel(draft.result.mode)}
                  {draft.result.ocrConfidence === undefined ? "" : ` · ${draft.result.ocrConfidence}% OCR confidence`}
                  {` · ${draft.actions.length} proposed actions`}
                </p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#e4eee9] px-3 py-1.5 text-xs font-bold text-[#285a53]">
              <CheckCircle2 size={14} />
              Extraction complete
            </span>
          </div>
          {draft.result.ocrConfidence !== undefined && draft.result.ocrConfidence < 65 ? (
            <div className="rounded-2xl border border-[#d49b43]/35 bg-[#fff5df] p-4 text-sm text-[#74501c]">
              <p className="font-bold">Low-confidence scan — verify the extracted text</p>
              <p className="mt-1 leading-6">Try a flatter, sharper image for better results. Action confidence is capped so uncertain OCR is never presented as certain.</p>
            </div>
          ) : null}
          <details className="rounded-2xl border bg-[#fffdf8] p-4">
            <summary className="cursor-pointer text-sm font-bold text-[#314b55]">Review extracted text</summary>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-[#f1eee6] p-3 text-xs leading-5 text-[#59656c]">{draft.result.text.slice(0, 4000) || "No readable text was found."}</pre>
          </details>
          <div>
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Confirm the next steps</h2>
                <p className="mt-1 text-sm text-[#687079]">Edit anything the parser got wrong. Only these confirmed items enter your inbox.</p>
              </div>
              <button type="button" onClick={props.onAdd} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-bold hover:border-[#10233f]/35">
                <Plus size={15} />
                Add
              </button>
            </div>
            <div className="space-y-4">
              {draft.actions.map((action, index) => (
                <DraftActionCard key={action.clientKey} action={action} index={index} onUpdate={(changes) => props.onUpdate(action.clientKey, changes)} onRemove={() => props.onRemove(action.clientKey)} />
              ))}
              {!draft.actions.length ? (
                <div className="rounded-2xl border border-dashed bg-[#fffdf8]/75 p-8 text-center">
                  <p className="font-bold">No explicit action found</p>
                  <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-[#687079]">Balances, historical payments, and informational dates are intentionally not turned into tasks. Review the extracted text, add an action manually, or cancel this document.</p>
                </div>
              ) : null}
            </div>
          </div>
          <div className="sticky bottom-4 z-20 flex flex-col-reverse justify-between gap-3 rounded-2xl border bg-[#fffdf8]/95 p-3 shadow-[0_14px_40px_rgb(16_35_63/15%)] backdrop-blur sm:flex-row sm:items-center">
            <button type="button" onClick={props.onCancel} disabled={saving} className="rounded-xl px-4 py-3 text-sm font-bold text-[#647078] hover:bg-[#eeeae1]">Cancel</button>
            <button type="button" onClick={props.onSave} disabled={saving || !draft.actions.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10233f] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">
              {saving ? <LoaderCircle className="animate-spin" size={17} /> : <Archive size={17} />}
              {saving ? "Saving privately…" : "Confirm and save " + draft.actions.length}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function DraftActionCard({ action, index, onUpdate, onRemove }: { action: DraftAction; index: number; onUpdate: (changes: Partial<DraftAction>) => void; onRemove: () => void }) {
  return (
    <article className="rounded-[20px] border bg-[#fffdf8] p-4 shadow-[0_7px_22px_rgb(16_35_63/4%)] sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#71797d]">Action {index + 1}</span>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#e6eee9] px-2.5 py-1 text-[11px] font-bold text-[#285a53]">{action.confidence}% confidence</span>
          <button type="button" onClick={onRemove} aria-label={"Remove action " + (index + 1)} className="grid h-8 w-8 place-items-center rounded-lg text-[#7a8184] hover:bg-[#f3e5e1] hover:text-[#a83a2f]">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-bold">What needs to happen</span>
          <input value={action.title} maxLength={160} onChange={(event) => onUpdate({ title: event.target.value })} className="h-11 w-full rounded-xl border bg-white px-3 text-[15px] outline-none focus:border-[#356c64] focus:ring-3 focus:ring-[#356c64]/10" />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-bold">Organization</span>
          <input value={action.organization ?? ""} maxLength={120} placeholder="Optional" onChange={(event) => onUpdate({ organization: event.target.value || null })} className="h-11 w-full rounded-xl border bg-white px-3 text-[15px] outline-none focus:border-[#356c64] focus:ring-3 focus:ring-[#356c64]/10" />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-bold">Due date</span>
          <input type="date" value={action.dueDate ?? ""} onChange={(event) => onUpdate({ dueDate: event.target.value || null })} className="h-11 w-full rounded-xl border bg-white px-3 text-[15px] outline-none focus:border-[#356c64] focus:ring-3 focus:ring-[#356c64]/10" />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-bold">Amount</span>
          <div className="flex">
            <select value={action.currency ?? "USD"} onChange={(event) => onUpdate({ currency: event.target.value })} className="h-11 rounded-l-xl border border-r-0 bg-[#f2efe7] px-2 text-sm font-bold outline-none">
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
              <option>CAD</option>
              <option>AUD</option>
              <option>CNY</option>
            </select>
            <input type="number" min="0" step="0.01" value={action.amountMinor === null || action.amountMinor === undefined ? "" : (action.amountMinor / 100).toFixed(2)} placeholder="Optional" onChange={(event) => onUpdate({ amountMinor: event.target.value ? Math.round(Number(event.target.value) * 100) : null })} className="h-11 min-w-0 flex-1 rounded-r-xl border bg-white px-3 text-[15px] outline-none focus:border-[#356c64] focus:ring-3 focus:ring-[#356c64]/10" />
          </div>
        </label>
        <div className="rounded-xl bg-[#f1eee6] p-3 sm:col-span-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#71797d]">Evidence in document</p>
          <p className="mt-1.5 text-sm leading-6 text-[#5f696f]">{action.sourceQuote || "Manually added by you"}</p>
        </div>
      </div>
    </article>
  );
}

function DocumentsView({ documents, loading, onUpload }: { documents: InboxResponse["documents"]; loading: boolean; onUpload: () => void }) {
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.13em] text-[#69737a]">Original sources</p>
          <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-[38px]">Documents</h1>
          <p className="mt-2 text-base text-[#687079]">Private originals and the actions you confirmed from them.</p>
        </div>
        <button type="button" onClick={onUpload} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#10233f] px-4 text-sm font-bold text-white">
          <Plus size={17} />
          Add document
        </button>
      </div>
      {loading ? <LoadingList /> : documents.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {documents.map((document) => (
            <article key={document.id} className="rounded-[20px] border bg-[#fffdf8] p-5 shadow-[0_7px_22px_rgb(16_35_63/4%)]">
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7eee9] text-[#285a53]">
                  {document.mimeType.startsWith("image/") ? <FileImage size={20} /> : <FileText size={20} />}
                </span>
                <span className="rounded-full bg-[#eeeae1] px-2.5 py-1 text-xs font-bold text-[#697176]">{document.actionCount} actions</span>
              </div>
              <h2 className="mt-4 truncate font-bold">{document.originalName}</h2>
              <p className="mt-1 text-xs text-[#737b80]">{formatBytes(document.sizeBytes)} · {modeLabel(document.extractionMode)}</p>
              <a href={"/api/documents/" + encodeURIComponent(document.id) + "/file"} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#285a53] hover:text-[#10233f]">
                Download original
                <ChevronRight size={15} />
              </a>
            </article>
          ))}
        </div>
      ) : (
        <section className="rounded-[24px] border border-dashed bg-[#fffdf8]/75 p-10 text-center">
          <FileText className="mx-auto text-[#356c64]" size={31} />
          <h2 className="mt-4 text-xl font-bold">No saved documents</h2>
          <p className="mt-2 text-sm text-[#687079]">Documents only appear after you review and confirm their action items.</p>
        </section>
      )}
    </>
  );
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold " + (active ? "bg-[#10233f] text-white shadow-md" : "text-[#59666d] hover:bg-white/65 hover:text-[#10233f]")}>
      {icon}
      <span className="flex-1">{label}</span>
      {count !== undefined ? <span className={"rounded-full px-2 py-0.5 text-[11px] " + (active ? "bg-white/14" : "bg-[#10233f]/7")}>{count}</span> : null}
    </button>
  );
}

function MobileNav({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={"shrink-0 rounded-full px-4 py-2 text-sm font-bold " + (active ? "bg-[#10233f] text-white" : "border bg-[#fffdf8] text-[#5f696f]")}>{label}</button>;
}

function FilterButton({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={"inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-bold " + (active ? "border-[#10233f] bg-[#10233f] text-white" : "bg-[#fffdf8] text-[#606b71] hover:border-[#10233f]/35")}>
      {label}
      {count !== undefined ? <span className={"text-xs " + (active ? "text-white/65" : "text-[#899094]")}>{count}</span> : null}
    </button>
  );
}

function Metric({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={"rounded-xl p-3 " + (accent ? "bg-[#fff1d6]" : "bg-[#eef0ec]")}>
      <p className={"text-2xl font-bold tracking-[-0.04em] " + (accent ? "text-[#9b610b]" : "")}>{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-[#70787d]">{label}</p>
    </div>
  );
}

function LoadingList() {
  return (
    <div className="space-y-3" aria-label="Loading inbox">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-28 animate-pulse rounded-[20px] border bg-[#fffdf8]/70 p-4">
          <div className="ml-10 h-4 w-2/3 rounded-full bg-[#10233f]/8" />
          <div className="ml-10 mt-3 h-3 w-1/3 rounded-full bg-[#10233f]/6" />
        </div>
      ))}
    </div>
  );
}

function dueLabel(date: string | null | undefined, today: string) {
  if (!date) return { text: "", className: "" };
  const days = Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
  if (days < 0) return { text: Math.abs(days) + "d overdue", className: "bg-[#f8ded8] text-[#9c352b]" };
  if (days === 0) return { text: "Due today", className: "bg-[#fff0cf] text-[#95600d]" };
  if (days === 1) return { text: "Due tomorrow", className: "bg-[#fff0cf] text-[#95600d]" };
  if (days <= 7) return { text: "Due in " + days + " days", className: "bg-[#fff0cf] text-[#95600d]" };
  return { text: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(date + "T12:00:00")), className: "bg-[#e7eee9] text-[#285a53]" };
}

function formatMoney(amountMinor: number, currency: string | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
  }).format(amountMinor / 100);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function modeLabel(mode: string) {
  if (mode === "image-ocr") return "Local OCR";
  if (mode === "pdf-text") return "PDF text";
  return "Plain text";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AM";
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? "Request failed with status " + response.status + ".";
  } catch {
    return "Request failed with status " + response.status + ".";
  }
}
