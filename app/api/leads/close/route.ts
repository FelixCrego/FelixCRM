export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { syncClosedLeadOutcomeToMarketingHub } from "@/lib/marketing-hub-sync";
import { canUserManageAllLeads, closeLeadDeal, getLeadById } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as {
      leadId?: string;
      closedDealValue?: number;
      stripeCheckoutLink?: string | null;
      soldByUserId?: string | null;
    };
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const closedDealValue = typeof body.closedDealValue === "number" && Number.isFinite(body.closedDealValue) ? body.closedDealValue : null;
    const isSuperAdmin = await canUserManageAllLeads(user.id, user.email);

    if (!leadId) return NextResponse.json({ error: "leadId is required." }, { status: 400 });
    if (closedDealValue === null) return NextResponse.json({ error: "closedDealValue must be a valid number." }, { status: 400 });

    const result = await closeLeadDeal({
      leadId,
      actingUserId: user.id,
      closedDealValue,
      stripeCheckoutLink: typeof body.stripeCheckoutLink === "string" ? body.stripeCheckoutLink : null,
      bypassOwnership: isSuperAdmin,
      soldByUserId: isSuperAdmin && typeof body.soldByUserId === "string" ? body.soldByUserId.trim() || null : null,
    });

    const lead = await getLeadById(leadId, user.id, { includeAll: isSuperAdmin });
    let marketingHubSync: Awaited<ReturnType<typeof syncClosedLeadOutcomeToMarketingHub>> | null = null;
    if (lead) {
      try {
        marketingHubSync = await syncClosedLeadOutcomeToMarketingHub(lead);
      } catch (syncError) {
        console.warn("Marketing Hub closed-deal sync failed:", syncError);
      }
    }

    return NextResponse.json({ closed: result, marketingHubSync });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to close lead.";
    const status = message === "Forbidden" ? 403 : message === "Lead not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
