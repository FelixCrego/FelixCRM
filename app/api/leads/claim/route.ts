import { NextResponse } from "next/server";
import { claimLeads, getCurrentUserId } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const leadIds = Array.isArray(payload?.leadIds) ? payload.leadIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0) : [];

    if (!leadIds.length) {
      return NextResponse.json({ error: "leadIds is required." }, { status: 400 });
    }

    const ownerId = await getCurrentUserId();
    const claimed = await claimLeads(leadIds, ownerId);
    return NextResponse.json({ claimed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to claim leads." }, { status: 500 });
  }
}
