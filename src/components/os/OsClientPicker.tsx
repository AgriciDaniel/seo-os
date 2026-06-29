"use client";

/**
 * OS-themed client picker for the MenuBar.
 *
 * Same active-client semantics as `<ClientNavPicker>` (URL `?client=` wins,
 * localStorage fallback, list mirror), but skinned with OS theme tokens
 * (`var(--accent)`, `var(--panel-bg)`, `var(--fg)`, etc.) so it reads as
 * a first-class part of the office chrome instead of a glued-on legacy
 * widget. Kept deliberately small — duplicating the ~30 LOC of picker
 * logic was cheaper than threading a `variant` prop through every JSX
 * branch of `ClientNavPicker`.
 */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface ClientRow {
  slug: string;
  name: string;
  site_url?: string | null;
}

const STORAGE_KEY = "seo-office:active-client";

function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function readStoredSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSlug(slug: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (slug) window.localStorage.setItem(STORAGE_KEY, slug);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / quota — fine to drop */
  }
}

export function OsClientPicker() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storedSlug, setStoredSlug] = useState<string | null>(null);
  // Delete flow state (mirrors ClientNavPicker): which row is confirming,
  // which slug is mid-DELETE, and the last error to surface inline.
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const refreshClients = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/clients", { cache: "no-store", signal });
      if (!r.ok) throw new Error(`client list failed: ${r.status}`);
      const d = (await r.json()) as { clients?: ClientRow[] };
      setClients(d.clients ?? []);
    } catch (err) {
      if (signal?.aborted) return;
      setLoadError(err instanceof Error ? err.message : "client list failed");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration
    setStoredSlug(readStoredSlug());
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => void refreshClients(ac.signal), 0);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [pathname, refreshClients]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const urlSlug = sp.get("client");

  useEffect(() => {
    if (!urlSlug) return;
    if (loading) return;
    const nextSlug =
      clients.length > 0 && !clients.some((c) => c.slug === urlSlug)
        ? null
        : urlSlug;
    writeStoredSlug(nextSlug);
    const timer = window.setTimeout(() => setStoredSlug(nextSlug), 0);
    return () => window.clearTimeout(timer);
  }, [urlSlug, loading, clients]);

  const onOfficeRoot = pathname === "/office";
  useEffect(() => {
    if (!onOfficeRoot) return;
    if (urlSlug) return;
    if (!storedSlug) return;
    if (clients.length === 0) return;
    if (!clients.some((c) => c.slug === storedSlug)) return;
    if (clients[0]?.slug === storedSlug) return;
    router.replace(`/office?client=${encodeURIComponent(storedSlug)}`);
  }, [onOfficeRoot, urlSlug, storedSlug, clients, router]);

  const validUrlSlug =
    urlSlug && (clients.length === 0 || clients.some((c) => c.slug === urlSlug))
      ? urlSlug
      : null;
  const validStoredSlug =
    storedSlug && (clients.length === 0 || clients.some((c) => c.slug === storedSlug))
      ? storedSlug
      : null;
  const activeSlug = validUrlSlug ?? validStoredSlug ?? clients[0]?.slug ?? null;
  const active = clients.find((c) => c.slug === activeSlug);

  // Purge a client via the existing DELETE route (archives the vault to
  // .seo-office/backups/ first, then cascades the SQLite rows). On success
  // refetch; if the purged client was active, fall back to /office so the
  // server picks a fresh default instead of a dead slug.
  async function handleDelete(slug: string) {
    setDeletingSlug(slug);
    setDeleteError(null);
    try {
      const r = await fetch(`/api/clients/${encodeURIComponent(slug)}?confirm=1`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? `delete failed: ${r.status}`);
      }
      const wasActive = slug === activeSlug;
      setConfirmSlug(null);
      await refreshClients();
      if (wasActive) {
        writeStoredSlug(null);
        setStoredSlug(null);
        router.replace("/office");
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setDeletingSlug(null);
    }
  }

  const label = active
    ? active.name
    : activeSlug
      ? prettifySlug(activeSlug)
      : "Clients";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((cur) => {
            const next = !cur;
            if (next) void refreshClients();
            return next;
          });
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5"
        style={{
          color: open ? "var(--fg)" : "var(--accent)",
          background: "transparent",
          border: "none",
          fontFamily: "var(--font-ui)",
          fontSize: 11.5,
          padding: 0,
          cursor: "pointer",
        }}
        title={
          active?.site_url
            ? `Active client: ${active.name} · ${active.site_url}`
            : `Active client: ${label}`
        }
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: active ? "var(--ok)" : "var(--fg-faint)",
          }}
        />
        <span style={{ maxWidth: "10rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <span aria-hidden style={{ fontSize: 9, lineHeight: 1, marginTop: 1 }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: 6,
            minWidth: 240,
            maxWidth: "min(20rem, calc(100vw - 1rem))",
            background: "var(--panel-bg)",
            border: "1px solid var(--chrome-border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 1000,
            backdropFilter: "blur(8px)",
            padding: "4px 0",
            fontFamily: "var(--font-ui)",
          }}
        >
          {loading && clients.length === 0 && (
            <p style={{ padding: "8px 12px", fontSize: 10.5, color: "var(--fg-faint)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              loading clients…
            </p>
          )}
          {!loading && loadError && (
            <button
              type="button"
              onClick={() => void refreshClients()}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 10.5,
                background: "transparent",
                border: "none",
                color: "var(--err)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
              role="menuitem"
            >
              reload clients
            </button>
          )}
          {!loading && !loadError && clients.length === 0 && (
            <p style={{ padding: "8px 12px", fontSize: 10.5, color: "var(--fg-faint)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              no clients yet
            </p>
          )}
          {clients.map((c) => {
            const isActive = c.slug === activeSlug;
            const href = `/office?client=${encodeURIComponent(c.slug)}`;
            const isConfirming = confirmSlug === c.slug;
            const isDeleting = deletingSlug === c.slug;
            return (
              <div
                key={c.slug}
                style={{
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  background: isActive ? "var(--chrome-bg)" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "stretch" }}>
                  <Link
                    href={href}
                    onClick={() => {
                      setOpen(false);
                      writeStoredSlug(c.slug);
                      setStoredSlug(c.slug);
                    }}
                    style={{
                      display: "block",
                      flex: 1,
                      minWidth: 0,
                      padding: "8px 12px",
                      color: "var(--fg)",
                      fontSize: 12.5,
                      textDecoration: "none",
                    }}
                    role="menuitem"
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </span>
                      {isActive && (
                        <span style={{ fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)" }}>
                          active
                        </span>
                      )}
                    </div>
                    {c.site_url && (
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: 11,
                          color: "var(--fg-faint)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.site_url}
                      </p>
                    )}
                  </Link>
                  {!isConfirming && (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmSlug(c.slug);
                        setDeleteError(null);
                      }}
                      title={`Delete ${c.name}`}
                      aria-label={`Delete client ${c.name}`}
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        padding: "0 10px",
                        background: "transparent",
                        border: "none",
                        color: "var(--fg-faint)",
                        cursor: "pointer",
                      }}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                      </svg>
                    </button>
                  )}
                </div>
                {isConfirming && (
                  <div style={{ padding: "2px 12px 10px" }}>
                    <p style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: "var(--err)" }}>
                      Delete <strong>{c.name}</strong>? This purges its vault. A backup is
                      saved to{" "}
                      <code style={{ color: "var(--fg-faint)" }}>.seo-office/backups/</code>{" "}
                      first.
                    </p>
                    {deleteError && (
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--err)" }}>
                        {deleteError}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button
                        type="button"
                        onClick={() => void handleDelete(c.slug)}
                        disabled={isDeleting}
                        style={{
                          padding: "3px 10px",
                          fontSize: 10.5,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "var(--err)",
                          background: "transparent",
                          border: "1px solid var(--err)",
                          borderRadius: 3,
                          cursor: isDeleting ? "default" : "pointer",
                          opacity: isDeleting ? 0.5 : 1,
                        }}
                      >
                        {isDeleting ? "deleting…" : "delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmSlug(null);
                          setDeleteError(null);
                        }}
                        disabled={isDeleting}
                        style={{
                          padding: "3px 10px",
                          fontSize: 10.5,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "var(--fg-muted)",
                          background: "transparent",
                          border: "1px solid var(--chrome-border)",
                          borderRadius: 3,
                          cursor: isDeleting ? "default" : "pointer",
                          opacity: isDeleting ? 0.5 : 1,
                        }}
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ margin: "4px 0", borderTop: "1px solid var(--chrome-border)" }} />
          <Link
            href="/clients/new"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              padding: "8px 12px",
              fontSize: 10.5,
              color: "var(--fg-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
            role="menuitem"
          >
            + new client
          </Link>
        </div>
      )}
    </div>
  );
}
