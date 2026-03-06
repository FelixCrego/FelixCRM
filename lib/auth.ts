import { cookies, headers } from "next/headers";

export const AUTH_ACCESS_TOKEN_COOKIE = "felix_access_token";
export const AUTH_REFRESH_TOKEN_COOKIE = "felix_refresh_token";
export const AUTH_USER_HEADER = "x-felix-user-id";

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
  if (!accessToken) return null;

  const user = await getSupabaseUserByAccessToken(accessToken);
  return user?.id ?? null;
}

export async function getAuthenticatedUser() {
  const accessToken = cookies().get(AUTH_ACCESS_TOKEN_COOKIE)?.value ?? "";
  if (!accessToken) return null;

  const user = await getSupabaseUserByAccessToken(accessToken);
  if (!user?.id) return null;

  return {
    id: user.id,
    email: user.email ?? null,
  };
}
