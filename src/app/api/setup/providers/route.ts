import { NextResponse } from "next/server";
import {
  configuredProviderId,
  detectAll,
  selectedProviderId,
} from "@/lib/integrations/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const [providers, selected] = await Promise.all([
    detectAll(),
    selectedProviderId(),
  ]);
  return NextResponse.json({
    providers,
    selected,
    configured: configuredProviderId(),
  });
}
