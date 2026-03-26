import { listCallAnalyticsByLeadIds, type CallAnalyticsRecord } from "@/lib/call-analytics-store";
import { canUserViewAllLeads, listAssignableUsers, listLeads } from "@/lib/store";
import type { Lead } from "@/lib/types";

type SalesLearningSnapshot = {
  promptContext: string;
  injectedData: string[];
  bookedDemoCount: number;
  transcriptBackedExampleCount: number;
};

type TranscriptLine = {
  speaker?: string;
  text?: string;
  sentiment?: string;
};

function parseDate(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function truncate(value: string | null | undefined, maxLength: number) {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(maxLength - 3, 0)).trimEnd()}...`;
}

function getBookedAt(lead: Lead) {
  return parseDate(lead.demoBooking?.bookedAt) || parseDate(lead.updatedAt);
}

function getBestCallRecord(records: CallAnalyticsRecord[]) {
  if (!records.length) return null;
  return [...records].sort((a, b) => scoreCallRecord(b) - scoreCallRecord(a))[0] ?? null;
}

function scoreCallRecord(record: CallAnalyticsRecord) {
  let score = 0;
  if (record.ai_summary) score += 6;
  if (record.transcript_json) score += 5;
  if (record.transcript_text) score += 4;
  if (record.analysis_s3_uri) score += 3;
  if (record.overall_sentiment) score += 2;
  if (record.recording_s3_uri) score += 1;
  score += parseDate(record.source_event_time ?? undefined) / 1_000_000_000_000;
  return score;
}

function normalizeTranscriptLines(record: CallAnalyticsRecord): TranscriptLine[] {
  if (Array.isArray(record.transcript_json)) {
    return record.transcript_json
      .filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === "object")
      .map((line) => ({
        speaker: typeof line.speaker === "string" ? line.speaker.trim() : "",
        text: typeof line.text === "string" ? line.text.trim() : "",
        sentiment: typeof line.sentiment === "string" ? line.sentiment.trim() : "",
      }))
      .filter((line) => line.text);
  }

  if (!record.transcript_text) return [];

  return record.transcript_text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:]{1,40}):\s*(.+)$/);
      if (!match) return { text: line };
      return {
        speaker: match[1]?.trim(),
        text: match[2]?.trim(),
      };
    })
    .filter((line) => line.text);
}

function extractObjectionSignals(record: CallAnalyticsRecord) {
  const objectionPattern =
    /\b(already|think about it|send (?:me )?details|price|pricing|budget|too expensive|busy|call me back|not interested|website|agency|later|partner|wife|husband)\b/i;

  const matches = normalizeTranscriptLines(record)
    .filter((line) => {
      const speaker = (line.speaker || "").toUpperCase();
      return speaker.includes("CUSTOMER") || speaker.includes("PROSPECT") || !speaker;
    })
    .map((line) => line.text || "")
    .filter((line) => objectionPattern.test(line))
    .map((line) => truncate(line, 160))
    .filter(Boolean);

  return Array.from(new Set(matches)).slice(0, 3);
}

function extractTranscriptExcerpt(record: CallAnalyticsRecord) {
  const lines = normalizeTranscriptLines(record).slice(0, 6);
  if (!lines.length) return "";
  return truncate(
    lines
      .map((line) => {
        const speaker = line.speaker ? `${line.speaker}: ` : "";
        return `${speaker}${line.text || ""}`.trim();
      })
      .join(" | "),
    420,
  );
}

function formatRepHighlights(leads: Lead[], repNamesById: Map<string, string>) {
  const counts = new Map<string, number>();

  for (const lead of leads) {
    if (!lead.ownerId) continue;
    counts.set(lead.ownerId, (counts.get(lead.ownerId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ownerId, count]) => `${repNamesById.get(ownerId) ?? ownerId}: ${count} booked demos`);
}

function buildLearningExample(lead: Lead, record: CallAnalyticsRecord | null) {
  const lines = [
    `Lead: ${lead.businessName} (${lead.city || "Unknown city"})`,
    `Research: ${truncate(lead.aiResearchSummary || lead.enrichment?.summary || "No research summary stored.", 220)}`,
  ];

  if (record?.ai_summary) {
    lines.push(`Call summary: ${truncate(record.ai_summary, 220)}`);
  }

  const objections = record ? extractObjectionSignals(record) : [];
  if (objections.length) {
    lines.push(`Objections heard: ${objections.join(" | ")}`);
  }

  const transcriptExcerpt = record ? extractTranscriptExcerpt(record) : "";
  if (transcriptExcerpt) {
    lines.push(`Transcript excerpt: ${transcriptExcerpt}`);
  }

  return lines.join("\n");
}

export async function buildSalesLearningSnapshot(params: {
  userId: string;
  userEmail?: string | null;
  currentLeadId?: string | null;
}): Promise<SalesLearningSnapshot> {
  const includeAll = await canUserViewAllLeads(params.userId, params.userEmail);
  const [leads, assignableUsers] = await Promise.all([
    listLeads(params.userId, { includeAll }),
    listAssignableUsers().catch(() => []),
  ]);

  const repNamesById = new Map(assignableUsers.map((user) => [user.id, user.name]));
  const bookedDemoLeads = leads
    .filter((lead) => Boolean(lead.demoBooking?.date))
    .filter((lead) => !params.currentLeadId || lead.id !== params.currentLeadId)
    .sort((a, b) => getBookedAt(b) - getBookedAt(a));

  const learningLeads = bookedDemoLeads.slice(0, 12);
  const leadIds = learningLeads.map((lead) => lead.id);
  const callRows = await listCallAnalyticsByLeadIds(leadIds, 120).catch(() => [] as CallAnalyticsRecord[]);

  const callsByLeadId = new Map<string, CallAnalyticsRecord[]>();
  for (const row of callRows) {
    if (!row.lead_id) continue;
    const existing = callsByLeadId.get(row.lead_id) ?? [];
    existing.push(row);
    callsByLeadId.set(row.lead_id, existing);
  }

  const exampleBlocks = learningLeads
    .map((lead) => {
      const bestRecord = getBestCallRecord(callsByLeadId.get(lead.id) ?? []);
      return {
        lead,
        record: bestRecord,
        hasTranscript: Boolean(bestRecord?.transcript_json || bestRecord?.transcript_text || bestRecord?.ai_summary),
      };
    })
    .sort((a, b) => Number(b.hasTranscript) - Number(a.hasTranscript))
    .slice(0, 6);

  const transcriptBackedExampleCount = exampleBlocks.filter((example) => example.hasTranscript).length;
  const repHighlights = formatRepHighlights(bookedDemoLeads, repNamesById);
  const examplesText = exampleBlocks.map((example, index) => `${index + 1}. ${buildLearningExample(example.lead, example.record)}`).join("\n\n");

  const injectedData = [
    `Deep research for target lead`,
    `${bookedDemoLeads.length} booked-demo wins in CRM`,
    transcriptBackedExampleCount
      ? `${transcriptBackedExampleCount} transcript-backed winning call examples`
      : "No transcript-backed wins synced yet",
    repHighlights[0] ? `Top rep pattern: ${repHighlights[0]}` : "No rep leaderboard pattern yet",
  ];

  const promptContext = [
    `Visible booked demos in CRM: ${bookedDemoLeads.length}`,
    repHighlights.length ? `Top demo bookers: ${repHighlights.join(" | ")}` : "Top demo bookers: not enough data yet.",
    transcriptBackedExampleCount
      ? `Transcript-backed winning examples available: ${transcriptBackedExampleCount}`
      : "Transcript-backed winning examples available: 0. Use only the booked-demo and research patterns below.",
    examplesText ? `Winning examples:\n${examplesText}` : "Winning examples: none yet.",
  ].join("\n\n");

  return {
    promptContext,
    injectedData,
    bookedDemoCount: bookedDemoLeads.length,
    transcriptBackedExampleCount,
  };
}
