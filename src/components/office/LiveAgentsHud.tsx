"use client";

/**
 * LiveAgentsHud — top-left office overlay that replaces the old
 * standalone /agents route.
 *
 * Default scope = the selected client (most "relevant per selected
 * client"). A segmented toggle inside the expanded panel switches to
 * cross-client mode for the rare case the user wants a book-wide
 * roll-up. Scope is persisted in localStorage so it sticks across
 * sessions.
 *
 * Data: polls /api/agents (+ ?client=<slug> when scope is "client")
 * every 3 seconds. Same cadence as the deleted AgentBoard. Eventual
 * consistency is fine — each client's office page already holds a
 * long-lived SSE on its own job-stream for tight feedback; this HUD
 * just answers "is anything running?" at a glance.
 *
 * Row click:
 *   - same-client rows  → onFocusSpecialist(specialistId) flies the
 *                         camera to that desk.
 *   - cross-client rows → /office?client=<other> via next/router.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import StatusPill, { type Status } from "@/components/office/StatusPill";

interface LiveTask {
  id: string;
  client_slug: string;
  title: string;
  status: string;
  specialist_id: string | null;
  parent_task_id: string | null;
  updated_at: string;
}
interface LiveJob {
  id: string;
  client_slug: string;
  specialist: string;
  status: string;
  message: string | null;
  started_at: string | null;
  created_at: string;
}
interface LiveAssignment {
  id: string;
  client_slug: string;
  specialist_id: string;
  title: string;
  status: string;
  permission_mode: string;
  job_id: string | null;
  updated_at: string;
}
interface ClientRow {
  slug: string;
  name: string;
  site_url: string;
}
interface AgentResponse {
  ok: boolean;
  live: { tasks: LiveTask[]; jobs: LiveJob[]; assignments: LiveAssignment[] };
  clients: ClientRow[];
}

type Scope = "client" | "all";
type SourceKind = "task" | "job" | "assignment";

interface AgentWaveRow {
  key: string;
  client_slug: string;
  specialist_id: string;
  title: string;
  status: Status;
  sources: SourceKind[];
}

const FOCUSED_POLL_INTERVAL_MS = 5000;
const DOCK_IDLE_POLL_INTERVAL_MS = 15000;
const SCOPE_STORAGE_KEY = "office:live-hud:scope";
const STATUS_PRIORITY: Record<Status, number> = {
  failed: 7,
  running: 6,
  spawning: 5,
  queued: 4,
  blocked: 3,
  planned: 2,
  proposed: 1,
  succeeded: 0,
  cancelled: 0,
};

function waveStatus(status: string): Status | null {
  if (status === "queued") return "spawning";
  if (
    status === "planned" ||
    status === "proposed" ||
    status === "running" ||
    status === "blocked" ||
    status === "failed" ||
    status === "succeeded" ||
    status === "cancelled"
  ) {
    return status;
  }
  return null;
}

function titleFromSpecialist(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

interface Props {
  activeClientSlug: string;
  /** True when the camera is focused on any entity — shifts the HUD
   *  down so it doesn't collide with the "← back to office" button. */
  focusedMode: boolean;
  /** Called when the user clicks a row that belongs to the active
   *  client. The id is the registered specialist id (same shape
   *  ChatPanel's onFocusSpecialist expects). */
  onFocusSpecialist: (specialistId: string) => void;
  /** `overlay` floats over the canvas; `dock` sits in the right-pane
   * operations footer next to recent jobs. */
  variant?: "overlay" | "dock";
}

