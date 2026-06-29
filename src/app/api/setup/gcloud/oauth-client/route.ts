/**
 * POST /api/setup/gcloud/oauth-client
 *
 * Accepts the Desktop OAuth client JSON downloaded from Google Cloud,
 * stores it in the user's local config directory, and points gcloud ADC login
 * at that stable path. The file contains a client secret, so we never echo
 * its contents and write it outside the repository with owner-only perms.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeEnvLocal } from "@/lib/setup/env-local";
import { sameOriginSetupWriteAllowed } from "@/lib/http/same-origin";

const MAX_CLIENT_FILE_BYTES = 128 * 1024;

const DesktopOauthClient = z.object({
  installed: z
    .object({
      client_id: z.string().min(1),
      project_id: z.string().optional(),
      auth_uri: z.string().url(),
      token_uri: z.string().url(),
      client_secret: z.string().min(1),
      redirect_uris: z.array(z.string()).optional(),
    })
    .passthrough(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const allowed = sameOriginSetupWriteAllowed(req);
  if (allowed !== true) return allowed;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "upload the OAuth client JSON as form data" },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "upload the OAuth client JSON file" },
      { status: 400 },
    );
  }
  if (file.size <= 0) {
    return NextResponse.json(
      { ok: false, error: "uploaded file is empty" },
      { status: 400 },
    );
  }
  if (file.size > MAX_CLIENT_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "OAuth client JSON is larger than expected" },
      { status: 400 },
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await file.text());
  } catch {
    return NextResponse.json(
      { ok: false, error: "file is not valid JSON" },
      { status: 400 },
    );
  }

  const parsed = DesktopOauthClient.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "expected a Google OAuth Desktop app client JSON with an installed.client_id and installed.client_secret",
      },
      { status: 400 },
    );
  }

  const configRoot =
    process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config");
  const configDir = path.join(configRoot, "seo-office");
  const targetPath = path.join(configDir, "gcp-oauth-client.json");
  const tempPath = path.join(
    configDir,
    `.gcp-oauth-client.${process.pid}.${Date.now()}.tmp`,
  );

  await fsp.mkdir(configDir, { recursive: true, mode: 0o700 });
  await fsp.writeFile(tempPath, JSON.stringify(parsed.data, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  await fsp.chmod(tempPath, 0o600).catch(() => undefined);
  await fsp.rename(tempPath, targetPath);
  await fsp.chmod(targetPath, 0o600).catch(() => undefined);
  await writeEnvLocal({ SEO_OFFICE_GCLOUD_CLIENT_ID_FILE: targetPath });

  return NextResponse.json({
    ok: true,
    path: targetPath,
    projectId: parsed.data.installed.project_id ?? null,
    restartRequired: false,
  });
}
