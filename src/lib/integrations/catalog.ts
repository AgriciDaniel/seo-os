/**
 * Single source of truth for every external API key the app knows about.
 *
 * Consumed by:
 *   - the setup wizard (renders cards + "where to get" links + input fields)
 *   - the specialists catalog (cross-references which integrations each one uses)
 *   - the save-keys whitelist (the allowed env-var names are derived from here)
 *
 * Adding a new integration is one entry — no UI changes required.
 */

export type Importance = "required" | "recommended" | "optional";

/**
 * "api-key" — user pastes a value into one or more inputs; we persist to
 *             .env.local; sync `isConfigured(env)` is the source of truth.
 * "cli"     — user runs a CLI auth flow (e.g. gcloud); no fields, no env
 *             vars to write. The setup page fetches live status from a
 *             dedicated endpoint instead.
 */
export type IntegrationKind = "api-key" | "cli";

export interface IntegrationField {
  /** env-var name written to .env.local */
  envName: string;
  /** short label shown above the input */
  label: string;
  /** placeholder text inside the input */
  placeholder: string;
  /** "password" hides the value, "email"/"text" show it */
  inputType?: "password" | "email" | "text";
}

export interface IntegrationKey {
  id: string;
  name: string;
  /** one-line description of what unlocks when this is set */
  blurb: string;
  signupUrl: string;
  importance: Importance;
  /** default "api-key" */
  kind?: IntegrationKind;
  /** one or more env vars that make up this integration (e.g. DataForSEO = login + password) */
  fields: IntegrationField[];
  /** how to read live "configured" status from process.env (server-side) */
  isConfigured: (env: NodeJS.ProcessEnv) => boolean;
  /** For `kind: "cli"`, the endpoint the setup page polls for live status. */
  statusEndpoint?: string;
}

export const INTEGRATIONS: IntegrationKey[] = [
  {
    id: "dataforseo",
    name: "DataForSEO",
    blurb:
      "SERP, keyword metrics, backlinks, on-page analysis — the heavy lifting for most live SEO data. Pay-per-use.",
    signupUrl: "https://dataforseo.com/",
    importance: "recommended",
    fields: [
      {
        envName: "DATAFORSEO_LOGIN",
        label: "Login (email)",
        placeholder: "you@example.com",
        inputType: "email",
      },
      {
        envName: "DATAFORSEO_PASSWORD",
        label: "Password",
        placeholder: "•••••••",
        inputType: "password",
      },
    ],
    isConfigured: (env) =>
      Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD),
  },
  {
    id: "google",
    name: "Google API key",
    blurb:
      "PageSpeed Insights + CrUX field data. Free tier covers most single-operator workloads.",
    signupUrl: "https://console.cloud.google.com/apis/credentials",
    importance: "recommended",
    fields: [
      {
        envName: "GOOGLE_API_KEY",
        label: "API key",
        placeholder: "AIzaSy...",
        inputType: "password",
      },
    ],
    isConfigured: (env) => Boolean(env.GOOGLE_API_KEY),
  },
  {
    id: "google-cloud",
    name: "Google Cloud",
    blurb:
      "OAuth bridge unlocking Search Console + GA4 via the gcloud CLI. The CLI handles refresh tokens — we never store them.",
    signupUrl: "https://cloud.google.com/sdk/docs/install",
    importance: "optional",
    kind: "cli",
    fields: [],
    // CLI integrations don't read process.env — the live status endpoint is
    // the source of truth. We surface a placeholder here so other catalog
    // consumers don't blow up on a missing function.
    isConfigured: () => false,
    statusEndpoint: "/api/setup/gcloud/status",
  },
  {
    id: "google-ai",
    name: "Google AI Studio (Gemini)",
    blurb:
      "Image generation for OG / hero / schema assets. Only used by the image-gen specialist.",
    signupUrl: "https://aistudio.google.com/apikey",
    importance: "optional",
    fields: [
      {
        envName: "GOOGLE_AI_API_KEY",
        label: "Gemini API key",
        placeholder: "AIzaSy...",
        inputType: "password",
      },
    ],
    isConfigured: (env) => Boolean(env.GOOGLE_AI_API_KEY),
  },
  {
    id: "bing",
    name: "Bing Webmaster",
    blurb:
      "Bing-side backlink + indexation data. Free; requires a verified site at bing.com/webmasters.",
    signupUrl: "https://www.bing.com/webmasters/about",
    importance: "optional",
    fields: [
      {
        envName: "BING_WEBMASTER_API_KEY",
        label: "API key",
        placeholder: "•••",
        inputType: "password",
      },
    ],
    isConfigured: (env) => Boolean(env.BING_WEBMASTER_API_KEY),
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    blurb:
      "Full-site crawling for large audits. Falls back to local fetch when not configured.",
    signupUrl: "https://firecrawl.dev/",
    importance: "optional",
    fields: [
      {
        envName: "FIRECRAWL_API_KEY",
        label: "API key",
        placeholder: "fc-...",
        inputType: "password",
      },
    ],
    isConfigured: (env) => Boolean(env.FIRECRAWL_API_KEY),
  },
];

/** Env-var names allowed by the save-keys endpoint. Derived from INTEGRATIONS
 *  so adding an integration above auto-extends the whitelist. */
export const INTEGRATION_ENV_NAMES: string[] = INTEGRATIONS.flatMap((i) =>
  i.fields.map((f) => f.envName),
);

export function getIntegration(id: string): IntegrationKey | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}
