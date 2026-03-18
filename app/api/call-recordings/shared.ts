import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCallAnalyticsByLeadAndContactId, upsertCallAnalytics } from "@/lib/call-analytics-store";
import { canUserViewAllLeads, getLeadById } from "@/lib/store";
import { isExpiredIsoTimestamp, parseAmazonS3Uri, validateAmazonS3PresignedUrl } from "@/lib/contact-lens";

export type CallAnalyticsLookup = {
  lead_id?: string | null;
  contact_id: string;
  recording_url?: string | null;
  recording_url_expires_at?: string | null;
  recording_s3_uri?: string | null;
};

export function getRegion(record: CallAnalyticsLookup) {
  const validation = validateAmazonS3PresignedUrl(record.recording_url ?? null);
  return validation.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? null;
}

export async function requireAuthorizedCallAnalytics(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) };
  }

  const url = new URL(request.url);
  const leadId = url.searchParams.get("leadId")?.trim() ?? "";
  const contactId = url.searchParams.get("contactId")?.trim() ?? "";

  if (!leadId || !contactId) {
    return { error: new Response(JSON.stringify({ error: "leadId and contactId are required." }), { status: 400 }) };
  }

  const includeAll = await canUserViewAllLeads(user.id, user.email);
  const lead = await getLeadById(leadId, user.id, { includeAll });
  if (!lead) {
    return { error: new Response(JSON.stringify({ error: "Lead not found." }), { status: 404 }) };
  }

  const record = await getCallAnalyticsByLeadAndContactId(leadId, contactId);
  if (!record) {
    return { error: new Response(JSON.stringify({ error: "Recording not found." }), { status: 404 }) };
  }

  return { leadId, contactId, record };
}

export async function getPlayableRecording(record: CallAnalyticsLookup) {
  const s3Object = parseAmazonS3Uri(record.recording_s3_uri ?? null);
  const region = getRegion(record);

  if (s3Object && region) {
    try {
      const s3 = new S3Client({ region });
      const expiresInSeconds = 60 * 60;
      const command = new GetObjectCommand({
        Bucket: s3Object.bucket,
        Key: s3Object.key,
      });
      await s3.send(command);

      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      const url = `/api/call-recordings/stream?leadId=${encodeURIComponent(record.lead_id ?? "")}&contactId=${encodeURIComponent(record.contact_id)}`;

      await upsertCallAnalytics({
        lead_id: record.lead_id ?? null,
        contact_id: record.contact_id,
        recording_url_expires_at: expiresAt,
        recording_s3_uri: record.recording_s3_uri ?? null,
      });

      return {
        url,
        expiresAt,
        source: "stream",
      } as const;
    } catch {
      // Fall back to stored URL below if direct S3 access is unavailable.
    }
  }

  const validation = validateAmazonS3PresignedUrl(record.recording_url ?? null);
  const storedUrlStillValid =
    validation.isValid &&
    !isExpiredIsoTimestamp(record.recording_url_expires_at ?? null) &&
    !isExpiredIsoTimestamp(validation.expiresAt);

  if (storedUrlStillValid && record.recording_url) {
    return {
      url: record.recording_url,
      expiresAt: validation.expiresAt ?? record.recording_url_expires_at ?? null,
      source: "stored",
    } as const;
  }

  if (record.recording_url) {
    return {
      url: record.recording_url,
      expiresAt: record.recording_url_expires_at ?? null,
      source: "fallback",
    } as const;
  }

  return null;
}
