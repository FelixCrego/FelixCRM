export type ContactLensWebhookPayload = {
  leadId?: string | null;
  contactId: string;
  customerPhone?: string | null;
  durationSeconds?: number | null;
  overallSentiment?: string | null;
  recordingUrl?: string | null;
  recordingUrlExpiresAt?: string | null;
  recordingS3Uri?: string | null;
  analysisS3Uri?: string | null;
  transcriptText?: string | null;
  transcriptJson?: unknown;
  aiSummary?: string | null;
  agentTalkTimePct?: number | null;
  customerTalkTimePct?: number | null;
  interruptions?: number | null;
  eventSource?: string | null;
  sourceEventTime?: string | null;
  rawPayload?: unknown;
};

export type ContactLensCrmRecord = {
  lead_id: string;
  contact_id: string;
  customer_phone?: string | null;
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
  source_event_time?: string | null;
  raw_payload?: unknown;
};

export type AmazonS3UrlValidation = {
  isValid: boolean;
  bucket: string | null;
  key: string | null;
  region: string | null;
  expiresAt: string | null;
  errors: string[];
};

export type AmazonS3ObjectReference = {
  bucket: string;
  key: string;
  region: string | null;
};

type RawPayload = Record<string, unknown>;

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getNestedRecord(value: unknown): RawPayload | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawPayload) : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function findFirstString(payload: RawPayload, paths: string[][]): string | null {
  for (const path of paths) {
    let current: unknown = payload;
    for (const key of path) {
      const record = getNestedRecord(current);
      if (!record) {
        current = null;
        break;
      }
      current = record[key];
    }
    const resolved = getString(current);
    if (resolved) return resolved;
  }
  return null;
}

function findFirstNumber(payload: RawPayload, paths: string[][]): number | null {
  for (const path of paths) {
    let current: unknown = payload;
    for (const key of path) {
      const record = getNestedRecord(current);
      if (!record) {
        current = null;
        break;
      }
      current = record[key];
    }
    const resolved = getNumber(current);
    if (resolved !== null) return resolved;
  }
  return null;
}

