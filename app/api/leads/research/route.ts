import { NextResponse } from "next/server";
import { runLeadResearch } from "@/lib/scraper";
import { getLeadById, setLeadResearchSummary } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const leadId = String(body.leadId ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ error: "leadId is required." }, { status: 400 });
  }

  const lead = await getLeadById(leadId, ownerId);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const research = await runLeadResearch({
    name: lead.businessName,
    phone: lead.phone,
    address: lead.city,
  });

  await setLeadResearchSummary(leadId, research);
  return NextResponse.json(research);
}
