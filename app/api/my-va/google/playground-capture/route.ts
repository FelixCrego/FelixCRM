import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { saveGoogleRefreshToken } from "@/lib/google-token-store";

export const runtime = "nodejs";
const PLAYGROUND_REDIRECT = "https://developers.google.com/oauthplayground";
const SESSION_COOKIE = "google_oauth_session";

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

function html(title: string, message: string, status = 200) {
  return new NextResponse(`<!doctype html><html><body style="font-family:system-ui;padding:40px"><h1>${title}</h1><p>${message}</p></body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") || "";
    const cookie = request.headers.get("cookie") || "";
    const state = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) || "";
    const clientSecret = required("GOOGLE_CLIENT_SECRET");
    if (!code || !state || !validState(decodeURIComponent(state), clientSecret)) {
      return html("Google connection failed", "The authorization session is missing or expired. Start the connection again.", 400);
    }
    const oauth = new google.auth.OAuth2(required("GOOGLE_CLIENT_ID"), clientSecret, PLAYGROUND_REDIRECT);
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Reconnect and approve access again.");
    await saveGoogleRefreshToken(tokens.refresh_token);
    const response = html("Google connected", "Gmail sending and Calendar booking are now authorized for Buildvora. You may close this page.");
    response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/api/my-va/google" });
    return response;
  } catch (error) {
    return html("Google connection failed", error instanceof Error ? error.message : "Unknown error", 500);
  }
}
