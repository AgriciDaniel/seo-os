"use client";

import ChatPanel from "@/components/ChatPanel";

export interface ChatWindowProps {
  clientSlug: string;
  target: string;
  targets: Array<{ id: string; name: string }>;
  enableLivePolling?: boolean;
  onProposeRun?: (specialistId: string) => void;
  onStreamDone?: (target: string) => void;
  onFocusSpecialist?: (specialistId: string) => void;
  onTargetChange?: (next: string) => void;
}

/**
 * ChatWindow — a window-kind wrapper around the existing ChatPanel.
 *
 * Click the orchestrator dais → spawn this with `target="orchestrator"`.
 * Specialist desks open RemoteDesktopWindow whose Chat tab uses the same
 * underlying ChatPanel, so the conversation experience is identical
 * regardless of entry point.
 */
export function ChatWindow({
  clientSlug,
  target,
  targets,
  enableLivePolling,
  onProposeRun,
  onStreamDone,
  onFocusSpecialist,
  onTargetChange,
}: ChatWindowProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--window-bg)",
      }}
    >
      <ChatPanel
        clientSlug={clientSlug}
        target={target}
        targets={targets}
        onTargetChange={onTargetChange ?? (() => {})}
        enableLivePolling={enableLivePolling}
        onProposeRun={onProposeRun}
        onStreamDone={onStreamDone}
        onFocusSpecialist={onFocusSpecialist}
      />
    </div>
  );
}
