import { prettyNameFromEmail } from "@/lib/store";
import type { UserRole } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_TIME_CLOCK_ENTRIES = 180;

type AuthAdminUser = {
  id?: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  invited_at?: string | null;
  banned_until?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type PayType = "COMMISSION" | "HOURLY";
export type OvertimeStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export type TimeClockSettings = {
  payType: PayType;
  hourlyRate: number | null;
  maxWeeklyHours: number | null;
  requireOvertimeApproval: boolean;
};

export type TimeClockEntry = {
  id: string;
  weekStart: string;
  clockInAt: string;
  clockOutAt: string | null;
  durationMinutes: number | null;
  regularMinutes: number | null;
  overtimeMinutes: number | null;
  overtimeStatus: OvertimeStatus;
  approvedByUserId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
};

export type WorkforceUser = {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
  lastSignInAt: string | null;
  createdAt: string | null;
  settings: TimeClockSettings;
  currentEntry: TimeClockEntry | null;
  entries: TimeClockEntry[];
  weeklyWorkedMinutes: number;
  weeklyPendingOvertimeMinutes: number;
  weeklyApprovedOvertimeMinutes: number;
  weeklyRemainingMinutes: number | null;
};

function requireSupabaseAdminConfig() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase admin configuration is required for workforce management.");
  }
}

function normalizeEmail(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asObjectRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function parseRole(value: unknown): UserRole {
  if (value === "SUPER_ADMIN" || value === "MANAGER" || value === "TEAM_LEAD" || value === "REP") {
    return value;
  }
  return "REP";
}

function pickDisplayName(user: AuthAdminUser & { id: string }, fallbackEmail?: string | null) {
  const metadata = asObjectRecord(user.user_metadata) ?? {};
  const nameCandidate =
    typeof metadata.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : typeof metadata.full_name === "string" && metadata.full_name.trim()
        ? metadata.full_name.trim()
        : typeof fallbackEmail === "string" && fallbackEmail.trim()
          ? prettyNameFromEmail(fallbackEmail.trim().toLowerCase())
          : user.id;
  return nameCandidate;
}

function getWeekStart(date: Date) {
  const normalized = new Date(date);
  const day = normalized.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + diff);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized.toISOString();
}

function minutesBetween(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.max(1, Math.round((end - start) / 60000));
}

function trimEntries(entries: TimeClockEntry[]) {
  return [...entries]
    .sort((a, b) => new Date(b.clockInAt).getTime() - new Date(a.clockInAt).getTime())
    .slice(0, MAX_TIME_CLOCK_ENTRIES);
}

function parseTimeClockSettings(metadata: Record<string, unknown>): TimeClockSettings {
  const container = asObjectRecord(metadata.timeClock) ?? {};
  const settings = asObjectRecord(container.settings) ?? {};
  const hourlyRate = parseNumber(settings.hourlyRate);
  const maxWeeklyHours = parseNumber(settings.maxWeeklyHours);
  return {
    payType: settings.payType === "HOURLY" ? "HOURLY" : "COMMISSION",
    hourlyRate: hourlyRate !== null && hourlyRate >= 0 ? hourlyRate : null,
    maxWeeklyHours: maxWeeklyHours !== null && maxWeeklyHours >= 0 ? maxWeeklyHours : null,
    requireOvertimeApproval: parseBoolean(settings.requireOvertimeApproval, true),
  };
}

function parseTimeClockEntries(metadata: Record<string, unknown>) {
  const container = asObjectRecord(metadata.timeClock) ?? {};
  const rawEntries = Array.isArray(container.entries) ? container.entries : [];
  const entries = rawEntries
    .map((raw) => {
      const entry = asObjectRecord(raw);
      if (!entry || typeof entry.id !== "string" || typeof entry.clockInAt !== "string") return null;
      const overtimeStatus =
        entry.overtimeStatus === "PENDING" || entry.overtimeStatus === "APPROVED" || entry.overtimeStatus === "REJECTED"
          ? entry.overtimeStatus
          : "NONE";
      return {
        id: entry.id,
        weekStart: typeof entry.weekStart === "string" && entry.weekStart ? entry.weekStart : getWeekStart(new Date(entry.clockInAt)),
        clockInAt: entry.clockInAt,
        clockOutAt: typeof entry.clockOutAt === "string" && entry.clockOutAt ? entry.clockOutAt : null,
        durationMinutes: parseNumber(entry.durationMinutes),
        regularMinutes: parseNumber(entry.regularMinutes),
        overtimeMinutes: parseNumber(entry.overtimeMinutes),
        overtimeStatus,
        approvedByUserId: typeof entry.approvedByUserId === "string" && entry.approvedByUserId ? entry.approvedByUserId : null,
        approvedByName: typeof entry.approvedByName === "string" && entry.approvedByName ? entry.approvedByName : null,
        approvedAt: typeof entry.approvedAt === "string" && entry.approvedAt ? entry.approvedAt : null,
      } satisfies TimeClockEntry;
    })
    .filter((entry): entry is TimeClockEntry => Boolean(entry));
  return trimEntries(entries);
}

