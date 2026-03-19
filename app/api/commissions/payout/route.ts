import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserManageAllLeads, listLeads, prettyNameFromEmail, saveLeadCommissionPayout } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isSuperAdmin = await canUserManageAllLeads(user.id, user.email);
    if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await request.json()) as {
      leadId?: string;
      status?: "PAID" | "UNPAID";
      paidAmount?: number;
      note?: string | null;
    };

    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const status = body.status === "PAID" ? "PAID" : "UNPAID";
    const paidAmount = typeof body.paidAmount === "number" && Number.isFinite(body.paidAmount) && body.paidAmount >= 0 ? body.paidAmount : null;
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

    if (!leadId) return NextResponse.json({ error: "leadId is required." }, { status: 400 });

    const lead = (await listLeads(user.id, { includeAll: true })).find((candidate) => candidate.id === leadId);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const paidByName = typeof user.email === "string" && user.email.trim() ? prettyNameFromEmail(user.email) : "Super Admin";

    const nextPayout =
      status === "PAID"
        ? {
            status: "PAID" as const,
            paidAt: new Date().toISOString(),
            paidAmount,
            paidByUserId: user.id,
            paidByName,
            note,
          }
        : {
            status: "UNPAID" as const,
            paidAt: null,
            paidAmount: null,
            paidByUserId: null,
            paidByName: null,
            note,
          };

    await saveLeadCommissionPayout(leadId, nextPayout);

    return NextResponse.json({ ok: true, commissionPayout: nextPayout });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update commission payout." }, { status: 500 });
  }
}
