export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { canUserViewAllLeads, createLead, deleteLeads, listClaimableLeads, listLeads, releaseStaleLeads, setLeadWorkspaceStatus } from "@/lib/store";
import { getAuthenticatedUser, getAuthenticatedUserId } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await releaseStaleLeads();
    const scope = new URL(request.url).searchParams.get("scope");
    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const leads = scope === "all" ? await listClaimableLeads(200) : await listLeads(user.id, { includeAll });
    return NextResponse.json({ leads });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load leads." }, { status: 500 });
  }
}


export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as { businessName?: string; phone?: string | null; websiteUrl?: string | null };
    const businessName = body?.businessName?.trim() || "";

    if (!businessName) {
      return NextResponse.json({ error: "Business name is required." }, { status: 400 });
    }

    const lead = await createLead(userId, {
      businessName,
      phone: body?.phone?.trim() || null,
      websiteUrl: body?.websiteUrl?.trim() || null,
      sourceType: "ADDED",
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to add lead." }, { status: 500 });
  }
}


export async function DELETE(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as { leadIds?: string[] };
    const leadIds = Array.isArray(body?.leadIds)
      ? body.leadIds.filter((leadId): leadId is string => typeof leadId === "string" && leadId.trim().length > 0)
      : [];

    if (!leadIds.length) {
      return NextResponse.json({ error: "At least one lead id is required." }, { status: 400 });
    }

    const result = await deleteLeads(leadIds, userId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete leads." }, { status: 500 });
  }
}

const ALLOWED_LEAD_STATUSES = new Set([
  "NEW",
  "ATTEMPTED",
  "CONTACTED",
  "IN_PROGRESS",
  "DEMO_BOOKED",
  "AWAITING_APPROVAL",
  "PAYMENT_PENDING",
  "DISQUALIFIED",
]);

export async function PATCH(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as { leadId?: string; status?: string | null };
    const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
    const rawStatus = typeof body?.status === "string" ? body.status.trim().toUpperCase() : "";
    const nextStatus = rawStatus === "UNSET" ? "" : rawStatus;

    if (!leadId) {
      return NextResponse.json({ error: "Lead id is required." }, { status: 400 });
    }

    if (nextStatus && !ALLOWED_LEAD_STATUSES.has(nextStatus)) {
      return NextResponse.json({ error: "Invalid lead status." }, { status: 400 });
    }

    const result = await setLeadWorkspaceStatus(leadId, userId, nextStatus || null, {
      canonicalStatus: nextStatus === "DISQUALIFIED" || nextStatus === "CLOSED" ? nextStatus : null,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update lead." }, { status: 500 });
  }
}
