import { GetTranscriptionJobCommand, StartTranscriptionJobCommand, TranscribeClient } from "@aws-sdk/client-transcribe";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseAmazonS3Uri, type ContactLensWebhookPayload } from "@/lib/contact-lens";

type TranscriptHydration = Partial<
  Pick<
    ContactLensWebhookPayload,
    | "durationSeconds"
    | "analysisS3Uri"
    | "transcriptText"
    | "transcriptJson"
    | "aiSummary"
    | "eventSource"
    | "sourceEventTime"
  >
>;

type TranscriptLine = {
  time: string | null;
  speaker: string;
  text: string;
  startSeconds: number | null;
  endSeconds: number | null;
};

type TranscribeTranscriptDocument = {
  results?: {
    transcripts?: Array<{ transcript?: string }>;
    items?: Array<{
      type?: string;
      start_time?: string;
      end_time?: string;
      speaker_label?: string;
      alternatives?: Array<{ content?: string }>;
    }>;
    speaker_labels?: {
      segments?: Array<{
        speaker_label?: string;
        items?: Array<{ start_time?: string; end_time?: string }>;
      }>;
    };
  };
};

const TRANSCRIBE_PENDING_SOURCE = "amazon-transcribe-pending";
const TRANSCRIBE_COMPLETE_SOURCE = "amazon-transcribe-fallback";
const TRANSCRIBE_FAILED_SOURCE = "amazon-transcribe-failed";
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"] as const;

function getAwsRegion() {
  return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-west-2";
}

const transcribe = new TranscribeClient({ region: getAwsRegion() });

function buildTranscriptionJobName(contactId: string) {
  const sanitized = contactId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `felixcrm-contact-${sanitized}`.slice(0, 180);
}

function getMediaFormatFromKey(key: string): "mp3" | "mp4" | "wav" | undefined {
  const extension = key.split(".").pop()?.trim().toLowerCase();
  if (extension === "mp3" || extension === "mp4" || extension === "wav") return extension;
  return undefined;
}

function parseNumericString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function secondsToClock(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeSpeakerLabel(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^spk_(\d+)$/);
  if (match) {
    return `SPEAKER_${Number(match[1]) + 1}`;
  }
  return normalized.toUpperCase();
}

function buildSpeakerMap(document: TranscribeTranscriptDocument) {
  const speakerMap = new Map<string, string>();
  for (const segment of document.results?.speaker_labels?.segments ?? []) {
    const speaker = normalizeSpeakerLabel(segment.speaker_label) ?? "SPEAKER";
    for (const item of segment.items ?? []) {
      if (typeof item.start_time === "string" && item.start_time.trim()) {
        speakerMap.set(item.start_time, speaker);
      }
    }
  }
  return speakerMap;
}

function buildTranscriptLines(document: TranscribeTranscriptDocument): TranscriptLine[] {
  const items = Array.isArray(document.results?.items) ? document.results?.items ?? [] : [];
  const speakerMap = buildSpeakerMap(document);
  const lines: TranscriptLine[] = [];
  let current: TranscriptLine | null = null;

  const flushCurrent = () => {
    if (!current) return;
    const text = current.text.trim();
    if (text) {
      lines.push({ ...current, text });
    }
    current = null;
  };

  for (const item of items) {
    const content = item.alternatives?.[0]?.content?.trim() ?? "";
    if (!content) continue;

    if (item.type === "punctuation") {
      if (current) current.text = `${current.text}${content}`;
      continue;
    }

    const startSeconds = parseNumericString(item.start_time);
    const endSeconds = parseNumericString(item.end_time);
    const speaker: string =
      speakerMap.get(item.start_time ?? "") ?? normalizeSpeakerLabel(item.speaker_label) ?? current?.speaker ?? "SPEAKER_1";
    const gapSeconds =
      current?.endSeconds !== null && current?.endSeconds !== undefined && startSeconds !== null
        ? startSeconds - current.endSeconds
        : 0;
    const shouldStartNewLine = !current || current.speaker !== speaker || gapSeconds > 1.5;

    if (shouldStartNewLine) {
      flushCurrent();
      current = {
        time: secondsToClock(startSeconds),
        speaker,
        text: content,
        startSeconds,
        endSeconds,
      };
      continue;
    }

    if (!current) continue;
    current.text = current.text ? `${current.text} ${content}` : content;
    current.endSeconds = endSeconds ?? current.endSeconds;
  }

  flushCurrent();
  return lines;
}

function buildFallbackSummary(lines: TranscriptLine[], transcriptText: string) {
  const speakerCounts = new Map<string, number>();
  for (const line of lines) {
    speakerCounts.set(line.speaker, (speakerCounts.get(line.speaker) ?? 0) + 1);
  }

  const topSpeakers = [...speakerCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([speaker, count]) => `${speaker} contributed ${count} turns`)
    .join(". ");

  const excerpt = lines
    .slice(0, 3)
    .map((line) => `${line.speaker}: ${line.text}`)
    .join(" ");

  const transcriptSentence = transcriptText.trim()
    ? `Transcript captured with ${lines.length || 1} conversation turns.`
    : "Transcript generation completed.";

  return [transcriptSentence, topSpeakers || null, excerpt || null].filter(Boolean).join(" ").trim() || null;
}

