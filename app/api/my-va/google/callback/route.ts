import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { saveGoogleRefreshToken } from "@/lib/google-token-store";

export const runtime = "nodejs";

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
  } catch { return false; }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const clientId = required("GOOGLE_CLIENT_ID");
    const clientSecret = required("GOOGLE_CLIENT_SECRET");
    const redirectUri = required("GOOGLE_REDIRECT_URI").replace(/\\r|\\n/g, "").trim();
    if (!code || !validState(state, clientSecret)) return new NextResponse("Invalid or expired authorization request.", { status: 400 });
    const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth.getToken(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("Google did not return a refresh token. Reconnect and approve access again.");
    await saveGoogleRefreshToken(refreshToken);
    return new NextResponse(`<!doctype html><html><body style="font-family:system-ui;padding:40px"><h1>Google connected</h1><p>Gmail sending and Calendar booking are now authorized for Buildvora. You may close this page.</p></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (error) {
    return new NextResponse(`Google connection failed: ${error instanceof Error ? error.message : "Unknown error"}`, { status: 500 });
  }
}
