import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { saveGoogleRefreshToken } from "@/lib/google-token-store";

export const runtime = "nodejs";
const PLAYGROUND_REDIRECT = "https://developers.google.com/oauthplayground";
const ALLOWED_ORIGIN = "https://developers.google.com";

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

function cors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  response.headers.set("Vary", "Origin");
  return response;
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "content-type");
  response.headers.set("Access-Control-Max-Age", "300");
  return response;
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin") || "";
    if (origin !== ALLOWED_ORIGIN) {
      return cors(NextResponse.json({ ok: false, error: "Origin not allowed." }, { status: 403 }));
    }

    const { code, state } = await request.json() as { code?: string; state?: string };
    if (!code || !state) {
      return cors(NextResponse.json({ ok: false, error: "Missing authorization code or state." }, { status: 400 }));
    }

    const clientSecret = required("GOOGLE_CLIENT_SECRET");
    if (!validState(state, clientSecret)) {
      return cors(NextResponse.json({ ok: false, error: "Invalid or expired authorization state." }, { status: 403 }));
    }

    const oauth = new google.auth.OAuth2(required("GOOGLE_CLIENT_ID"), clientSecret, PLAYGROUND_REDIRECT);
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Reconnect with consent enabled.");
    await saveGoogleRefreshToken(tokens.refresh_token);

    return cors(NextResponse.json({
      ok: true,
      scopes: (tokens.scope || "").split(" ").filter(Boolean).length,
      stored: true,
    }));
  } catch (error) {
    return cors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 }));
  }
}
