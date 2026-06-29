"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { INTEGRATIONS } from "@/lib/integrations/catalog";

interface ProviderAvailability {
  id: string;
  name: string;
  authMode: "api-key" | "subscription";
  installed: boolean;
  authed: boolean;
  version?: string;
  error?: string;
}

interface Status {
  providers?: ProviderAvailability[];
  selectedProvider?: string | null;
  configuredProvider?: string | null;
  integrations?: Record<string, { configured: boolean }>;
  python?: { ok: true; version: string } | { ok: false; error: string };
}

interface ClientRow {
  slug: string;
  name: string;
  site_url?: string | null;
}

/**
 * System window — at-a-glance reality check.
 *
 * Surfaces the data the user actually cares about:
 *   1. Active client (from URL/localStorage — matches MenuBar picker)
 *   2. LLM provider (which one is doing the work today)
 *   3. Integrations (which keys are wired, with green/grey dots)
 *   4. Python interpreter (vendored claude-seo scripts need it)
 *
 * The previous version iterated the `providers` ARRAY with Object.entries
 * which produced numeric string keys ("0", "1", "2", "3") all marked
 * "not configured" — useless. We now iterate the catalog-backed
 * `integrations` map and read provider availability separately.
 */
export function SystemApp() {
  const [status, setStatus] = useState<Status | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const sp = useSearchParams();

  useEffect(() => {
    let abort = false;
    void Promise.all([
      fetch("/api/setup/status").then((r) => r.json()).catch(() => null),
      fetch("/api/clients").then((r) => r.json()).catch(() => null),
    ]).then((results) => {
      if (abort) return;
      const [statusData, clientsData] = results;
      if (statusData) setStatus(statusData as Status);
      if (clientsData && Array.isArray((clientsData as { clients?: ClientRow[] }).clients)) {
        setClients((clientsData as { clients: ClientRow[] }).clients);
      }
    });
    return () => { abort = true; };
  }, []);

  if (!status) return <Empty>Loading…</Empty>;

  // Active client — same resolution as OsClientPicker (URL wins, then storage, then first).
  const urlSlug = sp.get("client");
  let storedSlug: string | null = null;
  try {
    storedSlug = typeof window !== "undefined"
      ? window.localStorage.getItem("seo-office:active-client")
      : null;
  } catch {
    storedSlug = null;
  }
  const activeSlug = urlSlug ?? storedSlug ?? clients[0]?.slug ?? null;
  const active = clients.find((c) => c.slug === activeSlug) ?? null;

  // LLM provider — prefer configured (.env-set), fall back to "selected"
  // (CLI auto-selected by detection). Look up the full record for label/version.
  const llmId = status.configuredProvider ?? status.selectedProvider ?? null;
  const llm = status.providers?.find((p) => p.id === llmId) ?? null;

  // Integrations — iterate the catalog so order is deterministic and we
  // never miss one because the API forgot to include it.
  const integrations = INTEGRATIONS.map((i) => ({
    id: i.id,
    name: i.name,
    configured: status.integrations?.[i.id]?.configured ?? false,
    importance: i.importance,
  }));
  const configuredCount = integrations.filter((i) => i.configured).length;

  return (
    <div
      className="px-5 py-4"
      style={{
        color: "var(--fg)",
        fontFamily: "var(--font-ui)",
        fontSize: 12.5,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <Section title="Active client">
        {active ? (
          <>
            <Row label="Name" value={active.name} />
            <Row label="Slug" value={active.slug} />
            {active.site_url && <Row label="Site" value={active.site_url} />}
          </>
        ) : (
          <Row label="State" value="no client selected" valueColor="var(--fg-faint)" />
        )}
      </Section>

      <Section title="LLM provider">
        {llm ? (
          <>
            <Row
              label="Active"
              value={llm.name}
              valueColor={llm.authed ? "var(--ok)" : "var(--err)"}
            />
            {llm.version && <Row label="Version" value={llm.version} />}
            <Row
              label="Auth"
              value={llm.authed ? "ready" : (llm.error ?? "not authed")}
              valueColor={llm.authed ? "var(--ok)" : "var(--fg-faint)"}
            />
          </>
        ) : (
          <Row label="State" value="no provider configured" valueColor="var(--fg-faint)" />
        )}
      </Section>

      <Section
        title={`Integrations (${configuredCount}/${integrations.length} configured)`}
      >
        {integrations.map((i) => (
          <Row
            key={i.id}
            label={i.name}
            value={i.configured ? "ready" : "not configured"}
            valueColor={i.configured ? "var(--ok)" : "var(--fg-faint)"}
            indicator={i.configured}
          />
        ))}
      </Section>

      {status.python && (
        <Section title="Runtime">
          <Row
            label="Python"
            value={
              status.python.ok
                ? `v${status.python.version}`
                : (status.python.error ?? "not detected")
            }
            valueColor={status.python.ok ? "var(--ok)" : "var(--err)"}
          />
        </Section>
      )}

      <p
        style={{
          marginTop: 16,
          fontSize: 11,
          color: "var(--fg-faint)",
          fontFamily: "var(--font-mono)",
        }}
      >
        Adjust keys at <a href="/setup" style={{ color: "var(--accent)", textDecoration: "underline" }}>/setup</a>.
        Changes apply on the next request — no restart needed.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h3
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--fg-faint)",
          margin: "0 0 8px",
        }}
      >
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  valueColor,
  indicator,
}: {
  label: string;
  value: string;
  valueColor?: string;
  indicator?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "3px 0" }}>
      <span style={{ color: "var(--fg-muted)", width: 110, fontSize: 11.5, flexShrink: 0 }}>
        {label}
      </span>
      {indicator !== undefined && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: indicator ? "var(--ok)" : "var(--fg-faint)",
            opacity: indicator ? 1 : 0.4,
            display: "inline-block",
            marginRight: -4,
          }}
        />
      )}
      <span style={{ color: valueColor ?? "var(--fg)", fontWeight: 500, wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4" style={{ color: "var(--fg-faint)", fontSize: 12 }}>
      {children}
    </div>
  );
}
