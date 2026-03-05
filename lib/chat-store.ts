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
  recipient_id?: string | null;
  content: string;
  created_at: string;
};

type StoredUser = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
};

type AuthAdminUser = {
  id: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
  } | null;
};

type AuthAdminUsersResponse = {
  users?: AuthAdminUser[];
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string | null;
  content: string;
  createdAt: string;
};

export type ChatUser = {
  id: string;
  name: string;
  role: string;
  isOnline: boolean;
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

function isMissingColumnError(error: unknown, column: string) {
  const code = typeof error === "object" && error && "code" in error ? String((error as SupabaseError).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "PGRST204" && message.includes(`'${column}'`);
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
    recipientId: row.recipient_id ?? null,
    content: row.content,
    createdAt: row.created_at,
  };
}

function getFallbackName(userId: string) {
  return `Rep ${userId.slice(0, 6)}`;
}

function getDisplayNameFromStoredUser(user: StoredUser) {
  return (
    (typeof user.name === "string" && user.name.trim()) ||
    (typeof user.full_name === "string" && user.full_name.trim()) ||
    (typeof user.email === "string" && user.email.split("@")[0]) ||
    getFallbackName(user.id)
  );
}

function getDisplayNameFromAuthUser(user: AuthAdminUser) {
  return (
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    (typeof user.email === "string" && user.email.split("@")[0]) ||
    getFallbackName(user.id)
  );
}

async function listAuthUsers(): Promise<AuthAdminUser[]> {
  if (!hasDb) return [];

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=500`, {
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to list auth users: ${response.status}`);
  }

  const payload = (await response.json()) as AuthAdminUsersResponse;
  return Array.isArray(payload.users) ? payload.users : [];
}

async function resolveDisplayName(userId: string) {
  if (!hasDb) return getFallbackName(userId);

  try {
    const userRows = await withTableFallback<StoredUser[]>("chat-users", USERS_TABLE_CANDIDATES, (table) =>
      supabaseRequest<StoredUser[]>(table, undefined, { select: "id,name,full_name,email,role", id: `eq.${userId}`, limit: "1" }),
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

function isMessageVisibleToUser(message: ChatMessage, userId: string, peerId?: string | null) {
  if (!peerId) return !message.recipientId;
  return (
    (message.senderId === userId && message.recipientId === peerId) ||
    (message.senderId === peerId && message.recipientId === userId)
  );
}

export async function listChatMessages(userId: string, limit?: number, peerId?: string | null): Promise<ChatMessage[]> {
  if (!hasDb) {
    const filtered = memoryMessages.filter((message) => isMessageVisibleToUser(message, userId, peerId));
    if (!limit || limit <= 0) return filtered;
    return filtered.slice(-limit);
  }

  try {
    const rows = await withTableFallback<StoredMessage[]>("chat-messages", CHAT_TABLE_CANDIDATES, (table) =>
      supabaseRequest<StoredMessage[]>(table, undefined, {
        select: "id,sender_id,sender_name,recipient_id,content,created_at",
        order: "created_at.asc",
      }),
    );

    const filtered = rows.map(mapStoredMessage).filter((message) => isMessageVisibleToUser(message, userId, peerId));
    if (!limit || limit <= 0) return filtered;
    return filtered.slice(-limit);
  } catch (error) {
    if (peerId && isMissingColumnError(error, "recipient_id")) {
      const filtered = memoryMessages.filter((message) => isMessageVisibleToUser(message, userId, peerId));
      if (!limit || limit <= 0) return filtered;
      return filtered.slice(-limit);
    }
    const filtered = memoryMessages.filter((message) => isMessageVisibleToUser(message, userId, peerId));
    if (!limit || limit <= 0) return filtered;
    return filtered.slice(-limit);
  }
}

export async function createChatMessage(userId: string, content: string, recipientId?: string | null) {
  const senderName = await resolveDisplayName(userId);
  const normalizedRecipientId = recipientId?.trim() || null;

  if (!hasDb) {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      senderId: userId,
      senderName,
      recipientId: normalizedRecipientId,
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
          body: JSON.stringify([{ sender_id: userId, sender_name: senderName, recipient_id: normalizedRecipientId, content }]),
        },
        { select: "id,sender_id,sender_name,recipient_id,content,created_at" },
      ),
    );

    return mapStoredMessage(rows[0]);
  } catch {
    const fallbackMessage: ChatMessage = {
      id: crypto.randomUUID(),
      senderId: userId,
      senderName,
      recipientId: normalizedRecipientId,
      content,
      createdAt: new Date().toISOString(),
    };
    memoryMessages.push(fallbackMessage);
    return fallbackMessage;
  }
}

export async function listChatUsers(currentUserId: string): Promise<ChatUser[]> {
  prunePresence();

  if (!hasDb) {
    const users = new Map<string, ChatUser>();
    for (const message of memoryMessages) {
      if (message.senderId !== currentUserId && !users.has(message.senderId)) {
        users.set(message.senderId, {
          id: message.senderId,
          name: message.senderName,
          role: "REP",
          isOnline: memoryPresence.has(message.senderId),
        });
      }
    }

    return [...users.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const usersById = new Map<string, ChatUser>();

  try {
    const rows = await withTableFallback<StoredUser[]>("chat-users", USERS_TABLE_CANDIDATES, (table) =>
      supabaseRequest<StoredUser[]>(table, undefined, { select: "id,name,full_name,email,role", limit: "500" }),
    );

    for (const user of rows) {
      if (!user.id || user.id === currentUserId) continue;
      usersById.set(user.id, {
        id: user.id,
        name: getDisplayNameFromStoredUser(user),
        role: (typeof user.role === "string" && user.role.trim()) || "REP",
        isOnline: memoryPresence.has(user.id),
      });
    }
  } catch {
    // continue; auth users fallback below
  }

  try {
    const authUsers = await listAuthUsers();
    for (const user of authUsers) {
      if (!user.id || user.id === currentUserId || usersById.has(user.id)) continue;
      usersById.set(user.id, {
        id: user.id,
        name: getDisplayNameFromAuthUser(user),
        role: "REP",
        isOnline: memoryPresence.has(user.id),
      });
    }
  } catch {
    // ignore auth directory errors
  }

  return [...usersById.values()].sort((a, b) => a.name.localeCompare(b.name));
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
