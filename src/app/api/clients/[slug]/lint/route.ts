/**
 * GET /api/clients/:slug/lint
 *
 * Dry-run vault lint: returns the JSON `LintReport` without writing a
 * deliverable note. Use this for the UI dashboard's "Run vault lint" tile
 * and for manual `curl` verification. To persist the report into the
 * vault, dispatch the `vault-linter` specialist through the normal
 * assignment flow instead.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ClientSlug } from "@/lib/brain/types";
import { lintVault } from "@/lib/specialists/vault-linter";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = ClientSlug.safeParse(slug);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: `invalid client slug: ${parsed.error.message}` },
      { status: 400 },
    );
  }
  const report = await lintVault(parsed.data);
  return NextResponse.json({ ok: true, report });
}