function buildTimeClockMetadata(settings: TimeClockSettings, entries: TimeClockEntry[]) {
  return {
    settings,
    entries: trimEntries(entries),
  };
}

async function listAuthAdminUsersRaw(): Promise<Array<AuthAdminUser & { id: string }>> {
  requireSupabaseAdminConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to list auth users.");
  }

  const payload = (await response.json()) as { users?: AuthAdminUser[] };
  return (payload.users ?? []).filter((user): user is AuthAdminUser & { id: string } => typeof user.id === "string" && user.id.length > 0);
}

async function getAuthAdminUserById(userId: string): Promise<(AuthAdminUser & { id: string }) | null> {
  const users = await listAuthAdminUsersRaw();
  return users.find((user) => user.id === userId) ?? null;
}

async function saveAuthUserMetadata(userId: string, metadata: Record<string, unknown>) {
  requireSupabaseAdminConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_metadata: metadata,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to save auth user metadata.");
  }
}

function computeWeeklySummary(entries: TimeClockEntry[], settings: TimeClockSettings) {
  const currentWeek = getWeekStart(new Date());
  let weeklyWorkedMinutes = 0;
  let weeklyPendingOvertimeMinutes = 0;
  let weeklyApprovedOvertimeMinutes = 0;

  for (const entry of entries) {
    if (entry.weekStart !== currentWeek) continue;
    const effectiveDuration =
      entry.clockOutAt && entry.durationMinutes !== null
        ? entry.durationMinutes
        : entry.clockOutAt
          ? minutesBetween(entry.clockInAt, entry.clockOutAt)
          : minutesBetween(entry.clockInAt, new Date().toISOString());
    weeklyWorkedMinutes += effectiveDuration;
    const overtimeMinutes = entry.overtimeMinutes ?? 0;
    if (entry.overtimeStatus === "PENDING") weeklyPendingOvertimeMinutes += overtimeMinutes;
    if (entry.overtimeStatus === "APPROVED") weeklyApprovedOvertimeMinutes += overtimeMinutes;
  }

  const weeklyRemainingMinutes =
    settings.maxWeeklyHours !== null ? Math.max(0, Math.round(settings.maxWeeklyHours * 60) - weeklyWorkedMinutes) : null;

  return {
    weeklyWorkedMinutes,
    weeklyPendingOvertimeMinutes,
    weeklyApprovedOvertimeMinutes,
    weeklyRemainingMinutes,
  };
}

function buildWorkforceUser(user: AuthAdminUser & { id: string }): WorkforceUser {
  const email = normalizeEmail(user.email);
  const metadata = asObjectRecord(user.user_metadata) ?? {};
  const settings = parseTimeClockSettings(metadata);
  const entries = parseTimeClockEntries(metadata);
  const currentEntry = entries.find((entry) => !entry.clockOutAt) ?? null;
  const summary = computeWeeklySummary(entries, settings);

  return {
    id: user.id,
    email: email || null,
    name: pickDisplayName(user, email),
    role: parseRole(metadata.role),
    lastSignInAt: typeof user.last_sign_in_at === "string" ? user.last_sign_in_at : null,
    createdAt: typeof user.created_at === "string" ? user.created_at : null,
    settings,
    currentEntry,
    entries,
    ...summary,
  };
}

async function updateWorkforceUser(
  userId: string,
  updater: (current: WorkforceUser, metadata: Record<string, unknown>) => { settings?: TimeClockSettings; entries?: TimeClockEntry[] },
) {
  const user = await getAuthAdminUserById(userId);
  if (!user) throw new Error("User not found.");

  const metadata = { ...(asObjectRecord(user.user_metadata) ?? {}) };
  const current = buildWorkforceUser(user);
  const next = updater(current, metadata);
  const nextSettings = next.settings ?? current.settings;
  const nextEntries = next.entries ?? current.entries;
  metadata.timeClock = buildTimeClockMetadata(nextSettings, nextEntries);
  await saveAuthUserMetadata(userId, metadata);
  return buildWorkforceUser({ ...user, user_metadata: metadata });
}

