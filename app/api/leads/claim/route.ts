import { NextResponse } from "next/server";
import { claimLeads, demoOwnerId } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const leadIds = Array.isArray(payload?.leadIds) ? payload.leadIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0) : [];

    if (!leadIds.length) {
      return NextResponse.json({ error: "leadIds is required." }, { status: 400 });
    }

    const claimed = await claimLeads(leadIds, demoOwnerId());
    return NextResponse.json({ claimed });
  } catch {
    return NextResponse.json({ error: "Failed to claim leads." }, { status: 500 });
  }
}
