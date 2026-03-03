export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { listLeads, releaseStaleLeads } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET() {
  try {
    const userId = getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await releaseStaleLeads();
    const leads = await listLeads(userId);
    return NextResponse.json({ leads });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load leads." }, { status: 500 });
  }
}
