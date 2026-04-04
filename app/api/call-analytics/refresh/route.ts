import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, getLeadById } from "@/lib/store";
import { getCallAnalyticsByLeadId, upsertCallAnalytics } from "@/lib/call-analytics-store";
import { hydrateCallAnalyticsPayload, hydrateRecordingPayloadFromS3 } from "@/lib/contact-lens-artifacts";
import type { ContactLensWebhookPayload } from "@/lib/contact-lens";

type CallAnalyticsRow = {
  lead_id?: string | null;
  contact_id: string;
  recording_s3_uri?: string | null;
  overall_sentiment?: string | null;
  analysis_s3_uri?: string | null;
  transcript_text?: string | null;
  transcript_json?: unknown;
  ai_summary?: string | null;
  agent_talk_time_pct?: number | null;
  customer_talk_time_pct?: number | null;
  interruptions?: number | null;
  event_source?: string | null;
  source_event_time?: string | null;
};

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

type RecoveredRecording = Partial<
  Pick<ContactLensWebhookPayload, "recordingS3Uri" | "eventSource" | "sourceEventTime">
>;

function needsHydration(row: CallAnalyticsRow) {
  const hasTranscript = Boolean(row.transcript_text || row.transcript_json);
  return Boolean(
    (!row.recording_s3_uri || !row.ai_summary || !hasTranscript) && row.contact_id,
  );
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { leadId?: string; contactId?: string };
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
    if (!leadId) return NextResponse.json({ error: "leadId is required." }, { status: 400 });

    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const lead = await getLeadById(leadId, user.id, { includeAll });
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const rows = await getCallAnalyticsByLeadId(leadId, 25);
    let hydratedCount = 0;

    for (const row of rows) {
      if (contactId && row.contact_id !== contactId) continue;
      if (!needsHydration(row)) continue;

      const recoveredRecording: RecoveredRecording = !row.recording_s3_uri
        ? await hydrateRecordingPayloadFromS3(row.contact_id).catch(() => ({}))
        : {};
      const recordingS3Uri = recoveredRecording.recordingS3Uri ?? row.recording_s3_uri ?? null;
      const hydrated: HydratedAnalytics = await hydrateCallAnalyticsPayload({
        contactId: row.contact_id,
        recordingS3Uri,
      }).catch((): HydratedAnalytics => ({}));

      if (
        !recordingS3Uri &&
        !hydrated.overallSentiment &&
        !hydrated.aiSummary &&
        !hydrated.transcriptText &&
        !hydrated.transcriptJson
      ) {
        continue;
      }

      await upsertCallAnalytics({
        ...row,
        lead_id: row.lead_id ?? leadId,
        recording_s3_uri: recordingS3Uri,
        overall_sentiment: hydrated.overallSentiment ?? row.overall_sentiment ?? null,
        analysis_s3_uri: hydrated.analysisS3Uri ?? row.analysis_s3_uri ?? null,
        transcript_text: hydrated.transcriptText ?? row.transcript_text ?? null,
        transcript_json: hydrated.transcriptJson ?? row.transcript_json ?? null,
        ai_summary: hydrated.aiSummary ?? row.ai_summary ?? null,
        agent_talk_time_pct: hydrated.agentTalkTimePct ?? row.agent_talk_time_pct ?? null,
        customer_talk_time_pct: hydrated.customerTalkTimePct ?? row.customer_talk_time_pct ?? null,
        interruptions: hydrated.interruptions ?? row.interruptions ?? null,
        event_source: hydrated.eventSource ?? recoveredRecording.eventSource ?? row.event_source ?? null,
        source_event_time: hydrated.sourceEventTime ?? recoveredRecording.sourceEventTime ?? row.source_event_time ?? null,
      });
      hydratedCount += 1;
    }

    return NextResponse.json({ success: true, hydratedCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to refresh call analytics." },
      { status: 500 },
    );
  }
}
