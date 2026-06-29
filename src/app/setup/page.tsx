"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { INTEGRATIONS, type IntegrationKey } from "@/lib/integrations/catalog";
import { SetupShell } from "@/components/setup/SetupShell";
import {
  READY_SPECIALISTS,
  UPCOMING_SPECIALISTS,
  type SpecialistMeta,
} from "@/lib/specialists/catalog";

type ProviderId = "anthropic-api" | "claude-cli" | "codex-cli" | "gemini-cli";

interface ProviderAvailability {
  id: ProviderId;
  name: string;
  authMode: "api-key" | "subscription";
  installed: boolean;
  authed: boolean;
  version?: string;
  error?: string;
}

interface SetupStatus {
  providers: ProviderAvailability[];
  selectedProvider: ProviderId | null;
  configuredProvider: ProviderId | null;
  integrations: Record<string, { configured: boolean }>;
  python: { ok: true; version: string } | { ok: false; error: string };
}

interface GcloudStatus {
  installed: boolean;
  version?: string;
  path?: string;
  account?: string;
  quotaProject?: string;
  adcValid: boolean;
  scopes: string[];
  scopeSource?: "adc-file" | "access-token" | "unknown";
  loginInFlight: boolean;
  /** OAuth URL gcloud printed during the current login. Surfaces here so
   *  the user has a clickable fallback when browser auto-launch fails. */
  loginUrl?: string | null;
  lastLoginError: string | null;
  apis: { searchConsole: boolean; ga4: boolean };
  /** When the user supplies their own OAuth client (env var
   *  `SEO_OFFICE_GCLOUD_CLIENT_ID_FILE`) gcloud routes the consent flow
   *  through THEIR project — bypassing Google's sensitive-scope filter
   *  on the bundled default client. Surfaced so the UI can confirm
   *  the override is active. */
  byoOauthClient?: {
    configured: boolean;
    present: boolean;
    path: string | null;
  };
  /** Normalised OS so the install card auto-picks the right command.
   *  See detectPlatform() in the status route — server-side detection
   *  is canonical for this local-first app (the server IS the user's
   *  machine). */
  platform?: "linux" | "macos" | "windows" | "other";
  error?: string;
}

interface GcpProjectSummary {
  projectId: string;
  name?: string;
}

type SaveKeysResult =
  | {
      ok: true;
      written: string[];
      rejected: string[];
      restartRequired: boolean;
      path: string;
    }
  | { ok: false; error: string };

type CopyState = "idle" | "copied" | "manual";

async function readSetupResponse<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(extractSetupError(json) ?? `HTTP ${response.status}`);
  }
  return json as T;
}

function extractSetupError(json: unknown): string | null {
  if (
    json &&
    typeof json === "object" &&
    "error" in json &&
    typeof json.error === "string"
  ) {
    return json.error;
  }
  return null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function copyCommand(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to the legacy copy path below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

/* ========================================================================== */
/* page shell                                                                  */
/* ========================================================================== */

export default function SetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [gcloud, setGcloud] = useState<GcloudStatus | null>(null);
  const [step, setStep] = useState<"providers" | "configure" | "done">(
    "providers",
  );

  const fetchGcloudStatus = useCallback(async (): Promise<GcloudStatus | null> => {
    try {
      const r = await fetch("/api/setup/gcloud/status");
      if (r.ok) return (await r.json()) as GcloudStatus;
    } catch {
      // fall through
    }
    return null;
  }, []);

  const refreshGcloud = useCallback(async () => {
    const g = await fetchGcloudStatus();
    if (g) setGcloud(g);
  }, [fetchGcloudStatus]);

  useEffect(() => {
    void refresh().then((s) => {
      setStatus(s);
      if (s.configuredProvider) setStep("configure");
    });
    void fetchGcloudStatus().then((g) => {
      if (g) setGcloud(g);
    });
  }, [fetchGcloudStatus]);

  // Poll gcloud status while a login flow is in progress so the card flips
  // from "waiting for browser…" to "signed in as X" without the user clicking.
  // Cutoff at 5 minutes (login was abandoned or the OAuth window closed) and
  // pause while the tab is hidden so we don't burn cycles in the background.
  useEffect(() => {
    if (!gcloud?.loginInFlight) return;
    const startedAt = Date.now();
    const MAX_DURATION_MS = 5 * 60 * 1000;
    const t = setInterval(() => {
      if (Date.now() - startedAt > MAX_DURATION_MS) {
        clearInterval(t);
        return;
      }
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchGcloudStatus().then((g) => {
        if (g) setGcloud(g);
      });
    }, 2000);
    return () => clearInterval(t);
  }, [gcloud?.loginInFlight, fetchGcloudStatus]);

  async function refresh(): Promise<SetupStatus> {
    const r = await fetch("/api/setup/status");
    return r.json();
  }

  if (!status) {
    return (
      <SetupShell>
        <div className="mx-auto max-w-3xl px-6 py-12">
          <p
            className="label-micro"
            style={{ color: "var(--fg-faint)", fontFamily: "var(--font-mono)" }}
          >
            checking environment…
          </p>
        </div>
      </SetupShell>
    );
  }

  return (
    <SetupShell>
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        <header className="space-y-2">
          <p
            className="label-micro"
            style={{
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            first-run setup
          </p>
          <h1
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: "var(--fg)",
              margin: 0,
            }}
          >
            Configure SEO Office
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--fg-muted)", lineHeight: 1.55 }}>
            Keys live in{" "}
            <code
              style={{
                background: "var(--code-bg, var(--chrome-bg))",
                padding: "1px 6px",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fg)",
                border: "1px solid var(--chrome-border)",
              }}
            >
              .env.local
            </code>{" "}
            on your machine and never leave it. Saved changes apply on the next
            request — no restart needed.
          </p>
        </header>

      <SystemChecks status={status} gcloud={gcloud} />

      {step === "providers" && (
        <ProvidersStep
          status={status}
          onRefresh={async () => {
            setStatus(await refresh());
          }}
          onSaved={async () => {
            setStatus(await refresh());
            setStep("configure");
          }}
        />
      )}

      {step === "configure" && (
        <ConfigureStep
          status={status}
          gcloud={gcloud}
          onGcloudChange={refreshGcloud}
          onDone={async () => {
            setStatus(await refresh());
            setStep("done");
          }}
        />
      )}

        {step === "done" && (
          <div
            style={{
              border: "1px solid var(--ok)",
              background: "var(--panel-bg, var(--chrome-bg))",
              padding: 20,
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ok)", margin: 0 }}>
              Setup saved. Open the{" "}
              <a href="/office" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                office
              </a>
              .
            </p>
          </div>
        )}
      </div>
    </SetupShell>
  );
}

