import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { normalizeContactLensPayload, parseAmazonS3Uri, type ContactLensWebhookPayload } from "@/lib/contact-lens";

type TranscriptHydration = Partial<
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

type RecordingHydration = Pick<ContactLensWebhookPayload, "recordingS3Uri" | "eventSource" | "sourceEventTime">;

function getAwsRegion() {
  return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
}

function resolveBucketRegion(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    BucketRegion?: unknown;
    Endpoint?: unknown;
    $response?: { headers?: Record<string, string | undefined> };
    $metadata?: { httpHeaders?: Record<string, string | undefined> };
  };
  if (typeof candidate.BucketRegion === "string" && candidate.BucketRegion.trim()) {
    return candidate.BucketRegion.trim();
  }
  const endpoint =
    typeof candidate.Endpoint === "string"
      ? candidate.Endpoint
      : candidate.$metadata?.httpHeaders?.["x-amz-bucket-region"] ??
        candidate.$response?.headers?.["x-amz-bucket-region"] ??
        null;
  if (typeof endpoint !== "string" || !endpoint.trim()) return null;
  const fromHeader = endpoint.trim();
  if (!fromHeader.includes(".")) return fromHeader;
  const match = fromHeader.match(/s3[.-]([a-z0-9-]+)\.amazonaws\.com/i);
  return match?.[1] ?? null;
}

async function sendWithBucketRegionRetry<T>(
  operation: (client: S3Client) => Promise<T>,
  initialRegion = getAwsRegion(),
): Promise<T> {
  let region = initialRegion;
  let client = new S3Client({ region });
  try {
    return await operation(client);
  } catch (error) {
    const redirectedRegion = resolveBucketRegion(error);
    if (!redirectedRegion || redirectedRegion === region) throw error;
    client = new S3Client({ region: redirectedRegion });
    return operation(client);
  }
}

function buildAnalysisPrefixes(recordingKey: string): string[] {
  const normalizedKey = recordingKey.replace(/^\/+/, "");
  const dateMatch = normalizedKey.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  const year = dateMatch?.[1];
  const month = dateMatch?.[2];
  const day = dateMatch?.[3];
  if (!year || !month || !day) return [];

  const rootPrefix = normalizedKey.includes("CallRecordings/")
    ? normalizedKey.slice(0, normalizedKey.indexOf("CallRecordings/"))
    : "";

  return Array.from(
    new Set([
      `${rootPrefix}Analysis/Voice/${year}/${month}/${day}/`,
      `Analysis/Voice/${year}/${month}/${day}/`,
      `${rootPrefix}Analysis/Voice/Redacted/${year}/${month}/${day}/`,
      `Analysis/Voice/Redacted/${year}/${month}/${day}/`,
    ]),
  );
}

function buildRecentDatePrefixes(root: string, daysBack: number): string[] {
  const prefixes: string[] = [];
  const now = new Date();
  for (let offset = 0; offset <= daysBack; offset += 1) {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - offset);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    prefixes.push(`${root}${year}/${month}/${day}/`);
  }
  return prefixes;
}

async function bodyToString(body: unknown): Promise<string> {
  if (!body) return "";
  if (typeof (body as { transformToString?: () => Promise<string> }).transformToString === "function") {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return new TextDecoder().decode(bytes);
  }
  return "";
}

async function findAnalysisArtifactKey(bucket: string, recordingKey: string, contactId: string): Promise<string | null> {
  const prefixes = buildAnalysisPrefixes(recordingKey);
  if (!prefixes.length) return null;
  const candidates: Array<{ key: string; lastModified: number }> = [];

  for (const prefix of prefixes) {
    const response = await sendWithBucketRegionRetry((s3) =>
      s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          MaxKeys: 200,
        }),
      ),
    );

    for (const item of response.Contents ?? []) {
      const key = item.Key ?? "";
      if (!key || !key.endsWith(".json")) continue;
      if (!key.includes(contactId)) continue;
      if (!/_analysis/i.test(key)) continue;
      if (/redacted/i.test(key)) continue;
      candidates.push({
        key,
        lastModified: item.LastModified ? item.LastModified.getTime() : 0,
      });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.lastModified - a.lastModified);
  return candidates[0]?.key ?? null;
}

export async function hydrateContactLensPayloadFromS3(payload: ContactLensWebhookPayload): Promise<TranscriptHydration> {
  const recordingS3 = parseAmazonS3Uri(payload.recordingS3Uri ?? null);
  if (!recordingS3 || !payload.contactId) return {};

  const artifactKey = await findAnalysisArtifactKey(recordingS3.bucket, recordingS3.key, payload.contactId);
  if (!artifactKey) return {};
  const object = await sendWithBucketRegionRetry((s3) =>
    s3.send(
      new GetObjectCommand({
        Bucket: recordingS3.bucket,
        Key: artifactKey,
      }),
    ),
  );

  const content = await bodyToString(object.Body);
  if (!content.trim()) return {};

  const parsed = JSON.parse(content) as unknown;
  const normalized = normalizeContactLensPayload(parsed);

  return {
    overallSentiment: normalized.overallSentiment ?? null,
    analysisS3Uri: `s3://${recordingS3.bucket}/${artifactKey}`,
    transcriptText: normalized.transcriptText ?? null,
    transcriptJson: normalized.transcriptJson ?? null,
    aiSummary: normalized.aiSummary ?? null,
    agentTalkTimePct: normalized.agentTalkTimePct ?? null,
    customerTalkTimePct: normalized.customerTalkTimePct ?? null,
    interruptions: normalized.interruptions ?? null,
    eventSource: normalized.eventSource ?? "contact-lens-analysis-artifact",
    sourceEventTime: normalized.sourceEventTime ?? null,
  };
}

export async function hydrateRecordingPayloadFromS3(contactId: string, daysBack = 7): Promise<RecordingHydration> {
  const cleanContactId = contactId.trim();
  if (!cleanContactId) return {};

  const prefixes = Array.from(
    new Set([
      ...buildRecentDatePrefixes("connect/felix-outbound/CallRecordings/", daysBack),
      ...buildRecentDatePrefixes("CallRecordings/", daysBack),
    ]),
  );

  const bucket = process.env.AMAZON_CONNECT_RECORDINGS_BUCKET?.trim() || "amazon-connect-f93893c0453d";
  const candidates: Array<{ key: string; lastModified: number }> = [];

  for (const prefix of prefixes) {
    const response = await sendWithBucketRegionRetry((s3) =>
      s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          MaxKeys: 200,
        }),
      ),
    ).catch(() => null);
    if (!response) continue;

    for (const item of response.Contents ?? []) {
      const key = item.Key ?? "";
      if (!key || !/\.(wav|mp3)$/i.test(key)) continue;
      if (!key.includes(cleanContactId)) continue;
      candidates.push({
        key,
        lastModified: item.LastModified ? item.LastModified.getTime() : 0,
      });
    }
  }

  if (!candidates.length) return {};
  candidates.sort((a, b) => b.lastModified - a.lastModified);
  const match = candidates[0];
  if (!match) return {};

  return {
    recordingS3Uri: `s3://${bucket}/${match.key}`,
    eventSource: "s3-call-recording-recovered",
    sourceEventTime: match.lastModified ? new Date(match.lastModified).toISOString() : null,
  };
}
