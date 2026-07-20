import { DescribeInstanceCommand, DescribePhoneNumberCommand, ConnectClient } from "@aws-sdk/client-connect";
import { google } from "googleapis";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown provider error";
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const region = env("AWS_REGION") || env("AWS_DEFAULT_REGION") || "us-west-2";
  const instanceId = env("AMAZON_CONNECT_INSTANCE_ID");
  const sourceArn = env("AMAZON_CONNECT_SMS_SOURCE_ARN");
  const phoneNumberId = sourceArn.split("/").pop() || "";

  const sms = {
    configured: Boolean(instanceId && sourceArn && env("AMAZON_CONNECT_SMS_CONTACT_FLOW_ID")),
    reachable: false,
    number: null as string | null,
    error: null as string | null,
  };

  if (sms.configured && phoneNumberId) {
    try {
      const client = new ConnectClient({ region });
      await client.send(new DescribeInstanceCommand({ InstanceId: instanceId }));
      const phone = await client.send(new DescribePhoneNumberCommand({ PhoneNumberId: phoneNumberId }));
      sms.reachable = true;
      sms.number = phone.ClaimedPhoneNumberSummary?.PhoneNumber || null;
    } catch (error) {
      sms.error = errorMessage(error);
    }
  }

  const email = {
    configured: Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET") && env("GOOGLE_REDIRECT_URI") && env("GOOGLE_REFRESH_TOKEN")),
    reachable: false,
    mailbox: null as string | null,
    error: null as string | null,
  };

  if (email.configured) {
    try {
      const auth = new google.auth.OAuth2(env("GOOGLE_CLIENT_ID"), env("GOOGLE_CLIENT_SECRET"), env("GOOGLE_REDIRECT_URI"));
      auth.setCredentials({ refresh_token: env("GOOGLE_REFRESH_TOKEN") });
      const gmail = google.gmail({ version: "v1", auth });
      const profile = await gmail.users.getProfile({ userId: "me" });
      email.reachable = true;
      email.mailbox = profile.data.emailAddress || null;
    } catch (error) {
      email.error = errorMessage(error);
    }
  }

  const healthy = sms.configured && sms.reachable && email.configured && email.reachable;
  return NextResponse.json({ healthy, sms, email }, { status: healthy ? 200 : 503 });
}
