/**
 * gcloud CLI wrapper — auth bridge for OAuth-gated Google APIs.
 *
 * The user installs Google Cloud SDK themselves; we never auto-install. We
 * spawn `gcloud` for three things only:
 *   1. Detection — "is it installed, what version, where".
 *   2. The OAuth dance — `gcloud auth application-default login` opens the
 *      user's browser, catches the redirect on localhost, writes
 *      ~/.config/gcloud/application_default_credentials.json. We just wait.
 *   3. Token printing — `gcloud auth application-default print-access-token`
 *      returns a 60-min Bearer token. Specialists call REST APIs themselves
 *      (gcloud has no commands for Search Console / GA4 data).
 *
 * `SEO_OFFICE_GCLOUD_BIN` is captured at module top-level (matches
 * SEO_OFFICE_PYTHON behaviour) so a path change triggers `restartRequired`
 * from save-keys. Empty/unset falls back to `gcloud` on PATH.
 */
import "server-only";
import { spawnCapture } from "@/lib/integrations/_lib/spawn-capture";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const GCLOUD_BIN = process.env.SEO_OFFICE_GCLOUD_BIN || "gcloud";

/**
 * Optional path to a user-owned OAuth client JSON. When set, gcloud's
 * `auth application-default login` runs with `--client-id-file=<path>`
 * instead of using gcloud's bundled default client.
 *
 * Why this exists: Google blocks the default gcloud OAuth client from
 * accessing sensitive scopes (Search Console, GA4, etc.) for an
 * ever-growing set of users — Workspace accounts, certain regions, and
 * accounts whose admin has tightened third-party access. The consent
 * screen then renders "This app is blocked" instead of the scope grant.
 *
 * The fix: ask the user to create a Desktop-type OAuth client in their
 * own GCP project, download the JSON, and set this env var to the path.
 * Because the OAuth client is owned by the user's project, Google's
 * sensitive-scope filter no longer applies — the consent screen shows
 * the user's own app name and the grant succeeds.
 *
 * Read lazily so setup can upload a client JSON and use it for the next
 * sign-in without restarting the dev server.
 */
function gcloudClientIdFile(): string {
  return process.env.SEO_OFFICE_GCLOUD_CLIENT_ID_FILE?.trim() || "";
}

export function byoOauthClientPath(): string | null {
  return gcloudClientIdFile() || null;
}

export function byoOauthClientAvailable(): boolean {
  const clientIdFile = gcloudClientIdFile();
  if (!clientIdFile) return false;
  try {
    return fs.existsSync(/* turbopackIgnore: true */ clientIdFile);
  } catch {
    return false;
  }
}

const ADC_PATH = path.join(
  /* turbopackIgnore: true */ os.homedir(),
  ".config",
  "gcloud",
  "application_default_credentials.json",
);

const DETECT_TIMEOUT_MS = 5_000;
const SHORT_TIMEOUT_MS = 10_000;
const LOGIN_TIMEOUT_MS = 5 * 60_000; // gcloud will sit on the OAuth callback

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface DetectResult {
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
}

export interface AuthStatus {
  account?: string;
  quotaProject?: string;
  /** True when application_default_credentials.json exists and parses. */
  adcValid: boolean;
  /** OAuth scopes granted on the current ADC credential. */
  scopes: string[];
  /**
   * Where the scope list came from. Recent gcloud builds do not always write
   * `scopes` into application_default_credentials.json, so we fall back to the
   * currently minted access token before declaring scopes missing.
   */
  scopeSource: "adc-file" | "access-token" | "unknown";
}

export interface GcpProject {
  projectId: string;
  name?: string;
  projectNumber?: string;
}

/* -------------------------------------------------------------------------- */
/* low-level spawn                                                             */
/* -------------------------------------------------------------------------- */

