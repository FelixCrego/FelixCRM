import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";
function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export async function GET(request: Request) {
  const silent = new URL(request.url).searchParams.get("silent") === "1";
  const clientId = required("GOOGLE_CLIENT_ID");
  const clientSecret = required("GOOGLE_CLIENT_SECRET");
  const redirectUri = "https://developers.google.com/oauthplayground";
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac("sha256", clientSecret).update(timestamp).digest("hex");
  const state = Buffer.from(`${timestamp}.${signature}`).toString("base64url");
  const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: silent ? "none" : "consent",
    include_granted_scopes: true,
    login_hint: "felix@felixcrego.com",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar",
      "openid",
      "email",
    ],
    state,
  });
  return NextResponse.redirect(url);
}
