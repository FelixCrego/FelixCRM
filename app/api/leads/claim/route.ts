import { NextResponse } from "next/server";
import { claimLeads } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const ownerId = await getAuthenticatedUserId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const leadIds = Array.isArray(payload?.leadIds) ? payload.leadIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0) : [];

    if (!leadIds.length) {
      return NextResponse.json({ error: "leadIds is required." }, { status: 400 });
    }

    const result = await claimLeads(leadIds, ownerId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to claim leads." }, { status: 500 });
  }
}
