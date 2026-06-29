"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowStore } from "@/store/windows";
import MarkdownBody from "@/components/MarkdownBody";
import StatusPill, { type Status as OfficeStatus } from "@/components/office/StatusPill";
import type { ChatEvent, ChatTurn } from "@/lib/agents/types";
import type { BrainSuggestion } from "@/lib/brain/readiness-types";
import { publishAgenticEvent } from "@/lib/office/agentic-bus";

// Re-export so callers that imported ChatEvent from this module keep working.
export type { ChatEvent };

/* -------------------------------------------------------------------------- */
/* permission modes                                                            */
/* -------------------------------------------------------------------------- */

export type PermissionMode = "plan" | "read_only" | "auto" | "full_access";

/**
 * Each mode renders in the popover as label + tagline + glyph. The glyph is
 * a single Unicode char so we don't pull in an icon set; matches the
 * lightweight VS Code Claude "Modes" sheet visually without the dependency.
 */
const PERMISSION_OPTIONS: Array<{
  id: PermissionMode;
  label: string;
  blurb: string;
  glyph: string;
}> = [
  { id: "plan", label: "Plan mode", blurb: "Propose only. Never run without approval.", glyph: "✎" },
  { id: "read_only", label: "Read only", blurb: "Fetch + analyse. Never writes.", glyph: "◑" },
  { id: "auto", label: "Auto mode", blurb: "Run. Batch approvals for writes.", glyph: "⚡" },
  { id: "full_access", label: "Full access", blurb: "Run + auto-approve writes.", glyph: "⚙" },
];

/** Available models. Empty id = let the provider choose its default. */
const MODEL_OPTIONS: Array<{ id: string; label: string; tagline: string }> = [
  { id: "", label: "Default (recommended)", tagline: "Provider's choice for the active tier." },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", tagline: "Smartest. Slower, more expensive." },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", tagline: "Balanced quality + speed." },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", tagline: "Fastest, cheapest." },
];

/* -------------------------------------------------------------------------- */
/* attachments                                                                 */
/* -------------------------------------------------------------------------- */

interface AttachmentRef {
  sha256: string;
  filename: string;
  mime: string;
  size: number;
  preview_url?: string;
}