export async function getUserDisplayName(userId: string, email?: string | null) {
  const user = await getAuthAdminUserById(userId).catch(() => null);
  if (user) {
    return pickDisplayName(user, email);
  }
  const normalizedEmail = normalizeEmail(email);
  return normalizedEmail ? prettyNameFromEmail(normalizedEmail) : "Current User";
}

export async function getWorkforceUser(userId: string) {
  const user = await getAuthAdminUserById(userId);
  if (!user) throw new Error("User not found.");
  return buildWorkforceUser(user);
}

export async function listWorkforceUsers() {
  const users = await listAuthAdminUsersRaw();
  return users.map(buildWorkforceUser).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveWorkforceSettings(
  userId: string,
  settings: {
    payType: PayType;
    hourlyRate: number | null;
    maxWeeklyHours: number | null;
    requireOvertimeApproval: boolean;
  },
) {
  return updateWorkforceUser(userId, () => ({
    settings: {
      payType: settings.payType,
      hourlyRate: settings.hourlyRate !== null && settings.hourlyRate >= 0 ? settings.hourlyRate : null,
      maxWeeklyHours: settings.maxWeeklyHours !== null && settings.maxWeeklyHours >= 0 ? settings.maxWeeklyHours : null,
      requireOvertimeApproval: settings.requireOvertimeApproval,
    },
  }));
}

export async function clockInWorkforceUser(userId: string) {
  return updateWorkforceUser(userId, (current) => {
    if (current.settings.payType !== "HOURLY") {
      throw new Error("Hourly tracking is not enabled for this employee.");
    }
    if (current.currentEntry) {
      throw new Error("Employee is already clocked in.");
    }

    const now = new Date();
    const entry: TimeClockEntry = {
      id: crypto.randomUUID(),
      weekStart: getWeekStart(now),
      clockInAt: now.toISOString(),
      clockOutAt: null,
      durationMinutes: null,
      regularMinutes: null,
      overtimeMinutes: null,
      overtimeStatus: "NONE",
      approvedByUserId: null,
      approvedByName: null,
      approvedAt: null,
    };

    return {
      entries: [entry, ...current.entries],
    };
  });
}

export async function clockOutWorkforceUser(userId: string) {
  return updateWorkforceUser(userId, (current) => {
    const openEntry = current.currentEntry;
    if (!openEntry) {
      throw new Error("Employee is not clocked in.");
    }

    const clockOutAt = new Date().toISOString();
    const durationMinutes = minutesBetween(openEntry.clockInAt, clockOutAt);
    const currentWeekEntries = current.entries.filter((entry) => entry.weekStart === openEntry.weekStart && entry.id !== openEntry.id);
    const previousWorkedMinutes = currentWeekEntries.reduce((total, entry) => total + (entry.durationMinutes ?? 0), 0);

    let regularMinutes = durationMinutes;
    let overtimeMinutes = 0;
    let overtimeStatus: OvertimeStatus = "NONE";
    const maxWeeklyMinutes = current.settings.maxWeeklyHours !== null ? Math.round(current.settings.maxWeeklyHours * 60) : null;

    if (maxWeeklyMinutes !== null) {
      const overtimeBefore = Math.max(0, previousWorkedMinutes - maxWeeklyMinutes);
      const overtimeAfter = Math.max(0, previousWorkedMinutes + durationMinutes - maxWeeklyMinutes);
      overtimeMinutes = Math.max(0, overtimeAfter - overtimeBefore);
      regularMinutes = Math.max(0, durationMinutes - overtimeMinutes);
      if (overtimeMinutes > 0) {
        overtimeStatus = current.settings.requireOvertimeApproval ? "PENDING" : "APPROVED";
      }
    }

    return {
      entries: current.entries.map((entry) =>
        entry.id === openEntry.id
          ? {
              ...entry,
              clockOutAt,
              durationMinutes,
              regularMinutes,
              overtimeMinutes,
              overtimeStatus,
            }
          : entry,
      ),
    };
  });
}

export async function reviewWorkforceOvertime(params: {
  employeeUserId: string;
  entryId: string;
  approved: boolean;
  managerUserId: string;
  managerName: string;
}) {
  return updateWorkforceUser(params.employeeUserId, (current) => {
    const target = current.entries.find((entry) => entry.id === params.entryId);
    if (!target) throw new Error("Overtime entry not found.");
    if (target.overtimeStatus !== "PENDING") {
      throw new Error("This overtime entry is no longer pending approval.");
    }

    return {
      entries: current.entries.map((entry) =>
        entry.id === params.entryId
          ? {
              ...entry,
              overtimeStatus: params.approved ? "APPROVED" : "REJECTED",
              approvedByUserId: params.managerUserId,
              approvedByName: params.managerName,
              approvedAt: new Date().toISOString(),
            }
          : entry,
      ),
    };
  });
}
