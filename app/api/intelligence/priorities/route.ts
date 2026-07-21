export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { buildDailyPriorities } from "@/lib/intelligence-engine";
import { canUserViewAllLeads, listLeads } from "@/lib/store";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const leads = await listLeads(user.id, { includeAll });
    const requestedLimit = Number(new URL(request.url).searchParams.get("limit") || 10);
    const limit = Math.max(1, Math.min(50, Number.isFinite(requestedLimit) ? requestedLimit : 10));
    const priorities = buildDailyPriorities(leads, limit);
    const pipelineValue = priorities.reduce((sum, priority) => sum + priority.estimatedRevenueOpportunity.high, 0);
    return NextResponse.json({ generatedAt: new Date().toISOString(), priorities, summary: { total: priorities.length, pipelineValue } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load priorities." }, { status: 500 });
  }
}
