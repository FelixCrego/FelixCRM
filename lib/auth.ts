import { cookies, headers } from "next/headers";

export const AUTH_ACCESS_TOKEN_COOKIE = "felix_access_token";
export const AUTH_REFRESH_TOKEN_COOKIE = "felix_refresh_token";
export const AUTH_USER_HEADER = "x-felix-user-id";
export const AUTH_USER_EMAIL_HEADER = "x-felix-user-email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET?.trim().replace(/^['"]|['"]$/g, "") ?? "";

type SupabaseUser = { id: string; email?: string | null };
type SupabaseJwtHeader = { alg?: string; typ?: string };
type SupabaseJwtPayload = { sub?: string; email?: string | null; exp?: number };
type GetSupabaseUserOptions = {
  allowExpiredGraceSeconds?: number;
  allowNetworkFallback?: boolean;
};
type AuthCookieResponse = {
  cookies: {
    set: (
      name: string,
      value: string,
      options?: {
        httpOnly?: boolean;
        sameSite?: "lax" | "strict" | "none";
        secure?: boolean;
        path?: string;
        maxAge?: number;
      },
    ) => unknown;
  };
};
type AuthCookieSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

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

let cachedJwtSecret = "";
let cachedJwtKeyPromise: Promise<CryptoKey> | null = null;
const AUTH_COOKIE_REFRESH_MAX_AGE = 60 * 60 * 24 * 30;
const AUTH_ACCESS_TOKEN_REFRESH_BUFFER_SECONDS = 60;
const SUPABASE_AUTH_REQUEST_TIMEOUT_MS = 4000;

function requireSupabaseAuthConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase auth requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}

function getNormalizedEmail(usernameOrEmail: string) {
  const normalized = usernameOrEmail.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return "";
  return normalized;
}

function base64UrlToBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return `${normalized}${padding}`;
}

function decodeBase64Url(value: string) {
  return atob(base64UrlToBase64(value));
}

function decodeJwtSection<T>(value: string): T | null {
  try {
    return JSON.parse(decodeBase64Url(value)) as T;
  } catch {
    return null;
  }
}

function decodeBase64UrlToBytes(value: string) {
  const decoded = decodeBase64Url(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function getSupabaseJwtKey() {
  if (!supabaseJwtSecret) return null;
  if (!cachedJwtKeyPromise || cachedJwtSecret !== supabaseJwtSecret) {
    cachedJwtSecret = supabaseJwtSecret;
    cachedJwtKeyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(supabaseJwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
  }
  return cachedJwtKeyPromise;
}

async function getVerifiedSupabaseUserFromAccessToken(accessToken: string, options?: GetSupabaseUserOptions): Promise<SupabaseUser | null> {
  if (!accessToken || !supabaseJwtSecret) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = accessToken.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

  const header = decodeJwtSection<SupabaseJwtHeader>(encodedHeader);
  if (header?.alg !== "HS256") return null;

  const key = await getSupabaseJwtKey();
  if (!key) return null;

  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    decodeBase64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  ).catch(() => false);

  if (!verified) return null;

  const payload = decodeJwtSection<SupabaseJwtPayload>(encodedPayload);
  if (!payload?.sub || typeof payload.exp !== "number") return null;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const graceSeconds = Math.max(0, Math.floor(options?.allowExpiredGraceSeconds ?? 0));
  if (payload.exp + graceSeconds < nowInSeconds) return null;

  return {
    id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
  };
}

async function supabaseAuthRequest<T>(path: string, init?: RequestInit): Promise<T> {
  requireSupabaseAuthConfig();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_AUTH_REQUEST_TIMEOUT_MS);

  const response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey as string,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: init?.signal ?? controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
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

export function shouldRefreshAccessToken(accessToken: string, bufferSeconds = AUTH_ACCESS_TOKEN_REFRESH_BUFFER_SECONDS) {
  if (!accessToken) return true;

  const [, encodedPayload] = accessToken.split(".");
  if (!encodedPayload) return true;

  const payload = decodeJwtSection<SupabaseJwtPayload>(encodedPayload);
  if (!payload?.exp || typeof payload.exp !== "number") return true;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  return payload.exp - Math.max(0, Math.floor(bufferSeconds)) <= nowInSeconds;
}

export function setAuthCookies(response: AuthCookieResponse, session: AuthCookieSession) {
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
    maxAge: AUTH_COOKIE_REFRESH_MAX_AGE,
  });
}

export function clearAuthCookies(response: AuthCookieResponse) {
  response.cookies.set(AUTH_ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(AUTH_REFRESH_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getSupabaseUserByAccessToken(
  accessToken: string,
  options?: GetSupabaseUserOptions,
): Promise<SupabaseUser | null> {
  if (!accessToken) return null;

  const locallyVerifiedUser = await getVerifiedSupabaseUserFromAccessToken(accessToken, options);
  if (locallyVerifiedUser?.id) {
    return locallyVerifiedUser;
  }

  if (options?.allowNetworkFallback === false) {
    return null;
  }

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
  if (!accessToken) return null;

  // Refresh tokens must only be rotated from middleware, where the updated
  // cookies can be written back to the browser on the same response.
  const user = await getSupabaseUserByAccessToken(accessToken);
  return user?.id ?? null;
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
  if (!accessToken) return null;

  // Refresh tokens must only be rotated from middleware, where the updated
  // cookies can be written back to the browser on the same response.
  const user = await getSupabaseUserByAccessToken(accessToken);
  if (user?.id) {
    return {
      id: user.id,
      email: user.email ?? null,
    };
  }

  return null;
}
