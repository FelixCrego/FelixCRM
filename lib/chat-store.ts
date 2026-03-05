import { getProfile } from "@/lib/store";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(supabaseUrl && supabaseServiceRoleKey);

const CHAT_TABLE_CANDIDATES = ["chat_messages", "chatMessage", "ChatMessage"];
const USERS_TABLE_CANDIDATES = ["User", "user", "users"];
const PRESENCE_TTL_MS = 45_000;

type SupabaseError = { code?: string; message?: string };

type StoredMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
};

const resolvedTableCache = new Map<string, string>();
const memoryMessages: ChatMessage[] = [];
const memoryPresence = new Map<string, number>();

function parseJsonSafely<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function buildUrl(table: string, query?: Record<string, string>) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function supabaseRequest<T>(table: string, init?: RequestInit, query?: Record<string, string>): Promise<T> {
  if (!hasDb) throw new Error("Supabase environment variables are required for chat database access.");

  const response = await fetch(buildUrl(table, query), {
    ...init,
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payloadText = await response.text();
    const payload = payloadText ? (parseJsonSafely<SupabaseError>(payloadText) ?? {}) : {};
    const error = new Error(payload.message ?? `Supabase request failed: ${response.status}`) as Error & SupabaseError;
    error.code = payload.code;
    throw error;
  }

  if (response.status === 204) return [] as T;

  const payloadText = await response.text();
  if (!payloadText.trim()) return undefined as T;

  const payload = parseJsonSafely<T>(payloadText);
  if (payload === null) throw new Error(`Supabase response returned non-JSON payload with status ${response.status}.`);
  return payload;
}

function isMissingTableError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as SupabaseError).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "42P01" || code === "PGRST205" || (message.includes("Could not find the table") && message.includes("schema cache"));
}

async function withTableFallback<T>(cacheKey: string, candidates: string[], requester: (table: string) => Promise<T>): Promise<T> {
  const cached = resolvedTableCache.get(cacheKey);
  if (cached) {
    try {
      return await requester(cached);
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
      resolvedTableCache.delete(cacheKey);
    }
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const result = await requester(candidate);
      resolvedTableCache.set(cacheKey, candidate);
      return result;
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
      lastError = error;
    }
  }

  throw lastError ?? new Error(`Unable to resolve Supabase table for ${cacheKey}`);
}

function mapStoredMessage(row: StoredMessage): ChatMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    content: row.content,
    createdAt: row.created_at,
  };
}

function getFallbackName(userId: string) {
  return `Rep ${userId.slice(0, 6)}`;
}

async function resolveDisplayName(userId: string) {
  if (!hasDb) return getFallbackName(userId);

  try {
    const userRows = await withTableFallback<any[]>("chat-users", USERS_TABLE_CANDIDATES, (table) =>
      supabaseRequest<any[]>(table, undefined, { select: "*", id: `eq.${userId}`, limit: "1" }),
    );
    const user = userRows[0];
    const dbName =
      (typeof user?.name === "string" && user.name.trim()) ||
      (typeof user?.full_name === "string" && user.full_name.trim()) ||
      (typeof user?.email === "string" && user.email.split("@")[0]) ||
      "";

    if (dbName) return dbName;
  } catch {
    // ignore and fall through to role/name fallback
  }

  const profile = await getProfile(userId).catch(() => null);
  if (profile) {
    return `${profile.role === "MANAGER" ? "Manager" : "Rep"} ${userId.slice(0, 4)}`;
  }

  return getFallbackName(userId);
}

function prunePresence() {
  const now = Date.now();
  for (const [userId, lastSeenAt] of memoryPresence.entries()) {
    if (now - lastSeenAt > PRESENCE_TTL_MS) memoryPresence.delete(userId);
  }
}

export async function listChatMessages(limit = 100): Promise<ChatMessage[]> {
  if (!hasDb) return memoryMessages.slice(-limit);

  try {
    const rows = await withTableFallback<StoredMessage[]>("chat-messages", CHAT_TABLE_CANDIDATES, (table) =>
      supabaseRequest<StoredMessage[]>(table, undefined, {
        select: "id,sender_id,sender_name,content,created_at",
        order: "created_at.asc",
        limit: String(limit),
      }),
    );

    return rows.map(mapStoredMessage);
  } catch {
    return memoryMessages.slice(-limit);
  }
}

export async function createChatMessage(userId: string, content: string) {
  const senderName = await resolveDisplayName(userId);

  if (!hasDb) {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      senderId: userId,
      senderName,
      content,
      createdAt: new Date().toISOString(),
    };
    memoryMessages.push(message);
    return message;
  }

  try {
    const rows = await withTableFallback<StoredMessage[]>("chat-messages", CHAT_TABLE_CANDIDATES, (table) =>
      supabaseRequest<StoredMessage[]>(
        table,
        {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify([{ sender_id: userId, sender_name: senderName, content }]),
        },
        { select: "id,sender_id,sender_name,content,created_at" },
      ),
    );

    return mapStoredMessage(rows[0]);
  } catch {
    const fallbackMessage: ChatMessage = {
      id: crypto.randomUUID(),
      senderId: userId,
      senderName,
      content,
      createdAt: new Date().toISOString(),
    };
    memoryMessages.push(fallbackMessage);
    return fallbackMessage;
  }
}

export function heartbeatChatPresence(userId: string) {
  memoryPresence.set(userId, Date.now());
  prunePresence();
  return memoryPresence.size;
}

export function listOnlineChatUsers() {
  prunePresence();
  return memoryPresence.size;
}
