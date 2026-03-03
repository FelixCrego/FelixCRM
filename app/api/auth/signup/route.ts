import { NextResponse } from "next/server";
import {
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
  signInWithUsernamePassword,
  signUpWithUsernamePassword,
} from "@/lib/auth";

const DEFAULT_PRODUCTION_APP_URL = "https://felix-crm-xi.vercel.app";

function setAuthCookies(response: NextResponse, accessToken: string, refreshToken: string, expiresIn: number) {
  response.cookies.set(AUTH_ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expiresIn,
  });
  response.cookies.set(AUTH_REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

function resolveConfirmationRedirectBase(request: Request) {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredAppUrl) return configuredAppUrl;

  const origin = request.headers.get("origin")?.trim() ?? "";
  if (origin && !origin.includes("localhost")) return origin;

  return DEFAULT_PRODUCTION_APP_URL;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  try {
    const baseUrl = resolveConfirmationRedirectBase(request);
    const emailRedirectTo = `${baseUrl.replace(/\/$/, "")}/login?confirmed=1`;
    const session = await signUpWithUsernamePassword(username, password, emailRedirectTo);

    const response = NextResponse.json({
      ok: true,
      requiresEmailConfirmation: !session.accessToken,
      userId: session.userId,
    });

    if (session.accessToken && session.refreshToken) {
      setAuthCookies(response, session.accessToken, session.refreshToken, session.expiresIn);
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign up.";

    if (message.toLowerCase().includes("rate limit")) {
      try {
        const existingSession = await signInWithUsernamePassword(username, password);
        const response = NextResponse.json({ ok: true, userId: existingSession.userId, recoveredFromRateLimit: true });
        setAuthCookies(response, existingSession.accessToken, existingSession.refreshToken, existingSession.expiresIn);
        return response;
      } catch {
        return NextResponse.json(
          {
            error:
              "Email verification rate limit exceeded. If this account already exists, sign in instead, or wait a minute and try again.",
          },
          { status: 429 },
        );
      }
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