function normalizePhone(value: unknown): string | null {
  const digits = getString(value)?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function parseIsoDate(value: unknown): string | null {
  const text = getString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractContactIdFromArn(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("arn:")) return value;
  const candidate = value.split("/").pop()?.trim() ?? "";
  return candidate || null;
}

function buildS3Uri(bucket: string | null, key: string | null) {
  return bucket && key ? `s3://${bucket}/${key}` : null;
}

function parseAmazonS3Url(value: string | null): (AmazonS3ObjectReference & { url: URL }) | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;

    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.replace(/^\/+/, "");
    const virtualHostedMatch = host.match(/^(.+)\.s3[.-]([a-z0-9-]+)\.amazonaws\.com$/);
    if (virtualHostedMatch && pathname) {
      return {
        bucket: decodeURIComponent(virtualHostedMatch[1]),
        key: decodeURIComponent(pathname),
        region: virtualHostedMatch[2],
        url,
      };
    }

    const pathStyleMatch = host.match(/^s3[.-]([a-z0-9-]+)\.amazonaws\.com$/);
    if (pathStyleMatch) {
      const [bucket, ...keyParts] = pathname.split("/");
      if (bucket && keyParts.length) {
        return {
          bucket: decodeURIComponent(bucket),
          key: decodeURIComponent(keyParts.join("/")),
          region: pathStyleMatch[1],
          url,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function parseAmazonS3Uri(value: string | null): AmazonS3ObjectReference | null {
  if (!value) return null;
  const match = value.trim().match(/^s3:\/\/([^/]+)\/(.+)$/i);
  if (!match) return null;

  return {
    bucket: decodeURIComponent(match[1]),
    key: decodeURIComponent(match[2]),
    region: null,
  };
}

export function isExpiredIsoTimestamp(value: string | null | undefined): boolean {
  if (!value) return false;
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() <= Date.now();
}

export function validateAmazonS3PresignedUrl(value: string | null): AmazonS3UrlValidation {
  const parsed = parseAmazonS3Url(value);
  const errors: string[] = [];

  if (!parsed) {
    return {
      isValid: false,
      bucket: null,
      key: null,
      region: null,
      expiresAt: null,
      errors: ["URL is not a valid HTTPS Amazon S3 object URL."],
    };
  }

  const algorithm = parsed.url.searchParams.get("X-Amz-Algorithm");
  if (algorithm !== "AWS4-HMAC-SHA256") {
    errors.push("Missing or invalid X-Amz-Algorithm for SigV4.");
  }

  const signedAt = parsed.url.searchParams.get("X-Amz-Date");
  const expiresIn = parsed.url.searchParams.get("X-Amz-Expires");
  const credential = parsed.url.searchParams.get("X-Amz-Credential");
  const signature = parsed.url.searchParams.get("X-Amz-Signature");
  const signedHeaders = parsed.url.searchParams.get("X-Amz-SignedHeaders");

  if (!signedAt || !/^\d{8}T\d{6}Z$/.test(signedAt)) {
    errors.push("Missing or invalid X-Amz-Date.");
  }

  const expiresSeconds = expiresIn ? Number(expiresIn) : NaN;
  if (!Number.isFinite(expiresSeconds) || expiresSeconds <= 0) {
    errors.push("Missing or invalid X-Amz-Expires.");
  }

  if (!credential) errors.push("Missing X-Amz-Credential.");
  if (!signature) errors.push("Missing X-Amz-Signature.");
  if (!signedHeaders) errors.push("Missing X-Amz-SignedHeaders.");

  let expiresAt: string | null = null;
  if (signedAt && /^\d{8}T\d{6}Z$/.test(signedAt) && Number.isFinite(expiresSeconds) && expiresSeconds > 0) {
    const iso = `${signedAt.slice(0, 4)}-${signedAt.slice(4, 6)}-${signedAt.slice(6, 8)}T${signedAt.slice(9, 11)}:${signedAt.slice(11, 13)}:${signedAt.slice(13, 15)}Z`;
    const signedDate = new Date(iso);
    if (!Number.isNaN(signedDate.getTime())) {
      expiresAt = new Date(signedDate.getTime() + expiresSeconds * 1000).toISOString();
    }
  }

  return {
    isValid: errors.length === 0,
    bucket: parsed.bucket,
    key: parsed.key,
    region: parsed.region,
    expiresAt,
    errors,
  };
}

export function sanitizeSensitiveUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

export function sanitizeContactLensNoteContent(content: string): string {
  const sanitized = content.replace(/https:\/\/[^\s]*\.s3[.-][^\s]*\.amazonaws\.com\/[^\s)]+/gi, (match) => {
    return sanitizeSensitiveUrl(match) ?? match;
  });

  const lines = sanitized
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, allLines) => {
      if (/^Recording URL:/i.test(line)) return false;
      if (/^Recording URL expires:/i.test(line)) return false;
      if (/^Recording S3:/i.test(line)) return false;
      if (/^Analysis S3:/i.test(line)) return false;
      if (!line && (!allLines[index - 1] || !allLines[index + 1])) return false;
      return true;
    });

  return lines.join("\n").trim();
}

export function isContactLensWebhookAuthorized(request: Request): boolean {
  const secret = process.env.CONTACT_LENS_WEBHOOK_SECRET?.trim();
  if (!secret) return true;

  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;

  const headerSecret = request.headers.get("x-felix-webhook-secret");
  return headerSecret === secret;
}

export function normalizeContactLensPayload(payload: unknown): ContactLensWebhookPayload {
  const record = getNestedRecord(payload);
  if (!record) {
    throw new Error("Webhook payload must be a JSON object.");
  }

  const detail = getNestedRecord(record.detail) ?? {};
  const contactDetail = getNestedRecord(detail.contact) ?? getNestedRecord(detail.ContactData) ?? {};
  const attributes =
    getNestedRecord(contactDetail.Attributes) ??
    getNestedRecord(contactDetail.attributes) ??
    getNestedRecord(detail.parameters) ??
    {};

  const s3Record = getNestedRecord(getArray(record.Records)[0]);
  const s3Payload = getNestedRecord(s3Record?.s3);
  const s3Bucket = getString(getNestedRecord(s3Payload?.bucket)?.name);
  const s3ObjectKey = getString(getNestedRecord(s3Payload?.object)?.key);

  const leadId = findFirstString(record, [
    ["lead_id"],
    ["leadId"],
    ["detail", "lead_id"],
    ["detail", "leadId"],
    ["detail", "contact", "Attributes", "lead_id"],
    ["detail", "contact", "Attributes", "leadId"],
    ["detail", "contact", "attributes", "lead_id"],
    ["detail", "contact", "attributes", "leadId"],
    ["detail", "ContactData", "Attributes", "lead_id"],
    ["detail", "ContactData", "Attributes", "leadId"],
    ["detail", "parameters", "lead_id"],
    ["detail", "parameters", "leadId"],
  ]);

  const contactId = extractContactIdFromArn(findFirstString(record, [
    ["contact_id"],
    ["contactId"],
    ["detail", "contact_id"],
    ["detail", "contactId"],
    ["detail", "contactArn"],
    ["detail", "contact", "contactId"],
    ["detail", "contact", "id"],
    ["detail", "ContactData", "ContactId"],
    ["detail", "ContactData", "InitialContactId"],
    ["detail", "contact", "initialContactId"],
  ]));

  if (!contactId) {
    throw new Error("Missing required routing field: contact_id.");
  }

  const recordingUrl = findFirstString(record, [["recording_url"], ["recordingUrl"]]);
  const recordingUrlValidation = validateAmazonS3PresignedUrl(recordingUrl);
  const s3UriFromUrl = buildS3Uri(recordingUrlValidation.bucket, recordingUrlValidation.key);
  const recordingS3Uri =
    findFirstString(record, [["recording_s3_uri"], ["recordingS3Uri"]]) ??
    s3UriFromUrl ??
    buildS3Uri(s3Bucket, s3ObjectKey ? decodeURIComponent(s3ObjectKey.replace(/\+/g, " ")) : null);

  return {
    leadId,
    contactId,
    customerPhone:
      normalizePhone(findFirstString(record, [
        ["customer_phone"],
        ["customerPhone"],
        ["detail", "customer_phone"],
        ["detail", "customerPhone"],
        ["detail", "contact", "customerEndpoint", "address"],
        ["detail", "ContactData", "CustomerEndpoint", "Address"],
      ])) ??
      normalizePhone(attributes.customer_phone ?? attributes.customerPhone),
    durationSeconds: findFirstNumber(record, [["duration_seconds"], ["durationSeconds"], ["detail", "duration_seconds"], ["detail", "durationSeconds"]]),
    overallSentiment: findFirstString(record, [["overall_sentiment"], ["overallSentiment"], ["sentiment"], ["detail", "sentiment"]]),
    recordingUrl: recordingUrl,
    recordingUrlExpiresAt: recordingUrlValidation.expiresAt,
    recordingS3Uri,
    analysisS3Uri: findFirstString(record, [["analysis_s3_uri"], ["analysisS3Uri"], ["detail", "analysis_s3_uri"], ["detail", "analysisS3Uri"]]),
    transcriptText: findFirstString(record, [["transcript_text"], ["transcriptText"], ["detail", "transcript_text"], ["detail", "transcriptText"]]),
    transcriptJson: record.transcript_json ?? record.transcriptJson ?? detail.transcript_json ?? detail.transcriptJson ?? null,
    aiSummary: findFirstString(record, [["ai_summary"], ["aiSummary"], ["summary"], ["detail", "summary"]]),
    agentTalkTimePct: findFirstNumber(record, [["agent_talk_time_pct"], ["agentTalkTimePct"]]),
    customerTalkTimePct: findFirstNumber(record, [["customer_talk_time_pct"], ["customerTalkTimePct"]]),
    interruptions: findFirstNumber(record, [["interruptions"]]),
    eventSource: findFirstString(record, [["event_source"], ["eventSource"], ["detail-type"]]),
    sourceEventTime: parseIsoDate(findFirstString(record, [["source_event_time"], ["sourceEventTime"], ["time"], ["detail", "time"]])),
    rawPayload: payload,
  };
}

export function toContactLensCrmRecord(payload: ContactLensWebhookPayload, leadId: string): ContactLensCrmRecord {
  return {
    lead_id: leadId,
    contact_id: payload.contactId,
    customer_phone: payload.customerPhone ?? null,
    duration_seconds: payload.durationSeconds ?? null,
    overall_sentiment: payload.overallSentiment ?? null,
    recording_url: payload.recordingUrl ?? null,
    recording_url_expires_at: payload.recordingUrlExpiresAt ?? null,
    recording_s3_uri: payload.recordingS3Uri ?? null,
    analysis_s3_uri: payload.analysisS3Uri ?? null,
    transcript_text: payload.transcriptText ?? null,
    transcript_json: payload.transcriptJson ?? null,
    ai_summary: payload.aiSummary ?? null,
    agent_talk_time_pct: payload.agentTalkTimePct ?? null,
    customer_talk_time_pct: payload.customerTalkTimePct ?? null,
    interruptions: payload.interruptions ?? null,
    event_source: payload.eventSource ?? null,
    source_event_time: payload.sourceEventTime ?? null,
    raw_payload: payload.rawPayload,
  };
}

function formatPercent(value?: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${Math.round(value)}%`;
}

export function buildContactLensLeadNote(payload: ContactLensWebhookPayload): string {
  const lines = [
    "Amazon Connect Contact Lens call synced.",
    `Contact ID: ${payload.contactId}`,
  ];

  if (payload.overallSentiment) lines.push(`Overall sentiment: ${payload.overallSentiment}`);
  if (typeof payload.durationSeconds === "number") lines.push(`Duration: ${payload.durationSeconds}s`);
  if (payload.customerPhone) lines.push(`Customer phone: ${payload.customerPhone}`);

  const agentTalkTime = formatPercent(payload.agentTalkTimePct);
  const customerTalkTime = formatPercent(payload.customerTalkTimePct);
  if (agentTalkTime || customerTalkTime) {
    lines.push(`Talk ratio: agent ${agentTalkTime ?? "n/a"} / customer ${customerTalkTime ?? "n/a"}`);
  }

  if (typeof payload.interruptions === "number") lines.push(`Interruptions: ${payload.interruptions}`);
  if (payload.aiSummary) lines.push(`AI summary: ${payload.aiSummary}`);
  if (payload.recordingUrl || payload.recordingS3Uri) lines.push("Recording available in Call Audio & AI.");
  if (payload.analysisS3Uri) lines.push("Analysis artifact synced.");
  if (payload.sourceEventTime) lines.push(`Source event time: ${payload.sourceEventTime}`);

  const transcriptSnippet = payload.transcriptText?.trim().slice(0, 400);
  if (transcriptSnippet) lines.push(`Transcript excerpt: ${transcriptSnippet}`);

  return sanitizeContactLensNoteContent(lines.join("\n"));
}
