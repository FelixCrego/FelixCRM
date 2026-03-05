export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { closeLeadDeal } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as { leadId?: string; closedDealValue?: number; stripeCheckoutLink?: string | null };
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const closedDealValue = typeof body.closedDealValue === "number" && Number.isFinite(body.closedDealValue) ? body.closedDealValue : null;

    if (!leadId) return NextResponse.json({ error: "leadId is required." }, { status: 400 });
    if (closedDealValue === null) return NextResponse.json({ error: "closedDealValue must be a valid number." }, { status: 400 });

    const result = await closeLeadDeal({
      leadId,
      ownerId: userId,
      closedDealValue,
      stripeCheckoutLink: typeof body.stripeCheckoutLink === "string" ? body.stripeCheckoutLink : null,
    });

    return NextResponse.json({ closed: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to close lead.";
    const status = message === "Forbidden" ? 403 : message === "Lead not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