export default function LiveAgentsHud({
  activeClientSlug,
  focusedMode,
  onFocusSpecialist,
  variant = "overlay",
}: Props) {
  const [scope, setScope] = useState<Scope>("client");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hydrate persisted scope after mount — same post-hydration pattern
  // OfficeWorkspace uses for rightWidth (avoids SSR mismatch).
  useEffect(() => {
    try {
      const v = localStorage.getItem(SCOPE_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration
      if (v === "all" || v === "client") setScope(v);
    } catch {
      /* storage unavailable — keep default */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SCOPE_STORAGE_KEY, scope);
    } catch {
      /* ignore */
    }
  }, [scope]);

  // Poll /api/agents. Re-key on scope +
  // activeClientSlug so changing either kicks an immediate refetch
  // instead of waiting for the next tick.
  useEffect(() => {
    let cancelled = false;
    const url =
      scope === "client"
        ? `/api/agents?client=${encodeURIComponent(activeClientSlug)}`
        : "/api/agents";

    async function load() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) {
          if (!cancelled) setError(`HTTP ${r.status}`);
          return;
        }
        const json = (await r.json()) as AgentResponse;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    const intervalMs =
      variant === "dock" && !open
        ? DOCK_IDLE_POLL_INTERVAL_MS
        : FOCUSED_POLL_INTERVAL_MS;
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
  }, [scope, activeClientSlug, variant, open]);

  const agentRows = useMemo<AgentWaveRow[]>(() => {
    if (!data) return [];

    type MutableRow = AgentWaveRow & {
      priority: number;
      sourceSet: Set<SourceKind>;
    };
    const rows = new Map<string, MutableRow>();
    const upsert = (input: {
      client_slug: string;
      specialist_id: string | null;
      title: string | null;
      status: string;
      source: SourceKind;
    }) => {
      if (!input.specialist_id) return;
      const status = waveStatus(input.status);
      if (!status) return;
      const key = `${input.client_slug}:${input.specialist_id}`;
      const priority = STATUS_PRIORITY[status];
      const title = input.title?.trim() || titleFromSpecialist(input.specialist_id);
      const existing = rows.get(key);
      if (!existing) {
        rows.set(key, {
          key,
          client_slug: input.client_slug,
          specialist_id: input.specialist_id,
          title,
          status,
          sources: [input.source],
          sourceSet: new Set([input.source]),
          priority,
        });
        return;
      }
      existing.sourceSet.add(input.source);
      existing.sources = Array.from(existing.sourceSet);
      if (priority >= existing.priority) {
        existing.title = title;
        existing.status = status;
        existing.priority = priority;
      }
    };

    for (const task of data.live.tasks) {
      upsert({
        client_slug: task.client_slug,
        specialist_id: task.specialist_id,
        title: task.title,
        status: task.status,
        source: "task",
      });
    }
    for (const job of data.live.jobs) {
      upsert({
        client_slug: job.client_slug,
        specialist_id: job.specialist,
        title: job.message && job.message !== "queued" ? job.message : null,
        status: job.status,
        source: "job",
      });
    }
    for (const assignment of data.live.assignments) {
      upsert({
        client_slug: assignment.client_slug,
        specialist_id: assignment.specialist_id,
        title: assignment.title,
        status: assignment.status,
        source: "assignment",
      });
    }

    return Array.from(rows.values())
      .sort((a, b) => b.priority - a.priority || a.specialist_id.localeCompare(b.specialist_id))
      .map((row) => ({
        key: row.key,
        client_slug: row.client_slug,
        specialist_id: row.specialist_id,
        title: row.title,
        status: row.status,
        sources: row.sources,
      }));
  }, [data]);

  const clientsBySlug = useMemo(
    () => new Map((data?.clients ?? []).map((c) => [c.slug, c])),
    [data],
  );

  const live = agentRows.length > 0;
  const agentLabel = agentRows.length === 1 ? "agent" : "agents";
  const waveLabel = agentRows.some((row) => row.status === "running")
    ? "working"
    : agentRows.some((row) => row.status === "spawning")
      ? "spawning"
      : "planned";
  const topOffset = focusedMode ? "top-16" : "top-4";
  const docked = variant === "dock";

  return (
    <div
      className={
        docked
          ? "pointer-events-auto relative"
          : `pointer-events-auto absolute left-4 ${topOffset} z-20`
      }
    >
      {/* Collapsed pill — always visible, even when idle, so the user has
       *  a steady "all quiet" signal. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Live agents"
        className={
          "flex items-center gap-2 border border-graphite bg-abyss/85 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white backdrop-blur transition-colors hover:border-gold/60 " +
          (docked ? "w-full justify-between" : "")
        }
      >
        <span
          aria-hidden
          className={
            "inline-block h-2 w-2 rounded-full " +
            (live ? "animate-pulse bg-orange-400" : "bg-graphite")
          }
        />
        <span className="font-mono text-[11px]">
          {docked ? (live ? `${agentRows.length}` : "0") : live ? `${agentRows.length} ${agentLabel} ${waveLabel}` : "all quiet"}
        </span>
        <span className={docked ? "text-[10px] text-ash" : "text-ash"}>{docked ? agentLabel : "·"}</span>
        <span className="text-[10px] text-ash">
          {scope === "client" ? "this client" : "all clients"}
        </span>
        <span aria-hidden className="text-[9px] leading-none text-ash">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Live agents panel"
          className={
            docked
              ? "absolute bottom-full left-0 right-0 z-40 mb-2 border border-graphite bg-abyss/95 p-3 shadow-xl backdrop-blur"
              : "mt-1 w-96 max-w-[90vw] border border-graphite bg-abyss/95 p-3 shadow-xl backdrop-blur"
          }
        >
          {/* scope toggle */}
          <div className="mb-3 flex items-stretch border border-graphite">
            <ScopeButton
              active={scope === "client"}
              onClick={() => setScope("client")}
              label="this client"
            />
            <ScopeButton
              active={scope === "all"}
              onClick={() => setScope("all")}
              label="all clients"
            />
          </div>

          {error && (
            <p className="mb-2 border border-red-500/40 bg-red-950/30 px-2 py-1 text-[10px] text-red-200">
              ✗ {error}
            </p>
          )}

          {!data && !error && (
            <p className="text-[11px] text-ash">loading…</p>
          )}

          {data && agentRows.length === 0 && (
            <p className="border border-dashed border-graphite/60 bg-charcoal/30 px-3 py-3 text-center text-[11px] text-fg-shadow">
              {scope === "client"
                ? "No agents spawning for this client right now."
                : "All quiet across every client."}
            </p>
          )}

          {data && agentRows.length > 0 && (
            <div className="space-y-3">
              <Section title="Agent wave" count={agentRows.length}>
                <ul className="divide-y divide-graphite/60 border border-graphite">
                  {agentRows.map((row) => (
                    <RowItem
                      key={row.key}
                      title={row.title}
                      status={row.status}
                      clientSlug={row.client_slug}
                      activeClientSlug={activeClientSlug}
                      specialistId={row.specialist_id}
                      clientsBySlug={clientsBySlug}
                      kinds={row.sources}
                      scope={scope}
                      onFocusSpecialist={onFocusSpecialist}
                    />
                  ))}
                </ul>
              </Section>
            </div>
          )}

          <p className="mt-3 text-right font-mono text-[9px] text-fg-shadow">
            refreshes every {docked && !open ? 15 : 5}s
          </p>
        </div>
      )}
    </div>
  );
}

function ScopeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 px-2 py-1 text-[10px] uppercase tracking-wider transition-colors " +
        (active
          ? "bg-charcoal text-white"
          : "bg-transparent text-ash hover:text-white")
      }
    >
      {label}
    </button>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-[10px] uppercase tracking-wider text-ash">{title}</h2>
        <span className="font-mono text-[9px] text-fg-shadow">·{count}</span>
      </div>
      {children}
    </section>
  );
}

function RowItem({
  title,
  status,
  clientSlug,
  activeClientSlug,
  specialistId,
  clientsBySlug,
  kinds,
  scope,
  onFocusSpecialist,
}: {
  title: string;
  status: Status;
  clientSlug: string;
  activeClientSlug: string;
  specialistId: string | null;
  clientsBySlug: Map<string, ClientRow>;
  kinds: SourceKind[];
  scope: Scope;
  onFocusSpecialist: (id: string) => void;
}) {
  const isActiveClient = clientSlug === activeClientSlug;
  const c = clientsBySlug.get(clientSlug);
  const clientLabel = c?.name ?? clientSlug;

  // Click target depends on which client the row belongs to:
  //   - active client → fly camera to specialist desk (no navigation)
  //   - other client  → /office?client=<slug>
  const meta = (
    <p className="mt-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-ash">
      <span
        className="font-mono"
        style={{ color: "var(--accent-gold)" }}
      >
        {kinds.join(" + ")}
      </span>
      {scope === "all" && (
        <>
          <span>·</span>
          <span className="font-mono">{clientLabel}</span>
        </>
      )}
      {specialistId && (
        <>
          <span>·</span>
          <span className="font-mono">{specialistId}</span>
        </>
      )}
    </p>
  );

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] text-white">{title}</span>
        <StatusPill status={status} size="compact" />
      </div>
      {meta}
    </>
  );

  if (isActiveClient && specialistId) {
    return (
      <li className="bg-charcoal/60">
        <button
          type="button"
          onClick={() => onFocusSpecialist(specialistId)}
          className="block w-full px-3 py-2 text-left transition-colors hover:bg-charcoal"
        >
          {body}
        </button>
      </li>
    );
  }

  if (!isActiveClient) {
    return (
      <li className="bg-charcoal/60">
        <Link
          href={`/office?client=${encodeURIComponent(clientSlug)}`}
          className="block px-3 py-2 transition-colors hover:bg-charcoal"
        >
          {body}
        </Link>
      </li>
    );
  }

  // Active client but no specialist id (e.g. a parent Task) — render
  // non-clickable. Clicking it has nowhere meaningful to go.
  return <li className="bg-charcoal/60 px-3 py-2">{body}</li>;
}
