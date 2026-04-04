import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCallAnalyticsByContactId, upsertCallAnalytics } from "@/lib/call-analytics-store";

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mergeRawPayload(existing: unknown, patch: Record<string, unknown>) {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};

  return Object.entries(patch).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (value === undefined || value === null || value === "") return acc;
      acc[key] = value;
      return acc;
    },
    { ...base },
  );
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      leadId?: string;
      contactId?: string;
      source?: string;
      repId?: string;
      leadOwnerId?: string;
    };
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
    const source = normalizeOptionalString(body.source) ?? "crm";
    const repId = normalizeOptionalString(body.repId) ?? user.id;
    const leadOwnerId = normalizeOptionalString(body.leadOwnerId);

    if (!leadId || !contactId) {
      return NextResponse.json({ error: "leadId and contactId are required." }, { status: 400 });
    }

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
      raw_payload: mergeRawPayload(existing?.raw_payload, {
        event_source: "crm-contact-link",
        lead_id: leadId,
        contact_id: contactId,
        crm_source: source,
        linked_at: new Date().toISOString(),
        linked_by_user_id: user.id,
        rep_id: repId,
        lead_owner_id: leadOwnerId,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to link call analytics." },
      { status: 500 },
    );
  }
}
