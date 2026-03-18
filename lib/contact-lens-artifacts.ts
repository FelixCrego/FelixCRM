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

function getAwsRegion() {
  return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
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

  const s3 = new S3Client({ region: getAwsRegion() });
  const candidates: Array<{ key: string; lastModified: number }> = [];

  for (const prefix of prefixes) {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 200,
      }),
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

  const s3 = new S3Client({ region: getAwsRegion() });
  const object = await s3.send(
    new GetObjectCommand({
      Bucket: recordingS3.bucket,
      Key: artifactKey,
    }),
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
