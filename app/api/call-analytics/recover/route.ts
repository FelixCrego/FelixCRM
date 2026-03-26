import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCallAnalyticsByContactId, upsertCallAnalytics } from "@/lib/call-analytics-store";
import { canUserViewAllLeads, getLeadById } from "@/lib/store";
import { hydrateCallAnalyticsPayload, hydrateRecordingPayloadFromS3 } from "@/lib/contact-lens-artifacts";
import type { ContactLensWebhookPayload } from "@/lib/contact-lens";

type RecoveredRecording = Partial<
  Pick<ContactLensWebhookPayload, "recordingS3Uri" | "eventSource" | "sourceEventTime">
>;

type HydratedAnalytics = Partial<
  Pick<
    ContactLensWebhookPayload,
    | "overallSentiment"
    | "analysisS3Uri"
    | "transcriptText"
    | "transcriptJson"
    | "aiSummary"
    | "agentTalkTimePct"
    | "customerTalkTimePct"
    | "interruptions"
    | "eventSource"
    | "sourceEventTime"
  >
>;

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
    const recoveredRecording: RecoveredRecording = await hydrateRecordingPayloadFromS3(contactId).catch(() => ({}));
    const recordingS3Uri = recoveredRecording.recordingS3Uri ?? existing?.recording_s3_uri ?? null;

    const hydrated: HydratedAnalytics = recordingS3Uri
      ? await hydrateCallAnalyticsPayload({
          contactId,
          recordingS3Uri,
        }).catch(() => ({}))
      : {};

    await upsertCallAnalytics({
      lead_id: leadId,
      contact_id: contactId,
      customer_phone: existing?.customer_phone ?? null,
      duration_seconds: existing?.duration_seconds ?? null,
      recording_url: existing?.recording_url ?? null,
      recording_url_expires_at: existing?.recording_url_expires_at ?? null,
      recording_s3_uri: recordingS3Uri,
      analysis_s3_uri: hydrated.analysisS3Uri ?? existing?.analysis_s3_uri ?? null,
      overall_sentiment: hydrated.overallSentiment ?? existing?.overall_sentiment ?? null,
      transcript_text: hydrated.transcriptText ?? existing?.transcript_text ?? null,
      transcript_json: hydrated.transcriptJson ?? existing?.transcript_json ?? null,
      ai_summary: hydrated.aiSummary ?? existing?.ai_summary ?? null,
      agent_talk_time_pct: hydrated.agentTalkTimePct ?? existing?.agent_talk_time_pct ?? null,
      customer_talk_time_pct: hydrated.customerTalkTimePct ?? existing?.customer_talk_time_pct ?? null,
      interruptions: hydrated.interruptions ?? existing?.interruptions ?? null,
      event_source: hydrated.eventSource ?? recoveredRecording.eventSource ?? existing?.event_source ?? "crm-contact-recover",
      source_event_time: hydrated.sourceEventTime ?? recoveredRecording.sourceEventTime ?? existing?.source_event_time ?? null,
      raw_payload: existing?.raw_payload ?? { lead_id: leadId, contact_id: contactId, event_source: "crm-contact-recover" },
    });

    return NextResponse.json({
      success: true,
      recovered: Boolean(recordingS3Uri),
      analyzed: Boolean(hydrated.analysisS3Uri || hydrated.aiSummary || hydrated.transcriptText || hydrated.transcriptJson),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to recover call analytics." },
      { status: 500 },
    );
  }
}