export async function runGcloud(
  args: string[],
  opts: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<SpawnResult> {
  const result = await spawnCapture("sh", ["-lc", gcloudShellCommand(args)], {
    timeoutMs: opts.timeoutMs ?? SHORT_TIMEOUT_MS,
    // Cast: callers pass plain string maps; spawnCapture merges over
    // process.env so the missing-`NODE_ENV` complaint from
    // NodeJS.ProcessEnv's structural type is a non-issue at runtime.
    env: opts.env as NodeJS.ProcessEnv | undefined,
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/* -------------------------------------------------------------------------- */
/* detection                                                                   */
/* -------------------------------------------------------------------------- */

export async function detectGcloud(): Promise<DetectResult> {
  // `gcloud --version` prints multiple lines; the first looks like
  // "Google Cloud SDK 480.0.0".
  const probe = await runGcloud(["--version"], { timeoutMs: DETECT_TIMEOUT_MS });
  if (probe.exitCode !== 0) {
    return {
      installed: false,
      error: probe.stderr.trim() || "gcloud not on PATH",
    };
  }
  const firstLine = probe.stdout.split("\n")[0]?.trim() ?? "";
  const versionMatch = firstLine.match(/(\d+\.\d+\.\d+)/);
  const version = versionMatch?.[1];

  // Resolve the binary path. If env var is absolute, use it. Otherwise we
  // can't portably `which` without spawning another process — skip on env-set,
  // best-effort lookup via PATH walking for the default case.
  let binPath: string | undefined;
  if (process.env.SEO_OFFICE_GCLOUD_BIN && path.isAbsolute(process.env.SEO_OFFICE_GCLOUD_BIN)) {
    binPath = process.env.SEO_OFFICE_GCLOUD_BIN;
  } else {
    binPath = await resolveOnPath(GCLOUD_BIN);
  }

  return { installed: true, version, path: binPath };
}

async function resolveOnPath(name: string): Promise<string | undefined> {
  const r = await spawnCapture("sh", ["-lc", `command -v -- ${shellQuote(name)}`], {
    timeoutMs: DETECT_TIMEOUT_MS,
  });
  if (r.exitCode !== 0) return undefined;
  return r.stdout.split("\n")[0]?.trim() || undefined;
}

/* -------------------------------------------------------------------------- */
/* auth status                                                                 */
/* -------------------------------------------------------------------------- */

interface AdcFile {
  client_id?: string;
  refresh_token?: string;
  type?: string;
  scopes?: string[];
  quota_project_id?: string;
}

/** Sync read so it composes with the existing sync availability gates. */
export function readAdcFileSync(): AdcFile | null {
  try {
    if (!fs.existsSync(/* turbopackIgnore: true */ ADC_PATH)) return null;
    const raw = fs.readFileSync(/* turbopackIgnore: true */ ADC_PATH, "utf8");
    return JSON.parse(raw) as AdcFile;
  } catch {
    return null;
  }
}

export function adcAvailableSync(): boolean {
  return readAdcFileSync() != null;
}

export function adcScopesSync(): string[] {
  const f = readAdcFileSync();
  if (!f) return [];
  return Array.isArray(f.scopes) ? f.scopes : [];
}

interface TokenInfoResponse {
  scope?: string;
  expires_in?: string | number;
}

let tokenScopeCache:
  | { scopes: string[]; expiresAtMs: number }
  | null = null;

async function accessTokenScopes(): Promise<string[]> {
  const now = Date.now();
  if (tokenScopeCache && tokenScopeCache.expiresAtMs > now) {
    return tokenScopeCache.scopes;
  }

  try {
    const token = await printAccessToken();
    const r = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!r.ok) return [];
    const j = (await r.json()) as TokenInfoResponse;
    const scopes =
      typeof j.scope === "string"
        ? j.scope.split(/\s+/).map((s) => s.trim()).filter(Boolean)
        : [];
    if (scopes.length > 0) {
      const expiresSeconds = Number(j.expires_in);
      const ttlMs = Number.isFinite(expiresSeconds)
        ? Math.max(30_000, Math.min(expiresSeconds * 1000, 5 * 60_000))
        : 5 * 60_000;
      tokenScopeCache = { scopes, expiresAtMs: now + ttlMs };
    }
    return scopes;
  } catch {
    return [];
  }
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const adcFile = readAdcFileSync();
  const adcValid = adcFile != null;
  const fileScopes = Array.isArray(adcFile?.scopes) ? adcFile.scopes : [];
  const tokenScopes =
    adcValid && fileScopes.length === 0 ? await accessTokenScopes() : [];
  const scopes = fileScopes.length > 0 ? fileScopes : tokenScopes;
  const scopeSource =
    fileScopes.length > 0
      ? "adc-file"
      : tokenScopes.length > 0
        ? "access-token"
        : "unknown";

  // `gcloud auth list --format=json` returns active user accounts (not ADC
  // specifically, but the active user is almost always the one ADC was
  // authorized with).
  const acct = await runGcloud(["auth", "list", "--format=json", "--filter=status:ACTIVE"]);
  let account: string | undefined;
  if (acct.exitCode === 0) {
    try {
      const parsed = JSON.parse(acct.stdout) as Array<{ account?: string }>;
      account = parsed[0]?.account;
    } catch {
      // gcloud sometimes emits a warning line before the JSON — try to recover.
      const jsonStart = acct.stdout.indexOf("[");
      if (jsonStart >= 0) {
        try {
          const parsed = JSON.parse(acct.stdout.slice(jsonStart)) as Array<{
            account?: string;
          }>;
          account = parsed[0]?.account;
        } catch {
          // give up; account stays undefined
        }
      }
    }
  }

  // The ADC file is the source of truth for quota project (set by
  // `gcloud auth application-default set-quota-project`). Fall back to the
  // gcloud config when absent.
  let quotaProject = adcFile?.quota_project_id;
  if (!quotaProject) {
    const cfg = await runGcloud(["config", "get-value", "project"]);
    if (cfg.exitCode === 0) {
      const v = cfg.stdout.trim();
      if (v && v !== "(unset)") quotaProject = v;
    }
  }

  return {
    account,
    quotaProject,
    adcValid,
    scopes,
    scopeSource,
  };
}

/* -------------------------------------------------------------------------- */
/* projects                                                                    */
/* -------------------------------------------------------------------------- */

export async function listProjects(): Promise<GcpProject[]> {
  const r = await runGcloud([
    "projects",
    "list",
    "--format=json",
    "--limit=200",
  ]);
  if (r.exitCode !== 0) return [];
  try {
    const parsed = JSON.parse(r.stdout) as Array<{
      projectId?: string;
      name?: string;
      projectNumber?: string;
    }>;
    return parsed
      .filter((p) => typeof p.projectId === "string")
      .map((p) => ({
        projectId: p.projectId!,
        name: p.name,
        projectNumber: p.projectNumber,
      }));
  } catch {
    return [];
  }
}

export async function setQuotaProject(projectId: string): Promise<SpawnResult> {
  return runGcloud([
    "auth",
    "application-default",
    "set-quota-project",
    projectId,
  ]);
}

/* -------------------------------------------------------------------------- */
/* OAuth login / signout                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Scopes we request during ADC login. Bundles every API the app might call.
 * Re-requesting login with a different scope set replaces the credential.
 */
export const ADC_LOGIN_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  // gcloud's `auth application-default login` enforces the full
  // `cloud-platform` scope on user-credential ADC since ~v460. The
  // `.read-only` variant fails CLI-side scope validation before the
  // OAuth dance even starts ("scope is required but not requested").
  // We don't actually call any write-bearing GCP APIs — specialists
  // only consume Search Console / GA4 / CrUX — but the scope has to
  // appear in the login request for the CLI to proceed.
  "https://www.googleapis.com/auth/cloud-platform",
];

/**
 * Kick off ADC login. gcloud opens the user's default browser, runs a
 * local-loopback OAuth callback server, and writes ADC creds when the user
 * authorizes. We wait for the subprocess to exit (up to 5 minutes).
 *
 * `onStdout`/`onStderr` are wired so the caller (login-tracker) can scan
 * for the OAuth URL gcloud prints. When the dev server can't open a
 * browser (headless terminal, missing DBUS, BROWSER unset, etc.) gcloud
 * falls back to printing the URL — without surfacing it the user sees
 * "Waiting for browser…" forever.
 */
export async function loginAdc(opts: {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  /** Cancel an in-flight login (e.g. user clicked "Cancel" because
   *  Google's consent screen rejected them and the subprocess is now
   *  hung waiting for an OAuth callback that will never arrive). */
  signal?: AbortSignal;
} = {}): Promise<SpawnResult> {
  const args = [
    "auth",
    "application-default",
    "login",
    "--quiet",
    `--scopes=${ADC_LOGIN_SCOPES.join(",")}`,
  ];
  // BYO OAuth client (recommended). When the user has dropped a
  // client_secret.json from their own GCP project and pointed
  // SEO_OFFICE_GCLOUD_CLIENT_ID_FILE at it, route gcloud through it so
  // sensitive scopes don't get blocked by Google's filter on the
  // bundled default client.
  const clientIdFile = gcloudClientIdFile();
  if (clientIdFile) {
    args.push(`--client-id-file=${clientIdFile}`);
  }
  // Streaming wrapper around runGcloud so callers can scrape the URL
  // out of the live stdout/stderr stream.
  const result = await spawnCapture("sh", ["-lc", gcloudShellCommand(args)], {
    timeoutMs: LOGIN_TIMEOUT_MS,
    onStdout: opts.onStdout,
    onStderr: opts.onStderr,
    signal: opts.signal,
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function revokeAdc(): Promise<SpawnResult> {
  return runGcloud([
    "auth",
    "application-default",
    "revoke",
    "--quiet",
  ]);
}

/* -------------------------------------------------------------------------- */
/* token printing                                                              */
/* -------------------------------------------------------------------------- */

export async function printAccessToken(): Promise<string> {
  const r = await runGcloud([
    "auth",
    "application-default",
    "print-access-token",
  ]);
  if (r.exitCode !== 0) {
    throw new Error(
      `gcloud print-access-token failed: ${r.stderr.trim() || `exit ${r.exitCode}`}`,
    );
  }
  const tok = r.stdout.trim();
  if (!tok) {
    throw new Error("gcloud print-access-token returned empty output");
  }
  return tok;
}

/* -------------------------------------------------------------------------- */
/* scope helpers                                                               */
/* -------------------------------------------------------------------------- */

export function hasScopeSync(scope: string): boolean {
  const scopes = adcScopesSync();
  if (scopes.length > 0) return scopes.includes(scope);
  // Empty `scopes` in the ADC file is ambiguous, not a denial. Some gcloud
  // versions mint correctly scoped tokens while omitting the field locally.
  // Let the real API call decide instead of blocking setup/specialists early.
  return adcAvailableSync();
}

export const SCOPE = {
  searchConsole: "https://www.googleapis.com/auth/webmasters.readonly",
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
} as const;

/* -------------------------------------------------------------------------- */
/* paths (exported for tests / debugging)                                      */
/* -------------------------------------------------------------------------- */

export const ADC_FILE_PATH = ADC_PATH;
export const GCLOUD_BIN_PATH = GCLOUD_BIN;

/** Async existence check that doesn't block on a sync `fs.existsSync`. */
export async function adcFileExists(): Promise<boolean> {
  try {
    await fsp.access(/* turbopackIgnore: true */ ADC_PATH, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function gcloudShellCommand(args: string[]): string {
  return `exec ${[GCLOUD_BIN, ...args].map(shellQuote).join(" ")}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
