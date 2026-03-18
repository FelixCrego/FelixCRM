import { NextResponse } from "next/server";
import { createLeadNote, findLeadIdByContactId, findLeadIdByPhone } from "@/lib/store";
import { getCallAnalyticsByContactId, upsertCallAnalytics } from "@/lib/call-analytics-store";
import {
  buildContactLensLeadNote,
  isContactLensWebhookAuthorized,
  normalizeContactLensPayload,
  toContactLensCrmRecord,
} from "@/lib/contact-lens";

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
    const existing = await getCallAnalyticsByContactId(payload.contactId).catch(() => null);
    const fallbackLeadId =
      existing?.lead_id ||
      (await findLeadIdByContactId(payload.contactId).catch(() => null)) ||
      (payload.customerPhone ? await findLeadIdByPhone(payload.customerPhone).catch(() => null) : null);
    const leadId = payload.leadId || fallbackLeadId || null;

    if (!leadId) {
      return NextResponse.json(
        { error: "Missing lead_id and no existing call_analytics row found for contact_id." },
        { status: 400 },
      );
    }

    const mergedTranscriptJson = mergeTranscriptJson(existing?.transcript_json, payload.transcriptJson);
    const mergedTranscriptText =
      payload.transcriptText ??
      transcriptJsonToText(mergedTranscriptJson) ??
      existing?.transcript_text ??
      null;

    await upsertCallAnalytics({
      ...toContactLensCrmRecord(payload, leadId),
      duration_seconds: coalesceValue(payload.durationSeconds, existing?.duration_seconds),
      overall_sentiment: coalesceValue(payload.overallSentiment, existing?.overall_sentiment),
      recording_url: coalesceValue(payload.recordingUrl, existing?.recording_url),
      recording_url_expires_at: coalesceValue(payload.recordingUrlExpiresAt, existing?.recording_url_expires_at),
      recording_s3_uri: coalesceValue(payload.recordingS3Uri, existing?.recording_s3_uri),
      analysis_s3_uri: coalesceValue(payload.analysisS3Uri, existing?.analysis_s3_uri),
      transcript_text: mergedTranscriptText,
      transcript_json: mergedTranscriptJson,
      ai_summary: coalesceValue(payload.aiSummary, existing?.ai_summary),
      agent_talk_time_pct: coalesceValue(payload.agentTalkTimePct, existing?.agent_talk_time_pct),
      customer_talk_time_pct: coalesceValue(payload.customerTalkTimePct, existing?.customer_talk_time_pct),
      interruptions: coalesceValue(payload.interruptions, existing?.interruptions),
      event_source: coalesceValue(payload.eventSource, existing?.event_source),
      customer_phone: coalesceValue(payload.customerPhone, existing?.customer_phone),
      source_event_time: coalesceValue(payload.sourceEventTime, existing?.source_event_time),
      raw_payload: payload.rawPayload,
    });

    try {
      await createLeadNote(leadId, buildContactLensLeadNote({ ...payload, leadId }), "call", payload.contactId);
    } catch (noteError) {
      console.warn("Contact Lens note creation failed:", noteError);
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
