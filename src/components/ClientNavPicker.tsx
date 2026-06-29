"use client";

/**
 * Header-level client picker that replaces the old "Clients" nav link
 * AND the top-left floating client card on `/office`. One place to
 * switch the active client, with a built-in shortcut to the full
 * Clients dashboard for management.
 *
 * Data flow:
 *   - Clients are fetched from `/api/clients` on mount AND on every
 *     pathname change, so a freshly-created client appears in the list
 *     as soon as `/clients/new` redirects to `/office?client=<slug>`.
 *   - The active slug is read in priority order:
 *       1. `?client=` on the URL (canonical on /office)
 *       2. `localStorage["seo-office:active-client"]` (persists across
 *          /setup and the office for pages that don't carry the slug
 *          in their URL)
 *       3. `clients[0]?.slug` (first client as last-resort default)
 *   - Whenever the URL has `?client=`, we mirror it into localStorage so
 *     other pages can read it back.
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

/** Best-effort pretty label when we have a slug but no fetched record yet
 *  (e.g. right after `/clients/new` redirects to `/office?client=<slug>`
 *  but our list hasn't been refetched). Turns `smoke-test-co` into
 *  `Smoke Test Co`. */
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

export default function ClientNavPicker() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storedSlug, setStoredSlug] = useState<string | null>(null);
  // Delete flow: which row is in its inline confirm state, which slug is
  // mid-DELETE, and the last error so a failed purge surfaces in the row.
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

  // Hydrate the localStorage-backed slug after mount (avoids SSR hydration
  // mismatch — localStorage is browser-only). Single one-shot read is the
  // canonical post-hydration pattern for browser-only storage; same shape
  // OfficeScene already uses for prefers-reduced-motion.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration from localStorage
    setStoredSlug(readStoredSlug());
  }, []);

  // Refetch the client list whenever we navigate. Cheap (SQLite read,
  // <30ms) and keeps newly-created clients visible after the redirect.
  useEffect(() => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => void refreshClients(ac.signal), 0);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [pathname, refreshClients]);

  // Outside-click closes the popover. Attached only while open so we're
  // not paying for a listener on every nav render.
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
  // Mirror the URL into localStorage so /setup and any other page
  // without a slug in its URL can read the active client back.
  // The setState is the desired cross-page persistence write — the
  // existing functional check would no-op when urlSlug already matches
  // storedSlug, but the rule fires regardless of value.
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

  // Auto-restore the stored client when the user lands on `/office`
  // without an explicit `?client=` param. Otherwise the server picks
  // `clients[0]` regardless of which client the user last had open,
  // making nav feel like it "forgot" them.
  const onOfficeRoot = pathname === "/office";
  useEffect(() => {
    if (!onOfficeRoot) return;
    if (urlSlug) return; // explicit choice, leave alone
    if (!storedSlug) return; // nothing to restore
    if (clients.length === 0) return; // wait for the list before validating
    if (!clients.some((c) => c.slug === storedSlug)) return; // stale slug
    // Avoid a redirect when the stored slug happens to be the default.
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
  // we refetch the list; if the purged client was active, fall back to
  // /office so the server picks a fresh default instead of a dead slug.
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

  // Label resolves in three tiers: full record (preferred), prettified
  // slug (when the slug is known but the list hasn't loaded the record
  // yet — happens right after creating a client), or "Clients" (no
  // slug at all yet).
  const label = active
    ? active.name
    : activeSlug
      ? prettifySlug(activeSlug)
      : "Clients";

  const onClientsPage =
    pathname === "/office" || pathname?.startsWith("/office");

  return (
    <div ref={wrapperRef} className="relative min-w-0">
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
        className={
          (onClientsPage || open
            ? "px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white border-b border-gold"
            : "px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-ash hover:text-white") +
          " flex min-w-0 items-center gap-1.5"
        }
        title={
          active?.site_url
            ? `Active client: ${active.name} · ${active.site_url}`
            : `Active client: ${label}`
        }
      >
        <span aria-hidden className="hex inline-block h-2 w-2 bg-gold" />
        <span className="max-w-[8rem] truncate sm:max-w-[12rem]">{label}</span>
        <span aria-hidden className="text-[9px] leading-none">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-[min(18rem,calc(100vw-1rem))] border border-graphite bg-abyss/95 py-1 shadow-xl backdrop-blur"
        >
          {loading && clients.length === 0 && (
            <p className="px-3 py-2 text-[11px] uppercase tracking-wider text-ash">
              loading clients...
            </p>
          )}
          {!loading && loadError && (
            <button
              type="button"
              onClick={() => void refreshClients()}
              className="block w-full px-3 py-2 text-left text-[11px] uppercase tracking-wider text-red-300 hover:bg-charcoal/40"
              role="menuitem"
            >
              reload clients
            </button>
          )}
          {!loading && !loadError && clients.length === 0 && (
            <p className="px-3 py-2 text-[11px] uppercase tracking-wider text-ash">
              no clients yet
            </p>
          )}
          {clients.map((c) => {
            const isActive = c.slug === activeSlug;
            // Switch the active client by navigating to /office?client=<slug>.
            // The server component picks up the new ?client and rerenders
            // OfficeWorkspace with the right manifest. Full navigation
            // because the workspace tree depends on server-side data.
            const href = `/office?client=${encodeURIComponent(c.slug)}`;
            const isConfirming = confirmSlug === c.slug;
            const isDeleting = deletingSlug === c.slug;
            return (
              <div
                key={c.slug}
                className={
                  isActive
                    ? "border-l-2 border-gold bg-charcoal/40"
                    : "border-l-2 border-transparent hover:bg-charcoal/40"
                }
              >
                <div className="flex items-stretch">
                  <Link
                    href={href}
                    onClick={() => {
                      setOpen(false);
                      writeStoredSlug(c.slug);
                      setStoredSlug(c.slug);
                    }}
                    className="block min-w-0 flex-1 px-3 py-2 text-sm text-white"
                    role="menuitem"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{c.name}</span>
                      {isActive && (
                        <span className="text-[10px] uppercase tracking-wider text-gold">
                          active
                        </span>
                      )}
                    </div>
                    {c.site_url && (
                      <p className="truncate text-[11px] text-ash">{c.site_url}</p>
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
                      className="shrink-0 px-2.5 text-ash transition-colors hover:text-red-300"
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
                  <div className="px-3 pb-2.5 pt-0.5">
                    <p className="text-[11px] leading-snug text-red-300">
                      Delete <span className="font-semibold">{c.name}</span>? This purges
                      its vault. A backup is saved to{" "}
                      <code className="text-ash">.seo-office/backups/</code> first.
                    </p>
                    {deleteError && (
                      <p className="mt-1 text-[11px] text-red-400">{deleteError}</p>
                    )}
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDelete(c.slug)}
                        disabled={isDeleting}
                        className="rounded-sm bg-red-500/15 px-2.5 py-1 text-[11px] uppercase tracking-wider text-red-300 hover:bg-red-500/25 disabled:opacity-50"
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
                        className="rounded-sm px-2.5 py-1 text-[11px] uppercase tracking-wider text-ash hover:text-white disabled:opacity-50"
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="my-1 border-t border-graphite/70" />
          <Link
            href="/clients/new"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[11px] uppercase tracking-wider text-ash hover:bg-charcoal/40 hover:text-white"
            role="menuitem"
          >
            + new client
          </Link>
          <Link
            href="/office"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[11px] uppercase tracking-wider text-ash hover:bg-charcoal/40 hover:text-white"
            role="menuitem"
          >
            manage all clients →
          </Link>
        </div>
      )}
    </div>
  );
}
