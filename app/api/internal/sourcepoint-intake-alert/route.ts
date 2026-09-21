import { google } from "googleapis";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCEPOINT_CAPABILITY_URL = "https://www.sourcepointcap.com/api/intake-mail-capability";
const RECIPIENT = "mark@sourcepointcap.com";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function cleanHeader(value: unknown, max = 200) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { token?: string };
    const token = String(body.token || "").trim();
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return NextResponse.json({ error: "Invalid intake alert capability." }, { status: 400 });

    const capabilityResponse = await fetch(`${SOURCEPOINT_CAPABILITY_URL}?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const capability = await capabilityResponse.json().catch(() => ({})) as { recipient?: string; subject?: string; text?: string; reference?: string; error?: string };
    if (!capabilityResponse.ok) return NextResponse.json({ error: "SourcePoint capability was rejected." }, { status: 403 });

    const recipient = String(capability.recipient || "").trim().toLowerCase();
    const reference = cleanHeader(capability.reference, 40);
    const subject = cleanHeader(capability.subject, 180);
    const text = String(capability.text || "").replace(/\r\n/g, "\n").trim().slice(0, 30_000);
    if (recipient !== RECIPIENT || !/^SP-\d{5,}$/.test(reference) || !subject.startsWith("[SourcePoint]") || !text) {
      return NextResponse.json({ error: "Invalid SourcePoint alert payload." }, { status: 400 });
    }

    const oauth = new google.auth.OAuth2(required("GOOGLE_CLIENT_ID"), required("GOOGLE_CLIENT_SECRET"), required("GOOGLE_REDIRECT_URI"));
    oauth.setCredentials({ refresh_token: required("GOOGLE_REFRESH_TOKEN") });
    const raw = base64Url([
      `To: ${RECIPIENT}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      text,
    ].join("\r\n"));
    const response = await google.gmail({ version: "v1", auth: oauth }).users.messages.send({ userId: "me", requestBody: { raw } });
    return NextResponse.json({ ok: true, recipient: RECIPIENT, messageId: response.data.id ?? null, reference }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SourcePoint mail bridge failed.";
    console.error("SourcePoint intake mail bridge failed", { error: message.slice(0, 240) });
    return NextResponse.json({ error: "SourcePoint intake alert could not be delivered." }, { status: 500 });
  }
}