/* ========================================================================== */
/* environment readout                                                         */
/* ========================================================================== */

function SystemChecks({
  status,
  gcloud,
}: {
  status: SetupStatus;
  gcloud: GcloudStatus | null;
}) {
  const configuredCount = Object.values(status.integrations).filter(
    (i) => i.configured,
  ).length;

  const gcloudDetail = (() => {
    if (!gcloud) return "checking…";
    if (!gcloud.installed) return "not installed (optional)";
    if (!gcloud.adcValid) return gcloud.version ? `v${gcloud.version} · not signed in` : "not signed in";
    return gcloud.account
      ? `v${gcloud.version ?? "?"} · ${gcloud.account}`
      : `v${gcloud.version ?? "?"} · signed in`;
  })();

  return (
    <section className="border border-graphite bg-iron p-5">
      <h2 className="mb-1 text-[14px] font-semibold uppercase tracking-wider text-white">
        Environment
      </h2>
      <ul className="divide-y divide-graphite">
        <StatusRow
          label="LLM provider"
          ok={Boolean(status.configuredProvider)}
          detail={llmProviderDetail(status)}
        />
        <StatusRow
          label="Python 3.11+"
          ok={status.python.ok}
          detail={
            status.python.ok ? `v${status.python.version}` : status.python.error
          }
        />
        <StatusRow
          label="Google Cloud CLI"
          ok={Boolean(gcloud?.adcValid)}
          detail={gcloudDetail}
        />
        <StatusRow
          label="Integrations"
          ok={configuredCount > 0}
          detail={`${configuredCount}/${INTEGRATIONS.length} configured`}
        />
      </ul>
    </section>
  );
}

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="flex items-center gap-2 text-white">
        <span
          aria-hidden
          className={
            ok
              ? "inline-block h-2 w-2 bg-emerald-500"
              : "inline-block h-2 w-2 bg-fog"
          }
        />
        {label}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-wider text-ash">
        {detail}
      </span>
    </li>
  );
}

function llmProviderDetail(status: SetupStatus): string {
  if (status.configuredProvider) return status.configuredProvider;
  if (status.selectedProvider) {
    return `auto-detected ${status.selectedProvider} — choose below`;
  }
  return "none yet — pick below";
}

/* ========================================================================== */
/* Step 1 — LLM provider                                                       */
/* ========================================================================== */

function ProvidersStep({
  status,
  onRefresh,
  onSaved,
}: {
  status: SetupStatus;
  onRefresh: () => Promise<void>;
  onSaved: () => void | Promise<void>;
}) {
  const [picking, setPicking] = useState<ProviderId | null>(
    status.configuredProvider ?? status.selectedProvider,
  );
  const [apiKey, setApiKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<
    | null
    | { ok: true; model: string; cost_usd: number }
    | { ok: false; error: string }
  >(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pickedProvider = status.providers.find((p) => p.id === picking) ?? null;

  async function save(provider: ProviderId, extras: Record<string, string> = {}) {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/setup/save-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          SEO_OFFICE_LLM_PROVIDER: provider,
          ...extras,
        }),
      });
      const result = await readSetupResponse<SaveKeysResult>(response);
      if (!result.ok) throw new Error(result.error);
      if (result.rejected.length > 0) {
        throw new Error(`Rejected unsupported key(s): ${result.rejected.join(", ")}`);
      }
      await onSaved();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 border border-graphite bg-iron p-5">
      <header>
        <h2 className="text-[14px] font-semibold uppercase tracking-wider text-white">
          1. Choose an LLM provider
        </h2>
        <p className="mt-1 text-sm text-ash">
          Use a CLI you&apos;ve already logged into (no extra cost on top of your subscription),
          or paste an API key.
        </p>
      </header>

      <ul className="space-y-2">
        {status.providers.map((p) => (
          <li key={p.id}>
            <ProviderCard
              provider={p}
              selected={picking === p.id}
              onPick={() => setPicking(p.id)}
            />
          </li>
        ))}
      </ul>

      {picking === "anthropic-api" && (
        <div className="space-y-3 border border-graphite bg-charcoal p-4">
          <p className="text-xs text-ash">
            Pay-per-token. Get a key at{" "}
            <a
              className="underline hover:text-gold"
              href="https://console.anthropic.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              console.anthropic.com
            </a>
            .
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full border border-graphite bg-charcoal px-3 py-2 font-mono text-sm text-white placeholder:text-fg-shadow focus:border-gold focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setValidating(true);
                setValidationResult(null);
                try {
                  const r = await fetch("/api/setup/validate-key", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ provider: "anthropic", key: apiKey }),
                  });
                  setValidationResult(
                    await readSetupResponse<
                      | { ok: true; model: string; cost_usd: number }
                      | { ok: false; error: string }
                    >(r),
                  );
                } catch (err) {
                  setValidationResult({ ok: false, error: errorMessage(err) });
                } finally {
                  setValidating(false);
                }
              }}
              disabled={!apiKey || validating}
              className="btn-cta"
            >
              {validating ? "Validating…" : "Validate"}
            </button>
            <button
              onClick={() => save("anthropic-api", { ANTHROPIC_API_KEY: apiKey })}
              disabled={
                saving ||
                !validationResult ||
                !("ok" in validationResult) ||
                validationResult.ok !== true
              }
              className="btn-cta"
            >
              {saving ? "Saving…" : "Use this provider"}
            </button>
          </div>
          {validationResult && validationResult.ok && (
            <p className="text-[11px] text-emerald-300">
              ✓ Key works ({validationResult.model}, est. $
              {validationResult.cost_usd.toFixed(6)})
            </p>
          )}
          {validationResult && !validationResult.ok && (
            <p className="text-[11px] text-red-300">✗ {validationResult.error}</p>
          )}
        </div>
      )}

      {picking && picking !== "anthropic-api" && (
        <CliProviderSetup
          providerId={picking}
          provider={pickedProvider}
          saving={saving}
          onRefresh={onRefresh}
          onUse={() => save(picking)}
        />
      )}

      {saveError && (
        <p className="border border-red-500/40 bg-red-950/20 px-3 py-2 text-[11px] leading-snug text-red-300">
          Save failed: {saveError}
        </p>
      )}
    </section>
  );
}

type CliProviderId = Exclude<ProviderId, "anthropic-api">;

interface CliProviderSetupCopy {
  executable: string;
  install: Array<{ label: string; cmd: string }>;
  login: Array<{ label: string; cmd: string }>;
  docsUrl: string;
  readyCopy: string;
  setupCopy: string;
}

