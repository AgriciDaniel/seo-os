import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const ENV_LOCAL_PATH = path.resolve(process.cwd(), ".env.local");

export interface EnvLocalWriteResult {
  path: string;
  written: string[];
}

export function readEnvLocalSync(): Record<string, string> {
  try {
    if (!fs.existsSync(ENV_LOCAL_PATH)) return {};
    return parseEnvLocal(fs.readFileSync(ENV_LOCAL_PATH, "utf8"));
  } catch {
    return {};
  }
}

export async function readEnvLocal(): Promise<Record<string, string>> {
  try {
    const raw = await fsp.readFile(ENV_LOCAL_PATH, "utf8");
    return parseEnvLocal(raw);
  } catch {
    return {};
  }
}

export function mergedRuntimeEnv(): NodeJS.ProcessEnv {
  const local = Object.fromEntries(
    Object.entries(readEnvLocalSync()).filter(([, value]) => value.trim() !== ""),
  );
  return { ...process.env, ...local };
}

export function envValue(name: string): string {
  const local = readEnvLocalSync()[name]?.trim();
  if (local) return local;
  return (process.env[name] ?? "").trim();
}

export function envValueFrom(
  name: string,
  overrides: Record<string, string>,
): string {
  const fromForm = (overrides[name] ?? "").trim();
  if (fromForm) return fromForm;
  return envValue(name);
}

/**
 * Merge updates into the user's local env file, preserving comments and
 * existing key order. Also updates process.env so setup changes can be used
 * immediately by request-time code in the current dev server.
 */
export async function writeEnvLocal(
  updates: Record<string, string>,
): Promise<EnvLocalWriteResult> {
  const existing = fs.existsSync(ENV_LOCAL_PATH)
    ? await fsp.readFile(ENV_LOCAL_PATH, "utf8")
    : "";
  const merged = mergeEnv(existing, updates);

  if (existing) {
    await fsp.writeFile(`${ENV_LOCAL_PATH}.bak`, existing, "utf8");
  }
  await fsp.writeFile(ENV_LOCAL_PATH, merged, "utf8");

  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }

  return { path: ENV_LOCAL_PATH, written: Object.keys(updates) };
}

function parseEnvLocal(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    parsed[m[1]] = unescapeValue(m[2].trim());
  }
  return parsed;
}

function unescapeValue(value: string): string {
  if (!value) return "";
  const quote = value[0];
  if ((quote === `"` || quote === `'`) && value.endsWith(quote)) {
    const inner = value.slice(1, -1);
    if (quote === `"`) {
      return inner
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, `"`)
        .replace(/\\\\/g, "\\");
    }
    return inner.replace(/\\'/g, `'`);
  }
  return value.replace(/\s+#.*$/, "").trim();
}

function mergeEnv(existing: string, updates: Record<string, string>): string {
  const lines = existing.split("\n");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(
      /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/,
    );
    if (!m) {
      out.push(line);
      continue;
    }
    const [, prefix, key, sep] = m;
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      out.push(`${prefix}${key}${sep}${escapeValue(updates[key])}`);
      seen.add(key);
    } else {
      out.push(line);
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) out.push(`${key}=${escapeValue(value)}`);
  }
  let body = out.join("\n");
  if (!body.endsWith("\n")) body += "\n";
  return body;
}

function escapeValue(value: string): string {
  if (/[\s#"']/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}
