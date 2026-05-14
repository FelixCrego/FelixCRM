import { google } from "googleapis";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, createLeadNote, getLeadById } from "@/lib/store";

export const runtime = "nodejs";

const DEFAULT_EMAIL_SUBJECT = "Follow-up from Felix CRM";
const DEFAULT_CONNECTED_MAILBOX_LABEL = "Google Workspace connected mailbox";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeaderValue(value: string) {
  const sanitizedValue = sanitizeHeaderValue(value);
  if (!/[^\x20-\x7E]/.test(sanitizedValue)) {
    return sanitizedValue;
  }

  return `=?UTF-8?B?${Buffer.from(sanitizedValue, "utf8").toString("base64")}?=`;
}

function encodeBodyAsBase64Lines(value: string) {
  const base64Body = Buffer.from(value, "utf8").toString("base64");
  return base64Body.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildRawMimeEmail(input: {
  toEmail: string;
  fromEmail?: string | null;
  replyToEmail?: string | null;
  subject: string;
  message: string;
}) {
  const headers = [`To: ${sanitizeHeaderValue(input.toEmail)}`];

  if (input.fromEmail) {
    headers.push(`From: ${sanitizeHeaderValue(input.fromEmail)}`);
  }

  if (input.replyToEmail) {
    headers.push(`Reply-To: ${sanitizeHeaderValue(input.replyToEmail)}`);
  }

  headers.push(`Subject: ${encodeHeaderValue(input.subject)}`);
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push("Content-Transfer-Encoding: base64");

  return toBase64Url([...headers, "", encodeBodyAsBase64Lines(input.message)].join("\r\n"));
}

function buildEmailActivityNote(input: {
  message: string;
  subject: string;
  destinationEmail: string;
  senderLabel: string;
  replyToEmail?: string | null;
}) {
  return [
    `Subject: ${input.subject}`,
    `To: ${input.destinationEmail}`,
    `From: ${input.senderLabel}`,
    input.replyToEmail ? `Reply-To: ${input.replyToEmail}` : null,
    "",
    input.message,
  ]
    .filter(Boolean)
    .join("\n");
}

function getEmailErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Unable to send email through Google Workspace.";

  const message = error.message || "Unable to send email through Google Workspace.";
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invalid_grant")) {
    return "Google Workspace rejected the refresh token. Reconnect the shared Gmail mailbox in the CRM environment settings.";
  }

  if (normalizedMessage.includes("insufficient authentication scopes")) {
    return "The Google Workspace token is missing Gmail send permission. Reconnect it with Gmail send scope enabled.";
  }

  if (normalizedMessage.includes("gmail api has not been used") || normalizedMessage.includes("access not configured")) {
    return "Gmail API is not enabled for this Google Cloud project yet.";
  }

  if (
    normalizedMessage.includes("from header") ||
    normalizedMessage.includes("sender header") ||
    normalizedMessage.includes("invalid from") ||
    normalizedMessage.includes("unauthorized sender")
  ) {
    return "The configured From address is not allowed for the connected Gmail mailbox. Remove CRM_FROM_EMAIL or add it as a send-as alias in Google Workspace.";
  }

  return message;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      leadId?: string;
      message?: string;
      email?: string;
      subject?: string;
    };

    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim() : DEFAULT_EMAIL_SUBJECT;

    if (!leadId || !message) {
      return NextResponse.json({ error: "leadId and message are required." }, { status: 400 });
    }

    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const lead = await getLeadById(leadId, user.id, { includeAll });
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const destinationEmail = normalizeEmail(email || lead.email || "");
    if (!destinationEmail) {
      return NextResponse.json({ error: "Lead email is required to send email." }, { status: 400 });
    }

    const clientId = requiredEnv("GOOGLE_CLIENT_ID");
    const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
    const redirectUri = requiredEnv("GOOGLE_REDIRECT_URI");
    const refreshToken = requiredEnv("GOOGLE_REFRESH_TOKEN");
    const fromEmail = optionalEnv("CRM_FROM_EMAIL");
    const replyToEmail = optionalEnv("CRM_REPLY_TO_EMAIL");

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: buildRawMimeEmail({
          toEmail: destinationEmail,
          fromEmail,
          replyToEmail,
          subject,
          message,
        }),
      },
    });

    const note = await createLeadNote(
      leadId,
      buildEmailActivityNote({
        message,
        subject,
        destinationEmail,
        senderLabel: fromEmail ?? DEFAULT_CONNECTED_MAILBOX_LABEL,
        replyToEmail,
      }),
      "email",
      response.data.id ?? response.data.threadId ?? null,
    );

    return NextResponse.json({
      success: true,
      note,
      messageId: response.data.id ?? null,
      threadId: response.data.threadId ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: getEmailErrorMessage(error) }, { status: 500 });
  }
}
