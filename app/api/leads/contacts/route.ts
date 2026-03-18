export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserManageAllLeads, setLeadContacts, type LeadContactRecord } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as { leadId?: string; contacts?: LeadContactRecord[] };
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required." }, { status: 400 });
    }

    const contacts = Array.isArray(body.contacts) ? body.contacts : [];
    const bypassOwnership = await canUserManageAllLeads(user.id, user.email);
    const savedContacts = await setLeadContacts(leadId, user.id, contacts, { bypassOwnership });

    return NextResponse.json({ contacts: savedContacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save lead contacts.";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
