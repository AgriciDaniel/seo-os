"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Notifications } from "./Notifications";
import { OsClientPicker } from "./OsClientPicker";
import { useWindowStore } from "@/store/windows";

/**
 * MenuBar — top OS shell strip.
 *
 * Layout: [brand] -- spacer -- [nav][client picker][notifications]
 *
 * The nav cluster lives on the right (per user pref) so the eye lands on
 * the brand badge first and the action surface (OFFICE/SETUP/SYSTEM +
 * active client + notifications) sits where the cursor usually rests.
 *
 * The theme picker dropdown used to live here on the right edge. It moved
 * to a small icon next to MusicToggle in the bottom-right cluster (see
 * ThemeToggle.tsx) so all ambience controls cluster together.
 */
export function MenuBar() {
  const openWindow = useWindowStore((s) => s.open);
  const pathname = usePathname();

  function openSystem() {
    openWindow({
      kind: "system",
      title: "System",
      icon: "⚙",
      contentProps: {},
      w: 560,
      h: 520,
      identityKey: "system:status",
    });
  }

  const isOffice = pathname?.startsWith("/office") ?? false;
  const isSetup = pathname?.startsWith("/setup") ?? false;

  return (
    <div
      className="flex items-center px-4"
      style={{
        height: 38,
        background: "var(--chrome-bg)",
        borderBottom: "1px solid var(--chrome-border)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <span
        style={{
          color: "var(--accent)",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.06em",
        }}
      >
        ◯ SEO OFFICE
      </span>
      <div className="ml-auto flex items-center gap-5">
        <nav className="flex gap-5" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
          <Link
            href="/office"
            style={{
              color: isOffice ? "var(--fg)" : "var(--fg-muted)",
              borderBottom: isOffice ? "1px solid var(--accent)" : "1px solid transparent",
              paddingBottom: 2,
            }}
          >
            OFFICE
          </Link>
          <Link
            href="/setup"
            style={{
              color: isSetup ? "var(--fg)" : "var(--fg-muted)",
              borderBottom: isSetup ? "1px solid var(--accent)" : "1px solid transparent",
              paddingBottom: 2,
            }}
          >
            SETUP
          </Link>
          <button
            onClick={openSystem}
            style={{
              color: "var(--fg-muted)",
              background: "transparent",
              border: "none",
              fontSize: 11.5,
              padding: 0,
              cursor: "pointer",
              letterSpacing: "inherit",
            }}
          >
            SYSTEM
          </button>
        </nav>
        <OsClientPicker />
        <Notifications />
      </div>
    </div>
  );
}
