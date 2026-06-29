/**
 * Content-addressed attachment storage for chat.
 *
 * Files land at
 *   .seo-office/vaults/<slug>/.chat/attachments/<sha256>.<ext>
 * with a JSON sidecar
 *   .seo-office/vaults/<slug>/.chat/attachments/<sha256>.meta.json
 *
 * Why sha256-keyed:
 *   - The same file uploaded twice (e.g. a logo dragged into two
 *     conversations) costs one slot, not two.
 *   - The URL is unguessable, so accidental sharing of a vault path
 *     doesn't expose contents to drive-by requests.
 *   - The id IS the integrity proof — no separate validation needed
 *     when the chat route later reads it back to base64-encode for
 *     the Anthropic SDK.
 *
 * Why JSONL sidecars instead of jamming everything into one index file:
 *   - One sidecar per file means concurrent uploads don't fight over
 *     a shared index. The atomic write-temp-then-rename pattern keeps
 *     each sidecar consistent without a per-vault lock.
 */
import "server-only";

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import { vaultRoot } from "@/lib/brain/paths";

/** Hard cap per single attachment. Generous for screenshots + briefs;
 *  bounded enough to refuse a 4 GB video drag. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Max attachments allowed on a single chat turn. */
export const MAX_ATTACHMENTS_PER_TURN = 5;

/**
 * Allowlisted MIME types. Anthropic supports image/* and application/pdf
 * natively; the text/* types are flattened into <file name="..."> blocks
 * by the chat route. Everything else is rejected at upload time.
 */
export const ALLOWED_MIME: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

/** Map MIME → file extension used for the on-disk file. */
function extFor(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "application/pdf":
      return "pdf";
    case "text/plain":
      return "txt";
    case "text/markdown":
      return "md";
    case "text/csv":
      return "csv";
    default:
      return "bin";
  }
}

export interface AttachmentRecord {
  /** Same as sha256 — the canonical id. */
  id: string;
  sha256: string;
  mime: string;
  /** Bytes on disk. */
  size: number;
  /** Original filename from the upload, sanitised. */
  filename: string;
  /** ISO timestamp. */
  uploaded_at: string;
  /** Convenience URL the UI uses to render previews. */
  preview_url: string;
}

/** Directory where attachments + sidecars live for a given client. */
function attachmentsDir(slug: string): string {
  return path.join(vaultRoot(slug), ".chat", "attachments");
}

/** Sanitise the supplied filename — keep alphanumerics, dots, dashes,
 *  underscores; collapse everything else; cap length. */
function safeFilename(input: string): string {
  const trimmed = input.trim();
  const cleaned = trimmed.replace(/[^A-Za-z0-9._-]+/g, "_");
  return cleaned.slice(0, 120) || "untitled";
}

/**
 * Save an attachment to the vault. Idempotent: re-uploading the same
 * bytes returns the existing record without rewriting the file.
 */
export async function saveAttachment(
  slug: string,
  data: Buffer,
  mime: string,
  filename: string,
): Promise<AttachmentRecord> {
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error(`unsupported mime type: ${mime}`);
  }
  if (data.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `attachment too large: ${data.byteLength} bytes (max ${MAX_ATTACHMENT_BYTES})`,
    );
  }

  const sha256 = createHash("sha256").update(data).digest("hex");
  const ext = extFor(mime);
  const dir = attachmentsDir(slug);
  await fsp.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${sha256}.${ext}`);
  const metaPath = path.join(dir, `${sha256}.meta.json`);

  // Idempotency — same bytes, same sha256, same on-disk file.
  if (!fs.existsSync(filePath)) {
    const tmp = `${filePath}.tmp.${process.pid}`;
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, filePath);
  }

  const record: AttachmentRecord = {
    id: sha256,
    sha256,
    mime,
    size: data.byteLength,
    filename: safeFilename(filename || `${sha256.slice(0, 8)}.${ext}`),
    uploaded_at: new Date().toISOString(),
    preview_url: `/api/chat/attachments/${sha256}`,
  };

  // Always (over)write the sidecar so the most recent filename + ts is
  // captured. Cheap, and sha256 collisions are not a concern.
  const tmpMeta = `${metaPath}.tmp.${process.pid}`;
  await fsp.writeFile(tmpMeta, JSON.stringify(record, null, 2), "utf8");
  await fsp.rename(tmpMeta, metaPath);

  return record;
}

/** Read the binary contents + meta for one attachment. */
export async function readAttachment(
  slug: string,
  sha256: string,
): Promise<{ buffer: Buffer; record: AttachmentRecord } | null> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return null; // reject path traversal
  const dir = attachmentsDir(slug);
  const metaPath = path.join(dir, `${sha256}.meta.json`);
  if (!fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(await fsp.readFile(metaPath, "utf8")) as AttachmentRecord;
  const ext = extFor(meta.mime);
  const filePath = path.join(dir, `${sha256}.${ext}`);
  if (!fs.existsSync(filePath)) return null;
  const buffer = await fsp.readFile(filePath);
  return { buffer, record: meta };
}

/** Read just the metadata sidecar for one attachment. */
export async function readAttachmentRecord(
  slug: string,
  sha256: string,
): Promise<AttachmentRecord | null> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
  const metaPath = path.join(attachmentsDir(slug), `${sha256}.meta.json`);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(await fsp.readFile(metaPath, "utf8")) as AttachmentRecord;
  } catch {
    return null;
  }
}
