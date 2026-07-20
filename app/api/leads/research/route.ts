import { NextResponse } from "next/server";
import { deepResearchLead } from "@/lib/deep-lead-research";
import { canUserManageAllLeads, getLeadById, setLeadResearchSummary } from "@/lib/store";
import { getAuthenticatedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const leadId = String(body.leadId ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ error: "leadId is required." }, { status: 400 });
  }

  const lead = await getLeadById(leadId, user.id, { includeAll: await canUserManageAllLeads(user.id, user.email) });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const research = await deepResearchLead({
    name: lead.businessName,
    phone: lead.phone,
    email: lead.email,
    websiteUrl: lead.websiteUrl,
    city: lead.city,
    businessType: lead.businessType,
  });

  await setLeadResearchSummary(leadId, research);
  return NextResponse.json(research);
}
