import { NextResponse } from "next/server";
import { listSpecialists } from "@/lib/orchestrator/registry";
import "@/lib/specialists"; // populate registry on first import

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    specialists: listSpecialists().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      desk: s.desk,
    })),
  });
}
