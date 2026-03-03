export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { listClaimableLeads, listLeads, releaseStaleLeads } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await releaseStaleLeads();
    const scope = new URL(request.url).searchParams.get("scope");
    const leads = scope === "all" ? await listClaimableLeads(200) : await listLeads(userId);
    return NextResponse.json({ leads });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load leads." }, { status: 500 });
  }
}
