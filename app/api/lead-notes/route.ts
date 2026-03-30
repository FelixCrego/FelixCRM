export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { canUserViewAllLeads, createLeadNote, listLeadNotes, sanitizeLeadNotesForLead, setLeadWorkspaceStatus } from "@/lib/store";
import { getAuthenticatedUser } from "@/lib/auth";
import { upsertCallAnalytics } from "@/lib/call-analytics-store";
import { sanitizeContactLensNoteContent } from "@/lib/contact-lens";
import { leadWorkspaceStatusFromDispositionChannel } from "@/lib/lead-workspace-status";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const leadId = new URL(request.url).searchParams.get("leadId")?.trim();
    if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

    await sanitizeLeadNotesForLead(leadId).catch((error) => {
      console.warn("Unable to sanitize lead notes before read:", error);
    });

    const notes = (await listLeadNotes(leadId)).map((note) => ({
      ...note,
      content: sanitizeContactLensNoteContent(note.content),
    }));
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load notes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as { leadId?: string; content?: string; channel?: string; contactId?: string | null } | null;
    const leadId = body?.leadId?.trim();
    const content = body?.content?.trim();
    const channel = body?.channel?.trim() || "notes";

    if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const note = await createLeadNote(leadId, content, channel, body?.contactId?.trim() || null);
    const shouldBypassOwnership = await canUserViewAllLeads(user.id, user.email).catch(() => false);
    const nextLeadStatus = leadWorkspaceStatusFromDispositionChannel(channel);

    if (nextLeadStatus) {
      try {
        await setLeadWorkspaceStatus(leadId, user.id, nextLeadStatus, {
          bypassOwnership: shouldBypassOwnership,
          canonicalStatus: nextLeadStatus === "DISQUALIFIED" ? "DISQUALIFIED" : null,
        });
      } catch (error) {
        console.warn("Unable to update lead status from disposition:", error);
      }
    }

    if (body?.contactId?.trim()) {
      try {
        await upsertCallAnalytics({
          lead_id: leadId,
          contact_id: body.contactId.trim(),
          event_source: "crm-disposition",
        });
      } catch (error) {
        console.warn("Unable to initialize call_analytics row from lead note:", error);
      }
    }

    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save note." }, { status: 500 });
  }
}
