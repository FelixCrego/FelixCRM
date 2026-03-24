const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type PostgrestError = {
  message?: string;
  details?: string;
  code?: string;
};

export type UserSessionRecord = {
  id: string;
  userId: string;
  userEmail: string | null;
  sessionStatus: "ACTIVE" | "ENDED";
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  lastPath: string | null;
  userAgent: string | null;
  createdAt: string;
};

export const USER_SESSIONS_SETUP_SQL = `create extension if not exists pgcrypto;

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text,
  session_status text not null default 'ACTIVE' check (session_status in ('ACTIVE', 'ENDED')),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  last_path text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists user_sessions_user_id_idx on public.user_sessions (user_id);
create index if not exists user_sessions_started_at_idx on public.user_sessions (started_at desc);
create index if not exists user_sessions_status_idx on public.user_sessions (session_status);`;

function getConfig() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { supabaseUrl, serviceRoleKey };
}

function isMissingUserSessionsTable(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as PostgrestError).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "42P01" || code === "PGRST205" || (message.includes("Could not find the table") && message.includes("user_sessions"));
}

async function supabaseRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { supabaseUrl: url, serviceRoleKey: key } = getConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const maybeError = payload && typeof payload === "object" ? (payload as PostgrestError) : {};
    const error = new Error(maybeError.message || maybeError.details || `Supabase request failed: ${response.status}`) as Error & PostgrestError;
    error.code = maybeError.code;
    throw error;
  }

  return (payload ?? undefined) as T;
}

function normalizeSession(row: Record<string, unknown>): UserSessionRecord {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? row.userId ?? ""),
    userEmail: typeof row.user_email === "string" ? row.user_email : typeof row.userEmail === "string" ? row.userEmail : null,
    sessionStatus: row.session_status === "ENDED" ? "ENDED" : "ACTIVE",
    startedAt: String(row.started_at ?? row.startedAt ?? ""),
    lastSeenAt: String(row.last_seen_at ?? row.lastSeenAt ?? ""),
    endedAt: typeof row.ended_at === "string" ? row.ended_at : typeof row.endedAt === "string" ? row.endedAt : null,
    lastPath: typeof row.last_path === "string" ? row.last_path : typeof row.lastPath === "string" ? row.lastPath : null,
    userAgent: typeof row.user_agent === "string" ? row.user_agent : typeof row.userAgent === "string" ? row.userAgent : null,
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
  };
}

export async function startUserSession(input: {
  userId: string;
  userEmail?: string | null;
  lastPath?: string | null;
  userAgent?: string | null;
}) {
  const payload = {
    user_id: input.userId,
    user_email: input.userEmail ?? null,
    session_status: "ACTIVE",
    last_seen_at: new Date().toISOString(),
    last_path: input.lastPath ?? null,
    user_agent: input.userAgent ?? null,
  };

  const rows = await supabaseRequest<Array<Record<string, unknown>>>("user_sessions?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([payload]),
  });

  return normalizeSession(rows[0] ?? {});
}

export async function heartbeatUserSession(input: { sessionId: string; userId: string; lastPath?: string | null }) {
  await supabaseRequest(`user_sessions?id=eq.${input.sessionId}&user_id=eq.${input.userId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      last_seen_at: new Date().toISOString(),
      last_path: input.lastPath ?? null,
      session_status: "ACTIVE",
    }),
  });
}

export async function endUserSession(input: { sessionId: string; userId: string; lastPath?: string | null }) {
  await supabaseRequest(`user_sessions?id=eq.${input.sessionId}&user_id=eq.${input.userId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      ended_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      last_path: input.lastPath ?? null,
      session_status: "ENDED",
    }),
  });
}

export async function endAllActiveUserSessions(userId: string) {
  await supabaseRequest(`user_sessions?user_id=eq.${userId}&session_status=eq.ACTIVE`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      ended_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      session_status: "ENDED",
    }),
  });
}

export async function listRecentUserSessions(limit = 50) {
  try {
    const rows = await supabaseRequest<Array<Record<string, unknown>>>(
      `user_sessions?select=*&order=started_at.desc&limit=${Math.max(1, Math.min(limit, 200))}`,
    );
    return {
      sessions: rows.map((row) => normalizeSession(row)),
      tableMissing: false,
    };
  } catch (error) {
    if (isMissingUserSessionsTable(error)) {
      return {
        sessions: [] as UserSessionRecord[],
        tableMissing: true,
      };
    }
    throw error;
  }
}

export function getUserSessionDurationMs(session: UserSessionRecord) {
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt ?? session.lastSeenAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return end - start;
}
