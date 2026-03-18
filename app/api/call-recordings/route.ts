export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCallAnalyticsByLeadAndContactId, upsertCallAnalytics } from "@/lib/call-analytics-store";
import { canUserViewAllLeads, getLeadById } from "@/lib/store";
import { isExpiredIsoTimestamp, parseAmazonS3Uri, validateAmazonS3PresignedUrl } from "@/lib/contact-lens";

type CallAnalyticsLookup = {
  lead_id?: string | null;
  contact_id: string;
  recording_url?: string | null;
  recording_url_expires_at?: string | null;
  recording_s3_uri?: string | null;
};

function getRegion(record: CallAnalyticsLookup) {
  const validation = validateAmazonS3PresignedUrl(record.recording_url ?? null);
  return validation.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? null;
}

async function getPlayableRecording(record: CallAnalyticsLookup) {
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

  const s3Object = parseAmazonS3Uri(record.recording_s3_uri ?? null);
  const region = getRegion(record);

  if (s3Object && region) {
    try {
      const s3 = new S3Client({ region });
      const expiresInSeconds = 60 * 60;
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: s3Object.bucket,
          Key: s3Object.key,
        }),
        { expiresIn: expiresInSeconds },
      );
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

      await upsertCallAnalytics({
        lead_id: record.lead_id ?? null,
        contact_id: record.contact_id,
        recording_url: url,
        recording_url_expires_at: expiresAt,
        recording_s3_uri: record.recording_s3_uri ?? null,
      });

      return {
        url,
        expiresAt,
        source: "signed",
      } as const;
    } catch {
      // Fall back to the stored URL below when AWS signing is unavailable.
    }
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

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const leadId = url.searchParams.get("leadId")?.trim() ?? "";
    const contactId = url.searchParams.get("contactId")?.trim() ?? "";

    if (!leadId || !contactId) {
      return NextResponse.json({ error: "leadId and contactId are required." }, { status: 400 });
    }

    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const lead = await getLeadById(leadId, user.id, { includeAll });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    const record = await getCallAnalyticsByLeadAndContactId(leadId, contactId);
    if (!record) {
      return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    }

    const playable = await getPlayableRecording(record);
    if (!playable?.url) {
      return NextResponse.json(
        { error: "No playable recording URL is available for this call." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      url: playable.url,
      expiresAt: playable.expiresAt,
      source: playable.source,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load recording." },
      { status: 500 },
    );
  }
}
