export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createLeadNote, listLeadNotes } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const leadId = new URL(request.url).searchParams.get("leadId")?.trim();
    if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

    const notes = await listLeadNotes(leadId);
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load notes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as { leadId?: string; content?: string; channel?: string; contactId?: string | null } | null;
    const leadId = body?.leadId?.trim();
    const content = body?.content?.trim();
    const channel = body?.channel?.trim() || "notes";

    if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const note = await createLeadNote(leadId, content, channel, body?.contactId?.trim() || null);
    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save note." }, { status: 500 });
  }
}
