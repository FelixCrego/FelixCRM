import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { saveGoogleRefreshToken } from "@/lib/google-token-store";

export const runtime = "nodejs";
const PLAYGROUND_REDIRECT = "https://developers.google.com/oauthplayground";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function validState(state: string, secret: string) {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [timestamp, signature] = decoded.split(".");
    if (!timestamp || !signature || Date.now() - Number(timestamp) > 15 * 60 * 1000) return false;
    const expected = crypto.createHmac("sha256", secret).update(timestamp).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const { code, state } = await request.json() as { code?: string; state?: string };
    const clientId = required("GOOGLE_CLIENT_ID");
    const clientSecret = required("GOOGLE_CLIENT_SECRET");
    if (!code || !state || !validState(state, clientSecret)) {
      return NextResponse.json({ ok: false, error: "Invalid or expired authorization request." }, { status: 400 });
    }
    const oauth = new google.auth.OAuth2(clientId, clientSecret, PLAYGROUND_REDIRECT);
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Reconnect with consent enabled.");
    await saveGoogleRefreshToken(tokens.refresh_token);
    return NextResponse.json({ ok: true, scopes: tokens.scope || "" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
