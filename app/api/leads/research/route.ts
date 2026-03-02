import { NextResponse } from "next/server";
import { runLeadDeepResearch } from "@/lib/scraper";
import { getLeadById, setLeadResearchSummary } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const leadId = String(body.leadId ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ error: "leadId is required." }, { status: 400 });
  }

  const lead = await getLeadById(leadId);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const summary = await runLeadDeepResearch({
    name: lead.businessName,
    phone: lead.phone,
    address: lead.city,
  });

  await setLeadResearchSummary(leadId, summary);
  return NextResponse.json({ summary });
}
