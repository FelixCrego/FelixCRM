import { cookies, headers } from "next/headers";
import type { NextResponse } from "next/server";

export const AUTH_ACCESS_TOKEN_COOKIE = "felix_access_token";
export const AUTH_REFRESH_TOKEN_COOKIE = "felix_refresh_token";
export const AUTH_USER_HEADER = "x-felix-user-id";
export const AUTH_USER_EMAIL_HEADER = "x-felix-user-email";
export const AUTH_REFRESH_BUFFER_SECONDS = 10 * 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type SupabaseUser = { id: string; email?: string | null };

type SupabaseAuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: SupabaseUser;
};

type SupabaseSignUpResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: SupabaseUser | null;
  session?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: SupabaseUser | null;
  } | null;
};

type AuthCookieSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

function requireSupabaseAuthConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase auth requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = typeof atob === "function"
      ? atob(padded)
      : Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getAccessTokenRemainingSeconds(accessToken: string, now = Date.now()) {
  const payload = decodeJwtPayload(accessToken);
  const exp = typeof payload?.exp === "number" ? payload.exp : NaN;
  if (!Number.isFinite(exp)) return null;
  return Math.floor(exp - now / 1000);
}

export function shouldRefreshAccessToken(accessToken: string, bufferSeconds = AUTH_REFRESH_BUFFER_SECONDS) {
  if (!accessToken) return true;
  const remainingSeconds = getAccessTokenRemainingSeconds(accessToken);
  if (remainingSeconds === null) return true;
  return remainingSeconds <= bufferSeconds;
}

export function setAuthCookies(response: NextResponse, session: AuthCookieSession) {
  response.cookies.set(AUTH_ACCESS_TOKEN_COOKIE, session.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: session.expiresIn,
  });
  response.cookies.set(AUTH_REFRESH_TOKEN_COOKIE, session.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(AUTH_ACCESS_TOKEN_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(AUTH_REFRESH_TOKEN_COOKIE, "", { path: "/", maxAge: 0 });
}

function getNormalizedEmail(usernameOrEmail: string) {
  const normalized = usernameOrEmail.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return "";
  return normalized;
}

async function supabaseAuthRequest<T>(path: string, init?: RequestInit): Promise<T> {
  requireSupabaseAuthConfig();

  const response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey as string,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let payload: Record<string, any> = {};
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, any>;
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    const message = payload?.error_description || payload?.msg || payload?.error || `Supabase auth failed (${response.status}).`;
    throw new Error(message);
  }

  return payload as T;
}

export async function signUpWithUsernamePassword(username: string, password: string, emailRedirectTo?: string) {
  const email = getNormalizedEmail(username);
  if (!email || password.length < 8) {
    throw new Error("A valid email and password (min 8 chars) are required.");
  }

  const signupPath = emailRedirectTo
    ? `/signup?redirect_to=${encodeURIComponent(emailRedirectTo)}`
    : "/signup";

  const payload = await supabaseAuthRequest<SupabaseSignUpResponse>(signupPath, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  const sessionAccessToken = payload.session?.access_token ?? payload.access_token ?? null;
  const sessionRefreshToken = payload.session?.refresh_token ?? payload.refresh_token ?? null;
  const sessionExpiresIn = payload.session?.expires_in ?? payload.expires_in ?? 0;
  const userId = payload.session?.user?.id ?? payload.user?.id ?? null;

  if (sessionAccessToken && sessionRefreshToken && userId) {
    return {
      userId,
      accessToken: sessionAccessToken,
      refreshToken: sessionRefreshToken,
      expiresIn: sessionExpiresIn,
    };
  }

  return {
    userId,
    accessToken: null,
    refreshToken: null,
    expiresIn: 0,
  };
}

export async function signInWithUsernamePassword(username: string, password: string) {
  const email = getNormalizedEmail(username);
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  const payload = await supabaseAuthRequest<SupabaseAuthSession>("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return {
    userId: payload.user.id,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
  };
}

export async function refreshSupabaseSession(refreshToken: string) {
  const payload = await supabaseAuthRequest<SupabaseAuthSession>("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  return {
    userId: payload.user.id,
    email: payload.user.email ?? null,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
  };
}

export async function getSupabaseUserByAccessToken(accessToken: string): Promise<SupabaseUser | null> {
  if (!accessToken) return null;
  try {
    return await supabaseAuthRequest<SupabaseUser>("/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return null;
  }
}

export async function getAuthenticatedUserId() {
  const forwardedUserId = headers().get(AUTH_USER_HEADER);
  if (forwardedUserId) return forwardedUserId;

  const accessToken = cookies().get(AUTH_ACCESS_TOKEN_COOKIE)?.value ?? "";
  if (accessToken) {
    const user = await getSupabaseUserByAccessToken(accessToken);
    if (user?.id) return user.id;
  }

  const refreshToken = cookies().get(AUTH_REFRESH_TOKEN_COOKIE)?.value ?? "";
  if (!refreshToken) return null;

  try {
    const refreshed = await refreshSupabaseSession(refreshToken);
    return refreshed.userId;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser() {
  const forwardedUserId = headers().get(AUTH_USER_HEADER);
  if (forwardedUserId) {
    return {
      id: forwardedUserId,
      email: headers().get(AUTH_USER_EMAIL_HEADER),
    };
  }

  const accessToken = cookies().get(AUTH_ACCESS_TOKEN_COOKIE)?.value ?? "";
  if (accessToken) {
    const user = await getSupabaseUserByAccessToken(accessToken);
    if (user?.id) {
      return {
        id: user.id,
        email: user.email ?? null,
      };
    }
  }

  const refreshToken = cookies().get(AUTH_REFRESH_TOKEN_COOKIE)?.value ?? "";
  if (!refreshToken) return null;

  try {
    const refreshed = await refreshSupabaseSession(refreshToken);
    return {
      id: refreshed.userId,
      email: refreshed.email,
    };
  } catch {
    return null;
  }
}
