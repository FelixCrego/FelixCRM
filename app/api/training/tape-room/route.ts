export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  TRAINING_HALL_OF_FAME_CHANNEL,
  TRAINING_HALL_OF_SHAME_CHANNEL,
  getTrainingBucketFromChannel,
} from "@/lib/lead-note-channels";
import { listLeadNotesWithMetadata } from "@/lib/lead-note-metadata";
import { listLeads } from "@/lib/store";

type TapeRoomEntry = {
  id: string;
  noteId: string;
  leadId: string;
  leadName: string;
  repName: string;
  nominatedByName: string;
  reason: string;
  createdAt: string;
  category: "HALL_OF_FAME" | "HALL_OF_SHAME";
  contactId: string | null;
  recordingUrl: string | null;
};

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const leads = await listLeads(user.id, { includeAll: true });
    const noteGroups = await Promise.all(
      leads.map(async (lead) => ({
        lead,
        notes: await listLeadNotesWithMetadata(lead.id).catch(() => []),
      })),
    );

    const entries = noteGroups.flatMap(({ lead, notes }) =>
      notes
        .filter((note) => {
          const normalizedChannel = (note.channel || "").trim().toLowerCase();
          return normalizedChannel === TRAINING_HALL_OF_FAME_CHANNEL || normalizedChannel === TRAINING_HALL_OF_SHAME_CHANNEL;
        })
        .map((note) => {
          const category = note.trainingBucket ?? getTrainingBucketFromChannel(note.channel) ?? "HALL_OF_SHAME";
          const contactId = typeof note.contactId === "string" && note.contactId.trim() ? note.contactId.trim() : null;

          return {
            id: `${category}-${lead.id}-${note.id}`,
            noteId: note.id,
            leadId: lead.id,
            leadName: lead.businessName,
            repName: note.taggedUserName ?? "Assigned Rep",
            nominatedByName: note.createdByName ?? "Leadership",
            reason: note.content,
            createdAt: note.createdAt,
            category,
            contactId,
            recordingUrl: contactId
              ? `/api/call-recordings?leadId=${encodeURIComponent(lead.id)}&contactId=${encodeURIComponent(contactId)}&mode=redirect`
              : null,
          } satisfies TapeRoomEntry;
        }),
    );

    entries.sort((left, right) => {
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      return rightTime - leftTime;
    });

    return NextResponse.json({
      hallOfFame: entries.filter((entry) => entry.category === "HALL_OF_FAME").slice(0, 12),
      hallOfShame: entries.filter((entry) => entry.category === "HALL_OF_SHAME").slice(0, 12),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load tape room." }, { status: 500 });
  }
}
