export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { setLeadContacts, type LeadContactRecord } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as { leadId?: string; contacts?: LeadContactRecord[] };
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required." }, { status: 400 });
    }

    const contacts = Array.isArray(body.contacts) ? body.contacts : [];
    const savedContacts = await setLeadContacts(leadId, userId, contacts);

    return NextResponse.json({ contacts: savedContacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save lead contacts.";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
