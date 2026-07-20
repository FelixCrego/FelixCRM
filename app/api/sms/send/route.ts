import { PinpointSMSVoiceV2Client, SendTextMessageCommand } from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, createLeadNote, getLeadById } from "@/lib/store";

export const runtime = "nodejs";
const DEFAULT_AWS_REGION = "us-west-2";

function normalizePhoneToE164(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return value.startsWith("+") ? value : `+${digits}`;
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getSmsErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Unable to send SMS.";
  const message = error.message || "Unable to send SMS.";
  if (message.includes("AccessDenied")) return "AWS rejected the SMS request. Verify the configured messaging permission.";
  if (message.includes("Conflict") || message.includes("PENDING")) return "The FelixCRM SMS number is not active yet. Carrier approval is still pending.";
  return message;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { leadId?: string; message?: string; phone?: string };
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!leadId || !message) return NextResponse.json({ error: "leadId and message are required." }, { status: 400 });

    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const lead = await getLeadById(leadId, user.id, { includeAll });
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const destinationPhone = normalizePhoneToE164(phone || lead.phone || "");
    if (!destinationPhone) return NextResponse.json({ error: "Lead phone number is required to send SMS." }, { status: 400 });

    const client = new PinpointSMSVoiceV2Client({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? DEFAULT_AWS_REGION });
    const response = await client.send(new SendTextMessageCommand({
      DestinationPhoneNumber: destinationPhone,
      OriginationIdentity: requireEnv("AWS_SMS_ORIGINATION_IDENTITY"),
      MessageBody: message,
      MessageType: "TRANSACTIONAL",
      Context: { lead_id: leadId, crm_user_id: user.id, crm_channel: "sms" },
    }));

    const note = await createLeadNote(leadId, message, "sms", response.MessageId ?? null);
    return NextResponse.json({ success: true, note, messageId: response.MessageId ?? null });
  } catch (error) {
    return NextResponse.json({ error: getSmsErrorMessage(error) }, { status: 500 });
  }
}
