import { NextRequest, NextResponse } from "next/server";
import { listClients, reindexClient } from "@/lib/brain/index-db";
import { scaffoldClient } from "@/lib/brain/scaffold";
import { ClientInputSchema, type ClientInput } from "@/lib/brain/types";
import { expandMinimalClientInput, looksMinimal } from "@/lib/brain/minimal-intake";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ clients: listClients() });
}

export async function POST(req: NextRequest) {
  const allowed = sameOriginWriteAllowed(req);
  if (allowed !== true) return allowed;

  const body = await req.json();
  let input: ClientInput;
  try {
    input = looksMinimal(body)
      ? expandMinimalClientInput(body)
      : ClientInputSchema.parse(body);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  try {
    const result = await scaffoldClient(input);
    await reindexClient(result.slug);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