const CLI_PROVIDER_SETUP: Record<CliProviderId, CliProviderSetupCopy> = {
  "claude-cli": {
    executable: "claude",
    install: [{ label: "Install Claude Code", cmd: "npm i -g @anthropic-ai/claude-code" }],
    login: [{ label: "Sign in", cmd: "claude login" }],
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code/setup",
    readyCopy: "Uses your Claude Pro/Max subscription through the local CLI.",
    setupCopy: "Install Claude Code, sign in, then refresh provider status.",
  },
  "codex-cli": {
    executable: "codex",
    install: [
      { label: "Install with npm", cmd: "npm i -g @openai/codex" },
      { label: "Install with Homebrew", cmd: "brew install codex" },
    ],
    login: [
      { label: "Sign in with ChatGPT", cmd: "codex login" },
      {
        label: "Or use an OpenAI API key",
        cmd: "printenv OPENAI_API_KEY | codex login --with-api-key",
      },
    ],
    docsUrl: "https://developers.openai.com/codex/cli",
    readyCopy: "Uses Codex through your ChatGPT account or Codex CLI API-key login.",
    setupCopy:
      "Install the Codex CLI, sign in with ChatGPT or an OpenAI API key, then refresh provider status.",
  },
  "gemini-cli": {
    executable: "gemini",
    install: [{ label: "Install Gemini CLI", cmd: "npm i -g @google/gemini-cli" }],
    login: [{ label: "Sign in", cmd: "gemini auth login" }],
    docsUrl: "https://github.com/google-gemini/gemini-cli",
    readyCopy: "Uses your Google AI Pro or Workspace auth through the local CLI.",
    setupCopy: "Install Gemini CLI, sign in, then refresh provider status.",
  },
};

