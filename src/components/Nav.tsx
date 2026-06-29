"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import ClientNavPicker from "./ClientNavPicker";

const links = [
  { href: "/office", label: "Office" },
  { href: "/setup", label: "Setup" },
];

export default function Nav() {
  const pathname = usePathname();
  // The /office route runs the OS-shell metamorphosis — its own MenuBar owns
  // brand + nav + client picker + theme dropdown + SYSTEM entry, so the
  // global Nav would be a duplicate row stealing 56px from the viewport.
  if (pathname?.startsWith("/office")) return null;
  return (
    <header className="sticky top-0 z-30 flex h-14 min-w-0 items-center justify-between gap-3 border-b border-graphite bg-abyss px-3 sm:px-5">
      <Link href="/" className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="hex inline-block h-3 w-3 bg-gold" />
        <span className="label-mono text-fg-pure" style={{ color: "var(--fg-pure)", letterSpacing: "0.2em" }}>
          SEO&nbsp;OFFICE
        </span>
      </Link>
      <nav className="relative flex min-w-0 shrink items-center justify-end gap-1 overflow-visible">
        {links.map((l) => {
          const active = pathname === l.href || pathname?.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={
                active
                  ? "px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white border-b border-gold"
                  : "px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-ash hover:text-white"
              }
            >
              {l.label}
            </Link>
          );
        })}
        {/* Merged client picker — replaces the old standalone Clients
            link AND the in-page top-left card. Wrapped in Suspense so
            its useSearchParams() call doesn't force the static
            /_not-found prerender to bail (Next.js 16 requirement). */}
        <Suspense fallback={null}>
          <ClientNavPicker />
        </Suspense>
      </nav>
    </header>
  );
}
