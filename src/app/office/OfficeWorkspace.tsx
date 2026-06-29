"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import JobStream from "@/components/JobStream";
import LiveAgentsHud from "@/components/office/LiveAgentsHud";
import SweepCard from "@/components/office/SweepCard";
import { FilesApp } from "@/components/os/FilesApp";
import MusicToggle from "@/components/MusicToggle";
import ThemeToggle from "@/components/office/ThemeToggle";
import TaskFeedDock from "@/components/office/TaskFeedDock";
import { FanoutBadge } from "@/components/office/FanoutBadge";
import type { BrainNode } from "@/components/BrainScene";
import { toRegisteredId, toSceneId, type SpecialistId } from "@/components/office/positions";
import type { FocusId } from "@/components/office/OfficeScene";
import { ThemeProvider, useTheme } from "@/components/office/themes";
import { Desktop } from "@/components/os/Desktop";
import { MinimizedTray } from "@/components/os/MinimizedTray";
import { useSpecialistsStream } from "@/hooks/useSpecialistsStream";
import { useEdgeSync } from "@/hooks/useEdgeSync";
import { useWindowStore, OFFICE_SIDEBAR_W } from "@/store/windows";

const OfficeScene = dynamic(() => import("@/components/office/OfficeScene"), {
  ssr: false,
  loading: () => <OfficeSceneFallback status="loading" />,
});

interface ClientRow {
  slug: string;
  name: string;
  site_url: string;
  business_type: string | null;
  owner: string;
}

interface JobRecord {
  id: string;
  client_slug: string;
  specialist: string;
  status: string;
  progress: number;
  message: string | null;
  created_at: string;
  result_path: string | null;
}

interface NextActionShape {
  id: string;
  specialistId?: string;
  headline: string;
  rationale: string;
  severity: string;
}

interface OperationalStatusShape {
  costUsd: number;
  cacheHitRate: number | null;
  cacheReadInputTokens?: number | null;
  cacheCreationInputTokens?: number | null;
  evidenceCount: number;
  cachedEvidenceCount: number;
  highRiskReviewCount: number;
  brainHealth: {
    score: number;
    clean: boolean;
  };
  lastSweep: {
    status: string;
    readinessStatus: string | null;
    updatedAt: string;
    costUsd: number;
  } | null;
  integrations: {
    configured: number;
    total: number;
    requiredConfigured: number;
    requiredTotal: number;
    launchReady: boolean;
  };
}

interface Props {
  clients: ClientRow[];
  activeClient: ClientRow;
  specialists: Array<{ id: string; name: string }>;
  initialNextAction: NextActionShape;
  initialJobs: JobRecord[];
  initialOperationalStatus: OperationalStatusShape;
  buildBrainIntegrationReadiness: {
    total: number;
    ready: number;
    willSkip: number;
    missingIntegrationNames: string[];
  } | null;
}

type PaneTab = "chat" | "vault";
type OfficeSceneStatus =
  | "checking"
  | "loading"
  | "ready"
  | "webgl-unavailable"
  | "load-error";

