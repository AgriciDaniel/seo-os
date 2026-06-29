"use client";

/**
 * Specialist Inbox — the right-pane view that shows what the Orchestrator
 * has dispatched to a given specialist. Tabs:
 *
 *   Inbox        list of Assignments newest-first, with status pills +
 *                Approve / Discard / Re-run / Open-in-vault quick actions.
 *   Conversation the existing ChatPanel scoped to (clientSlug, specialistId).
 *
 * The component is purely presentational + self-contained — it fetches its
 * own data via /api/clients/<slug>/specialists/<id>/assignments and
 * triggers state mutations through /api/assignments/<id>/[approve|cancel].
 * To wire it into OfficeWorkspace:
 *
 *   {focused && focused !== "brain" && focused !== "orchestrator" && (
 *     <SpecialistInbox
 *       clientSlug={activeClient.slug}
 *       specialistId={toRegisteredId(focused) ?? focused}
 *       specialistName={specialistNameFor(focused)}
 *     />
 *   )}
 *
 * It deliberately doesn't import the 3D scene so it can be embedded by
 * other surfaces too (e.g. a dedicated /office/specialists/<id> page).
 */

import { useEffect, useMemo, useState } from "react";

import { useWindowStore } from "@/store/windows";
import { useSpecialistsStore } from "@/store/specialists";
import ChatPanel from "@/components/ChatPanel";
import { reportApiPath } from "@/lib/reports/url";
import StatusPill, { type Status } from "./StatusPill";

type PermissionMode = "plan" | "read_only" | "auto" | "full_access";

interface Assignment {
  id: string;
  client_slug: string;
  specialist_id: string;
  parent_message_id: string | null;
  title: string;
  brief: string;
  payload: Record<string, unknown>;
  permission_mode: PermissionMode;
  status: Status;
  request_id: string;
  job_id: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
  /** Enriched by the assignments endpoint from the matching Task row. */
  result_path?: string | null;
  result_report_path?: string | null;
  result_data_path?: string | null;
  artifact?: {
    title: string;
    confidence: string | null;
    approval_status: string | null;
    risk_level: string | null;
    data_sources: string[] | null;
  } | null;
}

type Tab = "inbox" | "chat";

interface Props {
  clientSlug: string;
  /** Registered specialist id, e.g. "technical-auditor". */
  specialistId: string;
  /** Display name for the header. */
  specialistName: string;
  /** Full target list so the embedded ChatPanel can offer a switcher. */
  targets?: Array<{ id: string; name: string }>;
  onTargetChange?: (next: string) => void;
  /** Forwarded to the embedded ChatPanel — fired when the specialist's chat
   *  stream ends so the parent workspace can mark this desk as recently-
   *  active for the post-activity presence window. */
  onStreamDone?: (target: string) => void;
}

