import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserManageAllLeads, saveLeadBillingProfile } from "@/lib/store";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isSuperAdmin = await canUserManageAllLeads(user.id, user.email);
    if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await request.json()) as {
      leadId?: string;
      billingProfile?: Lead["billingProfile"];
    };

    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    if (!leadId || !body.billingProfile) {
      return NextResponse.json({ error: "leadId and billingProfile are required." }, { status: 400 });
    }

    await saveLeadBillingProfile(leadId, body.billingProfile);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save billing profile." }, { status: 500 });
  }
}
