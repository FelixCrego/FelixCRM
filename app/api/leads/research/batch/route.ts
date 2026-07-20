import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserManageAllLeads, getLeadById, setLeadResearchSummary } from "@/lib/store";
import { deepResearchLead } from "@/lib/deep-lead-research";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const leadIds = Array.isArray(body.leadIds) ? body.leadIds.map(String).filter(Boolean).slice(0, 10) : [];
  if (!leadIds.length) return NextResponse.json({ error: "Select at least one lead." }, { status: 400 });
  const includeAll = await canUserManageAllLeads(user.id, user.email);
  const results = [];
  for (const leadId of leadIds) {
    try {
      const lead = await getLeadById(leadId, user.id, { includeAll });
      if (!lead) { results.push({ leadId, ok: false, error: "Lead not found" }); continue; }
      const research = await deepResearchLead({ name: lead.businessName, phone: lead.phone, email: lead.email, websiteUrl: lead.websiteUrl, city: lead.city, businessType: lead.businessType });
      await setLeadResearchSummary(leadId, research);
      results.push({ leadId, ok: true, email: research.structured.primaryEmail, confidence: research.structured.confidence, sources: research.structured.sources.length });
    } catch (error) { results.push({ leadId, ok: false, error: error instanceof Error ? error.message : "Research failed" }); }
  }
  return NextResponse.json({ results });
}
