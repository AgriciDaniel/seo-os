"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * One-field intake. DataForSEO + the discovery specialists enrich every other
 * slot during the first sweep — see `expandMinimalClientInput()` for the
 * hostname-derived defaults that bridge minimal intake to the strict
 * scaffold contract.
 */
export default function NewClientPage() {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const [startingSweep, setStartingSweep] = useState(false);
  const [sweepError, setSweepError] = useState<string | null>(null);

  const canSubmit = (() => {
    if (!siteUrl.trim()) return false;
    try {
      new URL(siteUrl.trim().match(/^https?:\/\//) ? siteUrl.trim() : `https://${siteUrl.trim()}`);
      return true;
    } catch {
      return false;
    }
  })();

  const inputClass =
    "w-full border border-graphite bg-charcoal px-3 py-2 text-sm text-white placeholder:text-fg-shadow focus:border-gold focus:outline-none";

  if (createdSlug) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
        <header>
          <p className="label-micro">new client · scaffolded</p>
          <h1 className="display-md mt-2">Vault ready</h1>
          <p className="mt-2 text-[12px] text-ash">
            {createdName ?? createdSlug} is set up with placeholder values.
            Build the brain now to let the specialists enrich it with real
            data, or skip and configure manually.
          </p>
        </header>

        <section className="space-y-4 border border-gold/60 bg-iron p-5">
          <div>
            <p className="label-micro" style={{ color: "var(--accent-gold)" }}>
              recommended
            </p>
            <h2 className="mt-1 text-[16px] font-medium uppercase tracking-tight text-white">
              Build the brain
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-ash">
              Runs the full autonomous sweep: <span className="text-white">12 specialists</span>{" "}
              across three phases. DataForSEO fills in keywords, competitors,
              monetization signals, and persona; specialists missing a data
              source skip with a clear reason.
            </p>
          </div>

          {sweepError && (
            <p className="border border-red-500/40 bg-red-950/50 px-3 py-2 text-[11px] text-red-200">
              {sweepError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={startingSweep}
              onClick={async () => {
                if (startingSweep) return;
                setStartingSweep(true);
                setSweepError(null);
                try {
                  const r = await fetch(
                    `/api/clients/${encodeURIComponent(createdSlug)}/sweeps`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        template_id: "build-brain",
                        permission_mode: "auto",
                        from: "button",
                      }),
                    },
                  );
                  const data = await r.json();
                  if (!r.ok || !data.ok) {
                    setSweepError(data.error ?? "failed to start sweep");
                    return;
                  }
                  router.push(`/office?client=${encodeURIComponent(createdSlug)}`);
                } catch (err) {
                  setSweepError(err instanceof Error ? err.message : String(err));
                } finally {
                  setStartingSweep(false);
                }
              }}
              className="btn-cta"
            >
              {startingSweep ? "Starting sweep…" : "Build the brain"}
            </button>
            <button
              type="button"
              onClick={() =>
                router.push(`/office?client=${encodeURIComponent(createdSlug)}`)
              }
              className="border border-graphite bg-charcoal px-4 py-2 text-[11px] uppercase tracking-wider text-ash transition-colors hover:border-white hover:text-white"
            >
              Skip — open the office
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <header>
        <p className="label-micro">new client</p>
        <h1 className="display-md mt-2">Add a site</h1>
        <p className="mt-2 text-[12px] text-ash">
          Just the URL — the brain bootstraps with sensible defaults, and
          DataForSEO fills in keywords, competitors, and audience during the
          first sweep. Scaffolds into{" "}
          <code className="font-mono text-[11px] text-fg-shadow">
            ./.seo-office/vaults/&lt;slug&gt;/
          </code>
          .
        </p>
      </header>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          setError(null);
          try {
            const normalized = siteUrl.trim().match(/^https?:\/\//)
              ? siteUrl.trim()
              : `https://${siteUrl.trim()}`;
            const r = await fetch("/api/clients", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ siteUrl: normalized }),
            });
            const data = await r.json();
            if (!r.ok || !data.ok) {
              setError(data.error ?? "failed to create vault");
              return;
            }
            setCreatedSlug(data.slug);
            setCreatedName(data.manifest?.vault ?? null);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setSubmitting(false);
          }
        }}
        className="space-y-4 border border-graphite bg-iron p-5"
      >
        <div className="space-y-1">
          <label className="text-[12px] uppercase tracking-wider text-ash">
            Site URL
            <span className="ml-1 text-red-400">*</span>
          </label>
          <p className="text-[11px] leading-5 text-fg-shadow">
            Paste the URL of the site you want to work on. We&apos;ll discover
            the rest.
          </p>
          <input
            required
            type="text"
            inputMode="url"
            autoFocus
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://example.com"
            className={inputClass}
          />
        </div>

        {error && (
          <p className="border border-red-500/40 bg-red-950/50 px-3 py-2 text-[11px] text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className="btn-cta w-full"
        >
          {submitting ? "Scaffolding…" : "Create vault"}
        </button>

        <p className="text-[11px] leading-5 text-fg-shadow">
          Need to set the display name, owner, or business type up-front? You
          can edit the manifest after scaffold from the office, or paste them
          into <code className="font-mono">.seo-office/vaults/&lt;slug&gt;/.raw/.manifest.json</code>.
        </p>
      </form>
    </div>
  );
}
