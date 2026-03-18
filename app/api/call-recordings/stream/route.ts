export const dynamic = "force-dynamic";

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { getRegion, requireAuthorizedCallAnalytics } from "../shared";
import { parseAmazonS3Uri } from "@/lib/contact-lens";

function toReadableStream(body: unknown): ReadableStream | null {
  if (!body) return null;
  if (typeof (body as { transformToWebStream?: () => ReadableStream }).transformToWebStream === "function") {
    return (body as { transformToWebStream: () => ReadableStream }).transformToWebStream();
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthorizedCallAnalytics(request);
    if ("error" in auth) return auth.error;

    const s3Object = parseAmazonS3Uri(auth.record.recording_s3_uri ?? null);
    const region = getRegion(auth.record);
    if (!s3Object || !region) {
      return NextResponse.json({ error: "Recording S3 location is unavailable." }, { status: 404 });
    }

    const range = request.headers.get("range") ?? undefined;
    const s3 = new S3Client({ region });
    const object = await s3.send(
      new GetObjectCommand({
        Bucket: s3Object.bucket,
        Key: s3Object.key,
        ...(range ? { Range: range } : {}),
      }),
    );

    const stream = toReadableStream(object.Body);
    if (!stream) {
      return NextResponse.json({ error: "Recording stream is unavailable." }, { status: 500 });
    }

    const headers = new Headers();
    headers.set("Content-Type", object.ContentType ?? "audio/wav");
    headers.set("Accept-Ranges", object.AcceptRanges ?? "bytes");
    if (object.ContentLength !== undefined) headers.set("Content-Length", String(object.ContentLength));
    if (object.ContentRange) headers.set("Content-Range", object.ContentRange);
    if (object.ETag) headers.set("ETag", object.ETag);
    headers.set("Cache-Control", "private, no-store");

    return new Response(stream, {
      status: object.ContentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to stream recording." },
      { status: 500 },
    );
  }
}
