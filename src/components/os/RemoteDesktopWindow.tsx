"use client";

import SpecialistInbox from "@/components/office/SpecialistInbox";

/**
 * RemoteDesktopWindow — content for a specialist's OS window.
 *
 * Previously this rendered its own 4-tab shell (CHAT / INBOX / FILES / LAST)
 * that wrapped a SECOND tab strip inside `SpecialistInbox` (Inbox /
 * Conversation). The outer Inbox tab read `assignment.headline` while the
 * server returns `title`, so it surfaced raw UUIDs; FILES was a static
 * stub; LAST duplicated artifact previews that SpecialistInbox already
 * surfaces inside each AssignmentRow.
 *
 * Decision (audit run 2026-05-18): drop the outer tabs. The window's body
 * is a single `SpecialistInbox`, which has the only Inbox/Conversation
 * toggle that ever worked. Less chrome, less duplication, no raw UUIDs.
 *
 * The orchestrator window (kind "chat") still uses ChatPanel directly —
 * see ChatWindow.tsx. This component is specialist-only.
 */

interface RemoteDesktopWindowProps {
  clientSlug: string;
  specialistId: string;
  /** Display name used inside SpecialistInbox's header. */
  specialistName?: string;
  /** Full chat-target roster so the embedded ChatPanel's switcher works. */
  targets?: Array<{ id: string; name: string }>;
  /** Bubbled up to the parent when the user switches target inside chat. */
  onTargetChange?: (next: string) => void;
  /** Forwarded so the desk's afterglow logic keeps working when this
   *  window holds the conversation. */
  onStreamDone?: (target: string) => void;
}

export function RemoteDesktopWindow({
  clientSlug,
  specialistId,
  specialistName,
  targets,
  onTargetChange,
  onStreamDone,
}: RemoteDesktopWindowProps) {
  const chatTargets =
    targets ?? [{ id: specialistId, name: specialistName ?? specialistId }];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        color: "var(--fg)",
        fontFamily: "var(--font-ui)",
        fontSize: 12.5,
      }}
    >
      <SpecialistInbox
        key={`${clientSlug}:inbox:${specialistId}`}
        clientSlug={clientSlug}
        specialistId={specialistId}
        specialistName={specialistName ?? specialistId}
        targets={chatTargets}
        onTargetChange={onTargetChange ?? (() => {})}
        onStreamDone={onStreamDone}
      />
    </div>
  );
}
