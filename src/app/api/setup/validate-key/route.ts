import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateKey } from "@/lib/integrations/anthropic";
import { sameOriginSetupWriteAllowed } from "@/lib/http/same-origin";

const Body = z.object({
  provider: z.literal("anthropic"),
  key: z.string().min(10),
});

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const allowed = sameOriginSetupWriteAllowed(req);
  if (allowed !== true) return allowed;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  const result = await validateKey(parsed.data.key);
  return NextResponse.json(result);
}
