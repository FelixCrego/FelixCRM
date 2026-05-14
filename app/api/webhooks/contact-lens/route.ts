import { NextResponse } from "next/server";
import { createLeadNote, findLeadIdByContactId, findLeadIdByPhone, getLeadById } from "@/lib/store";
import { getCallAnalyticsByContactId, upsertCallAnalytics } from "@/lib/call-analytics-store";
import {
  buildContactLensLeadNote,
  isContactLensWebhookAuthorized,
  normalizeContactLensPayload,
  type ContactLensWebhookPayload,
  toContactLensCrmRecord,
} from "@/lib/contact-lens";
import { hydrateCallAnalyticsPayload } from "@/lib/contact-lens-artifacts";
import { syncContactLensOutcomeToMarketingHub } from "@/lib/marketing-hub-sync";

type CallAnalyticsRecord = {
  lead_id: string;
  contact_id: string;
  duration_seconds?: number | null;
  overall_sentiment?: string | null;
  recording_url?: string | null;
  recording_url_expires_at?: string | null;
  recording_s3_uri?: string | null;
  analysis_s3_uri?: string | null;
  transcript_text?: string | null;
  transcript_json?: unknown;
  ai_summary?: string | null;
  agent_talk_time_pct?: number | null;
  customer_talk_time_pct?: number | null;
  interruptions?: number | null;
  event_source?: string | null;
  customer_phone?: string | null;
  source_event_time?: string | null;
  raw_payload?: unknown;
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

function coalesceValue<T>(incoming: T | null | undefined, existing: T | null | undefined): T | null | undefined {
  return incoming ?? existing;
}

function mergeTranscriptJson(existing: unknown, incoming: unknown) {
  const existingRows = Array.isArray(existing) ? existing : [];
  const incomingRows = Array.isArray(incoming) ? incoming : [];
  if (!existingRows.length) return incomingRows.length ? incomingRows : null;
  if (!incomingRows.length) return existingRows.length ? existingRows : null;

  const seen = new Set();
  const merged = [];
  for (const row of [...existingRows, ...incomingRows]) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const key = [item.time, item.speaker, item.text].map((value) => String(value ?? "")).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

function mergeRawPayload(existing: unknown, incoming: unknown) {
  const existingPayload =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  const incomingPayload =
    incoming && typeof incoming === "object" && !Array.isArray(incoming)
      ? (incoming as Record<string, unknown>)
      : {};

  return {
    ...existingPayload,
    ...incomingPayload,
  };
}

function transcriptJsonToText(value: unknown) {
  if (!Array.isArray(value) || !value.length) return null;
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const speaker = typeof item.speaker === "string" && item.speaker.trim() ? item.speaker.trim() : "UNKNOWN";
      const text = typeof item.text === "string" && item.text.trim() ? item.text.trim() : "";
      if (!text) return null;
      return `${speaker}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  try {
    if (!isContactLensWebhookAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized webhook request." }, { status: 401 });
    }

    const rawPayload = await request.json();
    const payload = normalizeContactLensPayload(rawPayload);
    const hydratedPayload: HydratedAnalytics =
      !payload.aiSummary &&
      !payload.overallSentiment &&
      !payload.transcriptText &&
      !payload.transcriptJson &&
      payload.recordingS3Uri
        ? await hydrateCallAnalyticsPayload(payload).catch((error) => {
            console.warn("Contact Lens S3 hydration failed:", error);
            return {} as HydratedAnalytics;
          })
        : {};
    const resolvedPayload = {
      ...payload,
      overallSentiment: payload.overallSentiment ?? hydratedPayload.overallSentiment ?? null,
      analysisS3Uri: payload.analysisS3Uri ?? hydratedPayload.analysisS3Uri ?? null,
      transcriptText: payload.transcriptText ?? hydratedPayload.transcriptText ?? null,
      transcriptJson: payload.transcriptJson ?? hydratedPayload.transcriptJson ?? null,
      aiSummary: payload.aiSummary ?? hydratedPayload.aiSummary ?? null,
      agentTalkTimePct: payload.agentTalkTimePct ?? hydratedPayload.agentTalkTimePct ?? null,
      customerTalkTimePct: payload.customerTalkTimePct ?? hydratedPayload.customerTalkTimePct ?? null,
      interruptions: payload.interruptions ?? hydratedPayload.interruptions ?? null,
      eventSource: payload.eventSource ?? hydratedPayload.eventSource ?? null,
      sourceEventTime: payload.sourceEventTime ?? hydratedPayload.sourceEventTime ?? null,
    };
    const existing = await getCallAnalyticsByContactId(resolvedPayload.contactId).catch(() => null);
    const fallbackLeadId =
      existing?.lead_id ||
      (await findLeadIdByContactId(resolvedPayload.contactId).catch(() => null)) ||
      (resolvedPayload.customerPhone ? await findLeadIdByPhone(resolvedPayload.customerPhone).catch(() => null) : null);
    const leadId = resolvedPayload.leadId || fallbackLeadId || null;

    if (!leadId) {
      return NextResponse.json(
        { error: "Missing lead_id and no existing call_analytics row found for contact_id." },
        { status: 400 },
      );
    }

    const mergedTranscriptJson = mergeTranscriptJson(existing?.transcript_json, resolvedPayload.transcriptJson);
    const mergedTranscriptText =
      resolvedPayload.transcriptText ??
      transcriptJsonToText(mergedTranscriptJson) ??
      existing?.transcript_text ??
      null;

    await upsertCallAnalytics({
      ...toContactLensCrmRecord(resolvedPayload, leadId),
      duration_seconds: coalesceValue(resolvedPayload.durationSeconds, existing?.duration_seconds),
      overall_sentiment: coalesceValue(resolvedPayload.overallSentiment, existing?.overall_sentiment),
      recording_url: coalesceValue(resolvedPayload.recordingUrl, existing?.recording_url),
      recording_url_expires_at: coalesceValue(resolvedPayload.recordingUrlExpiresAt, existing?.recording_url_expires_at),
      recording_s3_uri: coalesceValue(resolvedPayload.recordingS3Uri, existing?.recording_s3_uri),
      analysis_s3_uri: coalesceValue(resolvedPayload.analysisS3Uri, existing?.analysis_s3_uri),
      transcript_text: mergedTranscriptText,
      transcript_json: mergedTranscriptJson,
      ai_summary: coalesceValue(resolvedPayload.aiSummary, existing?.ai_summary),
      agent_talk_time_pct: coalesceValue(resolvedPayload.agentTalkTimePct, existing?.agent_talk_time_pct),
      customer_talk_time_pct: coalesceValue(resolvedPayload.customerTalkTimePct, existing?.customer_talk_time_pct),
      interruptions: coalesceValue(resolvedPayload.interruptions, existing?.interruptions),
      event_source: coalesceValue(resolvedPayload.eventSource, existing?.event_source),
      customer_phone: coalesceValue(resolvedPayload.customerPhone, existing?.customer_phone),
      source_event_time: coalesceValue(resolvedPayload.sourceEventTime, existing?.source_event_time),
      raw_payload: mergeRawPayload(existing?.raw_payload, resolvedPayload.rawPayload),
    });

    try {
      await createLeadNote(leadId, buildContactLensLeadNote({ ...resolvedPayload, leadId }), "call", resolvedPayload.contactId);
    } catch (noteError) {
      console.warn("Contact Lens note creation failed:", noteError);
    }

    try {
      const lead = await getLeadById(leadId, "marketing-hub-sync", { includeAll: true });
      if (lead) {
        await syncContactLensOutcomeToMarketingHub(lead, resolvedPayload);
      }
    } catch (syncError) {
      console.warn("Marketing Hub Contact Lens sync failed:", syncError);
    }

    return NextResponse.json(
      { success: true, message: "AWS Contact Lens data secured." },
      { status: 200 },
    );
  } catch (error) {
    console.error("Webhook processing failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error processing webhook" },
      { status: 500 },
    );
  }
}