function parseConfiguredGeminiModels(rawModels: string | undefined): string[] {
  if (!rawModels) return [];

  const normalizedInput = rawModels.trim();
  if (!normalizedInput) return [];

  try {
    const parsed = JSON.parse(normalizedInput);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((model): model is string => typeof model === "string")
        .map((model) => model.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    }
  } catch {
    // Fall back to delimiter parsing.
  }

  return normalizedInput
    .split(/[\n,]+/)
    .map((model) => model.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

async function summarizeTranscriptWithGemini(transcriptText: string, lines: TranscriptLine[]) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !transcriptText.trim()) return buildFallbackSummary(lines, transcriptText);

  const prompt = [
    "You are summarizing a sales call transcript for a CRM.",
    "Write a concise 3-4 sentence summary with these priorities:",
    "1. State what the prospect wanted or asked about.",
    "2. State the main objections or concerns raised.",
    "3. State the next step or close status.",
    "Do not invent facts. If speaker labels are generic like SPEAKER_1 and SPEAKER_2, keep them generic.",
    "",
    "Transcript:",
    transcriptText.slice(0, 12000),
  ].join("\n");

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = Array.from(new Set([...(parseConfiguredGeminiModels(process.env.GEMINI_MODELS) || []), ...GEMINI_MODELS]));

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();
      if (text) return text;
    } catch {
      // Try the next model.
    }
  }

  return buildFallbackSummary(lines, transcriptText);
}

async function getTranscriptionJob(jobName: string) {
  try {
    const response = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }));
    return response.TranscriptionJob ?? null;
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String((error as { name?: string }).name ?? "") : "";
    if (name === "NotFoundException") return null;
    throw error;
  }
}

async function ensureTranscriptionJob(contactId: string, recordingS3Uri: string) {
  const recording = parseAmazonS3Uri(recordingS3Uri);
  if (!recording) return null;

  const jobName = buildTranscriptionJobName(contactId);
  const existing = await getTranscriptionJob(jobName);
  if (existing) return existing;

  await transcribe.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      LanguageCode: "en-US",
      MediaFormat: getMediaFormatFromKey(recording.key),
      Media: {
        MediaFileUri: `s3://${recording.bucket}/${recording.key}`,
      },
      Settings: {
        ShowSpeakerLabels: true,
        MaxSpeakerLabels: 2,
      },
    }),
  );

  return getTranscriptionJob(jobName);
}

async function loadTranscriptDocument(uri: string) {
  const response = await fetch(uri, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to download transcription output (${response.status}).`);
  }
  return (await response.json()) as TranscribeTranscriptDocument;
}

function buildTranscriptHydration(document: TranscribeTranscriptDocument): Omit<TranscriptHydration, "eventSource" | "sourceEventTime"> {
  const lines = buildTranscriptLines(document);
  const transcriptText =
    lines.length > 0
      ? lines.map((line) => `${line.speaker}: ${line.text}`).join("\n")
      : document.results?.transcripts?.[0]?.transcript?.trim() || null;
  const transcriptJson = lines.length
    ? lines.map((line) => ({
        time: line.time,
        speaker: line.speaker,
        text: line.text,
      }))
    : null;
  const durationSeconds = lines.reduce((max, line) => {
    if (line.endSeconds === null || line.endSeconds === undefined) return max;
    return Math.max(max, Math.round(line.endSeconds));
  }, 0);

  return {
    analysisS3Uri: null,
    transcriptText,
    transcriptJson,
    durationSeconds: durationSeconds || null,
  };
}

export async function hydrateContactLensPayloadFromTranscribe(payload: ContactLensWebhookPayload): Promise<TranscriptHydration> {
  const recordingS3Uri = payload.recordingS3Uri?.trim();
  const contactId = payload.contactId?.trim();
  if (!recordingS3Uri || !contactId) return {};

  const job = await ensureTranscriptionJob(contactId, recordingS3Uri);
  if (!job) return {};

  const now = new Date().toISOString();
  const status = job.TranscriptionJobStatus ?? "QUEUED";
  if (status === "FAILED") {
    return {
      aiSummary: job.FailureReason ? `Automatic transcription failed: ${job.FailureReason}` : "Automatic transcription failed.",
      eventSource: TRANSCRIBE_FAILED_SOURCE,
      sourceEventTime: now,
    };
  }

  if (status !== "COMPLETED" || !job.Transcript?.TranscriptFileUri) {
    return {
      eventSource: TRANSCRIBE_PENDING_SOURCE,
      sourceEventTime: now,
    };
  }

  const document = await loadTranscriptDocument(job.Transcript.TranscriptFileUri);
  const hydrated = buildTranscriptHydration(document);
  const transcriptLines = buildTranscriptLines(document);
  const aiSummary = hydrated.transcriptText ? await summarizeTranscriptWithGemini(hydrated.transcriptText, transcriptLines) : null;

  return {
    ...hydrated,
    aiSummary,
    eventSource: TRANSCRIBE_COMPLETE_SOURCE,
    sourceEventTime: now,
  };
}
