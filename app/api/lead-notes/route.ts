export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  canUserViewAllLeads,
  createLeadNote,
  getEffectiveUserRole,
  sanitizeLeadNotesForLead,
  setLeadWorkspaceStatus,
} from "@/lib/store";
import { getAuthenticatedUser } from "@/lib/auth";
import { upsertCallAnalytics } from "@/lib/call-analytics-store";
import { sanitizeContactLensNoteContent } from "@/lib/contact-lens";
import { leadWorkspaceStatusFromDispositionChannel } from "@/lib/lead-workspace-status";
import {
  MANAGER_CALL_REVIEW_CHANNEL,
  TRAINING_HALL_OF_FAME_CHANNEL,
  TRAINING_HALL_OF_SHAME_CHANNEL,
  getTrainingBucketFromChannel,
  isLeadershipRole,
} from "@/lib/lead-note-channels";
import { acknowledgeLeadNote, listLeadNotesWithMetadata, updateLeadNoteMetadata } from "@/lib/lead-note-metadata";
import { getUserDisplayName } from "@/lib/workforce-store";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const leadId = new URL(request.url).searchParams.get("leadId")?.trim();
    if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

    await sanitizeLeadNotesForLead(leadId).catch((error) => {
      console.warn("Unable to sanitize lead notes before read:", error);
    });

    const notes = (await listLeadNotesWithMetadata(leadId)).map((note) => ({
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

    const body = (await request.json().catch(() => null)) as {
      leadId?: string;
      content?: string;
      channel?: string;
      contactId?: string | null;
      targetUserId?: string | null;
      targetUserName?: string | null;
      taggedUserId?: string | null;
      taggedUserName?: string | null;
    } | null;
    const leadId = body?.leadId?.trim();
    const content = body?.content?.trim();
    const channel = body?.channel?.trim() || "notes";
    const normalizedChannel = channel.toLowerCase();

    if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const isLeadershipNote =
      normalizedChannel === MANAGER_CALL_REVIEW_CHANNEL ||
      normalizedChannel === TRAINING_HALL_OF_FAME_CHANNEL ||
      normalizedChannel === TRAINING_HALL_OF_SHAME_CHANNEL;

    if (isLeadershipNote) {
      const role = await getEffectiveUserRole(user.id, user.email).catch(() => "REP");
      if (!isLeadershipRole(role)) {
        return NextResponse.json({ error: "Only managers, team leads, and super admins can add leadership review notes." }, { status: 403 });
      }
    }

    let note = await createLeadNote(leadId, content, channel, body?.contactId?.trim() || null);
    const shouldBypassOwnership = await canUserViewAllLeads(user.id, user.email).catch(() => false);
    const nextLeadStatus = leadWorkspaceStatusFromDispositionChannel(channel);

    if (isLeadershipNote) {
      const actorName = await getUserDisplayName(user.id, user.email).catch(() => user.email ?? "Leadership");
      note = await updateLeadNoteMetadata(leadId, note.id, {
        ...(normalizedChannel === MANAGER_CALL_REVIEW_CHANNEL
          ? {
              targetUserId: body?.targetUserId?.trim() || null,
              targetUserName: body?.targetUserName?.trim() || null,
              requiresAcknowledgement: Boolean(body?.targetUserId?.trim()),
              acknowledgedAt: null,
              acknowledgedByUserId: null,
              acknowledgedByName: null,
            }
          : {}),
        createdByUserId: user.id,
        createdByName: actorName,
        trainingBucket: getTrainingBucketFromChannel(normalizedChannel),
        taggedUserId: body?.taggedUserId?.trim() || null,
        taggedUserName: body?.taggedUserName?.trim() || null,
      });
    }

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

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as {
      leadId?: string;
      noteId?: string;
      action?: string;
    } | null;

    const leadId = body?.leadId?.trim();
    const noteId = body?.noteId?.trim();
    const action = body?.action?.trim().toLowerCase();

    if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    if (!noteId) return NextResponse.json({ error: "noteId is required" }, { status: 400 });
    if (action !== "acknowledge") return NextResponse.json({ error: "Unsupported action." }, { status: 400 });

    const note = (await listLeadNotesWithMetadata(leadId)).find((item) => item.id === noteId);
    if (!note) return NextResponse.json({ error: "Lead note not found." }, { status: 404 });
    if ((note.channel || "").trim().toLowerCase() !== MANAGER_CALL_REVIEW_CHANNEL) {
      return NextResponse.json({ error: "Only manager review notes can be acknowledged." }, { status: 400 });
    }
    if (!note.targetUserId || note.targetUserId !== user.id) {
      return NextResponse.json({ error: "Only the assigned rep can acknowledge this note." }, { status: 403 });
    }

    const userName = await getUserDisplayName(user.id, user.email).catch(() => user.email ?? "Rep");
    const updated = await acknowledgeLeadNote(leadId, noteId, user.id, userName);
    return NextResponse.json({ note: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to acknowledge note." }, { status: 500 });
  }
}
