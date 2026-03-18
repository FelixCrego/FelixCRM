export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, listLeadNotes, listLeads } from "@/lib/store";

type SearchLeadResult = {
  id: string;
  businessName: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  type: "lead";
};

type SearchNoteResult = {
  id: string;
  leadId: string;
  leadName: string;
  snippet: string;
  type: "note";
};

type SearchDemoResult = {
  id: string;
  leadId: string;
  leadName: string;
  scheduledFor: string;
  type: "demo";
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function makeSnippet(content: string, query: string) {
  const normalizedContent = content.toLowerCase();
  const index = normalizedContent.indexOf(query);
  if (index < 0) return content.slice(0, 120);
  const start = Math.max(0, index - 36);
  const end = Math.min(content.length, index + query.length + 84);
  return content.slice(start, end).trim();
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const q = normalize(searchParams.get("q") ?? "");
    if (q.length < 2) {
      return NextResponse.json({ leads: [], notes: [], demos: [] });
    }

    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const leads = await listLeads(user.id, { includeAll });

    const matchedLeads = leads
      .filter((lead) => {
        const blob = [
          lead.businessName,
          lead.phone ?? "",
          lead.email ?? "",
          lead.city ?? "",
          lead.businessType ?? "",
          lead.sourceQuery ?? "",
        ].join(" ").toLowerCase();
        return blob.includes(q);
      })
      .slice(0, 8);

    const leadResults: SearchLeadResult[] = matchedLeads.map((lead) => ({
      id: lead.id,
      businessName: lead.businessName,
      phone: lead.phone ?? null,
      email: lead.email ?? null,
      city: lead.city ?? null,
      type: "lead",
    }));

    const noteResults: SearchNoteResult[] = [];
    for (const lead of matchedLeads.slice(0, 5)) {
      const notes = await listLeadNotes(lead.id).catch(() => []);
      for (const note of notes) {
        if (!note.content.toLowerCase().includes(q)) continue;
        noteResults.push({
          id: note.id,
          leadId: lead.id,
          leadName: lead.businessName,
          snippet: makeSnippet(note.content, q),
          type: "note",
        });
        if (noteResults.length >= 5) break;
      }
      if (noteResults.length >= 5) break;
    }

    const demoResults: SearchDemoResult[] = matchedLeads
      .map((lead) => {
        const booking = lead.demoBooking;
        if (!booking?.date || !booking?.time) return null;
        return {
          id: `demo-${lead.id}`,
          leadId: lead.id,
          leadName: lead.businessName,
          scheduledFor: `${booking.date} ${booking.time}`,
          type: "demo" as const,
        };
      })
      .filter((value): value is SearchDemoResult => Boolean(value))
      .slice(0, 5);

    return NextResponse.json({
      leads: leadResults,
      notes: noteResults,
      demos: demoResults,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed." }, { status: 500 });
  }
}
