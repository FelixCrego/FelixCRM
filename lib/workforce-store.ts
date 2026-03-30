import { prettyNameFromEmail } from "@/lib/store";
import type { UserRole } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_TIME_CLOCK_ENTRIES = 180;
const MAX_TIME_EDIT_REQUESTS = 80;

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

export type PayType = "COMMISSION" | "HOURLY" | "HOURLY_PLUS_COMMISSION";
export type OvertimeStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";
export type TimeEditRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type TimeEditRequestType = "ADD_SHIFT" | "EDIT_SHIFT";

export type TimeClockSettings = {
  payType: PayType;
  hourlyRate: number | null;
  commissionRate: number | null;
  maxWeeklyHours: number | null;
  requireOvertimeApproval: boolean;
  managerUserId: string | null;
  teamLeadUserId: string | null;
  managerOverrideRate: number | null;
  teamLeadOverrideRate: number | null;
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

export type TimeClockEditRequest = {
  id: string;
  requestType: TimeEditRequestType;
  targetEntryId: string | null;
  requestedClockInAt: string;
  requestedClockOutAt: string;
  note: string | null;
  status: TimeEditRequestStatus;
  submittedAt: string;
  submittedByUserId: string;
  submittedByName: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
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
  editRequests: TimeClockEditRequest[];
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

function trimEditRequests(requests: TimeClockEditRequest[]) {
  return [...requests]
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .slice(0, MAX_TIME_EDIT_REQUESTS);
}

function nonNegativeNumberOrNull(value: number | null) {
  return value !== null && value >= 0 ? value : null;
}

function parseOptionalId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseTimeClockSettings(metadata: Record<string, unknown>): TimeClockSettings {
  const container = asObjectRecord(metadata.timeClock) ?? {};
  const settings = asObjectRecord(container.settings) ?? {};
  const hourlyRate = parseNumber(settings.hourlyRate);
  const commissionRate = parseNumber(metadata.commissionRate);
  const maxWeeklyHours = parseNumber(settings.maxWeeklyHours);
  const managerOverrideRate = parseNumber(settings.managerOverrideRate);
  const teamLeadOverrideRate = parseNumber(settings.teamLeadOverrideRate);
  const payType =
    settings.payType === "HOURLY" || settings.payType === "HOURLY_PLUS_COMMISSION"
      ? settings.payType
      : "COMMISSION";

  return {
    payType,
    hourlyRate: nonNegativeNumberOrNull(hourlyRate),
    commissionRate: nonNegativeNumberOrNull(commissionRate),
    maxWeeklyHours: nonNegativeNumberOrNull(maxWeeklyHours),
    requireOvertimeApproval: parseBoolean(settings.requireOvertimeApproval, true),
    managerUserId: parseOptionalId(settings.managerUserId),
    teamLeadUserId: parseOptionalId(settings.teamLeadUserId),
    managerOverrideRate: nonNegativeNumberOrNull(managerOverrideRate),
    teamLeadOverrideRate: nonNegativeNumberOrNull(teamLeadOverrideRate),
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

function parseTimeClockEditRequests(metadata: Record<string, unknown>) {
  const container = asObjectRecord(metadata.timeClock) ?? {};
  const rawRequests = Array.isArray(container.editRequests) ? container.editRequests : [];
  const requests = rawRequests
    .map((raw) => {
      const request = asObjectRecord(raw);
      if (
        !request ||
        typeof request.id !== "string" ||
        typeof request.requestedClockInAt !== "string" ||
        typeof request.requestedClockOutAt !== "string" ||
        typeof request.submittedAt !== "string" ||
        typeof request.submittedByUserId !== "string" ||
        typeof request.submittedByName !== "string"
      ) {
        return null;
      }

      const status =
        request.status === "APPROVED" || request.status === "REJECTED"
          ? request.status
          : "PENDING";
      const requestType = request.requestType === "EDIT_SHIFT" ? "EDIT_SHIFT" : "ADD_SHIFT";

      return {
        id: request.id,
        requestType,
        targetEntryId: parseOptionalId(request.targetEntryId),
        requestedClockInAt: request.requestedClockInAt,
        requestedClockOutAt: request.requestedClockOutAt,
        note: typeof request.note === "string" && request.note.trim() ? request.note.trim() : null,
        status,
        submittedAt: request.submittedAt,
        submittedByUserId: request.submittedByUserId,
        submittedByName: request.submittedByName,
        reviewedAt: typeof request.reviewedAt === "string" && request.reviewedAt ? request.reviewedAt : null,
        reviewedByUserId: typeof request.reviewedByUserId === "string" && request.reviewedByUserId ? request.reviewedByUserId : null,
        reviewedByName: typeof request.reviewedByName === "string" && request.reviewedByName ? request.reviewedByName : null,
      } satisfies TimeClockEditRequest;
    })
    .filter((request): request is TimeClockEditRequest => Boolean(request));

  return trimEditRequests(requests);
}

function buildTimeClockMetadata(settings: TimeClockSettings, entries: TimeClockEntry[], editRequests: TimeClockEditRequest[]) {
  return {
    settings: {
      payType: settings.payType,
      hourlyRate: settings.hourlyRate,
      maxWeeklyHours: settings.maxWeeklyHours,
      requireOvertimeApproval: settings.requireOvertimeApproval,
      managerUserId: settings.managerUserId,
      teamLeadUserId: settings.teamLeadUserId,
      managerOverrideRate: settings.managerOverrideRate,
      teamLeadOverrideRate: settings.teamLeadOverrideRate,
    },
    entries: trimEntries(entries),
    editRequests: trimEditRequests(editRequests),
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

function clearEntryApproval(entry: TimeClockEntry): TimeClockEntry {
  return {
    ...entry,
    approvedByUserId: null,
    approvedByName: null,
    approvedAt: null,
  };
}

function recalculateEntries(entries: TimeClockEntry[], settings: TimeClockSettings) {
  const byWeek = new Map<string, TimeClockEntry[]>();
  for (const entry of entries) {
    const weekStart = getWeekStart(new Date(entry.clockInAt));
    const bucket = byWeek.get(weekStart) ?? [];
    bucket.push({ ...entry, weekStart });
    byWeek.set(weekStart, bucket);
  }

  const recalculated: TimeClockEntry[] = [];
  for (const [weekStart, weekEntries] of byWeek) {
    const maxWeeklyMinutes = settings.maxWeeklyHours !== null ? Math.round(settings.maxWeeklyHours * 60) : null;
    let cumulativeMinutes = 0;
    const sortedEntries = [...weekEntries].sort((a, b) => new Date(a.clockInAt).getTime() - new Date(b.clockInAt).getTime());

    for (const entry of sortedEntries) {
      if (!entry.clockOutAt) {
        recalculated.push({
          ...clearEntryApproval(entry),
          weekStart,
          durationMinutes: null,
          regularMinutes: null,
          overtimeMinutes: null,
          overtimeStatus: "NONE",
        });
        continue;
      }

      const durationMinutes = minutesBetween(entry.clockInAt, entry.clockOutAt);
      let regularMinutes = durationMinutes;
      let overtimeMinutes = 0;

      if (maxWeeklyMinutes !== null) {
        const overtimeBefore = Math.max(0, cumulativeMinutes - maxWeeklyMinutes);
        const overtimeAfter = Math.max(0, cumulativeMinutes + durationMinutes - maxWeeklyMinutes);
        overtimeMinutes = Math.max(0, overtimeAfter - overtimeBefore);
        regularMinutes = Math.max(0, durationMinutes - overtimeMinutes);
      }

      cumulativeMinutes += durationMinutes;

      let overtimeStatus: OvertimeStatus = "NONE";
      if (overtimeMinutes > 0) {
        if (entry.overtimeStatus === "APPROVED" || entry.overtimeStatus === "REJECTED" || entry.overtimeStatus === "PENDING") {
          overtimeStatus = entry.overtimeStatus;
        } else {
          overtimeStatus = settings.requireOvertimeApproval ? "PENDING" : "APPROVED";
        }
      }

      const nextEntry: TimeClockEntry = {
        ...entry,
        weekStart,
        durationMinutes,
        regularMinutes,
        overtimeMinutes,
        overtimeStatus,
      };

      recalculated.push(overtimeStatus === "APPROVED" || overtimeStatus === "REJECTED" ? nextEntry : clearEntryApproval(nextEntry));
    }
  }

  return trimEntries(recalculated);
}

function finalizeApprovedEntry(entries: TimeClockEntry[], entryId: string, approverUserId: string, approverName: string): TimeClockEntry[] {
  const approvedAt = new Date().toISOString();
  return entries.map((entry): TimeClockEntry => {
    if (entry.id !== entryId) return entry;
    if (!entry.clockOutAt || (entry.overtimeMinutes ?? 0) <= 0) {
      return {
        ...clearEntryApproval(entry),
        overtimeStatus: "NONE",
      };
    }
    return {
      ...entry,
      overtimeStatus: "APPROVED",
      approvedByUserId: approverUserId,
      approvedByName: approverName,
      approvedAt,
    };
  });
}

function parseDateTimeInput(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed.toISOString();
}

function validateClosedShift(clockInAt: string, clockOutAt: string) {
  if (new Date(clockOutAt).getTime() <= new Date(clockInAt).getTime()) {
    throw new Error("Clock out time must be after clock in time.");
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
  const entries = recalculateEntries(parseTimeClockEntries(metadata), settings);
  const editRequests = parseTimeClockEditRequests(metadata);
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
    editRequests,
    ...summary,
  };
}

async function updateWorkforceUser(
  userId: string,
  updater: (
    current: WorkforceUser,
    metadata: Record<string, unknown>,
  ) => {
    settings?: TimeClockSettings;
    entries?: TimeClockEntry[];
    editRequests?: TimeClockEditRequest[];
  },
) {
  const user = await getAuthAdminUserById(userId);
  if (!user) throw new Error("User not found.");

  const metadata = { ...(asObjectRecord(user.user_metadata) ?? {}) };
  const current = buildWorkforceUser(user);
  const next = updater(current, metadata);
  const nextSettings = next.settings ?? current.settings;
  const nextEntries = recalculateEntries(next.entries ?? current.entries, nextSettings);
  const nextEditRequests = trimEditRequests(next.editRequests ?? current.editRequests);
  metadata.timeClock = buildTimeClockMetadata(nextSettings, nextEntries, nextEditRequests);
  if (nextSettings.commissionRate === null) {
    delete metadata.commissionRate;
  } else {
    metadata.commissionRate = nextSettings.commissionRate;
  }
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
    commissionRate: number | null;
    maxWeeklyHours: number | null;
    requireOvertimeApproval: boolean;
    managerUserId?: string | null;
    teamLeadUserId?: string | null;
    managerOverrideRate?: number | null;
    teamLeadOverrideRate?: number | null;
  },
) {
  return updateWorkforceUser(userId, (current) => ({
    settings: {
      payType: settings.payType,
      hourlyRate: settings.hourlyRate !== null && settings.hourlyRate >= 0 ? settings.hourlyRate : null,
      commissionRate: settings.commissionRate !== null && settings.commissionRate >= 0 ? settings.commissionRate : null,
      maxWeeklyHours: settings.maxWeeklyHours !== null && settings.maxWeeklyHours >= 0 ? settings.maxWeeklyHours : null,
      requireOvertimeApproval: settings.requireOvertimeApproval,
      managerUserId: settings.managerUserId !== undefined ? parseOptionalId(settings.managerUserId) : current.settings.managerUserId,
      teamLeadUserId: settings.teamLeadUserId !== undefined ? parseOptionalId(settings.teamLeadUserId) : current.settings.teamLeadUserId,
      managerOverrideRate:
        settings.managerOverrideRate !== undefined
          ? settings.managerOverrideRate !== null && settings.managerOverrideRate >= 0
            ? settings.managerOverrideRate
            : null
          : current.settings.managerOverrideRate,
      teamLeadOverrideRate:
        settings.teamLeadOverrideRate !== undefined
          ? settings.teamLeadOverrideRate !== null && settings.teamLeadOverrideRate >= 0
            ? settings.teamLeadOverrideRate
            : null
          : current.settings.teamLeadOverrideRate,
    },
  }));
}

export async function clockInWorkforceUser(userId: string) {
  return updateWorkforceUser(userId, (current) => {
    if (current.settings.payType !== "HOURLY" && current.settings.payType !== "HOURLY_PLUS_COMMISSION") {
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
    validateClosedShift(openEntry.clockInAt, clockOutAt);

    return {
      entries: current.entries.map((entry) =>
        entry.id === openEntry.id
          ? {
              ...entry,
              clockOutAt,
            }
          : entry,
      ),
    };
  });
}

export async function saveTimeClockEntry(params: {
  employeeUserId: string;
  entryId?: string | null;
  clockInAt: string;
  clockOutAt?: string | null;
  managerUserId: string;
  managerName: string;
}) {
  const normalizedClockInAt = parseDateTimeInput(params.clockInAt, "Clock in");

  return updateWorkforceUser(params.employeeUserId, (current) => {
    const targetEntryId = params.entryId && params.entryId.trim() ? params.entryId.trim() : null;
    const targetEntry = targetEntryId ? current.entries.find((entry) => entry.id === targetEntryId) ?? null : null;
    if (targetEntryId && !targetEntry) {
      throw new Error("Time entry not found.");
    }

    const normalizedClockOutAt =
      typeof params.clockOutAt === "string" && params.clockOutAt.trim()
        ? parseDateTimeInput(params.clockOutAt, "Clock out")
        : targetEntry?.clockOutAt ?? null;

    if (!targetEntryId && !normalizedClockOutAt) {
      throw new Error("Clock out time is required when adding a new manual shift.");
    }
    if (normalizedClockOutAt) {
      validateClosedShift(normalizedClockInAt, normalizedClockOutAt);
    }

    const baseEntry: TimeClockEntry = {
      id: targetEntryId ?? crypto.randomUUID(),
      weekStart: getWeekStart(new Date(normalizedClockInAt)),
      clockInAt: normalizedClockInAt,
      clockOutAt: normalizedClockOutAt,
      durationMinutes: null,
      regularMinutes: null,
      overtimeMinutes: null,
      overtimeStatus: normalizedClockOutAt ? "APPROVED" : "NONE",
      approvedByUserId: normalizedClockOutAt ? params.managerUserId : null,
      approvedByName: normalizedClockOutAt ? params.managerName : null,
      approvedAt: normalizedClockOutAt ? new Date().toISOString() : null,
    };

    const entries = targetEntryId
      ? current.entries.map((entry) => (entry.id === targetEntryId ? baseEntry : entry))
      : [baseEntry, ...current.entries];

    const recalculatedEntries = recalculateEntries(entries, current.settings);

    return {
      entries: normalizedClockOutAt
        ? finalizeApprovedEntry(recalculatedEntries, baseEntry.id, params.managerUserId, params.managerName)
        : recalculatedEntries,
    };
  });
}

export async function submitTimeClockEditRequest(params: {
  employeeUserId: string;
  targetEntryId?: string | null;
  requestedClockInAt: string;
  requestedClockOutAt: string;
  note?: string | null;
  submittedByUserId: string;
  submittedByName: string;
}) {
  const requestedClockInAt = parseDateTimeInput(params.requestedClockInAt, "Clock in");
  const requestedClockOutAt = parseDateTimeInput(params.requestedClockOutAt, "Clock out");
  validateClosedShift(requestedClockInAt, requestedClockOutAt);

  return updateWorkforceUser(params.employeeUserId, (current) => {
    const targetEntryId = params.targetEntryId && params.targetEntryId.trim() ? params.targetEntryId.trim() : null;
    if (targetEntryId && !current.entries.some((entry) => entry.id === targetEntryId)) {
      throw new Error("The shift you are trying to edit no longer exists.");
    }

    const nextRequest: TimeClockEditRequest = {
      id: crypto.randomUUID(),
      requestType: targetEntryId ? "EDIT_SHIFT" : "ADD_SHIFT",
      targetEntryId,
      requestedClockInAt,
      requestedClockOutAt,
      note: typeof params.note === "string" && params.note.trim() ? params.note.trim() : null,
      status: "PENDING",
      submittedAt: new Date().toISOString(),
      submittedByUserId: params.submittedByUserId,
      submittedByName: params.submittedByName,
      reviewedAt: null,
      reviewedByUserId: null,
      reviewedByName: null,
    };

    return {
      editRequests: [nextRequest, ...current.editRequests],
    };
  });
}

export async function reviewTimeClockEditRequest(params: {
  employeeUserId: string;
  requestId: string;
  approved: boolean;
  managerUserId: string;
  managerName: string;
}) {
  return updateWorkforceUser(params.employeeUserId, (current) => {
    const targetRequest = current.editRequests.find((request) => request.id === params.requestId);
    if (!targetRequest) throw new Error("Time edit request not found.");
    if (targetRequest.status !== "PENDING") {
      throw new Error("This time edit request is no longer pending.");
    }

    let nextEntries = current.entries;
    if (params.approved) {
      const targetEntryId =
        targetRequest.requestType === "EDIT_SHIFT" && targetRequest.targetEntryId ? targetRequest.targetEntryId : crypto.randomUUID();

      const baseEntry: TimeClockEntry = {
        id: targetEntryId,
        weekStart: getWeekStart(new Date(targetRequest.requestedClockInAt)),
        clockInAt: targetRequest.requestedClockInAt,
        clockOutAt: targetRequest.requestedClockOutAt,
        durationMinutes: null,
        regularMinutes: null,
        overtimeMinutes: null,
        overtimeStatus: "APPROVED",
        approvedByUserId: params.managerUserId,
        approvedByName: params.managerName,
        approvedAt: new Date().toISOString(),
      };

      if (targetRequest.requestType === "EDIT_SHIFT") {
        if (!current.entries.some((entry) => entry.id === targetEntryId)) {
          throw new Error("The shift attached to this request no longer exists.");
        }
        nextEntries = current.entries.map((entry) => (entry.id === targetEntryId ? baseEntry : entry));
      } else {
        nextEntries = [baseEntry, ...current.entries];
      }

      nextEntries = finalizeApprovedEntry(recalculateEntries(nextEntries, current.settings), targetEntryId, params.managerUserId, params.managerName);
    }

    return {
      entries: nextEntries,
      editRequests: current.editRequests.map((request) =>
        request.id === params.requestId
          ? {
              ...request,
              status: params.approved ? "APPROVED" : "REJECTED",
              reviewedAt: new Date().toISOString(),
              reviewedByUserId: params.managerUserId,
              reviewedByName: params.managerName,
            }
          : request,
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
