"use client";

/**
 * Status pill — one small chip that renders an Assignment / Job status
 * with the right colour. Reused by the Specialist Inbox row badges, the
 * Assignment card inside ChatPanel, the future desk-overlay HUD, and
 * anywhere else that needs to display the same set of states. One file
 * = one source of truth for the visual language.
 */

export type Status =
  | "planned"
  | "proposed"
  | "queued"
  | "spawning"
  | "running"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled";

const STYLES: Record<Status, string> = {
  planned: "bg-zinc-700 text-zinc-200",
  proposed: "bg-slate-700 text-slate-100",
  queued: "bg-yellow-700 text-yellow-100",
  spawning: "bg-orange-700 text-orange-100 animate-pulse",
  running: "bg-orange-700 text-orange-100 animate-pulse",
  blocked: "bg-purple-700 text-purple-100",
  succeeded: "bg-emerald-700 text-emerald-100",
  failed: "bg-red-700 text-red-100",
  cancelled: "bg-stone-700 text-stone-200",
};

/** Tightened size variants. `compact` is used in inbox-row badges,
 *  `default` in standalone cards. */
type Size = "default" | "compact";

const SIZE_CLASSES: Record<Size, string> = {
  default: "px-2 py-0.5 text-[10px]",
  compact: "px-1.5 py-0 text-[9px]",
};

export default function StatusPill({
  status,
  size = "default",
}: {
  status: Status;
  size?: Size;
}) {
  return (
    <span
      className={
        "inline-flex items-center font-mono uppercase tracking-wider " +
        STYLES[status] +
        " " +
        SIZE_CLASSES[size]
      }
      aria-label={`status: ${status}`}
    >
      {status}
    </span>
  );
}
