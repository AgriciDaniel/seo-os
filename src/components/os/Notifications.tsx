"use client";

import { useEffect, useRef, useState } from "react";
import { useSpecialistsStore } from "@/store/specialists";

interface Toast {
  id: string;
  kind: "success" | "error";
  text: string;
  bornAt: number;
}

export function Notifications() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenAtRef = useRef<number>(0);

  useEffect(() => {
    const unsub = useSpecialistsStore.subscribe((state) => {
      const ka = state.lastKnowledgeAdded;
      if (!ka || ka.at <= seenAtRef.current) return;
      seenAtRef.current = ka.at;
      const filename = ka.artifactPath.split("/").pop() ?? ka.artifactPath;
      setToasts((arr) => [
        ...arr,
        {
          id: `ka-${ka.at}`,
          kind: "success",
          text: `${ka.specialistId} added: ${filename}`,
          bornAt: performance.now(),
        },
      ]);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setToasts((arr) => arr.filter((t) => performance.now() - t.bornAt < 5000));
    }, 250);
    return () => clearInterval(interval);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed right-4 flex flex-col gap-2"
      style={{ top: 48, zIndex: 200 }}
      role="status"
      aria-live="polite"
    >
      {toasts.slice(-3).map((t) => (
        <div
          key={t.id}
          className="px-3 py-2"
          style={{
            background: "var(--panel-bg)",
            border: `1px solid ${t.kind === "success" ? "var(--ok)" : "var(--err)"}`,
            borderLeft: `3px solid ${t.kind === "success" ? "var(--ok)" : "var(--err)"}`,
            borderRadius: "var(--panel-radius)",
            color: "var(--fg)",
            fontFamily: "var(--font-ui)",
            fontSize: 11.5,
            maxWidth: 320,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
