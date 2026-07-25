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

function cors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  response.headers.set("Vary", "Origin");
  return response;
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "content-type, x-exchange-nonce");
  response.headers.set("Access-Control-Max-Age", "300");
  return response;
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin") || "";
    if (origin !== ALLOWED_ORIGIN) return cors(NextResponse.json({ ok: false, error: "Origin not allowed." }, { status: 403 }));
    const expectedNonce = required("GOOGLE_EXCHANGE_NONCE");
    const suppliedNonce = request.headers.get("x-exchange-nonce") || "";
    if (suppliedNonce !== expectedNonce) return cors(NextResponse.json({ ok: false, error: "Invalid exchange nonce." }, { status: 403 }));
    const { code } = await request.json() as { code?: string };
    if (!code) return cors(NextResponse.json({ ok: false, error: "Missing authorization code." }, { status: 400 }));
    const oauth = new google.auth.OAuth2(required("GOOGLE_CLIENT_ID"), required("GOOGLE_CLIENT_SECRET"), PLAYGROUND_REDIRECT);
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Reconnect with consent enabled.");
    await saveGoogleRefreshToken(tokens.refresh_token);
    return cors(NextResponse.json({ ok: true, scopes: (tokens.scope || "").split(" ").filter(Boolean).length }));
  } catch (error) {
    return cors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 }));
  }
}
