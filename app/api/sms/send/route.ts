import { StartOutboundChatContactCommand, ConnectClient } from "@aws-sdk/client-connect";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, createLeadNote, getLeadById } from "@/lib/store";

export const runtime = "nodejs";

const DEFAULT_AWS_REGION = "us-west-2";
const DEFAULT_CONNECT_INSTANCE_ID = "e1d99aec-1a08-4575-b366-03da90f659ad";
const DEFAULT_CONNECT_SMS_SOURCE_ARN = "arn:aws:connect:us-west-2:474550261413:phone-number/2b527f94-c3d1-4fd9-ac8b-3b60302dce21";
const DEFAULT_CONNECT_SMS_CONTACT_FLOW_ID = "9b4c53df-f803-4d80-9fa6-6ab6ec4555ff";

function getAwsRegion() {
  return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? DEFAULT_AWS_REGION;
}

function normalizePhoneToE164(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function getConfigValue(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (process.env.NODE_ENV !== "production") return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

function getSmsErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unable to send SMS.";
  }

  const message = error.message || "Unable to send SMS.";
  if (message.includes("AccessDeniedException") || message.includes("Access Denied")) {
    return "Amazon Connect rejected the outbound SMS request. Verify the Connect number is SMS-enabled and the selected contact flow supports messaging.";
  }
  if (message.includes("BadRequestException")) {
    return "Amazon Connect rejected the outbound SMS payload. Verify the contact flow and SMS channel configuration.";
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
      phone?: string;
    };

    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";

    if (!leadId || !message) {
      return NextResponse.json({ error: "leadId and message are required." }, { status: 400 });
    }

    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const lead = await getLeadById(leadId, user.id, { includeAll });
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const destinationPhone = normalizePhoneToE164(phone || lead.phone || "");
    if (!destinationPhone) {
      return NextResponse.json({ error: "Lead phone number is required to send SMS." }, { status: 400 });
    }

    const instanceId = getConfigValue("AMAZON_CONNECT_INSTANCE_ID", DEFAULT_CONNECT_INSTANCE_ID);
    const contactFlowId = getConfigValue("AMAZON_CONNECT_SMS_CONTACT_FLOW_ID", DEFAULT_CONNECT_SMS_CONTACT_FLOW_ID);
    const sourceArn = getConfigValue("AMAZON_CONNECT_SMS_SOURCE_ARN", DEFAULT_CONNECT_SMS_SOURCE_ARN);

    const client = new ConnectClient({ region: getAwsRegion() });
    const response = await client.send(
      new StartOutboundChatContactCommand({
        InstanceId: instanceId,
        ContactFlowId: contactFlowId,
        SourceEndpoint: {
          Address: sourceArn,
          Type: "CONNECT_PHONENUMBER_ARN",
        },
        DestinationEndpoint: {
          Address: destinationPhone,
          Type: "TELEPHONE_NUMBER",
        },
        InitialSystemMessage: {
          Content: message,
          ContentType: "text/plain",
        },
        ChatDurationInMinutes: 60,
        SupportedMessagingContentTypes: ["text/plain"],
        SegmentAttributes: {
          "connect:Subtype": {
            ValueString: "connect:SMS",
          },
        },
        Attributes: {
          lead_id: leadId,
          crm_channel: "sms",
          crm_user_id: user.id,
        },
      }),
    );

    const note = await createLeadNote(leadId, message, "sms", response.ContactId ?? null);

    return NextResponse.json({
      success: true,
      note,
      contactId: response.ContactId ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: getSmsErrorMessage(error) }, { status: 500 });
  }
}
