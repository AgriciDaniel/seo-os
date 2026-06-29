/**
 * GET /api/setup/gcloud/detect
 *
 * Returns whether the gcloud CLI is installed and discoverable. Used by the
 * setup page to render state A vs state B/C.
 */
import { NextResponse } from "next/server";
import { detectGcloud } from "@/lib/integrations/gcloud";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "setup endpoints are disabled in production builds" },
      { status: 403 },
    );
  }
  const result = await detectGcloud();
  return NextResponse.json(result);
}