function CliProviderSetup({
  providerId,
  provider,
  saving,
  onRefresh,
  onUse,
}: {
  providerId: CliProviderId;
  provider: ProviderAvailability | null;
  saving: boolean;
  onRefresh: () => Promise<void>;
  onUse: () => void;
}) {
  const setup = CLI_PROVIDER_SETUP[providerId];
  const installed = Boolean(provider?.installed);
  const authed = Boolean(provider?.authed);
  const ready = installed && authed;

  return (
    <div className="space-y-3 border border-graphite bg-charcoal p-4">
      <p className="text-xs leading-relaxed text-ash">
        SEO Office will spawn{" "}
        <code className="font-mono text-white">{setup.executable}</code> for
        every LLM call. {ready ? setup.readyCopy : setup.setupCopy}
      </p>

      {!installed && (
        <div className="space-y-2">
          <p className="label-micro text-fg-shadow">Install</p>
          {setup.install.map((command) => (
            <SetupCommandRow key={command.label} command={command} />
          ))}
        </div>
      )}

      {(!installed || !authed) && (
        <div className="space-y-2">
          <p className="label-micro text-fg-shadow">Authenticate</p>
          {setup.login.map((command) => (
            <SetupCommandRow key={command.label} command={command} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onUse}
          disabled={saving || !ready}
          className="btn-cta disabled:cursor-not-allowed disabled:opacity-45"
          title={ready ? "Use this provider" : "Install and sign in first"}
        >
          {saving ? "Saving…" : "Use this provider"}
        </button>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="btn-ghost"
        >
          Refresh status
        </button>
        <a
          href={setup.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-gold hover:text-white"
        >
          → Docs
        </a>
      </div>

      {provider?.error && !installed && (
        <p className="truncate text-[11px] text-red-300" title={provider.error}>
          ✗ {provider.error}
        </p>
      )}
    </div>
  );
}

function SetupCommandRow({
  command,
}: {
  command: { label: string; cmd: string };
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function onCopy() {
    const copied = await copyCommand(command.cmd);
    setCopyState(copied ? "copied" : "manual");
    if (copied) window.setTimeout(() => setCopyState("idle"), 1500);
  }

  return (
    <div className="space-y-1 border border-graphite bg-abyss px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-ash">
            {command.label}
          </p>
          <code className="block truncate font-mono text-[11px] text-white">
            {command.cmd}
          </code>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className={
            "border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors " +
            (copyState === "copied"
              ? "border-emerald-500/60 text-emerald-300"
              : copyState === "manual"
                ? "border-gold text-gold"
                : "border-graphite text-ash hover:border-white hover:text-white")
          }
        >
          {copyState === "copied" ? "copied" : "copy"}
        </button>
      </div>
      {copyState === "manual" && (
        <p className="text-[10px] leading-snug text-gold">
          Browser copy is blocked. Select the command text and copy manually.
        </p>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  selected,
  onPick,
}: {
  provider: ProviderAvailability;
  selected: boolean;
  onPick: () => void;
}) {
  const ready = provider.installed && provider.authed;
  const label = providerCardLabel(provider);
  return (
    <button
      onClick={onPick}
      className={[
        "w-full border p-3 text-left transition-colors",
        selected ? "border-gold bg-charcoal" : "border-graphite",
        "hover:border-white",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{provider.name}</p>
          <p className="mt-0.5 truncate text-xs text-ash">
            {label}
            {provider.version ? ` · ${provider.version}` : ""}
          </p>
        </div>
        <span
          className={
            ready
              ? "label-micro border border-emerald-500/50 px-2 py-0.5 text-emerald-300"
              : provider.installed
                ? "label-micro border border-gold px-2 py-0.5 text-gold"
                : "label-micro border border-graphite px-2 py-0.5 text-ash"
          }
        >
          {ready ? "ready" : provider.installed ? "needs auth" : "not installed"}
        </span>
      </div>
    </button>
  );
}

function providerCardLabel(provider: ProviderAvailability): string {
  if (provider.id === "codex-cli") return "ChatGPT account or OpenAI API key";
  if (provider.id === "claude-cli") return "Claude subscription";
  if (provider.id === "gemini-cli") return "Google subscription";
  return "API key (pay per token)";
}

/* ========================================================================== */
/* Step 2 — integrations + specialists                                         */
/* ========================================================================== */

function ConfigureStep({
  status,
  gcloud,
  onGcloudChange,
  onDone,
}: {
  status: SetupStatus;
  gcloud: GcloudStatus | null;
  onGcloudChange: () => Promise<void>;
  onDone: () => void | Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setVal = (envName: string) => (next: string) =>
    setValues((v) => ({ ...v, [envName]: next }));

  async function save() {
    setSaving(true);
    setSavedMsg(null);
    setSaveError(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v.trim().length > 0),
      );
      if (Object.keys(payload).length === 0) {
        await onDone();
        return;
      }
      const r = await fetch("/api/setup/save-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readSetupResponse<SaveKeysResult>(r);
      if (!data.ok) throw new Error(data.error);
      if (data.rejected.length > 0) {
        throw new Error(`Rejected unsupported key(s): ${data.rejected.join(", ")}`);
      }
      const count = Object.keys(payload).length;
      setSavedMsg(
        data.restartRequired
          ? `Saved ${count} key(s). Binary path changed — restart pnpm dev to apply.`
          : `Saved ${count} key(s).`,
      );
      setValues({});
      await onDone();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section
        id="integrations"
        className="space-y-4 border border-graphite bg-iron p-5 scroll-mt-24"
      >
        <header>
          <h2 className="text-[14px] font-semibold uppercase tracking-wider text-white">
            2. Integrations
          </h2>
          <p className="mt-1 text-sm text-ash">
            Each card links to where the key comes from. Skip anything you don&apos;t
            have — the specialists that need it just stay locked.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          {INTEGRATIONS.map((i) =>
            i.kind === "cli" ? (
              <GcloudCard
                key={i.id}
                integration={i}
                gcloud={gcloud}
                onChange={onGcloudChange}
              />
            ) : (
              <IntegrationCard
                key={i.id}
                integration={i}
                configured={status.integrations[i.id]?.configured ?? false}
                values={values}
                onChange={setVal}
              />
            ),
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button onClick={save} disabled={saving} className="btn-cta">
            {saving ? "Saving…" : "Save & continue"}
          </button>
          <button onClick={onDone} className="btn-ghost">
            Skip
          </button>
          {savedMsg && (
            <span className="text-[11px] text-emerald-300">{savedMsg}</span>
          )}
        </div>
        {saveError && (
          <p className="border border-red-500/40 bg-red-950/20 px-3 py-2 text-[11px] leading-snug text-red-300">
            Save failed: {saveError}
          </p>
        )}
      </section>

      <SpecialistsCatalog status={status} />
    </div>
  );
}

type TestResult = { ok: true; detail: string } | { ok: false; error: string };

function IntegrationCard({
  integration,
  configured,
  values,
  onChange,
}: {
  integration: IntegrationKey;
  configured: boolean;
  values: Record<string, string>;
  onChange: (envName: string) => (next: string) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const importanceLabel = {
    required: "required",
    recommended: "recommended",
    optional: "optional",
  }[integration.importance];

  const importanceClass = {
    required: "border-red-500/50 text-red-300",
    recommended: "border-gold text-gold",
    optional: "border-graphite text-ash",
  }[integration.importance];

  const hasFormValues = integration.fields.some(
    (f) => (values[f.envName] ?? "").trim().length > 0,
  );
  // Can test if the user typed something OR a value is already saved in env.
  const canTest = hasFormValues || configured;

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const r = await fetch("/api/setup/test-integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: integration.id, values }),
      });
      setResult(await readSetupResponse<TestResult>(r));
    } catch (err) {
      setResult({
        ok: false,
        error: errorMessage(err),
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3 border border-graphite bg-charcoal p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{integration.name}</p>
          <p className="mt-1 text-[11px] leading-snug text-ash">
            {integration.blurb}
          </p>
        </div>
        <span
          className={`label-micro shrink-0 border px-2 py-0.5 ${
            configured
              ? "border-emerald-500/50 text-emerald-300"
              : importanceClass
          }`}
        >
          {configured ? "saved" : importanceLabel}
        </span>
      </header>

      <a
        href={integration.signupUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-[11px] text-gold hover:text-white"
      >
        → Get key
      </a>

      <div className="space-y-2">
        {configured && (
          <p className="text-[11px] leading-snug text-emerald-300/80">
            Saved locally. Secret fields stay blank; paste a replacement only
            when you want to overwrite them.
          </p>
        )}
        {integration.fields.map((f) => (
          <div key={f.envName} className="space-y-1">
            {integration.fields.length > 1 && (
              <label className="block text-[10px] uppercase tracking-wider text-ash">
                {f.label}
              </label>
            )}
            <input
              type={f.inputType ?? "password"}
              name={f.envName}
              placeholder={f.placeholder}
              value={values[f.envName] ?? ""}
              onChange={(e) => onChange(f.envName)(e.target.value)}
              className="w-full border border-graphite bg-abyss px-3 py-2 font-mono text-[12px] text-white placeholder:text-fg-shadow focus:border-gold focus:outline-none"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={runTest}
          disabled={!canTest || testing}
          className="border border-graphite px-2.5 py-1 text-[11px] uppercase tracking-wider text-ash transition-colors hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-graphite disabled:hover:text-ash"
          title={canTest ? "ping the API to verify the key" : "enter a value first"}
        >
          {testing ? "Testing…" : "Test"}
        </button>
        {result && (
          <span
            className={`truncate text-[11px] ${
              result.ok ? "text-emerald-300" : "text-red-300"
            }`}
            title={result.ok ? result.detail : result.error}
          >
            {result.ok ? `✓ ${result.detail}` : `✗ ${result.error}`}
          </span>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* specialist catalog                                                          */
/* ========================================================================== */

function SpecialistsCatalog({ status }: { status: SetupStatus }) {
  return (
    <section className="space-y-3 border border-graphite bg-iron p-5">
      <header>
        <h2 className="text-[14px] font-semibold uppercase tracking-wider text-white">
          3. Specialists
        </h2>
        <p className="mt-1 text-sm text-ash">
          Every desk in the office and what it needs. Ready specialists run today;
          the rest are vendored from claude-seo and ship in upcoming releases.
        </p>
      </header>

      <SpecialistGroup
        title={`Ready · ${READY_SPECIALISTS.length}`}
        specialists={READY_SPECIALISTS}
        integrations={status.integrations}
        open
      />

      <SpecialistGroup
        title={`Coming soon · ${UPCOMING_SPECIALISTS.length}`}
        specialists={UPCOMING_SPECIALISTS}
        integrations={status.integrations}
      />
    </section>
  );
}

function SpecialistGroup({
  title,
  specialists,
  integrations,
  open,
}: {
  title: string;
  specialists: SpecialistMeta[];
  integrations: Record<string, { configured: boolean }>;
  open?: boolean;
}) {
  return (
    <details open={open} className="group border border-graphite bg-charcoal">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-iron/50">
        <span className="label-micro text-white">{title}</span>
        <span className="text-[11px] text-ash group-open:rotate-90 transition-transform">
          ›
        </span>
      </summary>
      <ul className="divide-y divide-graphite border-t border-graphite">
        {specialists.map((s) => (
          <li key={s.id}>
            <SpecialistRow specialist={s} integrations={integrations} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function SpecialistRow({
  specialist,
  integrations,
}: {
  specialist: SpecialistMeta;
  integrations: Record<string, { configured: boolean }>;
}) {
  const isReady = specialist.status === "ready";
  const uses = specialist.uses ?? [];
  const requires = useMemo(
    () => new Set(specialist.requires ?? []),
    [specialist.requires],
  );

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white">{specialist.name}</p>
          <code className="font-mono text-[10px] text-fg-shadow">
            {specialist.id}
          </code>
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-ash">
          {specialist.blurb}
        </p>
        {uses.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {uses.map((id) => {
              const configured = integrations[id]?.configured ?? false;
              const isRequired = requires.has(id);
              return (
                <span
                  key={id}
                  title={
                    isRequired
                      ? configured
                        ? `${id} — required, configured`
                        : `${id} — required, not configured`
                      : configured
                        ? `${id} — used when available, configured`
                        : `${id} — used when available, not configured`
                  }
                  className={[
                    "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                    configured
                      ? "border-emerald-500/40 text-emerald-300"
                      : isRequired
                        ? "border-red-500/40 text-red-300"
                        : "border-graphite text-ash",
                  ].join(" ")}
                >
                  {isRequired && <span aria-hidden>*</span>}
                  {id}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <span
        className={[
          "label-micro shrink-0 border px-2 py-0.5",
          isReady
            ? "border-emerald-500/50 text-emerald-300"
            : "border-graphite text-ash",
        ].join(" ")}
      >
        {isReady ? "ready" : "soon"}
      </span>
    </div>
  );
}

/* ========================================================================== */
/* Google Cloud (CLI) card                                                     */
/* ========================================================================== */

/**
 * Install commands keyed by normalised OS. The GcloudCard auto-picks
 * the row matching `gcloud.platform` (surfaced from the server via
 * `process.platform`) and tucks the rest behind a "show other
 * platforms" disclosure.
 *
 * Linux apt is the right call for the bulk of the target audience
 * (Ubuntu / Pop!_OS / Debian / Mint). Fedora/Arch users will see the
 * apt command first but the "other platforms" disclosure links to the
 * official cross-distro install script.
 */
interface InstallCommand {
  label: string;
  cmd: string;
  href?: string;
}

const INSTALL_BY_OS: Record<
  "linux" | "macos" | "windows" | "other",
  InstallCommand
> = {
  linux: {
    label: "Linux (apt)",
    cmd: "sudo apt install google-cloud-cli",
    href: "https://cloud.google.com/sdk/docs/install#deb",
  },
  macos: {
    label: "macOS (brew)",
    cmd: "brew install --cask google-cloud-sdk",
    href: "https://cloud.google.com/sdk/docs/install#mac",
  },
  windows: {
    label: "Windows (winget)",
    cmd: "winget install Google.CloudSDK",
    href: "https://cloud.google.com/sdk/docs/install#windows",
  },
  // Cross-distro Linux + BSD + anything else exotic. The official
  // install script works anywhere with bash + curl, drops the SDK in
  // ~/google-cloud-sdk, and skips the package manager entirely.
  other: {
    label: "Any platform (install script)",
    cmd: "curl https://sdk.cloud.google.com | bash",
    href: "https://cloud.google.com/sdk/docs/install",
  },
};

const ALL_OS_KEYS = ["linux", "macos", "windows", "other"] as const;

const PLATFORM_LABEL: Record<"linux" | "macos" | "windows" | "other", string> = {
  linux: "Detected Linux",
  macos: "Detected macOS",
  windows: "Detected Windows",
  other: "Platform not auto-detected",
};

/**
 * Renders the "install gcloud" block, auto-picking the command matching
 * the user's OS and tucking the other platforms behind a disclosure.
 *
 * Why not just render all three rows like before: the previous UI made
 * users scan three commands to find the one for their OS — fine for
 * power users, friction for the non-technical community this app
 * targets. Server-side `process.platform` is canonical for a local-first
 * app, so the auto-pick is reliable.
 */
function InstallGcloudBlock({
  platform,
  signupUrl,
}: {
  platform: "linux" | "macos" | "windows" | "other";
  signupUrl: string;
}) {
  const primary = INSTALL_BY_OS[platform];
  // Show every OS except the auto-picked one in the disclosure. The
  // "other" bucket already covers cross-distro Linux, so when platform
  // = "other" we still show macos/windows/linux below for completeness.
  const fallbacks = ALL_OS_KEYS.filter((k) => k !== platform).map(
    (k) => INSTALL_BY_OS[k],
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-snug text-ash">
        Install the Google Cloud SDK then refresh this page. Auth lives in
        ADC creds at <code className="font-mono text-fg-shadow">~/.config/gcloud/</code>,
        never in <code className="font-mono text-fg-shadow">.env.local</code>.
      </p>

      <p className="label-micro text-fg-shadow">{PLATFORM_LABEL[platform]}</p>
      <InstallCommandRow command={primary} primary />

      <details className="border border-graphite/60 bg-abyss/40">
        <summary className="cursor-pointer select-none px-2 py-1 text-[11px] uppercase tracking-wider text-ash hover:text-white">
          Show other platforms
        </summary>
        <ul className="space-y-1.5 p-2">
          {fallbacks.map((c) => (
            <li key={c.label}>
              <InstallCommandRow command={c} />
            </li>
          ))}
        </ul>
      </details>

      <a
        href={signupUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-[11px] text-gold hover:text-white"
      >
        → Full install docs
      </a>
    </div>
  );
}

/**
 * Single install command row with a Copy button. The `primary` variant
 * uses a brighter border so the auto-picked command for the user's OS
 * reads as the recommended one at a glance.
 */
function InstallCommandRow({
  command,
  primary,
}: {
  command: InstallCommand;
  primary?: boolean;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function onCopy() {
    const copied = await copyCommand(command.cmd);
    setCopyState(copied ? "copied" : "manual");
    if (copied) window.setTimeout(() => setCopyState("idle"), 1500);
  }

  return (
    <div
      className={
        "space-y-1 border bg-abyss px-2 py-1.5 " +
        (primary ? "border-gold/60" : "border-graphite")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-ash">
            {command.label}
          </p>
          <code className="block truncate font-mono text-[11px] text-white">
            {command.cmd}
          </code>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className={
            "border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors " +
            (copyState === "copied"
              ? "border-emerald-500/60 text-emerald-300"
              : copyState === "manual"
                ? "border-gold text-gold"
                : "border-graphite text-ash hover:border-white hover:text-white")
          }
        >
          {copyState === "copied" ? "copied" : "copy"}
        </button>
      </div>
      {copyState === "manual" && (
        <p className="text-[10px] leading-snug text-gold">
          Browser copy is blocked. Select the command text and copy manually.
        </p>
      )}
    </div>
  );
}

function GcloudCard({
  integration,
  gcloud,
  onChange,
}: {
  integration: IntegrationKey;
  gcloud: GcloudStatus | null;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<
    | "none"
    | "signin"
    | "signout"
    | "cancel"
    | "project"
    | "test-sc"
    | "test-ga4"
    | "upload-client"
  >("none");
  const [projects, setProjects] = useState<GcpProjectSummary[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [scResult, setScResult] = useState<TestResult | null>(null);
  const [ga4Result, setGa4Result] = useState<TestResult | null>(null);
  const [oauthClientUpload, setOauthClientUpload] = useState<TestResult | null>(
    null,
  );

  async function signIn() {
    setBusy("signin");
    try {
      await fetch("/api/setup/gcloud/login", { method: "POST" });
      await onChange();
    } finally {
      setBusy("none");
    }
  }

  async function signOut() {
    setBusy("signout");
    try {
      await fetch("/api/setup/gcloud/signout", { method: "POST" });
      setProjectsLoaded(false);
      setProjects([]);
      setScResult(null);
      setGa4Result(null);
      await onChange();
    } finally {
      setBusy("none");
    }
  }

  /**
   * Abort the in-flight gcloud login subprocess. The most common reason
   * to need this is that Google's consent screen rejected the OAuth
   * client and the local-loopback callback will never fire — without
   * cancel, the subprocess hangs for 5 min.
   */
  async function cancelSignIn() {
    setBusy("cancel");
    try {
      await fetch("/api/setup/gcloud/cancel", { method: "POST" });
      await onChange();
    } finally {
      setBusy("none");
    }
  }

  async function uploadOauthClient(file: File | null) {
    if (!file) return;
    setBusy("upload-client");
    setOauthClientUpload(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/setup/gcloud/oauth-client", {
        method: "POST",
        body: form,
      });
      const result = (await r.json()) as
        | { ok: true; path: string }
        | { ok: false; error: string };
      if (!r.ok || !result.ok) {
        setOauthClientUpload({
          ok: false,
          error: result.ok ? `HTTP ${r.status}` : result.error,
        });
        return;
      }
      setOauthClientUpload({
        ok: true,
        detail: `saved locally at ${result.path}`,
      });
      await onChange();
    } catch (err) {
      setOauthClientUpload({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy("none");
    }
  }

  async function loadProjects() {
    setBusy("project");
    try {
      const r = await fetch("/api/setup/gcloud/projects");
      if (r.ok) {
        const j = (await r.json()) as { projects?: GcpProjectSummary[] };
        setProjects(j.projects ?? []);
        setProjectsLoaded(true);
      }
    } finally {
      setBusy("none");
    }
  }

  async function setProject(projectId: string) {
    setBusy("project");
    try {
      await fetch("/api/setup/gcloud/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      await onChange();
    } finally {
      setBusy("none");
    }
  }

  async function runTest(api: "search-console" | "ga4") {
    const setBusyKey = api === "search-console" ? "test-sc" : "test-ga4";
    setBusy(setBusyKey);
    if (api === "search-console") setScResult(null);
    else setGa4Result(null);
    try {
      const r = await fetch("/api/setup/test-integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: api, values: {} }),
      });
      const result = await readSetupResponse<TestResult>(r);
      if (api === "search-console") setScResult(result);
      else setGa4Result(result);
    } catch (err) {
      const result: TestResult = {
        ok: false,
        error: errorMessage(err),
      };
      if (api === "search-console") setScResult(result);
      else setGa4Result(result);
    } finally {
      setBusy("none");
    }
  }

  const statusBadge = (() => {
    if (!gcloud) return { text: "checking", cls: "border-graphite text-ash" };
    if (!gcloud.installed) return { text: "not installed", cls: "border-graphite text-ash" };
    if (gcloud.loginInFlight)
      return { text: "waiting…", cls: "border-gold text-gold" };
    if (gcloud.adcValid) return { text: "signed in", cls: "border-emerald-500/50 text-emerald-300" };
    return { text: "needs sign-in", cls: "border-gold text-gold" };
  })();
  const googleAccessNeedsAttention = Boolean(
    gcloud?.adcValid &&
      (!gcloud.apis.searchConsole ||
        !gcloud.apis.ga4 ||
        gcloud.scopeSource === "unknown"),
  );

  return (
    <div className="space-y-3 border border-graphite bg-charcoal p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{integration.name}</p>
          <p className="mt-1 text-[11px] leading-snug text-ash">
            {integration.blurb}
          </p>
        </div>
        <span className={`label-micro shrink-0 border px-2 py-0.5 ${statusBadge.cls}`}>
          {statusBadge.text}
        </span>
      </header>

      {!gcloud && (
        <p className="text-[11px] text-fg-shadow">Detecting gcloud…</p>
      )}

      {gcloud && !gcloud.installed && (
        <InstallGcloudBlock
          platform={gcloud.platform ?? "other"}
          signupUrl={integration.signupUrl}
        />
      )}

      {gcloud && gcloud.installed && !gcloud.adcValid && (
        <div className="space-y-2">
          <p className="text-[11px] leading-snug text-ash">
            ✓ gcloud {gcloud.version ?? ""} at{" "}
            <code className="font-mono text-fg-shadow">{gcloud.path ?? "PATH"}</code>
          </p>
          {gcloud.loginInFlight ? (
            <div className="space-y-2">
              <p className="text-[11px] text-gold">
                Waiting for browser… authorize the OAuth consent screen, then this card will flip to “signed in.”
              </p>
              {gcloud.loginUrl && (
                <p className="text-[11px] leading-snug text-ash">
                  Browser didn&apos;t open?{" "}
                  <a
                    href={gcloud.loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-gold underline hover:text-white"
                  >
                    Open this URL manually
                  </a>{" "}
                  to authorize.
                </p>
              )}
              <button
                type="button"
                onClick={cancelSignIn}
                disabled={busy !== "none"}
                className="border border-red-500/60 bg-red-950/30 px-3 py-1 text-[11px] uppercase tracking-wider text-red-200 transition-colors hover:bg-red-950/50 disabled:opacity-50"
              >
                {busy === "cancel" ? "Cancelling…" : "Cancel sign-in"}
              </button>
              <p className="text-[10px] leading-snug text-fg-shadow">
                Cancel if Google showed “This app is blocked.” See the
                BYO-OAuth-client note below for the fix.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={signIn}
              disabled={busy !== "none"}
              className="btn-cta"
            >
              {busy === "signin" ? "Launching browser…" : "Sign in with Google Cloud"}
            </button>
          )}
          {gcloud.lastLoginError && (
            <p className="text-[11px] text-red-300" title={gcloud.lastLoginError}>
              ✗ last sign-in failed: {summariseGcloudError(gcloud.lastLoginError)}
            </p>
          )}
          <ByoOauthClientNote
            byo={gcloud.byoOauthClient}
            uploading={busy === "upload-client"}
            uploadResult={oauthClientUpload}
            onUpload={uploadOauthClient}
          />
        </div>
      )}

      {gcloud && gcloud.installed && gcloud.adcValid && (
        <div className="space-y-3">
          <div className="space-y-1 text-[11px] leading-snug text-ash">
            {gcloud.account && (
              <p>
                Signed in as <span className="text-white">{gcloud.account}</span>
              </p>
            )}
            <p>
              Quota project:{" "}
              <span className="text-white">
                {gcloud.quotaProject ?? "(none — required for GA4)"}
              </span>
              {!projectsLoaded && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={loadProjects}
                    disabled={busy !== "none"}
                    className="text-gold hover:text-white"
                  >
                    {busy === "project" ? "loading…" : "change"}
                  </button>
                </>
              )}
            </p>
            {projectsLoaded && (
              <div className="pt-1">
                <select
                  defaultValue={gcloud.quotaProject ?? ""}
                  disabled={busy !== "none"}
                  onChange={(e) => {
                    if (e.target.value) void setProject(e.target.value);
                  }}
                  className="w-full border border-graphite bg-abyss px-2 py-1 font-mono text-[11px] text-white"
                >
                  <option value="">(select a project)</option>
                  {projects.map((p) => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.projectId}
                      {p.name ? ` — ${p.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {gcloud.scopeSource === "access-token" && (
              <p className="text-emerald-300/80">
                Required scopes verified from the live ADC token.
              </p>
            )}
            {gcloud.scopeSource === "unknown" && (
              <p className="text-gold">
                gcloud did not store scopes locally. Test each API below; a
                403 means the consent screen still needs the scopes.
              </p>
            )}
            {gcloud.loginInFlight && (
              <div className="space-y-1 border border-gold/40 bg-gold/10 p-2">
                <p className="text-gold">
                  Waiting for browser authorization. This will replace the
                  current ADC credential with the required scope set.
                </p>
                {gcloud.loginUrl && (
                  <a
                    href={gcloud.loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block break-all text-gold underline hover:text-white"
                  >
                    Open authorization URL manually
                  </a>
                )}
                <button
                  type="button"
                  onClick={cancelSignIn}
                  disabled={busy !== "none"}
                  className="border border-red-500/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-red-200 hover:bg-red-950/30 disabled:opacity-50"
                >
                  {busy === "cancel" ? "Cancelling..." : "Cancel sign-in"}
                </button>
              </div>
            )}
          </div>

          <ul className="space-y-1.5 border-t border-graphite pt-2">
            <ApiRow
              label="Search Console"
              available={gcloud.apis.searchConsole}
              scopeSource={gcloud.scopeSource}
              result={scResult}
              busy={busy === "test-sc"}
              onTest={() => runTest("search-console")}
            />
            <ApiRow
              label="Google Analytics 4"
              available={gcloud.apis.ga4}
              scopeSource={gcloud.scopeSource}
              result={ga4Result}
              busy={busy === "test-ga4"}
              onTest={() => runTest("ga4")}
            />
          </ul>

          <GoogleCloudAccessHelp open={googleAccessNeedsAttention} />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={signIn}
              disabled={busy !== "none" || gcloud.loginInFlight}
              className="border border-gold px-2.5 py-1 text-[11px] uppercase tracking-wider text-gold hover:border-white hover:text-white disabled:opacity-50"
            >
              {busy === "signin" ? "Launching..." : "Re-run sign-in"}
            </button>
            <button
              type="button"
              onClick={signOut}
              disabled={busy !== "none"}
              className="border border-graphite px-2.5 py-1 text-[11px] uppercase tracking-wider text-ash hover:border-white hover:text-white disabled:opacity-50"
            >
              {busy === "signout" ? "Revoking..." : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Pick the most informative line out of gcloud's multi-line stderr.
 *
 * gcloud's `application-default login` emits stderr like:
 *
 *   WARNING:
 *   The following scopes will be blocked soon for the default client ID: ...
 *   To use these scopes, you must provide your own client ID or use ...
 *   ERROR: (gcloud.auth.application-default.login) Invalid value for [--scopes]: ...
 *
 * A naive `.split("\n")[0]` lands on the bare "WARNING:" header. Prefer
 * the `ERROR:`-prefixed line; if none, fall back to the first non-empty
 * line. The full text is still surfaced via the `title` tooltip.
 */
function summariseGcloudError(raw: string): string {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const errorLine = lines.find((l) => l.startsWith("ERROR:"));
  return errorLine ?? lines[0] ?? raw;
}

/**
 * Disclosure shown beneath the sign-in button. Two states:
 *
 *   1. BYO client NOT configured — explains the "This app is blocked"
 *      consent-screen rejection and walks the user through creating
 *      their own OAuth client. Most users will hit this when Google's
 *      sensitive-scope filter blocks gcloud's bundled default client.
 *
 *   2. BYO client configured — confirms it's loaded so the user knows
 *      why the consent screen is now showing their project name. If
 *      the file path is set but the file doesn't exist on disk
 *      (renamed, moved, deleted), we surface that too so the user
 *      isn't surprised when login fails.
 *
 * Kept compact — collapsed by default via <details> so the card stays
 * scannable for users who don't need it.
 */
function ByoOauthClientNote({
  byo,
  uploading,
  uploadResult,
  onUpload,
}: {
  byo?: { configured: boolean; present: boolean; path: string | null };
  uploading: boolean;
  uploadResult: TestResult | null;
  onUpload: (file: File | null) => void;
}) {
  // Configured + file present → a quiet confirmation.
  if (byo?.configured && byo.present && byo.path) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] leading-snug text-emerald-300/80">
          ✓ Using your own OAuth client at{" "}
          <code className="font-mono text-fg-shadow">{byo.path}</code>
        </p>
        <OauthClientUploadControl
          label="Replace OAuth client JSON"
          uploading={uploading}
          uploadResult={uploadResult}
          onUpload={onUpload}
        />
      </div>
    );
  }

  // Configured but the file is missing → loud warning.
  if (byo?.configured && !byo.present && byo.path) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] leading-snug text-red-300">
          ✗ SEO_OFFICE_GCLOUD_CLIENT_ID_FILE points at{" "}
          <code className="font-mono text-fg-shadow">{byo.path}</code> but no
          file exists there. Upload the JSON again to repair the path.
        </p>
        <OauthClientUploadControl
          label="Upload OAuth client JSON"
          uploading={uploading}
          uploadResult={uploadResult}
          onUpload={onUpload}
        />
      </div>
    );
  }

  // Default state — collapsed guidance for the "app blocked" scenario.
  return (
    <details className="border border-graphite/60 bg-abyss/40 px-2 py-1.5 text-[11px] leading-snug">
      <summary className="cursor-pointer select-none text-ash hover:text-white">
        Google showed “This app is blocked”? Use your own OAuth client.
      </summary>
      <div className="mt-2 space-y-2 text-fg-shadow">
        <p>
          Google blocks gcloud&apos;s bundled OAuth client from sensitive
          scopes (Search Console, GA4) for a growing share of accounts.
          The fix is a one-time, per-user setup: create a Desktop OAuth
          client in your own GCP project, then upload the downloaded JSON
          here. SEO Office stores it locally and updates the path for you.
        </p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            Open{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold underline hover:text-white"
            >
              GCP Console → APIs &amp; Services → Credentials
            </a>
            .
          </li>
          <li>
            Click <strong>Create credentials → OAuth client ID</strong>.
            Application type: <strong>Desktop app</strong>. Any name.
          </li>
          <li>
            Download the JSON, then upload it below. SEO Office copies it to{" "}
            <code className="font-mono">~/.config/seo-office/gcp-oauth-client.json</code>{" "}
            and writes <code>SEO_OFFICE_GCLOUD_CLIENT_ID_FILE</code> in{" "}
            <code>.env.local</code>.
          </li>
          <li>
            Click <strong>Sign in with Google Cloud</strong> again. The consent
            screen will now show <em>your</em> project&apos;s name.
          </li>
        </ol>
        <OauthClientUploadControl
          label="Upload OAuth client JSON"
          uploading={uploading}
          uploadResult={uploadResult}
          onUpload={onUpload}
        />
        <p className="text-ash">
          Skipping this is fine if you only need the API-key flows
          above (CrUX, PageSpeed Insights, Gemini). Search Console and
          GA4 specifically require the ADC path.
        </p>
      </div>
    </details>
  );
}

function OauthClientUploadControl({
  label,
  uploading,
  uploadResult,
  onUpload,
}: {
  label: string;
  uploading: boolean;
  uploadResult: TestResult | null;
  onUpload: (file: File | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label
        className={
          "inline-flex cursor-pointer items-center border px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors " +
          (uploading
            ? "border-graphite text-ash opacity-60"
            : "border-gold text-gold hover:border-white hover:text-white")
        }
      >
        {uploading ? "Uploading…" : label}
        <input
          type="file"
          accept=".json,application/json"
          disabled={uploading}
          className="sr-only"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0] ?? null;
            e.currentTarget.value = "";
            onUpload(file);
          }}
        />
      </label>
      {uploadResult && (
        <p
          className={`truncate text-[11px] ${
            uploadResult.ok ? "text-emerald-300" : "text-red-300"
          }`}
          title={uploadResult.ok ? uploadResult.detail : uploadResult.error}
        >
          {uploadResult.ok
            ? `✓ ${uploadResult.detail}`
            : `✗ ${uploadResult.error}`}
        </p>
      )}
    </div>
  );
}

function GoogleCloudAccessHelp({ open }: { open: boolean }) {
  return (
    <details
      open={open}
      className="border border-graphite/60 bg-abyss/40 px-2 py-1.5 text-[11px] leading-snug"
    >
      <summary className="cursor-pointer select-none text-ash hover:text-white">
        Required Google Cloud APIs and OAuth scopes
      </summary>
      <div className="mt-2 space-y-2 text-fg-shadow">
        <p>
          Enable these APIs in the same project as the uploaded Desktop OAuth
          client, then add the scopes on Google Auth Platform - Data Access.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="label-micro text-fg-shadow">Console pages</p>
            <a
              href="https://console.cloud.google.com/auth/scopes"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-gold underline hover:text-white"
            >
              Google Auth Platform - Data Access
            </a>
            <a
              href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-gold underline hover:text-white"
            >
              Enable Search Console API
            </a>
            <a
              href="https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-gold underline hover:text-white"
            >
              Enable Analytics Admin API
            </a>
            <a
              href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-gold underline hover:text-white"
            >
              Enable Analytics Data API
            </a>
          </div>
          <div className="space-y-1">
            <p className="label-micro text-fg-shadow">Scopes requested</p>
            <code className="block break-all font-mono text-[10px] text-white">
              https://www.googleapis.com/auth/webmasters.readonly
            </code>
            <code className="block break-all font-mono text-[10px] text-white">
              https://www.googleapis.com/auth/analytics.readonly
            </code>
            <code className="block break-all font-mono text-[10px] text-white">
              https://www.googleapis.com/auth/cloud-platform
            </code>
          </div>
        </div>
        <p className="text-ash">
          After changing scopes or enabled APIs, click <strong>Re-run sign-in</strong>.
          Google only grants the new scope set after a fresh consent flow.
        </p>
        <p>
          Official references:{" "}
          <a
            href="https://developers.google.com/webmaster-tools/v1/how-tos/authorizing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold underline hover:text-white"
          >
            Search Console auth
          </a>
          {", "}
          <a
            href="https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold underline hover:text-white"
          >
            GA4 Data API quickstart
          </a>
          {", "}
          <a
            href="https://cloud.google.com/sdk/gcloud/reference/auth/application-default/login"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold underline hover:text-white"
          >
            gcloud ADC login
          </a>
          .
        </p>
      </div>
    </details>
  );
}

function ApiRow({
  label,
  available,
  scopeSource,
  result,
  busy,
  onTest,
}: {
  label: string;
  available: boolean;
  scopeSource?: "adc-file" | "access-token" | "unknown";
  result: TestResult | null;
  busy: boolean;
  onTest: () => void;
}) {
  const scopeNote = !available
    ? "scope missing"
    : scopeSource === "unknown"
      ? "scope not stored locally"
      : null;

  return (
    <li className="flex items-center justify-between gap-2 text-[11px]">
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={
            available
              ? "inline-block h-1.5 w-1.5 bg-emerald-500"
              : "inline-block h-1.5 w-1.5 bg-fog"
          }
        />
        <span className="text-white">{label}</span>
        {scopeNote && (
          <span className="text-fg-shadow">- {scopeNote}</span>
        )}
      </span>
      <span className="flex items-center gap-2">
        {result && (
          <span
            className={result.ok ? "text-emerald-300" : "text-red-300"}
            title={result.ok ? result.detail : result.error}
          >
            {result.ok ? `✓ ${result.detail}` : `✗ ${result.error}`}
          </span>
        )}
        <button
          type="button"
          onClick={onTest}
          disabled={!available || busy}
          className="border border-graphite px-2 py-0.5 text-[10px] uppercase tracking-wider text-ash hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-graphite disabled:hover:text-ash"
        >
          {busy ? "Testing…" : "Test"}
        </button>
      </span>
    </li>
  );
}