function browserHasWebGL() {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

class OfficeSceneErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function OfficeWorkspace(props: Props) {
  // The theme context has to wrap every component that calls `useTheme()`,
  // including the inner workspace (which paints the WebGL container's CSS
  // background gradient) and the picker popover.
  return (
    <ThemeProvider persistKey="seo-office:theme" defaultTheme="cosmos">
      <OfficeWorkspaceInner key={props.activeClient.slug} {...props} />
    </ThemeProvider>
  );
}

function OfficeWorkspaceInner({
  activeClient,
  specialists,
  initialNextAction,
  initialJobs,
  initialOperationalStatus,
  buildBrainIntegrationReadiness,
}: Props) {
  // The active theme's CSS gradient is painted on the left-pane container
  // behind a transparent WebGL canvas. Theme switches transition smoothly
  // because we add `transition: background 0.8s ease` on the same element.
  const { bgGradient } = useTheme();
  useSpecialistsStream(activeClient.slug);
  useEdgeSync(activeClient.slug);
  const openWindow = useWindowStore((s) => s.open);

  function handleDeskClick(
    specialistId: string,
    originRect?: { left: number; top: number; width: number; height: number },
  ) {
    const rect = originRect ?? { left: 200, top: 200, width: 80, height: 56 };
    const name =
      chatTargets.find((t) => t.id === specialistId)?.name ?? specialistId;
    openWindow({
      kind: "remote-desktop",
      title: name,
      icon: "▣",
      identityKey: `remote-desktop:${specialistId}`,
      contentProps: {
        clientSlug: activeClient.slug,
        specialistId,
        specialistName: name,
        targets: chatTargets,
        onTargetChange: setTarget,
        onStreamDone: markSpecialistReplied,
      },
      originRect: rect,
      w: 560,
      h: 520,
    });
  }

  /** Orchestrator dais click → open the orchestrator chat as a window.
   *  Same surface area as desk clicks; popup-only chat per OS metaphor. */
  function handleOrchestratorClick(originRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) {
    const rect = originRect ?? { left: 240, top: 360, width: 80, height: 56 };
    openWindow({
      kind: "chat",
      title: "Orchestrator",
      icon: "●",
      identityKey: "chat:orchestrator",
      contentProps: {
        clientSlug: activeClient.slug,
        target: "orchestrator",
        targets: chatTargets,
        onTargetChange: setTarget,
        onStreamDone: markSpecialistReplied,
        onProposeRun: (id: string) => void runSpecialist(id),
        onFocusSpecialist: focusSpecialistSurface,
        // The orchestrator chat is the source-of-truth for sweep narration —
        // always poll for new turns so the user sees specialists land in
        // real time without manually refreshing.
        enableLivePolling: true,
      },
      originRect: rect,
      w: 720,
      h: 620,
    });
  }

  const [tab, setTab] = useState<PaneTab>("chat");
  const [target, setTarget] = useState<string>("orchestrator");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>(initialJobs);
  // Per-specialist "last replied in chat" timestamps (registered id → epoch ms).
  // Updated whenever a chat stream ends with a specialist as target; consumed
  // by OfficeScene → Specialist to keep desks visibly *present* during the
  // 5-minute post-activity window (matches the existing pulseTimestamps shape
  // used for completed jobs). Orchestrator replies are intentionally skipped
  // because the orchestrator's dais is always-on per spec §6 — no extra
  // signal needed.
  const [replyTimestamps, setReplyTimestamps] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  // Client-side "user has dismissed this specialist's afterglow" override.
  // SOFT dismissal — server-side SSE timestamps (jobs + future replies) win
  // on every new tick, so a fresh activity event automatically re-arms the
  // desk by removing its id from this set. Keyed by REGISTERED id (same as
  // replyTimestamps + pulseTimestamps so we can do straight lookups).
  // Reset on client switch via OfficeWorkspaceInner's `key={slug}` remount.
  const [dismissedSpecialists, setDismissedSpecialists] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  function markSpecialistReplied(replyTarget: string) {
    if (replyTarget === "orchestrator") return;
    setReplyTimestamps((prev) => {
      const next = new Map(prev);
      next.set(replyTarget, Date.now());
      return next;
    });
    // A new reply is fresh activity — re-arm the desk by clearing any
    // prior dismissal. Without this, dismissing a specialist would
    // permanently hide them until the user reloads the page.
    setDismissedSpecialists((prev) => {
      if (!prev.has(replyTarget)) return prev;
      const next = new Set(prev);
      next.delete(replyTarget);
      return next;
    });
  }
  function dismissSpecialist(registeredId: string) {
    setDismissedSpecialists((prev) => {
      if (prev.has(registeredId)) return prev;
      const next = new Set(prev);
      next.add(registeredId);
      return next;
    });
  }
  // Called by OfficeScene when a fresh job pulse arrives for a previously-
  // dismissed specialist. Symmetrical with the in-line re-arm inside
  // markSpecialistReplied for the chat path. Server-side activity always
  // wins over a stale client-side dismissal — a brand-new event makes the
  // desk visibly light up again.
  function clearDismissedSpecialist(registeredId: string) {
    setDismissedSpecialists((prev) => {
      if (!prev.has(registeredId)) return prev;
      const next = new Set(prev);
      next.delete(registeredId);
      return next;
    });
  }
  const [nextAction, setNextAction] =
    useState<NextActionShape>(initialNextAction);
  const [operationalStatus, setOperationalStatus] =
    useState<OperationalStatusShape>(initialOperationalStatus);
  const [runningSpecialist, setRunningSpecialist] = useState<string | null>(null);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [sceneStatus, setSceneStatus] =
    useState<OfficeSceneStatus>("checking");
  const [sceneRetryKey, setSceneRetryKey] = useState(0);
  // Auto-retry count for the 3D scene. The most common "load-error" is the
  // load-timeout firing while the dev server is saturated by a sweep — a short
  // wait + retry usually recovers once the chunk/WebGL context is free. Capped
  // so a genuinely broken GPU doesn't loop forever; manual RETRY resets it.
  // Held as STATE (not a ref) so the fallback can show "Reconnecting (n/2)…"
  // live and switch to a clear, recoverable message once attempts run out.
  const [sceneAutoRetries, setSceneAutoRetries] = useState(0);

  useEffect(() => {
    function syncTabFromHash() {
      if (window.location.hash === "#vault") {
        setTab("vault");
      } else if (window.location.hash === "#chat") {
        setTab("chat");
      }
    }
    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);
    return () => window.removeEventListener("hashchange", syncTabFromHash);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsNarrowViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const nextStatus = browserHasWebGL() ? "loading" : "webgl-unavailable";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSceneStatus(nextStatus);
  }, [sceneRetryKey]);

  useEffect(() => {
    if (sceneStatus !== "loading") return;
    // 12s: under heavy sweep load the dev server serves the R3F chunk slowly
    // and WebGL init contends with the busy GPU, so the old 8s false-fired a
    // "load-error" on otherwise-fine machines. 12s gives the first attempt
    // room without leaving the user staring at a frozen "loading" — a real
    // failure then surfaces as a recoverable message, not silent limbo.
    const timeout = window.setTimeout(() => {
      setSceneStatus((current) =>
        current === "loading" ? "load-error" : current,
      );
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [sceneStatus, sceneRetryKey]);

  // Auto-recover from a transient load-error (timeout/crash under load): retry
  // up to twice, ~3s apart, then leave it for the manual RETRY button. Reset
  // the counter on a successful load so a later hiccup gets fresh attempts.
  // The counter resets in onSceneReady (the event), not here — so this effect
  // only ever schedules retries, never sets state synchronously in its body.
  const MAX_SCENE_AUTO_RETRIES = 2;
  useEffect(() => {
    if (sceneStatus !== "load-error") return;
    if (sceneAutoRetries >= MAX_SCENE_AUTO_RETRIES) return;
    const t = window.setTimeout(() => {
      setSceneAutoRetries((n) => n + 1);
      setSceneStatus("checking");
      setSceneRetryKey((key) => key + 1);
    }, 3000);
    return () => window.clearTimeout(t);
  }, [sceneStatus, sceneAutoRetries]);

  // SweepCard precedence flag — true while a sweep card is rendered (running
  // or terminal+undismissed). When true we hide the NextActionCard so the two
  // don't stack in the same top-right slot. The SweepCard itself owns the
  // polling and notifies us via onPresenceChange.
  const [sweepPresent, setSweepPresent] = useState(false);
  // `sweepLive` is still reported by SweepCard but intentionally no longer
  // auto-opens the Orchestrator chat. Popping that window on every sweep
  // start covered the 3D office, and the sidebar (phase strip + task feed)
  // already shows live progress. The chat now opens ONLY on an explicit
  // orchestrator-dais click. (Value discarded; setter kept for the existing
  // SweepCard onLiveChange wiring.)
  const [, setSweepLive] = useState(false);
  const sweepDismissKey = `office:dismissed-sweep:${activeClient.slug}`;
  const [dismissedSweepId, setDismissedSweepId] = useState<string | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissedSweepId(localStorage.getItem(sweepDismissKey));
    } catch {
      /* storage unavailable — just leave it not dismissed */
    }
  }, [sweepDismissKey]);

  // Camera focus — single discriminated value covering brain / orchestrator /
  // any specialist scene id / null (default overview). The scene's CameraRig
  // flies to the matching pose; click empty space or press ESC to exit.
  const [focused, setFocused] = useState<FocusId>(null);

  /** Click a brain node → spawn a NoteWindow for that note. Identity key
   *  dedupes repeat clicks to the existing window. */
  function openBrainNoteWindow(node: BrainNode) {
    openWindow({
      kind: "note",
      title: node.title ?? node.id.split("/").pop() ?? node.id,
      icon: "📄",
      identityKey: `note:${node.id}`,
      contentProps: {
        clientSlug: activeClient.slug,
        path: node.id,
        approvalStatus: undefined,
      },
      w: 560,
      h: 540,
    });
  }

  // Legacy half-armed specialist gesture. The UI now opens a specialist's
  // inbox on the first desk click; keep the ref only so old partial state is
  // cleared during focus transitions.
  const armedSpecialistRef = useRef<SpecialistId | null>(null);

  function openVaultTab() {
    setTab("vault");
    if (window.location.hash !== "#vault") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#vault`,
      );
    }
  }

  function openOrchestratorNextStep() {
    void refreshClientState();
    setTab("chat");
    setTarget("orchestrator");
    armedSpecialistRef.current = null;
    if (window.location.hash !== "#chat") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#chat`,
      );
    }
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("seo-office:open-suggestions"));
    }, 50);
  }

  function focusSpecialistSurface(specialistId: string) {
    const sceneId = toSceneId(specialistId);
    setTarget(specialistId);
    setTab("chat");
    setFocused(sceneId ?? null);
    armedSpecialistRef.current = null;
  }

  // Ambient music — shared between two control entry points: the bottom-right
  // <MusicToggle> button and the orchestrator's speaker tower (3D mesh). The
  // <audio> element + state live here; both controls dispatch the same
  // `toggleMusic`. Volume is set once on mount; browsers block autoplay until
  // a user gesture, which is exactly what the toggle clicks provide.
  const MUSIC_SRC = "/audio/v2_07_soulful_dub_pop_bed_trim_152.mp3";
  const MUSIC_VOLUME = 0.4;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = MUSIC_VOLUME;
  }, []);
  async function toggleMusic() {
    const audio = audioRef.current;
    if (!audio) return;
    if (musicPlaying) {
      audio.pause();
      setMusicPlaying(false);
      return;
    }
    try {
      await audio.play();
      setMusicPlaying(true);
    } catch {
      /* play() rejected — browser couldn't classify the call as a user
       * gesture. Leave the toggle in its "off" state. */
    }
  }

  // Dismissable next-action card. Stored in localStorage keyed by the action
  // id, so closing one recommendation doesn't suppress the next (different
  // id) one. Read after mount to avoid hydration mismatch.
  const dismissKey = `office:dismissed-next-action:${activeClient.slug}`;
  const [dismissedActionId, setDismissedActionId] = useState<string | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissedActionId(localStorage.getItem(dismissKey));
    } catch {
      /* storage unavailable — just leave it not dismissed */
    }
  }, [dismissKey]);
  function dismissNextAction() {
    setDismissedActionId(nextAction.id);
    try {
      localStorage.setItem(dismissKey, nextAction.id);
    } catch {
      /* ignore */
    }
  }
  function restoreNextAction() {
    setDismissedActionId(null);
    try {
      localStorage.removeItem(dismissKey);
    } catch {
      /* ignore */
    }
  }
  const nextActionDismissed = dismissedActionId === nextAction.id;
  // Day 0 measurement gate stays "visible-but-minimized" when dismissed so
  // the user can't forget data is missing. Other dismissals just disappear.
  const showAdvisoryChip =
    nextActionDismissed &&
    nextAction.id === "connect-data-sources" &&
    nextAction.severity === "blocking";

  // ESC exits camera focus. (Brain notes now open as windows; the OS-level
  // KeyboardShortcuts handler closes the topmost window on its own ESC pass.)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (focused !== null) {
        setFocused(null);
        // Exiting focus clears any half-armed specialist; the user starts
        // fresh with the two-click gesture next time.
        armedSpecialistRef.current = null;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  // Right-pane width, drag-to-resize. Clamped, persisted to localStorage.
  // We initialize to 440 on both server and client (avoids hydration mismatch)
  // and rehydrate from localStorage in the first effect.
  const [rightWidth, setRightWidth] = useState(440);
  const draggingRef = useRef(false);

  useEffect(() => {
    // One-shot localStorage hydration. We start at 440 on both server and
    // client (matches SSR markup), then bump to the stored value once after
    // mount. The lint rule below is the conventional exception for this.
    try {
      const s = localStorage.getItem("office:rightWidth");
      if (!s) return;
      const n = parseInt(s, 10);
      if (!Number.isFinite(n)) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRightWidth(Math.max(320, Math.min(900, n)));
    } catch {
      /* storage unavailable — keep default */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("office:rightWidth", String(rightWidth));
    } catch {
      /* ignore */
    }
  }, [rightWidth]);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const w = window.innerWidth - e.clientX;
      setRightWidth(Math.max(320, Math.min(900, w)));
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const registeredIds = useMemo(
    () => new Set(specialists.map((s) => s.id)),
    [specialists],
  );

  // React Compiler memoizes this automatically; manual useMemo dropped to
  // avoid `preserve-manual-memoization` when consumed by the desk-click
  // handlers (which the compiler can't fully analyze through).
  const chatTargets = [
    { id: "orchestrator", name: "Orchestrator" },
    ...specialists.map((s) => ({ id: s.id, name: s.name })),
  ];

  async function runSpecialist(specialistId: string) {
    const r = await fetch(`/api/clients/${activeClient.slug}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialist: specialistId }),
    });
    const data = await r.json();
    if (data.ok && data.job) {
      setActiveJobId(data.job.id);
      setRunningSpecialist(specialistId);
      setJobs((prev) => [data.job, ...prev]);
    }
  }

  async function onJobDone() {
    setRunningSpecialist(null);
    await refreshClientState();
  }

  async function refreshClientState() {
    const [jobsRes, clientRes] = await Promise.all([
      fetch(`/api/clients/${activeClient.slug}/jobs`, { cache: "no-store" }),
      fetch(`/api/clients/${activeClient.slug}`, { cache: "no-store" }),
    ]);
    const jobsData = await jobsRes.json().catch(() => ({}));
    if (jobsData.jobs) setJobs(jobsData.jobs);
    const clientData = await clientRes.json().catch(() => ({}));
    if (clientData.nextAction) setNextAction(clientData.nextAction);
    if (clientData.operationalStatus) {
      setOperationalStatus(clientData.operationalStatus);
    }
  }

  const canRenderScene = sceneStatus === "loading" || sceneStatus === "ready";

  // Compute StatusBar props from operationalStatus
  const cacheReadTokens = operationalStatus.cacheReadInputTokens ?? null;
  const cacheCreateTokens = operationalStatus.cacheCreationInputTokens ?? null;
  const cacheHitsLabel =
    cacheReadTokens !== null && cacheCreateTokens !== null
      ? `${cacheReadTokens}/${cacheReadTokens + cacheCreateTokens}t`
      : `${operationalStatus.cachedEvidenceCount}/${operationalStatus.evidenceCount}`;
  const { configured, total, requiredConfigured, requiredTotal } =
    operationalStatus.integrations;
  const integrationsLabel =
    requiredTotal > 0
      ? `${requiredConfigured}/${requiredTotal}`
      : `${configured}/${total}`;

  return (
    <Desktop
      clientName={activeClient.name}
      statusBarProps={{
        health: operationalStatus.brainHealth.score,
        cost: `$${operationalStatus.costUsd.toFixed(2)}`,
        cachePct:
          operationalStatus.cacheHitRate === null
            ? undefined
            : Math.round(operationalStatus.cacheHitRate * 100),
        cacheHits: cacheHitsLabel,
        integrations: integrationsLabel,
        lastSweep: operationalStatus.lastSweep
          ? formatShortDate(operationalStatus.lastSweep.updatedAt)
          : "none",
        reviewCount: operationalStatus.highRiskReviewCount,
        activeAgents: runningSpecialist ? 1 : 0,
        clientSlug: activeClient.slug,
      }}
      wallpaper={
        <div
          className="relative h-full w-full"
          style={{ background: bgGradient, transition: "background 0.8s ease" }}
        >
          {/* Shared <audio> element. Both the bottom-right MusicToggle button
              and the orchestrator's speaker tower call `toggleMusic` against it. */}
          <audio
            ref={audioRef}
            src={MUSIC_SRC}
            loop
            preload="metadata"
            onPause={() => setMusicPlaying(false)}
            onPlay={() => setMusicPlaying(true)}
            onEnded={() => setMusicPlaying(false)}
          />

          {canRenderScene && (
            <OfficeSceneErrorBoundary
              key={sceneRetryKey}
              onError={() => setSceneStatus("load-error")}
            >
              <OfficeScene
                clientSlug={activeClient.slug}
                focused={focused}
                chatTarget={target}
                replyTimestamps={replyTimestamps}
                dismissedSpecialists={dismissedSpecialists}
                onDismissSpecialist={dismissSpecialist}
                onClearDismiss={clearDismissedSpecialist}
                musicPlaying={musicPlaying}
                onSceneReady={() => {
                  setSceneStatus("ready");
                  setSceneAutoRetries(0);
                }}
                onWebGLUnavailable={() => setSceneStatus("webgl-unavailable")}
                onToggleMusic={() => void toggleMusic()}
                onDeskClick={handleDeskClick}
                onSelectBrain={() => {
                  setFocused("brain");
                  armedSpecialistRef.current = null;
                }}
                onSelectBrainNode={openBrainNoteWindow}
                onUnfocus={() => {
                  setFocused(null);
                  armedSpecialistRef.current = null;
                }}
                onSelectOrchestrator={() => {
                  // Orchestrator dais click → camera-focus + open the
                  // orchestrator chat window (chat is popup-only now).
                  setFocused("orchestrator");
                  setTarget("orchestrator");
                  armedSpecialistRef.current = null;
                  handleOrchestratorClick();
                }}
                onSelectDesk={(sceneId: SpecialistId) => {
                  // Map scene id → registered id for the chat target. The
                  // remote-desktop window is spawned via onDeskClick (Phase
                  // 3.5 wiring); here we only update target state + camera
                  // focus so the chat window opening receives the right id.
                  const registered = toRegisteredId(sceneId);
                  if (!registered) return;
                  setTarget(registered);
                  setFocused(sceneId);
                  armedSpecialistRef.current = null;
                }}
              />
            </OfficeSceneErrorBoundary>
          )}

          {sceneStatus !== "ready" && (
            <OfficeSceneFallback
              status={sceneStatus}
              autoRetries={sceneAutoRetries}
              maxAutoRetries={MAX_SCENE_AUTO_RETRIES}
              onRetry={() => {
                setSceneAutoRetries(0);
                setSceneStatus("checking");
                setSceneRetryKey((key) => key + 1);
              }}
              onOpenChat={() => setTab("chat")}
              onOpenVault={() => setTab("vault")}
            />
          )}

          {/* Fan-out progress badge — top-right overlay that latches when
              ≥3 specialists run in parallel. */}
          <FanoutBadge clientSlug={activeClient.slug} />

          {/* Back-to-overview button — visible whenever any entity is focused */}
          {focused !== null && (
            <button
              onClick={() => {
                setFocused(null);
                armedSpecialistRef.current = null;
              }}
              className="pointer-events-auto absolute left-4 top-4 z-20 border border-gold bg-abyss/85 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-gold backdrop-blur hover:bg-gold/10"
            >
              ← back to office
            </button>
          )}

          {/* Advisory mode chip — sits below the HUD to avoid collision.
              Only renders when the measurement gate was dismissed; the
              extra offset keeps everything readable when both are up. */}
          {showAdvisoryChip && (
            <div className="pointer-events-auto absolute left-4 top-28 z-10">
              <AdvisoryModeChip onRestore={restoreNextAction} />
            </div>
          )}

          {/* UI consolidation: SweepCard + NextActionCard + JobStream used
              to float over the canvas in three separate spots. They now
              live inside the right sidebar's TaskFeedDock as:
                - one-line next-action banner (replaces NextActionCard)
                - live-job tail under the tally header (replaces JobStream)
                - the SweepCard's status info is already in the StatusBar's
                  LAST SWEEP / REVIEW cells + the TaskFeed entries themselves,
                  so the floating card was redundant.
              The hidden side effects the SweepCard owned — auto-opening the
              orchestrator chat on sweep start, refreshing client state on
              terminal, polling /sweeps/current — are preserved by mounting
              SweepCard invisibly (display:none) below. Pulling them apart
              into a hook is the follow-up; this keeps the visual cleanup
              cleanly revertible. */}
          <div style={{ display: "none" }} aria-hidden>
            <SweepCard
              clientSlug={activeClient.slug}
              dismissedSweepId={dismissedSweepId}
              onDismiss={(sweepId) => {
                setDismissedSweepId(sweepId);
                try {
                  localStorage.setItem(sweepDismissKey, sweepId);
                } catch {
                  /* ignore */
                }
              }}
              onPresenceChange={setSweepPresent}
              onViewBrain={openVaultTab}
              onPlanNext={openOrchestratorNextStep}
              onTerminal={() => void refreshClientState()}
              onLiveChange={setSweepLive}
              onFocusSpecialist={focusSpecialistSurface}
            />
          </div>

          {/* bottom-right cluster — theme + music + control hint.
              Theme moved here from MenuBar so all ambience controls cluster. */}
          <div className="absolute bottom-4 right-4 z-10 flex items-stretch gap-2">
            <ThemeToggle />
            <MusicToggle playing={musicPlaying} onToggle={() => void toggleMusic()} />
            <div className="pointer-events-none flex items-center border border-graphite bg-abyss/80 px-3 backdrop-blur">
              <p className="label-micro">click a desk · drag to orbit</p>
            </div>
          </div>

        </div>
      }
      dock={
        <>
          {/* Files section */}
          <section
            className="flex flex-col overflow-hidden border-b"
            style={{ borderColor: "var(--chrome-border)", minHeight: 0 }}
          >
            <header
              className="flex items-center gap-2 px-3.5 py-2.5"
              style={{
                background: "var(--titlebar-bg)",
                borderBottom: "1px solid var(--chrome-border)",
                fontFamily: "var(--font-ui)",
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--fg-muted)",
              }}
            >
              <span style={{ color: "var(--accent)" }}>📁</span> Files · vault
            </header>
            <div className="flex-1 overflow-y-auto">
              <FilesApp clientSlug={activeClient.slug} />
            </div>
          </section>

          {/* Chat panels are no longer docked. Click the orchestrator dais
              or a specialist desk to open a chat window. SYSTEM menu item
              opens the orchestrator chat as well. */}
          <MinimizedTray />
        </>
      }
      dockFooter={
        // Only render when there's actual activity. The OfficeStatusStrip
        // that lived here is gone — the same numbers already render in the
        // bottom StatusBar (health / cost / cache / integr / sweep / review).
        // What's left is the live-activity feed: active agents + recent jobs.
        // Both collapse to nothing during steady idle.
        <TaskFeedDock
          clientSlug={activeClient.slug}
          initialJobs={jobs.map((j) => ({
            id: j.id,
            specialist: j.specialist,
            status: j.status,
            created_at: j.created_at,
            message: j.message,
            // finished_at isn't on the slim JobRecord shape we get here,
            // so we fall back to created_at inside the dock.
            // message is forwarded so the dock can promote
            // status="cancelled" + message starts with "skipped:" to the
            // yellow ⊘ SKIPPED state (vs the red ✗ FAILED collapse).
          }))}
          nextAction={
            // Hide the banner once the user dismissed this action id, when
            // a sweep is live (the SweepCard's task feed already narrates
            // every step), or when the action is "idle" (nothing to do).
            !sweepPresent && !nextActionDismissed && nextAction.id !== "idle"
              ? {
                  id: nextAction.id,
                  severity: nextAction.severity as "blocking" | "high" | "medium" | "low" | "idle",
                  headline: nextAction.headline,
                  rationale: nextAction.rationale,
                  specialistId: nextAction.specialistId,
                  canRun: Boolean(
                    nextAction.specialistId &&
                      registeredIds.has(nextAction.specialistId),
                  ),
                  onRun: nextAction.specialistId
                    ? () => runSpecialist(nextAction.specialistId!)
                    : undefined,
                  onDismiss: dismissNextAction,
                  disabled: Boolean(activeJobId && runningSpecialist),
                }
              : null
          }
          activeJob={
            activeJobId
              ? {
                  slug: activeClient.slug,
                  jobId: activeJobId,
                  onDone: () => {
                    setActiveJobId(null);
                    void onJobDone();
                  },
                }
              : null
          }
        />
      }
    />
  );
}

// OfficeStatusStrip + MetricCell removed — their data renders in the bottom
// StatusBar (single source of truth). formatShortDate kept; consumed by the
// StatusBar props mapping above for the lastSweep label.

function formatShortDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function OfficeSceneFallback({
  status,
  autoRetries = 0,
  maxAutoRetries = 0,
  onRetry,
  onOpenChat,
  onOpenVault,
}: {
  status: OfficeSceneStatus;
  /** How many automatic reconnect attempts have fired so far. */
  autoRetries?: number;
  /** The cap, after which we stop auto-retrying and show a recoverable state. */
  maxAutoRetries?: number;
  onRetry?: () => void;
  onOpenChat?: () => void;
  onOpenVault?: () => void;
}) {
  // A load-error while auto-retries remain is a transient reconnect, not a
  // dead end — say so, in gold, instead of the alarming "could not load".
  const reconnecting = status === "load-error" && autoRetries < maxAutoRetries;
  const copy =
    status === "webgl-unavailable"
      ? {
          title: "3D office paused",
          detail: "WebGL is unavailable in this browser session.",
          accent: "bg-red-400",
        }
      : status === "load-error"
        ? reconnecting
          ? {
              title: "Reconnecting the 3D workspace",
              detail: `The office is busy — attempt ${autoRetries + 1} of ${maxAutoRetries}. This usually recovers on its own; chat and vault stay available.`,
              accent: "bg-gold",
            }
          : {
              title: "3D office could not load",
              detail:
                "After several reloads the browser can run out of WebGL/GPU contexts. Reload the page to recover the 3D view — chat and vault keep working in the meantime.",
              accent: "bg-red-400",
            }
        : {
            title: "Preparing office",
            detail: "Loading the 3D workspace.",
            accent: "bg-gold",
          };

  return (
    <div className="pointer-events-auto absolute inset-0 z-[5] grid place-items-center bg-abyss/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[34rem] border border-graphite bg-abyss/90 p-4 shadow-2xl shadow-black/45 backdrop-blur">
        <div className="relative h-40 overflow-hidden border border-graphite bg-iron">
          <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/70 bg-gold/10 shadow-[0_0_44px_rgba(212,175,55,0.22)]" />
          <div className="absolute left-[18%] top-[24%] h-10 w-16 border border-graphite bg-abyss/85" />
          <div className="absolute right-[18%] top-[24%] h-10 w-16 border border-graphite bg-abyss/85" />
          <div className="absolute bottom-[20%] left-[20%] h-10 w-16 border border-graphite bg-abyss/85" />
          <div className="absolute bottom-[20%] right-[20%] h-10 w-16 border border-graphite bg-abyss/85" />
          <div className="absolute inset-x-10 top-1/2 border-t border-gold/30" />
          <div className="absolute inset-y-8 left-1/2 border-l border-gold/30" />
          <span
            className={`absolute right-3 top-3 h-2 w-2 rounded-full ${copy.accent}`}
          />
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-micro">{copy.title}</p>
            <p className="mt-1 text-[13px] leading-5 text-ash">{copy.detail}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {status === "load-error" && !reconnecting && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="border border-gold bg-gold/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-gold transition-colors hover:bg-gold/20"
              >
                Reload page
              </button>
            )}
            {onRetry && status !== "loading" && status !== "checking" && (
              <button
                type="button"
                onClick={onRetry}
                className="border border-gold bg-gold/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-gold transition-colors hover:bg-gold/20"
              >
                Retry
              </button>
            )}
            {onOpenChat && (
              <button
                type="button"
                onClick={onOpenChat}
                className="border border-graphite bg-iron px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white transition-colors hover:border-gold/70"
              >
                Chat
              </button>
            )}
            {onOpenVault && (
              <button
                type="button"
                onClick={onOpenVault}
                className="border border-graphite bg-iron px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white transition-colors hover:border-gold/70"
              >
                Vault
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  id,
  current,
  onClick,
  label,
}: {
  id: PaneTab;
  current: PaneTab;
  onClick: (id: PaneTab) => void;
  label: string;
}) {
  const active = id === current;
  return (
    <button
      onClick={() => onClick(id)}
      className={
        active
          ? "flex-1 border-b-2 border-gold px-3 py-2.5 text-[11px] uppercase tracking-[0.2em] text-white"
          : "flex-1 border-b-2 border-transparent px-3 py-2.5 text-[11px] uppercase tracking-[0.2em] text-ash hover:text-white"
      }
    >
      {label}
    </button>
  );
}

function NextActionCard({
  nextAction,
  registered,
  buildBrainIntegrationReadiness,
  onRun,
  onClose,
  disabled,
}: {
  nextAction: NextActionShape;
  registered: Set<string>;
  buildBrainIntegrationReadiness: {
    total: number;
    ready: number;
    willSkip: number;
    missingIntegrationNames: string[];
  } | null;
  onRun: (id: string) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const canRun =
    nextAction.specialistId &&
    nextAction.id !== "idle" &&
    registered.has(nextAction.specialistId);
  // Day 0 measurement-access gate: emitted as blocking because
  // no specialist can give data-backed advice until GSC / GA4 / ad networks /
  // GBP / etc. are connected. The CTA points at the integrations section on
  // /setup; dismissing leaves the minimized "advisory mode" chip below.
  const isMeasurementGate =
    nextAction.id === "connect-data-sources" && nextAction.severity === "blocking";
  const accent =
    {
      blocking: "border-red-500/50",
      high: "border-gold",
      medium: "border-blue-500/50",
      low: "border-graphite",
      idle: "border-emerald-500/50",
    }[nextAction.severity] ?? "border-graphite";

  return (
    <div
      className={`pointer-events-auto relative max-w-sm border ${accent} bg-abyss/85 px-4 py-3 pr-9 backdrop-blur`}
    >
      <button
        type="button"
        onClick={onClose}
        title="Dismiss this recommendation"
        aria-label="Dismiss this recommendation"
        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center text-[14px] leading-none text-ash transition-colors hover:bg-graphite/40 hover:text-white"
      >
        ×
      </button>
      <p className="label-micro">next action · {nextAction.severity}</p>
      <p className="mt-1 text-[14px] font-medium uppercase tracking-tight text-white">
        {nextAction.headline}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-ash">{nextAction.rationale}</p>
      {buildBrainIntegrationReadiness && nextAction.id !== "idle" && (
        <p className="mt-2 text-[10px] leading-relaxed text-fg-shadow">
          build brain · {buildBrainIntegrationReadiness.total} specialists ·{" "}
          {buildBrainIntegrationReadiness.ready} ready
          {buildBrainIntegrationReadiness.willSkip > 0 && (
            <>
              {" "}
              · {buildBrainIntegrationReadiness.willSkip} will skip
              {buildBrainIntegrationReadiness.missingIntegrationNames.length > 0 &&
                ` (${buildBrainIntegrationReadiness.missingIntegrationNames.join(", ")})`}
            </>
          )}
        </p>
      )}
      {canRun && (
        <button
          onClick={() => onRun(nextAction.specialistId!)}
          disabled={disabled}
          className="btn-cta mt-3"
        >
          Run {nextAction.specialistId}
        </button>
      )}
      {isMeasurementGate && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href="/setup#integrations"
            className="btn-cta"
          >
            Connect data sources
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="border border-graphite bg-charcoal px-3 py-1.5 text-[11px] uppercase tracking-wider text-ash transition-colors hover:border-white hover:text-white"
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}

function AdvisoryModeChip({ onRestore }: { onRestore: () => void }) {
  return (
    <button
      type="button"
      onClick={onRestore}
      title="Measurement access not configured — click to show the panel again"
      className="pointer-events-auto inline-flex items-center gap-1.5 border border-red-500/40 bg-abyss/85 px-2.5 py-1 text-[10px] uppercase tracking-wider text-red-200 backdrop-blur transition-colors hover:border-red-400 hover:text-red-100"
    >
      <span aria-hidden>⚠</span>
      <span>advisory mode</span>
    </button>
  );
}
