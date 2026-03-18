import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCallAnalyticsByContactId, upsertCallAnalytics } from "@/lib/call-analytics-store";
import { canUserViewAllLeads, getLeadById } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { leadId?: string; contactId?: string };
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";

    if (!leadId || !contactId) {
      return NextResponse.json({ error: "leadId and contactId are required." }, { status: 400 });
    }

    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const lead = await getLeadById(leadId, user.id, { includeAll });
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const existing = await getCallAnalyticsByContactId(contactId).catch(() => null);
    await upsertCallAnalytics({
      lead_id: leadId,
      contact_id: contactId,
      customer_phone: existing?.customer_phone ?? null,
      duration_seconds: existing?.duration_seconds ?? null,
      overall_sentiment: existing?.overall_sentiment ?? null,
      recording_url: existing?.recording_url ?? null,
      recording_url_expires_at: existing?.recording_url_expires_at ?? null,
      recording_s3_uri: existing?.recording_s3_uri ?? null,
      analysis_s3_uri: existing?.analysis_s3_uri ?? null,
      transcript_text: existing?.transcript_text ?? null,
      transcript_json: existing?.transcript_json ?? null,
      ai_summary: existing?.ai_summary ?? null,
      agent_talk_time_pct: existing?.agent_talk_time_pct ?? null,
      customer_talk_time_pct: existing?.customer_talk_time_pct ?? null,
      interruptions: existing?.interruptions ?? null,
      event_source: existing?.event_source ?? "crm-contact-link",
      source_event_time: existing?.source_event_time ?? new Date().toISOString(),
      raw_payload: existing?.raw_payload ?? {
        event_source: "crm-contact-link",
        lead_id: leadId,
        contact_id: contactId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to link call analytics." },
      { status: 500 },
    );
  }
}