const MAX_ATTACHMENTS_PER_TURN = 5;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* assignment shape (matches the server's Assignment row)                      */
/* -------------------------------------------------------------------------- */

export type AssignmentStatus =
  | "proposed"
  | "queued"
  | "running"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled";

interface ChatAssignment {
  id: string;
  specialist_id: string;
  title: string;
  status: AssignmentStatus;
  permission_mode: PermissionMode;
  job_id: string | null;
}

type SweepStatus =
  | "planned"
  | "blocked"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

type SweepPhase = "intake" | "diagnostic" | "discovery" | "synthesis" | "final";

interface SweepChildSummary {
  task_id: string;
  specialist_id: string;
  title: string;
  status: SweepStatus;
  phase: SweepPhase | null;
  result_summary: string | null;
  skipped: boolean;
}

interface SweepView {
  root_task_id: string;
  client_slug: string;
  title: string;
  status: SweepStatus;
  updated_at: string;
  totals: {
    all: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    skipped: number;
    running: number;
    queued: number;
    planned_or_blocked: number;
  };
  current_phase: SweepPhase | null;
  children: SweepChildSummary[];
  final_summary?: string | null;
}

/* -------------------------------------------------------------------------- */
/* turn shape                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `ChatEvent` + `ChatTurn` are now defined canonically in
 * `src/lib/agents/types.ts` so the SSE route on the server and this
 * renderer speak the same union. The two extra UI-only fields stay
 * here as a thin local extension.
 */
type LocalChatTurn = ChatTurn & {
  /** UI-only: true on optimistic user turns that failed to POST; the
   *  composer shows a retry chip and the server has no record of them. */
  failed?: boolean;
  /** UI-only: while the agentic stream is in flight, the renderer
   *  shows the pending events on this transient turn. Replaced by the
   *  persisted turn on completion. */
  streaming?: boolean;
};

interface Props {
  clientSlug: string;
  target: string;
  targets: Array<{ id: string; name: string }>;
  onTargetChange: (next: string) => void;
  onProposeRun?: (specialistId: string) => void;
  /** Optional callback fired when the user clicks an inline specialist id
   *  inside an assistant message (e.g. `sitemap-architect`). When
   *  omitted, the click falls back to switching the chat target to that
   *  specialist so something still happens. */
  onFocusSpecialist?: (specialistId: string) => void;
  /** Embedded specialist inboxes already provide the target in their header. */
  showTargetSelector?: boolean;
  /** Hide the entire "CHATTING WITH …" header row. Used by SpecialistInbox
   *  which already renders its own "SPECIALIST …" header above the tab bar,
   *  so without this we get a doubled name row in specialist windows. */
  showHeader?: boolean;
  /** Background sweep narration only needs polling while a sweep/job is live. */
  enableLivePolling?: boolean;
  /** Fired exactly once when an in-flight chat stream finishes — naturally
   *  (server `done` frame), via Stop, or via error/network drop. Receives
   *  the `target` that just finished replying. The office workspace uses
   *  this to mark the specialist as recently-active so their desk monitor
   *  + hologram stay visible for the post-activity window instead of
   *  going dark immediately after the assistant's last token. */
  onStreamDone?: (target: string) => void;
}

/* -------------------------------------------------------------------------- */
/* component                                                                   */
/* -------------------------------------------------------------------------- */

export default function ChatPanel({
  clientSlug,
  target,
  targets,
  onTargetChange,
  onProposeRun,
  onFocusSpecialist,
  showTargetSelector = true,
  showHeader = true,
  enableLivePolling = false,
  onStreamDone,
}: Props) {
  // Stable ref for the callback so the stream-done firing in the `finally`
  // block doesn't depend on prop identity (parents that re-render frequently
  // would otherwise risk the closure capturing a stale handler — though here
  // we're inside an async function call site, the ref keeps us defensive).
  const onStreamDoneRef = useRef(onStreamDone);
  useEffect(() => {
    onStreamDoneRef.current = onStreamDone;
  }, [onStreamDone]);
  const [turns, setTurns] = useState<LocalChatTurn[]>([]);
  // Mirror of `turns` for the live-refresh poll's closure — lets us read
  // the latest cursor (last turn's ts) without re-creating the interval
  // on every state change. Kept in sync by a single tiny effect below.
  const turnsRef = useRef<LocalChatTurn[]>([]);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  // Streaming-only chat — the single-shot `/api/chat` path was removed.
  // Ref to the in-flight stream's AbortController; Stop calls .abort().
  // Mirrored into `streamReady` state so render reflects abort
  // availability — refs aren't a render input.
  const streamAbortRef = useRef<AbortController | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposed, setProposed] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<ChatAssignment | null>(null);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("auto");
  // Empty string means "use the provider default" — same convention as
  // MODEL_OPTIONS[0].id and the server's writeChatMeta(model: null).
  const [model, setModel] = useState<string>("");
  const [thinking, setThinking] = useState<boolean>(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Clicks on paths / reports inside an assistant message now dispatch into
  // the window store as proper OS windows (`kind:"note"`). The previous
  // ArtifactSlideOver pattern was a viewport-fixed overlay that (a) got
  // trapped inside framer-motion's transform containing-block when ChatPanel
  // ran inside a Window, and (b) didn't match the OS metaphor.
  const openWindow = useWindowStore((s) => s.open);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function openLatestSuggestions() {
      if (target !== "orchestrator") return;
      let attempts = 0;
      function activateLatestSuggestion() {
        const root = scrollRef.current;
        const cards = root?.querySelectorAll<HTMLElement>("[data-brain-suggestions]");
        const last = cards?.[cards.length - 1];
        if (!last) {
          attempts += 1;
          if (attempts < 20) window.setTimeout(activateLatestSuggestion, 100);
          return;
        }
        last.scrollIntoView({ block: "center", behavior: "smooth" });
        const firstCta = last.querySelector<HTMLElement>("[data-brain-suggestion-cta]");
        firstCta?.focus();
        firstCta?.click();
      }
      requestAnimationFrame(activateLatestSuggestion);
    }
    window.addEventListener("seo-office:open-suggestions", openLatestSuggestions);
    return () =>
      window.removeEventListener("seo-office:open-suggestions", openLatestSuggestions);
  }, [target]);

  // The set of specialist ids the MarkdownBody is allowed to promote into
  // clickable hotspots. Derived from `targets`; "orchestrator" excluded so
  // the literal word in an assistant message doesn't become a link.
  const knownSpecialistIds = useMemo(
    () => new Set(targets.map((t) => t.id).filter((id) => id !== "orchestrator")),
    [targets],
  );

  const handleOpenPath = useCallback(
    (clickedPath: string, kind: "note" | "folder" = "note") => {
      // Folders don't have a viewer yet — fall back to the file row's
      // existing behaviour by no-oping (the click in the brain graph
      // still focuses the brain camera). Notes open as proper windows.
      if (kind === "folder") return;
      const title = clickedPath.split("/").pop() ?? clickedPath;
      openWindow({
        kind: "note",
        title,
        icon: "📄",
        identityKey: `note:${clientSlug}:${clickedPath}`,
        contentProps: { clientSlug, path: clickedPath },
        w: 720,
        h: 620,
      });
    },
    [clientSlug, openWindow],
  );

  const handleOpenReport = useCallback(
    (href: string, label?: string) => {
      const title = label ?? reportDisplayPath(href, label) ?? "Report";
      openWindow({
        kind: "note",
        title,
        icon: "🌐",
        identityKey: `note:${clientSlug}:${href}`,
        // path can be a same-origin /api/... URL; NoteWindow's detectKind
        // treats those as external-url and iframes them.
        contentProps: { clientSlug, path: href },
        w: 900,
        h: 700,
      });
    },
    [clientSlug, openWindow],
  );

  const handleFocusSpecialist = useCallback(
    (specialistId: string) => {
      if (onFocusSpecialist) {
        onFocusSpecialist(specialistId);
        return;
      }
      // Fallback: at least swap the chat target so the click does
      // something visible even when the host hasn't wired the focus.
      if (knownSpecialistIds.has(specialistId)) onTargetChange(specialistId);
    },
    [onFocusSpecialist, onTargetChange, knownSpecialistIds],
  );

  const refreshHistoryAfterTerminalSweep = useCallback(async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const ac = new AbortController();
      const latest = await fetchHistoryWithRetry(clientSlug, target, ac.signal).catch(
        () => null,
      );
      if (latest) {
        setTurns((prev) => mergeTurns(prev, latest));
        const combined = latest.map((turn) => turn.content).join("\n\n");
        if (/Your SEO brain is ready for review/i.test(combined)) {
          return;
        }
      }
      await sleep(750);
    }
  }, [clientSlug, target]);

  useEffect(() => {
    const ac = new AbortController();
    // Reset the visible chat the moment the target changes so the *previous*
    // target's history never flashes on screen while we're loading the new
    // one. This also fixes the "late response lands in wrong target" race:
    // even if the previous fetch's resolution were still in flight, its
    // setTurns wouldn't survive this clear.
    // React 19's set-state-in-effect rule flags this, but it's the right
    // shape here — the resets are scoped to the same render that kicks the
    // fetch off, and the AbortController guards against late writes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurns([]);
    setError(null);
    setProposed(null);

    void fetchHistoryWithRetry(clientSlug, target, ac.signal)
      .then((turns) => {
        if (!ac.signal.aborted) setTurns(turns);
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          const message = err instanceof Error ? err.message : String(err);
          setError(`Couldn't load chat history: ${message}`);
        }
      });
    // Per-conversation meta — permission mode, model, thinking all
    // survive a refresh. One GET pulls all three.
    void fetch(
      `/api/chat/meta?slug=${encodeURIComponent(clientSlug)}&target=${encodeURIComponent(target)}`,
      { signal: ac.signal },
    )
      .then((r) => r.json())
      .then(
        (data: {
          ok: boolean;
          meta?: { permission_mode?: PermissionMode; model?: string; thinking?: boolean };
        }) => {
          if (!ac.signal.aborted && data.ok && data.meta) {
            if (data.meta.permission_mode) setPermissionMode(data.meta.permission_mode);
            setModel(data.meta.model ?? "");
            setThinking(Boolean(data.meta.thinking));
          }
        },
      )
      .catch(() => undefined);
    return () => ac.abort();
  }, [clientSlug, target]);

  // Live-refresh poll for the orchestrator chat. Picks up narration
  // messages written server-side by the chat-narrator (sweep kickoff,
  // per-specialist completions, final summary) without waiting for a
  // manual page reload. Only runs for the orchestrator target — specialist
  // inboxes don't currently emit background-written messages.
  //
  // We poll every 3 seconds with a `since` cursor that's the latest turn
  // we already have, so the response is empty most of the time. New turns
  // are de-duped by id before append, so a concurrent send-from-user can't
  // double up if its turn lands in both the local state and a poll
  // response.
  useEffect(() => {
    if (target !== "orchestrator") return;
    if (!enableLivePolling || pending || streamReady) return;
    let cancelled = false;
    const POLL_INTERVAL_MS = 3000;

    async function pollOnce() {
      // Read the latest ts directly off the rendered list. Using a ref
      // would be slightly leaner but the closure is fine — useEffect
      // re-runs on every target change, and turns is appended via
      // setTurns (which is stable). For mid-burst pulls we just read
      // from `turns` at fire time.
      const latestTs =
        turnsRef.current.length > 0
          ? turnsRef.current[turnsRef.current.length - 1].ts
          : "";
      const qs = new URLSearchParams({ slug: clientSlug, target });
      if (latestTs) qs.set("since", latestTs);
      try {
        const r = await fetch(`/api/chat/history?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const data = (await r.json()) as { ok: boolean; turns?: ChatTurn[] };
        if (cancelled || !data.ok || !data.turns || data.turns.length === 0) return;
        // De-dupe by id before append: the server's `since` filter is
        // strictly greater-than on ts, but a turn written at the exact
        // same millisecond as our cursor could slip through in theory.
        setTurns((prev) => {
          return mergeTurns(prev, data.turns!);
        });
      } catch {
        /* network blip — try again on the next tick */
      }
    }

    void pollOnce();
    const iv = setInterval(pollOnce, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void pollOnce();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clientSlug, target, enableLivePolling, pending, streamReady]);

  const patchMeta = useCallback(
    (patch: { permission_mode?: PermissionMode; model?: string | null; thinking?: boolean }) => {
      void fetch("/api/chat/meta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSlug, target, ...patch }),
      }).catch(() => undefined);
    },
    [clientSlug, target],
  );

  function changePermissionMode(next: PermissionMode) {
    setPermissionMode(next);
    patchMeta({ permission_mode: next });
  }

  function changeModel(next: string) {
    setModel(next);
    // Empty string → null on the wire (resets to provider default).
    patchMeta({ model: next === "" ? null : next });
  }

  function changeThinking(next: boolean) {
    setThinking(next);
    patchMeta({ thinking: next });
  }

  async function clearConversation() {
    const ok = confirm(
      "Clear this conversation? The on-disk turns will be deleted; attachments stay (they're content-addressed).",
    );
    if (!ok) return;
    try {
      await fetch(
        `/api/chat/history?slug=${encodeURIComponent(clientSlug)}&target=${encodeURIComponent(target)}`,
        { method: "DELETE" },
      );
      setTurns([]);
      setError(null);
      setProposed(null);
      setAssignment(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function approveAssignment(id: string) {
    try {
      const r = await fetch(
        `/api/assignments/${id}/approve?slug=${encodeURIComponent(clientSlug)}`,
        { method: "POST" },
      );
      const data = await r.json();
      if (r.ok && data.ok && data.assignment) {
        setAssignment(data.assignment as ChatAssignment);
      } else {
        setError(data.error ?? `HTTP ${r.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function discardAssignment(id: string) {
    try {
      await fetch(
        `/api/assignments/${id}?slug=${encodeURIComponent(clientSlug)}`,
        { method: "DELETE" },
      );
      setAssignment(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    const remainingSlots = MAX_ATTACHMENTS_PER_TURN - pendingAttachments.length;
    if (remainingSlots <= 0) {
      setError(`max ${MAX_ATTACHMENTS_PER_TURN} attachments per message`);
      return;
    }
    const queue = list.slice(0, remainingSlots);
    setUploading(true);
    setError(null);
    for (const file of queue) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${file.name}: file too large (max 25 MB)`);
        continue;
      }
      try {
        const form = new FormData();
        form.set("clientSlug", clientSlug);
        form.set("file", file);
        const r = await fetch("/api/chat/attachments", {
          method: "POST",
          body: form,
        });
        const data = await r.json();
        if (!r.ok || !data.ok) {
          setError(data.error ?? `HTTP ${r.status}`);
          continue;
        }
        const att = data.attachment as AttachmentRef;
        // Match the server: preview_url already starts with /api; tack
        // on the slug query for the GET endpoint.
        const previewUrl =
          att.preview_url ?? `/api/chat/attachments/${att.sha256}`;
        const ref: AttachmentRef = {
          ...att,
          preview_url: `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}slug=${encodeURIComponent(clientSlug)}`,
        };
        setPendingAttachments((prev) =>
          prev.some((p) => p.sha256 === ref.sha256) ? prev : [...prev, ref],
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    setUploading(false);
  }

  function removePendingAttachment(sha256: string) {
    setPendingAttachments((prev) => prev.filter((p) => p.sha256 !== sha256));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void uploadFiles(files);
    }
  }

  // "Is the user currently parked at the bottom of the scroll viewport?"
  // Maintained by the scroll listener (`onScroll` on the scroll container,
  // wired in the JSX). Used by the auto-scroll effect below to decide
  // whether to yank the viewport to the latest turn. Without this gate,
  // the panel would scroll-snap on every new turn even when the user has
  // deliberately scrolled UP to read earlier content — a known UX
  // anti-pattern ("auto-scroll fights manual scroll"). 96px tolerance so
  // the last line of a partially-visible long turn still counts as "near
  // bottom" — strictly equal would fail any time the user was reading
  // one line above the actual end.
  const atBottomRef = useRef(true);
  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distanceFromBottom < 96;
  }
  useEffect(() => {
    if (!scrollRef.current) return;
    // Only auto-scroll when the user was already at/near the bottom OR when
    // they just sent a message (pending=true) — in the latter case it's
    // their own action that just landed, so following the cursor down is
    // expected. New assistant turns + streaming deltas otherwise leave the
    // viewport wherever the user parked it.
    if (!atBottomRef.current && !pending) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length, pending]);

  async function send() {
    const message = input.trim();
    if (!message || pending) return;
    setInput("");
    setPending(true);
    setError(null);
    setProposed(null);
    setAssignment(null);
    // Optimistic local id so we can match the server's response back and
    // (more importantly) remove the user turn if the POST fails.
    const optimisticId = `local-${cryptoRandomId()}`;
    const streamingTurnId = `local-stream-${cryptoRandomId()}`;
    const userTurn: ChatTurn = {
      id: optimisticId,
      role: "user",
      content: message,
      ts: new Date().toISOString(),
      ...(pendingAttachments.length > 0
        ? { attachments: pendingAttachments }
        : {}),
    };
    setTurns((prev) => [...prev, userTurn]);
    const sentAttachments = pendingAttachments;
    setPendingAttachments([]);

    // Every chat turn now flows through the streaming backend — the
    // single-shot `/api/chat` path was removed when "AGENTIC" became the
    // only mode. The legacy `mode: "simple"` JSONL rows still render
    // (without the ⚯ badge) for back-compat.
    try {
      await sendStream(message, optimisticId, streamingTurnId, sentAttachments);
    } finally {
      setPending(false);
    }
  }

  /**
   * Streaming agentic send — POSTs to `/api/chat/stream` and consumes
   * the SSE response body chunk-by-chunk via fetch + ReadableStream
   * (EventSource is GET-only so we hand-roll the SSE parser).
   *
   * Side-effects: pushes a transient assistant turn marked
   * `streaming: true` onto `turns`; mutates its `content` + `events`
   * as deltas arrive. On `done`, flips `streaming` off so the renderer
   * stops showing the live indicator. The persisted ChatTurn the
   * server writes to JSONL is byte-identical to what we accumulated
   * here, so we don't re-fetch history.
   */
  async function sendStream(
    message: string,
    userTurnId: string,
    streamingTurnId: string,
    attachments: AttachmentRef[],
  ) {
    const ac = new AbortController();
    streamAbortRef.current = ac;
    setStreamReady(true);
    // Insert a transient assistant turn we'll mutate as events arrive.
    setTurns((prev) => [
      ...prev,
      {
        id: streamingTurnId,
        role: "assistant",
        content: "",
        ts: new Date().toISOString(),
        mode: "agentic",
        events: [],
        streaming: true,
      },
    ]);

    function patchStreamingTurn(
      patch: (t: LocalChatTurn) => LocalChatTurn,
    ): void {
      setTurns((prev) =>
        prev.map((t) => (t.id === streamingTurnId ? patch(t) : t)),
      );
    }

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientSlug,
          target,
          message,
          permissionMode,
          userTurnId,
          assistantTurnId: streamingTurnId,
          ...(model ? { model } : {}),
          ...(attachments.length > 0
            ? { attachments: attachments.map((a) => ({ sha256: a.sha256 })) }
            : {}),
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        let serverError: string | undefined;
        try {
          const j = await res.json();
          serverError = j?.error;
        } catch {
          /* fall through */
        }
        setError(serverError ?? `HTTP ${res.status}`);
        // Mark the optimistic user turn failed and drop the empty
        // streaming assistant. Restore the attachments so the user can
        // retry without re-uploading.
        setTurns((prev) =>
          prev
            .filter((t) => t.id !== streamingTurnId)
            .map((t) => (t.id === userTurnId ? { ...t, failed: true } : t)),
        );
        setPendingAttachments(attachments);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE frames are separated by blank lines. Walk the buffer
        // until no complete frame remains, then keep the tail for the
        // next read.
        let frameEnd: number;
        while ((frameEnd = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, frameEnd);
          buf = buf.slice(frameEnd + 2);
          handleSseFrame(frame, patchStreamingTurn, (ev) =>
            publishAgenticEvent(clientSlug, ev),
          );
        }
      }
    } catch (err) {
      const isAbort =
        err instanceof DOMException && err.name === "AbortError";
      if (isAbort) {
        // User clicked Stop — mark the turn interrupted but keep its
        // accumulated content + events visible.
        patchStreamingTurn((t) => ({
          ...t,
          streaming: false,
          interrupted: true,
        }));
      } else {
        setError(err instanceof Error ? err.message : String(err));
        patchStreamingTurn((t) => ({ ...t, streaming: false }));
      }
    } finally {
      // Flush the "streaming" flag in case the loop exited without a
      // `done` frame (network drop etc.).
      patchStreamingTurn((t) => ({ ...t, streaming: false }));
      streamAbortRef.current = null;
      setStreamReady(false);
      // Tell the parent that *this* target's stream finished — natural,
      // aborted, or errored, all reach here. The office workspace uses
      // this to keep the desk visibly *present* during the 5-minute
      // post-activity window so specialists don't blink off the moment
      // they finish replying.
      onStreamDoneRef.current?.(target);
    }
  }

  function stopStream() {
    streamAbortRef.current?.abort();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;

    // Ctrl/Cmd+Enter → insert newline at the cursor. Textareas don't do this
    // natively (Ctrl+Enter has no default text-insert behavior), so we splice
    // the value manually and restore the caret one position past the \n.
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      setInput((cur) => cur.slice(0, start) + "\n" + cur.slice(end));
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 1;
      });
      return;
    }

    // Shift+Enter → let the browser insert \n natively (standard chat UX).
    if (e.shiftKey) return;

    // Plain Enter → send.
    e.preventDefault();
    void send();
  }

  const targetName = targets.find((t) => t.id === target)?.name ?? target;
  const hasFinalBrainSummaryTurn = turns.some(
    (t) =>
      t.role === "assistant" &&
      /Your SEO brain is ready for review/i.test(t.content),
  );
  const hasVisibleStreamingTurn = turns.some(
    (t) =>
      t.role === "assistant" &&
      t.streaming &&
      ((t.content?.trim().length ?? 0) > 0 || (t.events?.length ?? 0) > 0),
  );
  const showThinkingRow = pending && !hasVisibleStreamingTurn;

  return (
    <div className="flex h-full flex-col">
      {/* Artifact clicks now dispatch into the window store (handleOpenPath /
          handleOpenReport call openWindow). The previous inline slide-over
          got trapped inside framer-motion's transform containing-block when
          ChatPanel ran inside a Window — see commit 1651654 for context. */}

      {/* Header is back to its tight v0.1.7 shape — the permission-mode
          control moved into the bottom composer toolbar (Claude Code-style)
          so it lives next to the textarea where decisions are actually made. */}
      {showHeader && (
        <header className="flex items-center justify-between gap-2 border-b border-graphite bg-abyss px-4 py-3">
          <div className="min-w-0">
            <p className="label-micro">chatting with</p>
            <p className="mt-0.5 truncate text-sm font-medium uppercase tracking-wider text-white">
              {targetName}
            </p>
          </div>
          {showTargetSelector && (
            <select
              value={target}
              onChange={(e) => onTargetChange(e.target.value)}
              className="border border-graphite bg-charcoal px-2 py-1 text-[11px] uppercase tracking-wider text-white focus:border-gold focus:outline-none"
            >
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </header>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-3 overflow-y-auto bg-iron px-4 py-4"
      >
        {turns.length === 0 && !pending ? (
          <div className="border border-dashed border-graphite p-4 text-center">
            <p className="text-[12px] text-ash">
              {target === "orchestrator"
                ? "Ask the orchestrator what to do next or have it summarise the latest audit."
                : `Ask the ${targetName.toLowerCase()} about your site or about their last audit.`}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-fg-shadow">
              try: &quot;what should i do next?&quot;
            </p>
          </div>
        ) : null}

        {target === "orchestrator" && (
          <LiveSweepRunPanel
            key={clientSlug}
            clientSlug={clientSlug}
            liveHint={enableLivePolling || pending || streamReady}
            hasFinalBrainSummaryTurn={hasFinalBrainSummaryTurn}
            onOpenPath={handleOpenPath}
            onOpenReport={handleOpenReport}
            onProposeRun={onProposeRun}
            onFocusSpecialist={handleFocusSpecialist}
            knownSpecialistIds={knownSpecialistIds}
            onTerminalRefresh={() => {
              if (!pending && !streamReady) void refreshHistoryAfterTerminalSweep();
            }}
          />
        )}

        {dedupeTurnsById(turns).map((t, i) => {
          const hideEmptyStreamingTurn =
            t.role === "assistant" &&
            t.streaming &&
            t.content.trim().length === 0 &&
            (t.events?.length ?? 0) === 0 &&
            (t.attachments?.length ?? 0) === 0;
          if (hideEmptyStreamingTurn) return null;
          return (
            <Bubble
              key={t.id ?? `legacy-${i}`}
              turn={t}
              clientSlug={clientSlug}
              onOpenPath={handleOpenPath}
              onOpenReport={handleOpenReport}
              onProposeRun={onProposeRun}
              onFocusSpecialist={handleFocusSpecialist}
              knownSpecialistIds={knownSpecialistIds}
            />
          );
        })}

        {showThinkingRow && (
          <div className="border border-graphite bg-charcoal px-3 py-2 text-[11px] uppercase tracking-wider text-ash">
            <span className="inline-block h-2 w-2 animate-pulse bg-gold" /> thinking…
          </div>
        )}

        {error && (
          <div className="border border-red-500/40 bg-red-950/50 px-3 py-2 text-[11px] text-red-200">
            ✗ {error}
          </div>
        )}

        {assignment && (
          <AssignmentCard
            assignment={assignment}
            onApprove={() => void approveAssignment(assignment.id)}
            onDiscard={() => void discardAssignment(assignment.id)}
          />
        )}

        {!assignment && proposed && (
          <div className="border border-gold bg-abyss px-3 py-2">
            <p className="label-micro" style={{ color: "var(--accent-gold)" }}>
              proposed action
            </p>
            <p className="mt-1 text-[12px] text-white">
              run <span className="font-mono text-gold">{proposed}</span>
            </p>
            <button
              onClick={() => {
                onProposeRun?.(proposed);
                setProposed(null);
              }}
              className="btn-cta mt-2"
              style={{ padding: "6px 12px", fontSize: 11 }}
            >
              Run {proposed}
            </button>
          </div>
        )}
      </div>

      <div
        className={
          "relative border-t border-graphite bg-abyss p-3 " +
          (dragOver ? "ring-2 ring-inset ring-gold" : "")
        }
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-abyss/80 text-[12px] uppercase tracking-wider text-gold">
            drop to attach
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingAttachments.map((att) => (
              <AttachmentChip
                key={att.sha256}
                attachment={att}
                onRemove={() => removePendingAttachment(att.sha256)}
              />
            ))}
          </div>
        )}

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={2}
          placeholder={pending ? "" : "type — Enter to send · Shift/Ctrl+Enter for new line"}
          disabled={pending}
          className="w-full resize-none border border-graphite bg-charcoal px-3 py-2 text-sm text-white placeholder:text-fg-shadow focus:border-gold focus:outline-none"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              void uploadFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          {/* Left toolbar group: "+" context menu (VS Code-style). */}
          <div className="flex items-center gap-2">
            <IconButton
              ariaLabel="More actions"
              title="More actions"
              onClick={() => setPlusMenuOpen((cur) => !cur)}
              isOpen={plusMenuOpen}
              disabled={pending}
            >
              <PlusIcon />
            </IconButton>

            {plusMenuOpen && (
              <Popover
                onClose={() => setPlusMenuOpen(false)}
                anchor="bottom-left"
              >
                <PopoverGroup label="Context">
                  <PopoverItem
                    icon={<PaperclipIcon />}
                    label="Upload from computer"
                    hint={uploading ? "uploading…" : undefined}
                    disabled={
                      pending ||
                      uploading ||
                      pendingAttachments.length >= MAX_ATTACHMENTS_PER_TURN
                    }
                    onClick={() => {
                      setPlusMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  />
                  <PopoverItem
                    icon={<TrashIcon />}
                    label="Clear conversation"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      void clearConversation();
                    }}
                  />
                </PopoverGroup>

                <PopoverGroup label="Model">
                  <PopoverSubmenu
                    icon={<CpuIcon />}
                    label="Switch model"
                    valueLabel={
                      MODEL_OPTIONS.find((m) => m.id === model)?.label ??
                      "Default (recommended)"
                    }
                  >
                    {MODEL_OPTIONS.map((opt) => (
                      <PopoverItem
                        key={opt.id || "default"}
                        label={opt.label}
                        hint={opt.tagline}
                        checked={opt.id === model}
                        onClick={() => {
                          changeModel(opt.id);
                          setPlusMenuOpen(false);
                        }}
                      />
                    ))}
                  </PopoverSubmenu>
                  <PopoverItem
                    icon={<SparkIcon />}
                    label="Thinking"
                    toggle={thinking}
                    hint={
                      thinking
                        ? "Extended reasoning enabled."
                        : "Tap to enable extended reasoning."
                    }
                    onClick={() => changeThinking(!thinking)}
                  />
                </PopoverGroup>
              </Popover>
            )}
          </div>

          {/* Right toolbar group: permission-mode picker + stop + send.
              The legacy Agentic toggle is gone — every turn now streams. */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setModeMenuOpen((cur) => !cur)}
                title="Permission mode"
                aria-label="Permission mode"
                aria-haspopup="menu"
                aria-expanded={modeMenuOpen}
                className={
                  "flex items-center gap-1.5 border border-graphite bg-charcoal px-2 py-1 text-[11px] uppercase tracking-wider transition-colors hover:text-gold " +
                  (modeMenuOpen ? "text-gold" : "text-ash")
                }
              >
                <span className="text-[12px] leading-none">
                  {PERMISSION_OPTIONS.find((o) => o.id === permissionMode)?.glyph ?? "⚡"}
                </span>
                <span>
                  {PERMISSION_OPTIONS.find((o) => o.id === permissionMode)?.label ?? "Mode"}
                </span>
                <ChevronUpIcon />
              </button>

              {modeMenuOpen && (
                <Popover
                  onClose={() => setModeMenuOpen(false)}
                  anchor="bottom-right"
                >
                  <PopoverGroup label="Modes">
                    {PERMISSION_OPTIONS.map((opt) => (
                      <PopoverItem
                        key={opt.id}
                        icon={
                          <span className="text-[14px] leading-none">{opt.glyph}</span>
                        }
                        label={opt.label}
                        hint={opt.blurb}
                        checked={opt.id === permissionMode}
                        onClick={() => {
                          changePermissionMode(opt.id);
                          setModeMenuOpen(false);
                        }}
                      />
                    ))}
                  </PopoverGroup>
                </Popover>
              )}
            </div>

            {/* Send/Stop — single slot that swaps based on whether a
                stream is in flight. While the agent is processing, the
                Send button is replaced by Stop so the user can interrupt
                without an extra control taking up resting-state real
                estate. */}
            {streamReady ? (
              <button
                type="button"
                onClick={stopStream}
                className="border border-red-500/60 bg-red-950/40 px-3 py-1.5 text-[11px] uppercase tracking-wider text-red-200 transition-colors hover:bg-red-950/60"
                style={{ fontSize: 11, padding: "6px 14px" }}
                title="Stop the agent and persist what it produced so far"
              >
                ◼ Stop
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={!input.trim() || pending}
                className="btn-cta"
                style={{ fontSize: 11, padding: "6px 14px" }}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* composer popover primitives                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Small icon button used in the composer toolbar. Matches the VS Code
 * Claude extension's "+" button visually — square outline, transparent
 * background, icon centered, gold accent on hover or when the linked
 * popover is open.
 */
function IconButton({
  children,
  ariaLabel,
  title,
  onClick,
  disabled,
  isOpen,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  isOpen?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={isOpen ?? false}
      title={title ?? ariaLabel}
      className={
        "inline-flex h-7 w-7 items-center justify-center border border-graphite bg-charcoal transition-colors hover:text-gold disabled:opacity-50 " +
        (isOpen ? "text-gold" : "text-ash")
      }
    >
      {children}
    </button>
  );
}

/**
 * Popover container — absolute-positioned panel that closes on outside
 * click or Escape. Lightweight enough to inline here; if we add a third
 * popover anywhere it can lift to its own file.
 */
function Popover({
  children,
  onClose,
  anchor,
}: {
  children: React.ReactNode;
  onClose: () => void;
  /** Where the popover sits relative to its parent. The parent must be
   *  `position: relative`. We currently anchor above the trigger so the
   *  composer toolbar opens its menus upward, away from the keyboard. */
  anchor: "bottom-left" | "bottom-right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDocPointer(e: PointerEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      className={
        "absolute bottom-full z-30 mb-1 w-72 border border-graphite bg-abyss/95 shadow-xl backdrop-blur " +
        (anchor === "bottom-left" ? "left-0" : "right-0")
      }
    >
      {children}
    </div>
  );
}

function PopoverGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-graphite/60 last:border-b-0">
      <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-fg-shadow">
        {label}
      </p>
      <div className="pb-1">{children}</div>
    </div>
  );
}

/**
 * Single popover row. Renders icon + label + optional check/toggle/hint.
 * Click handler fires unconditionally — the parent decides whether to
 * close the menu afterwards.
 */
function PopoverItem({
  icon,
  label,
  hint,
  onClick,
  disabled,
  checked,
  toggle,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  checked?: boolean;
  toggle?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-white transition-colors hover:bg-graphite/40 disabled:opacity-50"
    >
      {icon && (
        <span className="flex h-4 w-4 items-center justify-center text-ash">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span className="max-w-32 truncate text-[10px] text-fg-shadow">{hint}</span>
      )}
      {checked && <CheckIcon />}
      {toggle !== undefined && <ToggleIcon active={toggle} />}
    </button>
  );
}

/**
 * Collapsible submenu inside the popover. Used for "Switch model" so the
 * user picks an option without the popover closing under them.
 */
function PopoverSubmenu({
  icon,
  label,
  valueLabel,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  valueLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((cur) => !cur)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-white transition-colors hover:bg-graphite/40"
      >
        {icon && (
          <span className="flex h-4 w-4 items-center justify-center text-ash">
            {icon}
          </span>
        )}
        <span className="flex-1 truncate">{label}</span>
        <span className="max-w-36 truncate text-[10px] text-fg-shadow">
          {valueLabel}
        </span>
        <ChevronRightIcon rotated={open} />
      </button>
      {open && <div className="border-t border-graphite/60 bg-charcoal/40">{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* icons (inline SVG so we don't pull in an icon set)                          */
/* -------------------------------------------------------------------------- */

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 15 12 9 18 15" />
    </svg>
  );
}

function ChevronRightIcon({ rotated }: { rotated?: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={"transition-transform " + (rotated ? "rotate-90" : "")}
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-gold">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function CpuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4" />
    </svg>
  );
}

function ToggleIcon({ active }: { active: boolean }) {
  return (
    <span
      role="switch"
      aria-checked={active}
      className={
        "relative inline-block h-3 w-6 rounded-full transition-colors " +
        (active ? "bg-gold" : "bg-graphite")
      }
    >
      <span
        className={
          "absolute top-0.5 inline-block h-2 w-2 rounded-full bg-white transition-transform " +
          (active ? "translate-x-3.5" : "translate-x-0.5")
        }
      />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* attachment chip (composer)                                                  */
/* -------------------------------------------------------------------------- */

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: AttachmentRef;
  onRemove: () => void;
}) {
  const isImage = attachment.mime.startsWith("image/");
  return (
    <div className="group relative flex items-center gap-2 border border-graphite bg-charcoal px-2 py-1 text-[11px] text-white">
      {isImage && attachment.preview_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.preview_url}
          alt={attachment.filename}
          className="h-8 w-8 object-cover"
        />
      ) : (
        <span className="font-mono text-[10px] uppercase tracking-wider text-ash">
          {attachment.mime.split("/")[1]?.toUpperCase() ?? "FILE"}
        </span>
      )}
      <span className="max-w-40 truncate" title={attachment.filename}>
        {attachment.filename}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove attachment"
        className="text-ash transition-colors hover:text-red-300"
      >
        ×
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* assignment card                                                             */
/* -------------------------------------------------------------------------- */

const STATUS_PILL_STYLES: Record<AssignmentStatus, string> = {
  proposed: "bg-slate-700 text-slate-100",
  queued: "bg-yellow-700 text-yellow-100",
  running: "bg-orange-700 text-orange-100 animate-pulse",
  blocked: "bg-purple-700 text-purple-100",
  succeeded: "bg-emerald-700 text-emerald-100",
  failed: "bg-red-700 text-red-100",
  cancelled: "bg-stone-700 text-stone-200",
};

function AssignmentCard({
  assignment,
  onApprove,
  onDiscard,
}: {
  assignment: ChatAssignment;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  const showActions =
    assignment.status === "proposed" || assignment.status === "blocked";

  return (
    <div className="border border-gold bg-abyss px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="label-micro" style={{ color: "var(--accent-gold)" }}>
          assignment
        </p>
        <span
          className={`px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_PILL_STYLES[assignment.status]}`}
        >
          {assignment.status}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-white">{assignment.title}</p>
      <p className="mt-1 text-[11px] text-ash">
        <span className="font-mono">{assignment.specialist_id}</span>
        <span className="mx-1">·</span>
        <span className="font-mono">{assignment.permission_mode}</span>
      </p>
      {showActions && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={onApprove}
            className="btn-cta"
            style={{ padding: "6px 12px", fontSize: 11 }}
          >
            Approve & run
          </button>
          <button
            onClick={onDiscard}
            className="border border-graphite bg-charcoal px-3 py-1 text-[11px] uppercase tracking-wider text-ash transition-colors hover:text-white"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Strip stray PROPOSED ACTION tags that pre-strip API calls may have missed
 *  (legacy turns persisted before the stripper landed). */
const PROPOSED_RE = /\n*\[PROPOSED ACTION:\s*run-[a-z0-9-]+\s*\]\s*$/i;

function normalizeAssistantContent(content: string): string {
  return content
    .replace(PROPOSED_RE, "")
    .replace(/^(\s*-\s+`[^`]+`)\s+—\s+`spawning`\s*$/gm, "$1")
    .trim();
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 12);
}

/**
 * Parse one SSE frame and dispatch its payload onto the streaming
 * assistant turn. Frames look like:
 *
 *   event: text_delta
 *   data: {"delta":"hello "}
 *
 * Or comment-only ping frames (`: ping`) which we ignore. Malformed
 * frames are dropped silently — the stream must survive single bad
 * frames the same way the server-side parser does.
 */
function handleSseFrame(
  frame: string,
  patch: (fn: (t: LocalChatTurn) => LocalChatTurn) => void,
  agenticPublish?: (event: ChatEvent) => void,
): void {
  let eventKind: string | null = null;
  const dataLines: string[] = [];
  for (const raw of frame.split("\n")) {
    if (!raw || raw.startsWith(":")) continue;
    const idx = raw.indexOf(":");
    if (idx < 0) continue;
    const field = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trimStart();
    if (field === "event") eventKind = value;
    else if (field === "data") dataLines.push(value);
  }
  if (!eventKind || dataLines.length === 0) return;
  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    return;
  }

  switch (eventKind) {
    case "text_delta": {
      const p = payload as { delta?: string };
      if (typeof p.delta !== "string") return;
      patch((t) => ({ ...t, content: (t.content ?? "") + p.delta! }));
      break;
    }
    case "event": {
      const p = payload as { event?: ChatEvent };
      if (!p.event) return;
      const ev = p.event;
      patch((t) => ({
        ...t,
        events: mergeEvent(t.events ?? [], ev),
      }));
      // Re-publish onto the office's client-side agentic bus so the 3D
      // scene can translate tool-use / file-read / todo_update events
      // into visual cues (warm pulses, desk flashes, etc.). The publish
      // is fire-and-forget — if no subscribers, it's a no-op.
      if (agenticPublish) agenticPublish(ev);
      break;
    }
    case "session": {
      // Server already persists it to chat-meta — no UI mutation needed.
      break;
    }
    case "done": {
      const p = payload as {
        success?: boolean;
        interrupted?: boolean;
        content?: string;
        meta?: LocalChatTurn["meta"];
      };
      patch((t) => ({
        ...t,
        ...(typeof p.content === "string"
          ? { content: normalizeAssistantContent(p.content) }
          : {}),
        streaming: false,
        ...(p.interrupted ? { interrupted: true } : {}),
        ...(p.meta ? { meta: { ...t.meta, ...p.meta } } : {}),
      }));
      break;
    }
    case "error": {
      const p = payload as { message?: string };
      patch((t) => ({
        ...t,
        streaming: false,
        content: t.content + (p.message ? `\n\n_Error: ${p.message}_` : ""),
      }));
      break;
    }
    case "stderr": {
      // Surface only on the JS console — useful in dev, noise to ship.
      const p = payload as { chunk?: string };
      if (p.chunk) console.debug("[agent stderr]", p.chunk.trimEnd());
      break;
    }
  }
}

/**
 * Merge a new ChatEvent into the running list. Most events append; the
 * special cases:
 *   - `todo_update` collapses onto the previous `todo_update` (latest
 *     wins so the renderer shows a single live checklist that updates
 *     in place rather than a growing pile).
 *   - Bash `tool_result` patches its matching Bash row by id so command
 *     and output live together, like a terminal transcript.
 */
function mergeEvent(prev: ChatEvent[], next: ChatEvent): ChatEvent[] {
  if (next.kind === "todo_update") {
    // Replace the most-recent todo_update; append if none yet.
    for (let i = prev.length - 1; i >= 0; i--) {
      if (prev[i].kind === "todo_update") {
        const copy = prev.slice();
        copy[i] = next;
        return copy;
      }
    }
    return [...prev, next];
  }
  if (next.kind === "tool_result" && next.tool_use_id) {
    const idx = prev.findIndex(
      (event) => event.kind === "bash" && event.id === next.tool_use_id,
    );
    if (idx >= 0) {
      const copy = prev.slice();
      const bash = copy[idx];
      if (bash.kind === "bash") {
        copy[idx] = {
          ...bash,
          ...(next.error
            ? { stderr: next.output ?? "command failed" }
            : { stdout: next.output ?? "" }),
        };
      }
      return copy;
    }
  }
  return [...prev, next];
}

function mergeTurns(prev: LocalChatTurn[], incoming: ChatTurn[]): LocalChatTurn[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((t) => t.id ?? `${t.role}:${t.ts}`));
  const next = [...prev];
  for (const turn of incoming) {
    const key = turn.id ?? `${turn.role}:${turn.ts}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(turn);
  }
  return next;
}

/**
 * Dedupe turns by their render key just before mapping to <Bubble>. Defense
 * in depth against duplicate ids that may already sit in a vault's chat JSONL
 * from before the narration write-lock landed (two specialists finishing at
 * once could append the same `step:<task>:<job>` turn). Keeps the last value
 * for each key (most up-to-date streaming state) while preserving the order
 * of first appearance, so React never sees two children with the same key.
 */
function dedupeTurnsById(turns: LocalChatTurn[]): LocalChatTurn[] {
  const byKey = new Map<string, LocalChatTurn>();
  for (const t of turns) {
    byKey.set(t.id ?? `${t.role}:${t.ts}`, t);
  }
  return [...byKey.values()];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchHistoryWithRetry(
  clientSlug: string,
  target: string,
  signal: AbortSignal,
): Promise<LocalChatTurn[]> {
  const url = `/api/chat/history?slug=${encodeURIComponent(clientSlug)}&target=${encodeURIComponent(target)}`;
  let attempt = 0;
  // 1 initial try + 2 retries on 5xx. 4xx and network errors fail fast.
  while (true) {
    const r = await fetch(url, { signal });
    if (r.ok) {
      const data = (await r.json()) as { ok: boolean; turns?: LocalChatTurn[] };
      return data.ok ? (data.turns ?? []) : [];
    }
    if (r.status < 500 || attempt >= 2) {
      throw new Error(`HTTP ${r.status}`);
    }
    attempt++;
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt ** 2));
  }
}

/* -------------------------------------------------------------------------- */
/* live sweep run panel                                                        */
/* -------------------------------------------------------------------------- */

const SWEEP_TERMINAL_STATUSES: SweepStatus[] = ["succeeded", "failed", "cancelled"];

function LiveSweepRunPanel({
  clientSlug,
  liveHint,
  hasFinalBrainSummaryTurn,
  onOpenPath,
  onOpenReport,
  onProposeRun,
  onFocusSpecialist,
  knownSpecialistIds,
  onTerminalRefresh,
}: {
  clientSlug: string;
  liveHint: boolean;
  hasFinalBrainSummaryTurn: boolean;
  onOpenPath?: (path: string, kind: "note" | "folder") => void;
  onOpenReport?: (href: string, label?: string) => void;
  onProposeRun?: (specialistId: string) => void;
  onFocusSpecialist?: (id: string) => void;
  knownSpecialistIds: ReadonlySet<string>;
  onTerminalRefresh?: () => void;
}) {
  const [sweep, setSweep] = useState<SweepView | null>(null);
  const [terminalSummary, setTerminalSummary] = useState<{
    sweepId: string;
    content: string;
  } | null>(null);
  const [expandedSweepId, setExpandedSweepId] = useState<string | null>(null);
  const [collapsedSweepId, setCollapsedSweepId] = useState<string | null>(null);
  const [dismissedSweepId, setDismissedSweepId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(`seo-office:sweep-panel-dismissed:${clientSlug}`);
    } catch {
      return null;
    }
  });
  const status = sweep?.status ?? null;
  const isTerminal = status ? SWEEP_TERMINAL_STATUSES.includes(status) : false;
  const hasLiveSweep = Boolean(status && !isTerminal);
  const terminalRefreshRef = useRef<string | null>(null);

  const loadLatestTerminalSummary = useCallback(async (sweepId: string) => {
    const ac = new AbortController();
    const latest = await fetchHistoryWithRetry(
      clientSlug,
      "orchestrator",
      ac.signal,
    ).catch(() => null);
    const summary = latest
      ?.map((turn) => turn.content)
      .find((content) => /Your SEO brain is ready for review/i.test(content));
    if (summary) setTerminalSummary({ sweepId, content: summary });
    return Boolean(summary);
  }, [clientSlug]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(
          `/api/clients/${encodeURIComponent(clientSlug)}/sweeps/current`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const data = (await r.json()) as { ok: boolean; sweep?: SweepView | null };
        if (cancelled) return;
        const nextSweep = data.sweep ?? null;
        setSweep(nextSweep);
        if (nextSweep?.final_summary && !hasFinalBrainSummaryTurn) {
          setTerminalSummary({
            sweepId: nextSweep.root_task_id,
            content: nextSweep.final_summary,
          });
        }
        if (
          nextSweep &&
          SWEEP_TERMINAL_STATUSES.includes(nextSweep.status) &&
          !hasFinalBrainSummaryTurn
        ) {
          void loadLatestTerminalSummary(nextSweep.root_task_id);
        }
      } catch {
        /* keep the last visible sweep */
      }
    }

    void load();
    const intervalMs = liveHint || hasLiveSweep ? 3000 : 15000;
    const iv = setInterval(load, intervalMs);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    clientSlug,
    liveHint,
    hasLiveSweep,
    hasFinalBrainSummaryTurn,
    loadLatestTerminalSummary,
  ]);

  useEffect(() => {
    if (!sweep || !isTerminal || !onTerminalRefresh) return;
    if (terminalRefreshRef.current === sweep.root_task_id) return;
    terminalRefreshRef.current = sweep.root_task_id;
    onTerminalRefresh();
  }, [sweep, isTerminal, onTerminalRefresh]);

  useEffect(() => {
    if (!sweep || !isTerminal || hasFinalBrainSummaryTurn) return;

    let cancelled = false;
    const activeSweepId = sweep.root_task_id;
    async function loadTerminalSummary() {
      for (let attempt = 0; attempt < 24 && !cancelled; attempt++) {
        const found = await loadLatestTerminalSummary(activeSweepId);
        if (found && !cancelled) {
          return;
        }
        await sleep(750);
      }
    }

    void loadTerminalSummary();
    return () => {
      cancelled = true;
    };
  }, [sweep, isTerminal, hasFinalBrainSummaryTurn, loadLatestTerminalSummary]);

  if (!sweep) return null;
  if (isTerminal && dismissedSweepId === sweep.root_task_id) return null;

  const completed =
    sweep.totals.succeeded +
    sweep.totals.failed +
    sweep.totals.cancelled +
    sweep.totals.skipped;
  const progressPct =
    sweep.totals.all > 0 ? Math.round((completed / sweep.totals.all) * 100) : 0;
  const running = sweep.totals.running;
  const spawning = sweep.totals.queued;
  const isExpanded =
    expandedSweepId === sweep.root_task_id ||
    (hasLiveSweep && collapsedSweepId !== sweep.root_task_id);
  const title = isTerminal
    ? sweep.status === "succeeded"
      ? "Agent sweep complete"
      : sweep.status === "failed"
        ? "Agent sweep failed"
        : "Agent sweep cancelled"
    : running > 0
      ? "Agents working"
      : spawning > 0
        ? "Spawning agents"
        : "Preparing agent wave";
  const phaseLabel = sweep.current_phase
    ? sweep.current_phase === "final"
      ? "Final gate"
      : sweep.current_phase.charAt(0).toUpperCase() + sweep.current_phase.slice(1)
    : "Run";
  const statusLabel = isTerminal
    ? completed === sweep.totals.all
      ? `${completed} complete`
      : `${completed}/${sweep.totals.all} done`
    : running > 0
      ? `${running} working`
      : spawning > 0
        ? `${spawning} spawning`
        : `${sweep.totals.all} queued`;
  const panelStatus: OfficeStatus = isTerminal
    ? sweep.status
    : running > 0
      ? "running"
      : spawning > 0
        ? "spawning"
        : "queued";
  const rows = [...sweep.children].sort((a, b) => {
    const score = (row: SweepChildSummary) => {
      if (row.status === "running") return 0;
      if (row.status === "queued") return 1;
      if (row.status === "failed") return 2;
      if (row.status === "succeeded") return 3;
      if (row.status === "cancelled") return 4;
      return 5;
    };
    return score(a) - score(b) || a.specialist_id.localeCompare(b.specialist_id);
  });
  const sweepId = sweep.root_task_id;
  const terminalSummaryPayload =
    !hasFinalBrainSummaryTurn && terminalSummary?.sweepId === sweepId
      ? extractSuggestions(normalizeAssistantContent(terminalSummary.content))
    : null;

  function toggleExpanded() {
    if (isExpanded) {
      setExpandedSweepId(null);
      setCollapsedSweepId(sweepId);
      return;
    }
    setCollapsedSweepId(null);
    setExpandedSweepId(sweepId);
  }

  function handleDismiss() {
    if (!isTerminal) {
      setExpandedSweepId(null);
      setCollapsedSweepId(sweepId);
      return;
    }

    setDismissedSweepId(sweepId);
    try {
      window.localStorage.setItem(
        `seo-office:sweep-panel-dismissed:${clientSlug}`,
        sweepId,
      );
    } catch {
      /* localStorage can be unavailable in private contexts */
    }
  }

  return (
    <section className="w-full overflow-hidden border border-graphite bg-abyss/85 backdrop-blur">
      <div className="flex min-w-0 items-stretch">
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-charcoal/40 focus:outline-none focus:ring-1 focus:ring-gold"
          aria-expanded={isExpanded}
        >
          <span className="shrink-0 text-gold">
            <ChevronRightIcon rotated={isExpanded} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="label-micro block truncate">
              live agents · {phaseLabel}
            </span>
            <span className="mt-0.5 block truncate text-[12px] font-medium uppercase tracking-tight text-white">
              {title}
            </span>
          </span>
          <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wider text-ash sm:inline">
            {statusLabel}
          </span>
          <StatusPill status={panelStatus} size="compact" />
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="border-l border-graphite px-2 font-mono text-[11px] uppercase text-ash hover:bg-charcoal hover:text-white focus:outline-none focus:ring-1 focus:ring-gold"
          aria-label={isTerminal ? "Hide sweep summary" : "Collapse sweep summary"}
          title={isTerminal ? "Hide" : "Collapse"}
        >
          x
        </button>
      </div>

      <div className="mt-2 h-1 overflow-hidden bg-graphite/50">
        <div
          className={
            "h-full transition-[width] duration-500 " +
            (sweep.status === "failed"
              ? "bg-red-400"
              : isTerminal
                ? "bg-emerald-400"
                : "bg-orange-400")
          }
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 pt-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider text-ash">
            {running > 0 && <span className="text-orange-200">{running} working</span>}
            {spawning > 0 && <span className="text-amber-200">{spawning} spawning</span>}
            {sweep.totals.succeeded > 0 && (
              <span className="text-emerald-300">{sweep.totals.succeeded} complete</span>
            )}
            {sweep.totals.failed > 0 && (
              <span className="text-red-300">{sweep.totals.failed} failed</span>
            )}
            {sweep.totals.skipped > 0 && (
              <span className="text-fg-shadow">{sweep.totals.skipped} skipped</span>
            )}
          </div>

          <ul className="mt-2 max-h-40 divide-y divide-graphite/50 overflow-y-auto border border-graphite/60">
            {rows.map((child) => (
              <li
                key={child.task_id}
                className="flex min-w-0 items-center justify-between gap-2 bg-charcoal/45 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px] text-white">
                    {child.specialist_id}
                  </p>
                  {child.result_summary && (
                    <p className="mt-0.5 truncate text-[10px] text-ash">
                      {child.result_summary}
                    </p>
                  )}
                </div>
                <StatusPill status={sweepChildStatus(child)} size="compact" />
              </li>
            ))}
          </ul>
        </div>
      )}
      {!isExpanded && (
        <p className="px-3 pb-2 pt-1 font-mono text-[10px] uppercase tracking-wider text-ash">
          {sweep.totals.all > 0 ? (
            <>
              {completed}/{sweep.totals.all} done
              {running > 0 ? ` · ${running} active` : ""}
              {spawning > 0 ? ` · ${spawning} spawning` : ""}
            </>
          ) : (
            "waiting for agents"
          )}
        </p>
      )}
      {!hasFinalBrainSummaryTurn && terminalSummaryPayload && (
        <div
          className="border-t border-graphite bg-charcoal px-3 py-3"
          data-terminal-summary
        >
          {terminalSummaryPayload.source && (
            <MarkdownBody
              source={terminalSummaryPayload.source}
              onOpenPath={onOpenPath}
              onOpenReport={onOpenReport}
              onFocusSpecialist={onFocusSpecialist}
              knownSpecialistIds={knownSpecialistIds}
              clientSlug={clientSlug}
            />
          )}
          <BrainSuggestionCards
            suggestions={terminalSummaryPayload.suggestions}
            clientSlug={clientSlug}
            onOpenPath={onOpenPath}
            onOpenReport={onOpenReport}
            onProposeRun={onProposeRun}
          />
        </div>
      )}
    </section>
  );
}

function sweepChildStatus(child: SweepChildSummary): OfficeStatus {
  if (child.skipped) return "cancelled";
  if (child.status === "queued") return "spawning";
  if (child.status === "planned" || child.status === "blocked") return child.status;
  return child.status;
}

/* -------------------------------------------------------------------------- */
/* bubble                                                                      */
/* -------------------------------------------------------------------------- */

function BubbleImpl({
  turn,
  clientSlug,
  onOpenPath,
  onOpenReport,
  onProposeRun,
  onFocusSpecialist,
  knownSpecialistIds,
}: {
  turn: LocalChatTurn;
  clientSlug: string;
  onOpenPath?: (path: string, kind: "note" | "folder") => void;
  onOpenReport?: (href: string, label?: string) => void;
  onProposeRun?: (specialistId: string) => void;
  onFocusSpecialist?: (id: string) => void;
  knownSpecialistIds: ReadonlySet<string>;
}) {
  const isUser = turn.role === "user";
  const normalized = isUser ? turn.content : normalizeAssistantContent(turn.content);
  const suggestionPayload = useMemo(
    () => (isUser ? { source: normalized, suggestions: [] } : extractSuggestions(normalized)),
    [isUser, normalized],
  );
  const cleaned = isUser
    ? suggestionPayload.source
    : stripDuplicateReportSummaryLinks(
        suggestionPayload.source,
        suggestionPayload.suggestions,
      );
  const hasBody = cleaned.length > 0;
  const hasEvents = (turn.events?.length ?? 0) > 0;
  // An assistant turn that was stopped before any output streamed: empty
  // content, no events, no streaming flag. Without a placeholder the
  // bubble would render "(empty)" or be visually empty — confusing in
  // the timeline. Show a muted explanation instead. The existing
  // "◼ stopped" pill in the timestamp row keeps the cause visible.
  const stoppedBeforeOutput =
    !isUser &&
    turn.interrupted === true &&
    !turn.streaming &&
    cleaned.length === 0 &&
    (!turn.events || turn.events.length === 0);

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          (isUser
            ? "max-w-[88%] border border-gold/50 bg-gold/10 px-3 py-2 text-[13px] text-white"
            : "max-w-[88%] border border-graphite bg-charcoal px-3 py-2 text-[13px] text-white") +
          (turn.failed ? " border-red-500/60 bg-red-950/30" : "")
        }
      >
        {/* Optional tool-use timeline — rendered ABOVE the message body so
            the user sees what the agent did before reading what it said. */}
        {turn.events && turn.events.length > 0 && (
          <EventTimeline
            events={turn.events}
            streaming={Boolean(turn.streaming)}
            onOpenPath={onOpenPath}
            onOpenReport={onOpenReport}
            onFocusSpecialist={onFocusSpecialist}
            knownSpecialistIds={knownSpecialistIds}
          />
        )}

        {/* Persisted attachments — render BEFORE the body so the question
            text reads after the asset. Matches the SDK content-block order. */}
        {turn.attachments && turn.attachments.length > 0 && (
          <AttachmentList attachments={turn.attachments} />
        )}

        {/* User messages: raw text. Assistant messages: full markdown render
            with vault-path + specialist-id clickability. */}
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{cleaned}</p>
        ) : stoppedBeforeOutput ? (
          <p className="italic text-fg-shadow">
            (stopped before producing output)
          </p>
        ) : !hasBody && hasEvents ? null : !hasBody ? (
          <p className="italic text-fg-shadow">(no text output)</p>
        ) : (
          <MarkdownBody
            source={cleaned}
            onOpenPath={onOpenPath}
            onOpenReport={onOpenReport}
            onFocusSpecialist={onFocusSpecialist}
            knownSpecialistIds={knownSpecialistIds}
            clientSlug={clientSlug}
          />
        )}

        {!isUser && suggestionPayload.suggestions.length > 0 && (
          <BrainSuggestionCards
            suggestions={suggestionPayload.suggestions}
            clientSlug={clientSlug}
            onOpenPath={onOpenPath}
            onOpenReport={onOpenReport}
            onProposeRun={onProposeRun}
          />
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider text-fg-shadow">
            {new Date(turn.ts).toLocaleTimeString()}
          </p>
          <div className="flex items-center gap-2">
            {turn.streaming && (
              <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-gold">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
                streaming
              </span>
            )}
            {!turn.streaming && turn.interrupted && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-red-300">
                ◼ stopped
              </span>
            )}
            {!turn.streaming && !turn.interrupted && turn.mode === "agentic" && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-gold/70">
                ⚯ agentic
              </span>
            )}
            {turn.failed && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-red-300">
                ✗ not sent
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Bubble — memoized turn row. The chat panel maps `turns` (often 100+) to
 * Bubble components. Without memoization, every parent state movement
 * (focus, hover, scroll, tab, stream tick) forced 100+ Bubble re-renders,
 * each of which then re-rendered MarkdownBody and re-parsed markdown via
 * react-markdown — the dominant source of click-lag for users with long
 * orchestrator histories.
 *
 * Default shallow equality works here because all five props are stable
 * by construction:
 *   - turn: same object reference per persisted turn (only changes when
 *     a turn actually mutates — e.g. mid-stream content updates)
 *   - onOpenPath / onOpenReport / onFocusSpecialist: `useCallback`'d
 *     in the parent
 *   - knownSpecialistIds: `useMemo`'d on [targets] in the parent
 *
 * Net effect: a focus/hover/tab change with N turns produces N cheap
 * equality checks instead of N full re-renders + markdown re-parses.
 */
const Bubble = memo(BubbleImpl);

const SUGGESTION_BLOCK_RE = /```seo-suggestions\s*([\s\S]*?)```/g;

function extractSuggestions(source: string): {
  source: string;
  suggestions: BrainSuggestion[];
} {
  const suggestions: BrainSuggestion[] = [];
  const cleaned = source.replace(SUGGESTION_BLOCK_RE, (_block, raw) => {
    try {
      const parsed = JSON.parse(String(raw).trim()) as BrainSuggestion[];
      if (Array.isArray(parsed)) {
        for (const suggestion of parsed) {
          if (isBrainSuggestion(suggestion)) suggestions.push(suggestion);
        }
      }
    } catch {
      return _block;
    }
    return "";
  });
  return { source: cleaned.trim(), suggestions };
}

function isBrainSuggestion(value: unknown): value is BrainSuggestion {
  if (!value || typeof value !== "object") return false;
  const suggestion = value as Partial<BrainSuggestion>;
  return (
    typeof suggestion.id === "string" &&
    typeof suggestion.title === "string" &&
    typeof suggestion.why_this_matters === "string" &&
    Boolean(suggestion.cta && typeof suggestion.cta.label === "string")
  );
}

function stripDuplicateReportSummaryLinks(
  source: string,
  suggestions: BrainSuggestion[],
): string {
  const hasReportCta = suggestions.some((suggestion) => {
    const cta = suggestion.cta;
    return cta.type === "open_report" && Boolean(cta.path || cta.href);
  }) || /\[open report\s*→?\]\([^)]*\/reports\/[^)]*\.html\)/i.test(source);
  if (!hasReportCta) return source;
  return source
    .replace(/\s*\(report:\s*reports\/[^)\s]+\.html\)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function BrainSuggestionCards({
  suggestions,
  clientSlug,
  onOpenPath,
  onOpenReport,
  onProposeRun,
}: {
  suggestions: BrainSuggestion[];
  clientSlug: string;
  onOpenPath?: (path: string, kind: "note" | "folder") => void;
  onOpenReport?: (href: string, label?: string) => void;
  onProposeRun?: (specialistId: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="mt-3 grid gap-2" data-brain-suggestions>
      {suggestions.map((suggestion) => (
        <article
          key={suggestion.id}
          data-brain-suggestion-id={suggestion.id}
          className="border border-[#8a9a5b]/45 bg-[#11160f]/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-medium uppercase tracking-tight text-[#dfe8c7]">
                {suggestion.title}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-white/75">
                {suggestion.why_this_matters}
              </p>
            </div>
            <span className="shrink-0 border border-[#8a9a5b]/45 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#dfe8c7]">
              {suggestion.impact}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-ash">
              confidence {suggestion.confidence}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-ash">
              effort {suggestion.effort}
            </span>
            <SuggestionCta
              suggestion={suggestion}
              clientSlug={clientSlug}
              onOpenPath={onOpenPath}
              onOpenReport={onOpenReport}
              onProposeRun={onProposeRun}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function SuggestionCta({
  suggestion,
  clientSlug,
  onOpenPath,
  onOpenReport,
  onProposeRun,
}: {
  suggestion: BrainSuggestion;
  clientSlug: string;
  onOpenPath?: (path: string, kind: "note" | "folder") => void;
  onOpenReport?: (href: string, label?: string) => void;
  onProposeRun?: (specialistId: string) => void;
}) {
  const cta = suggestion.cta;
  const baseClass =
    "ml-auto border border-gold/60 bg-gold/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-gold transition-colors hover:bg-gold/20 focus:outline-none focus:ring-1 focus:ring-gold";
  if (cta.type === "open_note" && cta.path) {
    const kind = cta.path.endsWith("/") || !cta.path.endsWith(".md") ? "folder" : "note";
    return (
      <button
        type="button"
        className={baseClass}
        data-brain-suggestion-cta
        onClick={() => onOpenPath?.(cta.path!, kind)}
      >
        {cta.label}
      </button>
    );
  }
  if (cta.type === "open_report" && cta.path) {
    const href = cta.href ?? `/api/clients/${encodeURIComponent(clientSlug)}/reports/${cta.path.replace(/^reports\//, "")}`;
    return (
      <button
        type="button"
        className={baseClass}
        data-brain-suggestion-cta
        onClick={() => onOpenReport?.(href, cta.path)}
      >
        {cta.label}
      </button>
    );
  }
  if (cta.type === "run_specialist" && cta.specialistId) {
    return (
      <button
        type="button"
        className={baseClass}
        data-brain-suggestion-cta
        onClick={() => onProposeRun?.(cta.specialistId!)}
      >
        {cta.label}
      </button>
    );
  }
  if (cta.href) {
    return (
      <a href={cta.href} className={baseClass} data-brain-suggestion-cta>
        {cta.label}
      </a>
    );
  }
  return <span className={baseClass}>{cta.label}</span>;
}

/* -------------------------------------------------------------------------- */
/* attachment list (inside a bubble)                                           */
/* -------------------------------------------------------------------------- */

function AttachmentList({ attachments }: { attachments: AttachmentRef[] }) {
  return (
    <div className="mb-2 grid grid-cols-2 gap-2">
      {attachments.map((att) => (
        <AttachmentTile key={att.sha256} attachment={att} />
      ))}
    </div>
  );
}

function AttachmentTile({ attachment }: { attachment: AttachmentRef }) {
  const isImage = attachment.mime.startsWith("image/");
  if (isImage && attachment.preview_url) {
    return (
      <a
        href={attachment.preview_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block border border-graphite bg-abyss/60"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.preview_url}
          alt={attachment.filename}
          className="h-32 w-full object-cover"
        />
      </a>
    );
  }
  const subtype = attachment.mime.split("/")[1]?.toUpperCase() ?? "FILE";
  const sizeKb = Math.round(attachment.size / 1024);
  return (
    <a
      href={attachment.preview_url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-1 border border-graphite bg-abyss/60 p-2 text-[11px]"
    >
      <span className="font-mono text-[10px] uppercase tracking-wider text-gold">
        {subtype}
      </span>
      <span className="truncate text-white" title={attachment.filename}>
        {attachment.filename}
      </span>
      <span className="text-ash">{sizeKb} KB</span>
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* event timeline (forward-looking)                                            */
/* -------------------------------------------------------------------------- */

function EventTimeline({
  events,
  streaming,
  onOpenPath,
  onOpenReport,
  onFocusSpecialist,
  knownSpecialistIds,
}: {
  events: ChatEvent[];
  streaming: boolean;
  onOpenPath?: (path: string, kind: "note" | "folder") => void;
  onOpenReport?: (href: string, label?: string) => void;
  onFocusSpecialist?: (id: string) => void;
  knownSpecialistIds: ReadonlySet<string>;
}) {
  const latest = events[events.length - 1];
  const visibleEvents = events.slice(-6);
  const hiddenCount = Math.max(0, events.length - visibleEvents.length);
  const counts = events.reduce(
    (acc, event) => {
      if (event.kind === "file_read") acc.reads++;
      if (event.kind === "file_edit") acc.edits++;
      if (event.kind === "bash") acc.bash++;
      if (event.kind === "tool_use") acc.tools++;
      return acc;
    },
    { reads: 0, edits: 0, bash: 0, tools: 0 },
  );

  return (
    <div className="mb-2 border border-graphite/60 bg-abyss/70">
      <div className="flex items-start justify-between gap-3 border-b border-graphite/40 px-2 py-1.5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ash">
            <span
              aria-hidden
              className={
                "inline-block h-1.5 w-1.5 rounded-full " +
                (streaming ? "animate-pulse bg-orange-400" : "bg-emerald-400")
              }
            />
            {streaming ? "agent working" : "agent activity"}
          </p>
          {latest && (
            <p className="mt-0.5 truncate text-[11px] text-white/85">
              {eventSummary(latest)}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-fg-shadow">
          {events.length} ops
        </div>
      </div>

      {(counts.reads > 0 || counts.edits > 0 || counts.bash > 0 || counts.tools > 0) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-graphite/40 px-2 py-1 text-[9px] uppercase tracking-wider text-ash">
          {counts.reads > 0 && <span>{counts.reads} reads</span>}
          {counts.edits > 0 && <span>{counts.edits} edits</span>}
          {counts.bash > 0 && <span>{counts.bash} bash</span>}
          {counts.tools > 0 && <span>{counts.tools} tools</span>}
        </div>
      )}

      <ul className="divide-y divide-graphite/40">
        {hiddenCount > 0 && (
          <li className="px-2 py-1 text-[10px] text-fg-shadow">
            <details>
              <summary className="cursor-pointer select-none uppercase tracking-wider hover:text-white">
                {hiddenCount} earlier {hiddenCount === 1 ? "operation" : "operations"}
              </summary>
              <ul className="mt-1 divide-y divide-graphite/30 border-t border-graphite/30">
                {events.slice(0, hiddenCount).map((event, index) => (
                  <li key={`hidden-${event.kind}-${index}`} className="py-1.5">
                    <EventLine
                      event={event}
                      compact
                      onOpenPath={onOpenPath}
                      onOpenReport={onOpenReport}
                      onFocusSpecialist={onFocusSpecialist}
                      knownSpecialistIds={knownSpecialistIds}
                    />
                  </li>
                ))}
              </ul>
            </details>
          </li>
        )}
        {visibleEvents.map((event, index) => (
          <li key={`${event.kind}-${events.length - visibleEvents.length + index}`} className="px-2 py-1.5">
            <EventLine
              event={event}
              compact={streaming}
              onOpenPath={onOpenPath}
              onOpenReport={onOpenReport}
              onFocusSpecialist={onFocusSpecialist}
              knownSpecialistIds={knownSpecialistIds}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function eventSummary(event: ChatEvent): string {
  switch (event.kind) {
    case "tool_use":
      return `Using ${event.name}`;
    case "tool_result":
      return `${event.error ? "Failed" : "Finished"} ${event.name}`;
    case "file_read":
      return `Reading ${shortPath(event.path)}`;
    case "file_edit":
      return `Editing ${shortPath(event.path)}`;
    case "bash":
      return event.stdout || event.stderr ? "Bash command finished" : `Running ${event.command}`;
    case "thinking":
      return "Thinking through the next step";
    case "todo_update": {
      const active = event.todos.find((todo) => todo.status === "in_progress");
      return active?.activeForm ?? active?.content ?? "Updating plan";
    }
  }
}

function shortPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return parts.slice(-3).join("/");
}

function EventLine({
  event,
  compact = false,
  onOpenPath,
  onOpenReport,
  onFocusSpecialist,
  knownSpecialistIds,
}: {
  event: ChatEvent;
  compact?: boolean;
  onOpenPath?: (path: string, kind: "note" | "folder") => void;
  onOpenReport?: (href: string, label?: string) => void;
  onFocusSpecialist?: (id: string) => void;
  knownSpecialistIds: ReadonlySet<string>;
}) {
  const outputMaxClass = compact ? "max-h-24" : "max-h-32";
  switch (event.kind) {
    case "tool_use":
      return (
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-gold">
            ⏵ {event.name}
          </span>
          {event.input && Object.keys(event.input).length > 0 && (
            <pre className="mt-1 overflow-x-auto bg-charcoal/60 px-2 py-1 font-mono text-[11px] leading-5 text-white/85">
              {JSON.stringify(event.input, null, 2)}
            </pre>
          )}
        </div>
      );
    case "tool_result":
      return (
        <div>
          <span
            className={`font-mono text-[10px] uppercase tracking-wider ${
              event.error ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {event.error ? "✗" : "✓"} {event.name}
          </span>
          {event.output && (
            <div className={`mt-1 ${outputMaxClass} overflow-y-auto bg-charcoal/60 px-2 py-1`}>
              <MarkdownBody
                source={event.output}
                onOpenPath={onOpenPath}
                onOpenReport={onOpenReport}
                onFocusSpecialist={onFocusSpecialist}
                knownSpecialistIds={knownSpecialistIds}
              />
            </div>
          )}
        </div>
      );
    case "file_read":
      return (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-mono text-[10px] uppercase tracking-wider text-blue-300">
            📄 read
          </span>
          <code className="truncate font-mono text-[11px] text-white/90">
            {event.path}
            {event.range && <span className="text-ash"> · {event.range}</span>}
          </code>
        </div>
      );
    case "file_edit":
      return (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">
            ✎ edit
          </span>
          <code className="truncate font-mono text-[11px] text-white/90">
            {event.path}
          </code>
          {event.summary && (
            <span className="truncate text-[11px] text-ash">— {event.summary}</span>
          )}
        </div>
      );
    case "bash":
      return (
        <div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-mono text-[10px] uppercase tracking-wider text-purple-300">
              $ bash
            </span>
            {typeof event.exitCode === "number" && (
              <span
                className={`font-mono text-[10px] ${
                  event.exitCode === 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                exit {event.exitCode}
              </span>
            )}
          </div>
          <pre className="mt-1 overflow-x-auto bg-charcoal/60 px-2 py-1 font-mono text-[11px] leading-5 text-white/90">
            {event.command}
          </pre>
          {event.stdout && (
            <pre className={`mt-1 ${outputMaxClass} overflow-y-auto whitespace-pre-wrap bg-charcoal/60 px-2 py-1 font-mono text-[11px] leading-5 text-white/70`}>
              {event.stdout}
            </pre>
          )}
          {event.stderr && (
            <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap bg-red-950/40 px-2 py-1 font-mono text-[11px] leading-5 text-red-200">
              {event.stderr}
            </pre>
          )}
        </div>
      );
    case "thinking":
      return (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 text-[11px] text-ash hover:text-white">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-300">
              ◐ thought
            </span>
            {typeof event.durationMs === "number" && (
              <span className="font-mono text-[10px] text-ash">
                {(event.durationMs / 1000).toFixed(1)}s
              </span>
            )}
            <span className="text-ash/60">— expand</span>
          </summary>
          <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap bg-charcoal/40 px-2 py-1 font-mono text-[11px] leading-5 text-white/70">
            {event.text}
          </pre>
        </details>
      );
    case "todo_update":
      return (
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300">
            ☑ todos
          </span>
          <ul className="mt-1 space-y-0.5">
            {event.todos.map((t, i) => {
              const icon =
                t.status === "completed"
                  ? "✓"
                  : t.status === "in_progress"
                    ? "◐"
                    : "○";
              const color =
                t.status === "completed"
                  ? "text-emerald-300/90 line-through"
                  : t.status === "in_progress"
                    ? "text-amber-300"
                    : "text-white/70";
              return (
                <li key={i} className={`flex items-start gap-1.5 text-[11px] ${color}`}>
                  <span className="font-mono text-[10px] leading-5">{icon}</span>
                  <span className="leading-5">
                    {t.status === "in_progress" && t.activeForm ? t.activeForm : t.content}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      );
  }
}
