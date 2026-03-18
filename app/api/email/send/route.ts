import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, createLeadNote, getLeadById } from "@/lib/store";

const DEFAULT_AWS_REGION = "us-east-1";
const DEFAULT_FROM_EMAIL = "hello@crm.felixcrego.com";
const DEFAULT_REPLY_TO_EMAIL = "felix@felixcrego.com";

function getAwsRegion() {
  return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? DEFAULT_AWS_REGION;
}

function getConfigValue(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function buildEmailActivityNote(message: string, destinationEmail: string, senderEmail: string) {
  return [`To: ${destinationEmail}`, `From: ${senderEmail}`, "", message].join("\n");
}

function getEmailErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Unable to send email.";
  const message = error.message || "Unable to send email.";
  if (message.includes("MessageRejected")) {
    return "Amazon SES rejected the email. This usually means the recipient is not verified while SES is still in sandbox.";
  }
  if (message.includes("AccessDenied")) {
    return "Amazon SES rejected the send request. Check the AWS sender permissions for SES.";
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
    const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim() : "Follow-up from Felix CRM";

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

    const fromEmail = getConfigValue("CRM_FROM_EMAIL", DEFAULT_FROM_EMAIL);
    const replyToEmail = getConfigValue("CRM_REPLY_TO_EMAIL", DEFAULT_REPLY_TO_EMAIL);

    const client = new SESv2Client({ region: getAwsRegion() });
    const response = await client.send(
      new SendEmailCommand({
        FromEmailAddress: fromEmail,
        Destination: {
          ToAddresses: [destinationEmail],
        },
        ReplyToAddresses: [replyToEmail],
        Content: {
          Simple: {
            Subject: {
              Data: subject,
              Charset: "UTF-8",
            },
            Body: {
              Text: {
                Data: message,
                Charset: "UTF-8",
              },
            },
          },
        },
      }),
    );

    const note = await createLeadNote(
      leadId,
      buildEmailActivityNote(message, destinationEmail, fromEmail),
      "email",
      response.MessageId ?? null,
    );

    return NextResponse.json({
      success: true,
      note,
      messageId: response.MessageId ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: getEmailErrorMessage(error) }, { status: 500 });
  }
}