export default function SpecialistInbox({
  clientSlug,
  specialistId,
  specialistName,
  targets = [],
  onTargetChange,
  onStreamDone,
}: Props) {
  const [tab, setTab] = useState<Tab>("inbox");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Artifact clicks dispatch to the window store now — see ChatPanel for the
  // same migration. The inline slide-over got trapped inside the OS Window's
  // transform containing-block and overlapped poorly.
  const openWindow = useWindowStore((s) => s.open);

  // Live working state for THIS specialist, sourced from the office-wide
  // SSE store (populated centrally by OfficeWorkspace). Sweep work runs as
  // jobs, not assignments, so without this the inbox shows "No assignments
  // yet" even while the desk is actively THINKING. Reading the store gives
  // instant running feedback with no extra polling.
  const live = useSpecialistsStore((s) => s.byId[specialistId]);
  const isWorking = live?.state === "running";

  const knownSpecialistIds = useMemo(
    () => new Set(targets.map((t) => t.id).filter((id) => id !== "orchestrator")),
    [targets],
  );

  function focusSpecialist(id: string) {
    if (!knownSpecialistIds.has(id)) return;
    onTargetChange?.(id);
  }

  function openArtifactWindow(path: string, kind: "note" | "report" = "note") {
    const title = path.split("/").pop() ?? path;
    const isReport = kind === "report";
    openWindow({
      kind: "note",
      title,
      icon: isReport ? "🌐" : "📄",
      identityKey: `note:${clientSlug}:${path}`,
      contentProps: {
        clientSlug,
        path: isReport ? reportApiPath(clientSlug, path) : path,
      },
      w: isReport ? 900 : 720,
      h: isReport ? 700 : 620,
    });
  }

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/clients/${encodeURIComponent(clientSlug)}/specialists/${encodeURIComponent(specialistId)}/assignments`,
        signal ? { signal } : undefined,
      );
      const data = (await r.json()) as { ok: boolean; assignments?: Assignment[]; error?: string };
      // Mid-flight cancellation race — if the user switched specialists
      // between fetch start and JSON parse, ignore this response so a
      // stale specialist's assignments don't overwrite the new view.
      if (signal?.aborted) return;
      if (!r.ok || !data.ok) {
        setError(data.error ?? `HTTP ${r.status}`);
      } else {
        setAssignments(data.assignments ?? []);
      }
    } catch (err) {
      // AbortError on switch is normal — don't surface it as a user error.
      if ((err as { name?: string })?.name === "AbortError") return;
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    // AbortController scoped to this (clientSlug, specialistId) effect run.
    // Switching either dep aborts the in-flight fetch BEFORE the cleanup
    // returns, so a stale response from the previous specialist can't
    // race past the new specialist's first load(). Visibility gate skips
    // background polls while the tab is hidden — same pattern as
    // LiveAgentsHud — so a docked office in a background tab doesn't
    // wake the server every 5s for assignments nobody is reading.
    const ac = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(ac.signal);
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load(ac.signal);
    }, 5_000);
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        void load(ac.signal);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ac.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSlug, specialistId]);

  async function approve(id: string) {
    setBusyId(id);
    try {
      const r = await fetch(
        `/api/assignments/${id}/approve?slug=${encodeURIComponent(clientSlug)}`,
        { method: "POST" },
      );
      const data = (await r.json()) as { ok: boolean; assignment?: Assignment; error?: string };
      if (!r.ok || !data.ok) {
        setError(data.error ?? `HTTP ${r.status}`);
      } else if (data.assignment) {
        setAssignments((prev) =>
          prev.map((a) => (a.id === id ? data.assignment! : a)),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id: string) {
    setBusyId(id);
    try {
      const r = await fetch(
        `/api/assignments/${id}?slug=${encodeURIComponent(clientSlug)}`,
        { method: "DELETE" },
      );
      const data = (await r.json()) as { ok: boolean; assignment?: Assignment; error?: string };
      if (!r.ok || !data.ok) {
        setError(data.error ?? `HTTP ${r.status}`);
      } else if (data.assignment) {
        setAssignments((prev) =>
          prev.map((a) => (a.id === id ? data.assignment! : a)),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-iron">
      <header className="flex items-center justify-between gap-2 border-b border-graphite bg-abyss px-4 py-3">
        <div className="min-w-0">
          <p className="label-micro">specialist</p>
          <p className="mt-0.5 truncate text-sm font-medium uppercase tracking-wider text-white">
            {specialistName}
          </p>
        </div>
        <nav className="flex items-stretch overflow-hidden border border-graphite" role="tablist">
          <TabBtn active={tab === "inbox"} onClick={() => setTab("inbox")}>
            Inbox{assignments.length > 0 ? ` · ${assignments.length}` : ""}
          </TabBtn>
          <TabBtn active={tab === "chat"} onClick={() => setTab("chat")}>
            Conversation
          </TabBtn>
        </nav>
      </header>

      {tab === "inbox" && (
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {isWorking && (
            <RunningNowCard
              slug={clientSlug}
              jobId={live?.lastJobId}
              fallbackMessage={live?.lastMessage ?? null}
            />
          )}

          {loading && assignments.length === 0 ? (
            <p className="text-[12px] text-ash">loading…</p>
          ) : null}

          {!loading && assignments.length === 0 && !isWorking ? (
            <div className="border border-dashed border-graphite p-4 text-center">
              <p className="text-[12px] text-ash">
                No assignments yet. The Orchestrator will dispatch one to
                this specialist when it decides to delegate.
              </p>
            </div>
          ) : null}

          {error && (
            <div className="border border-red-500/40 bg-red-950/50 px-3 py-2 text-[11px] text-red-200">
              ✗ {error}
            </div>
          )}

          {assignments.map((a) => (
            <AssignmentRow
              key={a.id}
              assignment={a}
              expanded={expandedId === a.id}
              busy={busyId === a.id}
              onToggle={() => setExpandedId((cur) => (cur === a.id ? null : a.id))}
              onApprove={() => void approve(a.id)}
              onCancel={() => void cancel(a.id)}
              onOpenOutput={(path) => openArtifactWindow(path, "note")}
              onOpenReport={(path) => openArtifactWindow(path, "report")}
            />
          ))}
        </div>
      )}

      {tab === "chat" && (
        <div className="flex-1 overflow-hidden">
          <ChatPanel
            clientSlug={clientSlug}
            target={specialistId}
            targets={targets}
            onTargetChange={onTargetChange ?? (() => undefined)}
            showTargetSelector={false}
            showHeader={false}
            onStreamDone={onStreamDone}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* live "working now" card                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Live status card shown while a job for THIS specialist is in flight.
 * Sweep work runs as jobs (not assignments), so the assignments list stays
 * empty mid-run — this card is the missing "I'm working on it" feedback the
 * desk's THINKING glow had no counterpart for in the inbox. Opens the job's
 * SSE stream for a live progress bar + latest log line, falling back to the
 * store's last message until the first event arrives.
 */
function RunningNowCard({
  slug,
  jobId,
  fallbackMessage,
}: {
  slug: string;
  jobId?: string;
  fallbackMessage: string | null;
}) {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(fallbackMessage);

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(
      `/api/jobs/${jobId}/events?slug=${encodeURIComponent(slug)}`,
    );
    es.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data) as {
          kind: string;
          progress?: number;
          message?: string;
        };
        if (typeof e.progress === "number") setProgress(e.progress);
        if (e.message) setMessage(e.message);
        if (e.kind === "done" || e.kind === "error") es.close();
      } catch {
        /* swallow malformed frames */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [slug, jobId]);

  return (
    <div className="border border-emerald-500/40 bg-emerald-500/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
          Working now
        </p>
        {jobId && (
          <span className="ml-auto font-mono text-[10px] text-ash">
            {Math.round(progress * 100)}%
          </span>
        )}
      </div>
      {jobId && (
        <div className="mt-2 h-0.5 w-full overflow-hidden bg-graphite">
          <div
            className="h-full bg-emerald-400 transition-[width] duration-200"
            style={{ width: `${Math.max(3, progress * 100)}%` }}
          />
        </div>
      )}
      <p
        className="mt-2 truncate text-[11px] text-white/80"
        title={message ?? undefined}
      >
        {message ?? "Starting…"}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* row                                                                         */
/* -------------------------------------------------------------------------- */

function AssignmentRow({
  assignment,
  expanded,
  busy,
  onToggle,
  onApprove,
  onCancel,
  onOpenOutput,
  onOpenReport,
}: {
  assignment: Assignment;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onCancel: () => void;
  onOpenOutput: (path: string) => void;
  onOpenReport: (path: string) => void;
}) {
  const canApprove =
    assignment.status === "proposed" || assignment.status === "blocked";
  const canCancel =
    assignment.status === "proposed" ||
    assignment.status === "queued" ||
    assignment.status === "running" ||
    assignment.status === "blocked";

  return (
    <div className="border border-graphite bg-charcoal">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2 text-left transition-colors hover:bg-graphite/40"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] text-white">{assignment.title}</p>
          <StatusPill status={assignment.status} size="compact" />
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ash">
          <span className="font-mono">{assignment.permission_mode}</span>
          <span>·</span>
          <time>{new Date(assignment.created_at).toLocaleString()}</time>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-graphite px-3 py-2">
          <div>
            <p className="label-micro">brief</p>
            <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-white">
              {assignment.brief}
            </p>
          </div>

          {Object.keys(assignment.payload).length > 0 && (
            <div>
              <p className="label-micro">payload</p>
              <pre className="mt-1 overflow-x-auto bg-abyss/60 px-2 py-1 font-mono text-[10px] leading-5 text-white/80">
                {JSON.stringify(assignment.payload, null, 2)}
              </pre>
            </div>
          )}

          {assignment.message && (
            <p className="text-[11px] text-ash">
              <span className="font-mono uppercase tracking-wider">last:</span>{" "}
              {assignment.message}
            </p>
          )}

          {assignment.artifact && (
            <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-wider sm:grid-cols-4">
              <ArtifactMeta label="confidence" value={assignment.artifact.confidence ?? "n/a"} />
              <ArtifactMeta
                label="source"
                value={
                  assignment.artifact.data_sources?.join(", ") ??
                  (assignment.result_data_path ? "structured" : "source note")
                }
              />
              <ArtifactMeta
                label="review"
                value={assignment.artifact.approval_status ?? "n/a"}
                attention={false}
              />
              <ArtifactMeta
                label="risk"
                value={assignment.artifact.risk_level ?? "n/a"}
                attention={assignment.artifact.risk_level === "high"}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {canApprove && (
              <button
                type="button"
                disabled={busy}
                onClick={onApprove}
                className="btn-cta disabled:opacity-50"
                style={{ padding: "4px 10px", fontSize: 11 }}
              >
                {busy ? "…" : "Approve & run"}
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="border border-graphite bg-abyss px-3 py-1 text-[11px] uppercase tracking-wider text-ash transition-colors hover:text-red-300 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            {assignment.status === "succeeded" && assignment.result_path && (
              <button
                type="button"
                onClick={() => onOpenOutput(assignment.result_path!)}
                className="border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-wider text-emerald-300 transition-colors hover:bg-emerald-500/20"
                title="Open the markdown output in the vault"
              >
                Open note
              </button>
            )}
            {assignment.status === "succeeded" && assignment.result_report_path && (
              <button
                type="button"
                onClick={() => onOpenReport(assignment.result_report_path!)}
                className="border border-gold bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-wider text-gold transition-colors hover:bg-gold/20"
                title="Open the polished HTML report inside SEO Office"
              >
                Open report
              </button>
            )}
            {assignment.job_id && (
              <span className="ml-auto font-mono text-[10px] text-ash">
                job: {assignment.job_id.slice(0, 8)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ArtifactMeta({
  label,
  value,
  attention,
}: {
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <div className="min-w-0 border border-graphite bg-abyss/50 px-2 py-1">
      <p className="truncate text-[9px] text-fg-shadow">{label}</p>
      <p className={attention ? "mt-0.5 truncate text-gold" : "mt-0.5 truncate text-ash"}>
        {value}
      </p>
    </div>
  );
}

function reportDisplayPath(href: string, label?: string): string {
  const cleanedLabel = label?.trim();
  if (cleanedLabel && !/^open report\s*→?$/i.test(cleanedLabel)) {
    return cleanedLabel;
  }
  const marker = "/reports/";
  const idx = href.indexOf(marker);
  if (idx >= 0) {
    const suffix = href.slice(idx + marker.length);
    return `reports/${decodeURIComponent(suffix)}`;
  }
  return decodeURIComponent(href.split("/").pop() || "report");
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "border-r border-graphite px-3 py-1 text-[10px] uppercase tracking-wider last:border-r-0 transition-colors " +
        (active ? "bg-gold text-abyss" : "bg-charcoal text-ash hover:text-white")
      }
    >
      {children}
    </button>
  );
}
