import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  SALES_DASHBOARD_DERIVED_TARGETS,
  SALES_DASHBOARD_TARGETS,
  SALES_DASHBOARD_TARGETS_BY_HOUR,
  SALES_DASHBOARD_WORKDAY_HOURS,
} from "@/lib/dashboard-targets";
import { MANAGER_CALL_REVIEW_CHANNEL } from "@/lib/lead-note-channels";
import { listLeadNotesWithMetadata } from "@/lib/lead-note-metadata";
import { resolveLeadWorkspaceStatus } from "@/lib/lead-workspace-status";
import { canUserViewAllLeads, getEffectiveUserRole, getReviewedDashboardNotificationIds, listLeads } from "@/lib/store";
import type { Lead } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DASHBOARD_TIME_ZONE = "America/New_York";
const DEMOS_TABLE_CANDIDATES = ["demos"];

const USERS_TABLE_CANDIDATES = ["User", "user", "users"];
const CALLS_TABLE_CANDIDATES = ["call_analytics"];

type UserRow = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

type AuthAdminUser = {
  id?: string | null;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type CallAnalyticsRow = {
  contact_id?: string | null;
  lead_id?: string | null;
  duration_seconds?: number | null;
  overall_sentiment?: string | null;
  recording_url?: string | null;
  recording_s3_uri?: string | null;
  analysis_s3_uri?: string | null;
  transcript_text?: string | null;
  agent_talk_time_pct?: number | null;
  customer_talk_time_pct?: number | null;
  interruptions?: number | null;
  created_at?: string | null;
  raw_payload?: unknown;
};

type DashboardRangeKey = "today" | "3d" | "7d" | "30d";

type DashboardWindowMetrics = {
  key: DashboardRangeKey;
  label: string;
  shortLabel: string;
  days: number;
  isToday: boolean;
  startDate: string;
  endDate: string;
  dials: number;
  conversations: number;
  demos: number;
  closes: number;
  revenue: number;
  talkMinutes: number;
  score: number;
  callsPerHour: number;
  contactRate: number;
  demoConversionRate: number;
  dialsPerDay: number;
  conversationsPerDay: number;
  demosPerDay: number;
  closesPerDay: number;
  talkMinutesPerDay: number;
  revenuePerDay: number;
  expectedDials: number;
  expectedDemos: number;
  dialGap: number;
  dialsStatus: DashboardPerformanceStatus;
  contactRateStatus: DashboardPerformanceStatus;
  demosStatus: DashboardPerformanceStatus;
  demoConversionStatus: DashboardPerformanceStatus;
  overallStatus: DashboardPerformanceStatus;
};

type DashboardLeaderboardRow = {
  userId: string;
  userName: string;
  claimedLeads: number;
  dialsToday: number;
  callsPerHourToday: number;
  conversationsToday: number;
  contactRateToday: number;
  demosToday: number;
  demoConversionRateToday: number;
  expectedDialsByNow: number;
  dialGapToday: number;
  talkMinutesToday: number;
  demosThisWeek: number;
  closesThisMonth: number;
  revenueThisMonth: number;
  scoreToday: number;
  streakDays: number;
  overallStatus: DashboardPerformanceStatus;
  needsAttentionReason: string;
  selectedWindow: DashboardWindowMetrics;
  dailyAverages: DashboardWindowMetrics[];
};

type DashboardPerformanceStatus = "on_track" | "at_risk" | "off_track";

type DemoRow = {
  id: string;
  lead_id?: string | null;
  lead_name?: string | null;
  selected_date?: string | null;
  selected_time?: string | null;
  rep_id?: string | null;
  rep_email?: string | null;
  created_at?: string | null;
};

type DashboardNotification = {
  id: string;
  title: string;
  detail: string;
  tone: "blue" | "emerald" | "amber" | "rose";
  href: string;
  createdAt: string;
};

type UpcomingDemoScheduleEntry = {
  leadId?: string | null;
  leadName: string;
  scheduledAt: Date;
  repId?: string | null;
  repEmail?: string | null;
};

type AttributedDemoRecord = {
  key: string;
  leadId?: string | null;
  leadName: string;
  date?: string | null;
  time?: string | null;
  scheduledAt: Date | null;
  bookedAt: Date | null;
  repId?: string | null;
  repEmail?: string | null;
};

type DashboardRepCallDrilldown = {
  userId: string;
  userName: string;
  totalCalls: number;
  callsToday: number;
  connectedToday: number;
  recordedCalls: number;
  recordedCallsToday: number;
  bookedDemoCalls: number;
  bookedDemoCallsToday: number;
  talkMinutesToday: number;
  selectedWindow: DashboardWindowMetrics;
  dailyAverages: DashboardWindowMetrics[];
  recentCalls: Array<{
    contactId: string;
    leadId: string;
    leadName: string;
    leadStatus: string;
    callAt: string;
    durationSeconds: number;
    countsAsContact: boolean;
    sentimentLabel: string;
    hasRecording: boolean;
    hasAnalysis: boolean;
    hasBookedDemo: boolean;
    isOwnedLead: boolean;
  }>;
};

type DashboardRangeContext = {
  key: DashboardRangeKey;
  label: string;
  shortLabel: string;
  days: number;
  isToday: boolean;
  startDayStamp: number;
  endDayStamp: number;
  startDate: string;
  endDate: string;
};

const DASHBOARD_RANGE_OPTIONS: Record<DashboardRangeKey, { days: number; label: string; shortLabel: string }> = {
  today: { days: 1, label: "Today", shortLabel: "Today" },
  "3d": { days: 3, label: "Last 3 Days", shortLabel: "3D Avg" },
  "7d": { days: 7, label: "Last 7 Days", shortLabel: "7D Avg" },
  "30d": { days: 30, label: "Last 30 Days", shortLabel: "30D Avg" },
};

const DASHBOARD_DAILY_AVERAGE_RANGES: DashboardRangeKey[] = ["3d", "7d", "30d"];

function getHeaders() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase configuration for dashboard metrics.");
  }

  return {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function buildUrl(table: string, query?: Record<string, string>) {
  if (!supabaseUrl) {
    throw new Error("Missing Supabase URL.");
  }

  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function requestFirstWorkingTable<T>(candidates: string[], query?: Record<string, string>) {
  let lastError: unknown = null;

  for (const table of candidates) {
    const response = await fetch(buildUrl(table, query), {
      headers: getHeaders(),
      cache: "no-store",
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const text = await response.text();
    if (response.status === 404 || text.includes("schema cache") || text.includes("Could not find the table")) {
      lastError = new Error(text);
      continue;
    }

    throw new Error(text || `Dashboard metrics query failed for ${table}.`);
  }

  throw lastError ?? new Error("Unable to resolve Supabase table.");
}

async function requestOptionalTable<T>(candidates: string[], query?: Record<string, string>) {
  for (const table of candidates) {
    const response = await fetch(buildUrl(table, query), {
      headers: getHeaders(),
      cache: "no-store",
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const text = await response.text();
    if (response.status === 404 || text.includes("schema cache") || text.includes("Could not find the table")) {
      continue;
    }

    throw new Error(text || `Dashboard metrics query failed for ${table}.`);
  }

  return [] as T;
}

function isSchemaCacheColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Could not find the") && message.includes("column") && message.includes("schema cache");
}

function getMissingColumnName(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

async function listUsersById() {
  const rows = await requestFirstWorkingTable<UserRow[]>(USERS_TABLE_CANDIDATES, {
    select: "id,name,email",
  });

  const users = new Map<string, string>();
  for (const row of rows) {
    if (typeof row.id !== "string" || !row.id) continue;
    const name = [row.name, row.email].find((value) => typeof value === "string" && value.trim().length > 0);
    users.set(row.id, typeof name === "string" ? name : row.id);
  }
  return users;
}

function titleCaseWords(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function prettyNameFromEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized === "felix@felixcrego.com") return "Felix Crego";
  const localPart = normalized.split("@")[0] ?? normalized;
  return titleCaseWords(localPart.replace(/\d+/g, " ").trim() || localPart);
}

async function listAuthUsersById() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return {
      namesById: new Map<string, string>(),
      emailsById: new Map<string, string>(),
    };
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: getHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to fetch auth users for dashboard.");
  }

  const payload = (await response.json()) as { users?: AuthAdminUser[] };
  const users = new Map<string, string>();
  const emails = new Map<string, string>();
  for (const user of payload.users ?? []) {
    if (typeof user.id !== "string" || !user.id) continue;
    const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
    const nameCandidate = typeof metadata.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : typeof metadata.full_name === "string" && metadata.full_name.trim()
        ? metadata.full_name.trim()
        : typeof user.email === "string" && user.email.trim()
          ? prettyNameFromEmail(user.email)
          : user.id;
    users.set(user.id, nameCandidate);
    if (typeof user.email === "string" && user.email.trim()) {
      emails.set(user.id, user.email.trim().toLowerCase());
    }
  }
  return {
    namesById: users,
    emailsById: emails,
  };
}

function normalizeEmail(value?: string | null) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseCallRawPayload(rawPayload: unknown) {
  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    return rawPayload as Record<string, unknown>;
  }

  if (typeof rawPayload === "string" && rawPayload.trim()) {
    try {
      const parsed = JSON.parse(rawPayload) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

function getCallAttributedUserId(call: CallAnalyticsRow, leadsById: Map<string, Lead>) {
  const rawPayload = parseCallRawPayload(call.raw_payload);
  const snapshotRepId =
    (typeof rawPayload?.rep_id === "string" && rawPayload.rep_id.trim() ? rawPayload.rep_id.trim() : null) ??
    (typeof rawPayload?.repId === "string" && rawPayload.repId.trim() ? rawPayload.repId.trim() : null) ??
    (typeof rawPayload?.linked_by_user_id === "string" && rawPayload.linked_by_user_id.trim()
      ? rawPayload.linked_by_user_id.trim()
      : null);

  if (snapshotRepId) return snapshotRepId;

  if (typeof call.lead_id !== "string" || !call.lead_id) return null;
  const lead = leadsById.get(call.lead_id);
  return typeof lead?.ownerId === "string" && lead.ownerId ? lead.ownerId : null;
}

async function listRecentCalls(limit = 1500) {
  const requiredColumns = ["contact_id", "lead_id", "created_at"];
  const optionalColumns = [
    "duration_seconds",
    "overall_sentiment",
    "recording_url",
    "recording_s3_uri",
    "analysis_s3_uri",
    "transcript_text",
    "agent_talk_time_pct",
    "customer_talk_time_pct",
    "interruptions",
    "raw_payload",
  ];
  let selectedColumns = [...requiredColumns, ...optionalColumns];

  while (selectedColumns.length >= requiredColumns.length) {
    try {
      const rows = await requestFirstWorkingTable<CallAnalyticsRow[]>(CALLS_TABLE_CANDIDATES, {
        select: selectedColumns.join(","),
        order: "created_at.desc",
        limit: String(limit),
      });

      return rows.filter((row) => typeof row.lead_id === "string" && row.lead_id);
    } catch (error) {
      const missingColumn = getMissingColumnName(error);
      if (!isSchemaCacheColumnError(error) || !missingColumn || !optionalColumns.includes(missingColumn)) {
        throw error;
      }

      selectedColumns = selectedColumns.filter((column) => column !== missingColumn);
    }
  }

  return [];
}

async function listDemoRows(params: { includeAll: boolean; userId: string; userEmail?: string | null }) {
  const requiredColumns = ["id", "lead_id", "lead_name", "selected_date", "selected_time", "rep_id"];
  const optionalColumns = ["rep_email", "created_at"];

  async function requestDemoRows(filter?: Record<string, string>) {
    let selectedColumns = [...requiredColumns, ...optionalColumns];

    while (selectedColumns.length >= requiredColumns.length) {
      try {
        return await requestOptionalTable<DemoRow[]>(DEMOS_TABLE_CANDIDATES, {
          select: selectedColumns.join(","),
          order: "selected_date.asc,selected_time.asc",
          limit: "500",
          ...(filter ?? {}),
        });
      } catch (error) {
        const missingColumn = getMissingColumnName(error);
        if (!isSchemaCacheColumnError(error) || !missingColumn || !optionalColumns.includes(missingColumn)) {
          throw error;
        }

        selectedColumns = selectedColumns.filter((column) => column !== missingColumn);
      }
    }

    return [] as DemoRow[];
  }

  if (params.includeAll) {
    return requestDemoRows();
  }

  const [byUserId, byEmail] = await Promise.all([
    requestDemoRows({ rep_id: `eq.${params.userId}` }),
    params.userEmail
      ? requestDemoRows({ rep_email: `eq.${params.userEmail}` }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          return message.includes("rep_email") ? [] as DemoRow[] : Promise.reject(error);
        })
      : Promise.resolve([] as DemoRow[]),
  ]);

  const deduped = new Map<string, DemoRow>();
  for (const demo of [...byUserId, ...byEmail]) {
    deduped.set(demo.id, demo);
  }
  return [...deduped.values()];
}

function getZonedParts(date: Date, timeZone = DASHBOARD_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
  };
}

function getZonedClockParts(date: Date, timeZone = DASHBOARD_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function toDayStamp(year: number, month: number, day: number) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function dayStampToIso(dayStamp: number) {
  return new Date(dayStamp * 86400000).toISOString().slice(0, 10);
}

function getDayStampInTimeZone(date: Date, timeZone = DASHBOARD_TIME_ZONE) {
  const parts = getZonedParts(date, timeZone);
  return toDayStamp(parts.year, parts.month, parts.day);
}

function parseDashboardRangeKey(value?: string | null): DashboardRangeKey {
  if (value && value in DASHBOARD_RANGE_OPTIONS) {
    return value as DashboardRangeKey;
  }
  return "today";
}

function createDashboardRangeContext(now: Date, key: DashboardRangeKey): DashboardRangeContext {
  const option = DASHBOARD_RANGE_OPTIONS[key];
  const endDayStamp = getDayStampInTimeZone(now, DASHBOARD_TIME_ZONE);
  const startDayStamp = endDayStamp - option.days + 1;
  return {
    key,
    label: option.label,
    shortLabel: option.shortLabel,
    days: option.days,
    isToday: key === "today",
    startDayStamp,
    endDayStamp,
    startDate: dayStampToIso(startDayStamp),
    endDate: dayStampToIso(endDayStamp),
  };
}

function isDateInRange(date: Date, range: DashboardRangeContext, timeZone = DASHBOARD_TIME_ZONE) {
  const stamp = getDayStampInTimeZone(date, timeZone);
  return stamp >= range.startDayStamp && stamp <= range.endDayStamp;
}

function isSameDayInTimeZone(date: Date, reference: Date, timeZone = DASHBOARD_TIME_ZONE) {
  return getDayStampInTimeZone(date, timeZone) === getDayStampInTimeZone(reference, timeZone);
}

function getWeekStartStampInTimeZone(date: Date, timeZone = DASHBOARD_TIME_ZONE) {
  const parts = getZonedParts(date, timeZone);
  const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  const normalizedWeekdayIndex = weekdayIndex >= 0 ? weekdayIndex : 0;
  return toDayStamp(parts.year, parts.month, parts.day) - normalizedWeekdayIndex;
}

function isOnOrAfterWeekStartInTimeZone(date: Date, reference: Date, timeZone = DASHBOARD_TIME_ZONE) {
  return getDayStampInTimeZone(date, timeZone) >= getWeekStartStampInTimeZone(reference, timeZone);
}

function isSameMonthInTimeZone(date: Date, reference: Date, timeZone = DASHBOARD_TIME_ZONE) {
  const value = getZonedParts(date, timeZone);
  const ref = getZonedParts(reference, timeZone);
  return value.year === ref.year && value.month === ref.month;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone = DASHBOARD_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const zonedTimestamp = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return zonedTimestamp - date.getTime();
}

function parseDemoTimeParts(value?: string | null) {
  const normalized = value?.trim() ?? "";
  const meridiemMatch = normalized.match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i);
  if (meridiemMatch) {
    const rawHour = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2]);
    const period = meridiemMatch[3].toUpperCase();
    return {
      hours24: rawHour % 12 + (period === "PM" ? 12 : 0),
      minutes,
    };
  }

  const twentyFourHourMatch = normalized.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHourMatch) {
    return {
      hours24: Number(twentyFourHourMatch[1]),
      minutes: Number(twentyFourHourMatch[2]),
    };
  }

  return null;
}

function parseDateParts(value: string) {
  const normalized = value.trim();
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }

  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return {
      year: Number(slashMatch[3]),
      month: Number(slashMatch[1]),
      day: Number(slashMatch[2]),
    };
  }

  const dashMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    return {
      year: Number(dashMatch[3]),
      month: Number(dashMatch[1]),
      day: Number(dashMatch[2]),
    };
  }

  return null;
}

function createDateInTimeZone(
  date: string,
  timeParts: { hours24: number; minutes: number },
  timeZone = DASHBOARD_TIME_ZONE,
) {
  const parts = parseDateParts(date);
  if (!parts) return null;

  const utcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, timeParts.hours24, timeParts.minutes, 0));
  let offsetMilliseconds = getTimeZoneOffsetMilliseconds(utcGuess, timeZone);
  let zonedDate = new Date(utcGuess.getTime() - offsetMilliseconds);
  const resolvedOffsetMilliseconds = getTimeZoneOffsetMilliseconds(zonedDate, timeZone);

  if (resolvedOffsetMilliseconds !== offsetMilliseconds) {
    offsetMilliseconds = resolvedOffsetMilliseconds;
    zonedDate = new Date(utcGuess.getTime() - offsetMilliseconds);
  }

  return Number.isNaN(zonedDate.getTime()) ? null : zonedDate;
}

function parseDemoDate(lead: Lead) {
  const booking = lead.demoBooking;
  if (!booking?.date) return null;
  return createDateInTimeZone(
    booking.date,
    parseDemoTimeParts(booking.time) ?? { hours24: 23, minutes: 59 },
  );
}

function parseDemoRowDate(demo: DemoRow) {
  if (!demo.selected_date) return null;
  return createDateInTimeZone(
    demo.selected_date,
    parseDemoTimeParts(demo.selected_time) ?? { hours24: 23, minutes: 59 },
  );
}

function getDemoBookedAt(demo: { bookedAt: Date | null; scheduledAt: Date | null }) {
  return demo.bookedAt ?? demo.scheduledAt;
}

function isDemoBookedOnOrAfterWeekStart(demo: { bookedAt: Date | null; scheduledAt: Date | null }, now: Date) {
  const bookedAt = getDemoBookedAt(demo);
  return bookedAt ? isOnOrAfterWeekStartInTimeZone(bookedAt, now) : false;
}

function isDemoBookedSameDay(demo: { bookedAt: Date | null; scheduledAt: Date | null }, now: Date) {
  const bookedAt = getDemoBookedAt(demo);
  return bookedAt ? isSameDayInTimeZone(bookedAt, now) : false;
}

function getAttributedDemoKey(parts: {
  leadId?: string | null;
  leadName?: string | null;
  date?: string | null;
  time?: string | null;
  repId?: string | null;
  repEmail?: string | null;
}) {
  const attributionKey = parts.repId || normalizeEmail(parts.repEmail) || "unassigned";
  return `${attributionKey}::${getDemoDedupeKey(parts)}`;
}

function matchesDemoToUser(demo: AttributedDemoRecord, userId: string, userEmail?: string | null) {
  const normalizedUserEmail = normalizeEmail(userEmail);
  return demo.repId === userId || (normalizedUserEmail ? normalizeEmail(demo.repEmail) === normalizedUserEmail : false);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatRelative(date: Date, now: Date) {
  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 60) {
    return diffMinutes >= 0 ? `in ${diffMinutes}m` : `${Math.abs(diffMinutes)}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return diffHours >= 0 ? `in ${diffHours}h` : `${Math.abs(diffHours)}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return diffDays >= 0 ? `in ${diffDays}d` : `${Math.abs(diffDays)}d ago`;
}

function minutesLabel(totalSeconds: number) {
  const minutes = Math.round(totalSeconds / 60);
  return `${minutes} min`;
}

function computeScore(params: { dials: number; conversations: number; demos: number; closes: number }) {
  return params.dials + params.conversations * 4 + params.demos * 12 + params.closes * 30;
}

function getDemoDedupeKey(parts: { leadId?: string | null; leadName?: string | null; date?: string | null; time?: string | null }) {
  return `${parts.leadId || parts.leadName || "unknown"}::${parts.date || ""}::${parts.time || ""}`;
}

function dayKey(date: Date) {
  const parts = getZonedParts(date, DASHBOARD_TIME_ZONE);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function getLeadCloseAttributionUserId(lead: Lead) {
  return typeof lead.soldByUserId === "string" && lead.soldByUserId
    ? lead.soldByUserId
    : typeof lead.ownerId === "string" && lead.ownerId
      ? lead.ownerId
      : null;
}

function computeStreak(
  calls: CallAnalyticsRow[],
  leads: Lead[],
  now: Date,
  ownerId: string,
  leadsById: Map<string, Lead>,
) {
  const scoresByDay = new Map<string, number>();

  for (const call of calls) {
    if (getCallAttributedUserId(call, leadsById) !== ownerId) continue;
    const at = parseDate(call.created_at);
    if (!at) continue;
    const key = dayKey(at);
    scoresByDay.set(key, (scoresByDay.get(key) ?? 0) + computeScore({
      dials: 1,
      conversations: isConnectedCall(call) ? 1 : 0,
      demos: 0,
      closes: 0,
    }));
  }

  for (const lead of leads) {
    if (getLeadCloseAttributionUserId(lead) !== ownerId) continue;
    const bookingAt = parseDate(lead.demoBooking?.bookedAt);
    if (bookingAt) {
      const key = dayKey(bookingAt);
      scoresByDay.set(key, (scoresByDay.get(key) ?? 0) + computeScore({ dials: 0, conversations: 0, demos: 1, closes: 0 }));
    }

    const closedAt = parseDate(lead.closedAt);
    if (closedAt) {
      const key = dayKey(closedAt);
      scoresByDay.set(key, (scoresByDay.get(key) ?? 0) + computeScore({ dials: 0, conversations: 0, demos: 0, closes: 1 }));
    }
  }

  let streak = 0;
  let cursorStamp = getDayStampInTimeZone(now, DASHBOARD_TIME_ZONE);
  while (true) {
    const cursorDate = new Date(cursorStamp * 86400000);
    const key = dayKey(cursorDate);
    if ((scoresByDay.get(key) ?? 0) <= 0) break;
    streak += 1;
    cursorStamp -= 1;
  }

  return streak;
}

function getLeadStatusLabel(lead: Lead, now: Date) {
  const demoAt = parseDemoDate(lead);
  const workspaceStatus = resolveLeadWorkspaceStatus(lead);
  if (demoAt && demoAt.getTime() >= now.getTime()) {
    return `Demo ${formatRelative(demoAt, now)}`;
  }
  if (lead.closedAt) return "Closed won";
  if (lead.siteStatus === "LIVE" || lead.deployedUrl) return "Site live - follow up";
  if (lead.siteStatus === "BUILDING") return "Site deploying";
  if (lead.siteStatus === "FAILED") return "Deploy failed - recover";
  if (workspaceStatus === "PAYMENT_PENDING") return "Payment pending";
  if (workspaceStatus === "AWAITING_APPROVAL") return "Awaiting approval";
  if (workspaceStatus === "DEMO_BOOKED") return "Demo booked";
  if (workspaceStatus === "CONTACTED") return "Needs next touch";
  if (workspaceStatus === "ATTEMPTED") return "Attempted outreach";
  return "Fresh lead";
}

function scoreLeadPriority(lead: Lead, now: Date) {
  const demoAt = parseDemoDate(lead);
  const updatedAt = parseDate(lead.updatedAt);
  const workspaceStatus = resolveLeadWorkspaceStatus(lead);
  let score = 0;

  if (workspaceStatus === "CLOSED" || workspaceStatus === "DISQUALIFIED") return -1;
  if (demoAt && demoAt.getTime() >= now.getTime()) score += demoAt.getTime() - now.getTime() <= 86400000 ? 40 : 28;
  if (lead.siteStatus === "FAILED") score += 30;
  if (lead.siteStatus === "BUILDING") score += 22;
  if (lead.siteStatus === "LIVE" || lead.deployedUrl) score += 16;
  if (workspaceStatus === "PAYMENT_PENDING") score += 26;
  if (workspaceStatus === "AWAITING_APPROVAL") score += 22;
  if (workspaceStatus === "DEMO_BOOKED") score += 18;
  if (workspaceStatus === "CONTACTED") score += 12;
  if (workspaceStatus === "ATTEMPTED") score += 8;
  if (lead.phone) score += 2;
  if (lead.email) score += 2;
  if (updatedAt && now.getTime() - updatedAt.getTime() <= 2 * 86400000) score += 5;

  return score;
}

function normalizeSentiment(value?: string | null) {
  if (!value) return "No sentiment yet";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function getCallDurationSeconds(call: Pick<CallAnalyticsRow, "duration_seconds">) {
  return typeof call.duration_seconds === "number" && Number.isFinite(call.duration_seconds)
    ? Math.max(call.duration_seconds, 0)
    : 0;
}

const NON_CONTACT_DISPOSITIONS = new Set(["no_answer", "left_voicemail", "voicemail", "wrong_number"]);

function normalizeDispositionValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/^disposition:/, "")
    .replace(/[\s-]+/g, "_");
}

function getCallCountsAsContactOverride(call: Pick<CallAnalyticsRow, "raw_payload">) {
  const rawPayload = parseCallRawPayload(call.raw_payload);
  if (!rawPayload) return null;

  if (typeof rawPayload.crm_disposition_counts_as_contact === "boolean") {
    return rawPayload.crm_disposition_counts_as_contact;
  }

  const disposition = normalizeDispositionValue(
    rawPayload.crm_disposition_channel ?? rawPayload.crm_disposition ?? rawPayload.disposition,
  );
  if (!disposition) return null;

  return !NON_CONTACT_DISPOSITIONS.has(disposition);
}

function isConnectedCall(call: CallAnalyticsRow) {
  const countsAsContactOverride = getCallCountsAsContactOverride(call);
  if (countsAsContactOverride !== null) return countsAsContactOverride;

  const durationSeconds = getCallDurationSeconds(call);
  if (durationSeconds > 0) return true;

  if (typeof call.customer_talk_time_pct === "number" && call.customer_talk_time_pct > 0) return true;
  if (typeof call.agent_talk_time_pct === "number" && call.agent_talk_time_pct > 0) return true;
  if (typeof call.interruptions === "number" && call.interruptions > 0) return true;
  if (typeof call.overall_sentiment === "string" && call.overall_sentiment.trim()) return true;
  if (typeof call.transcript_text === "string" && call.transcript_text.trim()) return true;
  if (typeof call.analysis_s3_uri === "string" && call.analysis_s3_uri.trim()) return true;
  if (typeof call.recording_s3_uri === "string" && call.recording_s3_uri.trim()) return true;
  if (typeof call.recording_url === "string" && call.recording_url.trim()) return true;

  return false;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDecimal(value: number) {
  return `${Math.round(value * 10) / 10}`;
}

function formatSignedNumber(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function computeRate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function getPerformanceStatus(actual: number, target: number): DashboardPerformanceStatus {
  if (target <= 0) {
    return actual > 0 ? "on_track" : "at_risk";
  }
  if (actual >= target) return "on_track";
  if (actual >= target * 0.8) return "at_risk";
  return "off_track";
}

function getTodayExpectedTargetByNow(params: {
  elapsedHours: number;
  perHourTarget: number;
  dailyTarget: number;
}) {
  return Math.max(0, Math.min(params.dailyTarget, params.elapsedHours * params.perHourTarget));
}

function getTodayPacedStatus(actual: number, expectedByNow: number): DashboardPerformanceStatus {
  if (expectedByNow <= 0) {
    return actual > 0 ? "on_track" : "at_risk";
  }

  // Before the first full expected unit lands, treat zero as at-risk instead of
  // fully off-track so early-day pacing reflects time-of-day realistically.
  if (expectedByNow < 1 && actual <= 0) {
    return "at_risk";
  }

  return getPerformanceStatus(actual, expectedByNow);
}

function combineStatuses(statuses: DashboardPerformanceStatus[]) {
  if (statuses.includes("off_track")) return "off_track";
  if (statuses.includes("at_risk")) return "at_risk";
  return "on_track";
}

function getStatusRank(status: DashboardPerformanceStatus) {
  if (status === "off_track") return 2;
  if (status === "at_risk") return 1;
  return 0;
}

function getWorkdayProgress(date: Date, timeZone = DASHBOARD_TIME_ZONE) {
  const { hour, minute } = getZonedClockParts(date, timeZone);
  const workdayStartMinutes = SALES_DASHBOARD_TARGETS.workdayStartHour * 60;
  const totalMinutes = SALES_DASHBOARD_WORKDAY_HOURS * 60;
  const currentMinutes = hour * 60 + minute;
  const elapsedMinutes = Math.max(0, Math.min(currentMinutes - workdayStartMinutes, totalMinutes));
  const elapsedHours = elapsedMinutes / 60;
  const expectedDialsByNow = Math.min(
    SALES_DASHBOARD_TARGETS.dialsPerDay,
    Math.round(elapsedHours * SALES_DASHBOARD_TARGETS.dialsPerHour),
  );

  return {
    elapsedHours,
    expectedDialsByNow,
    workdayLabel: `${formatDecimal(elapsedHours)} / ${SALES_DASHBOARD_WORKDAY_HOURS}h`,
  };
}

function buildWindowMetrics(params: {
  range: DashboardRangeContext;
  calls: CallAnalyticsRow[];
  demos: AttributedDemoRecord[];
  closedLeads: Lead[];
  workdayProgress: ReturnType<typeof getWorkdayProgress>;
}) {
  const callsInRange = params.calls.filter((call) => {
    const createdAt = parseDate(call.created_at);
    return createdAt ? isDateInRange(createdAt, params.range) : false;
  });
  const conversationsInRange = callsInRange.filter(isConnectedCall);
  const talkSecondsInRange = sum(callsInRange.map((call) => getCallDurationSeconds(call)));
  const demosInRange = params.demos.filter((demo) => {
    const bookedAt = getDemoBookedAt(demo);
    return bookedAt ? isDateInRange(bookedAt, params.range) : false;
  });
  const closedLeadsInRange = params.closedLeads.filter((lead) => {
    const closedAt = parseDate(lead.closedAt);
    return closedAt ? isDateInRange(closedAt, params.range) : false;
  });
  const revenue = sum(closedLeadsInRange.map((lead) => (typeof lead.closedDealValue === "number" ? lead.closedDealValue : 0)));

  const dials = callsInRange.length;
  const conversations = conversationsInRange.length;
  const demos = demosInRange.length;
  const closes = closedLeadsInRange.length;
  const talkMinutes = Math.round(talkSecondsInRange / 60);
  const score = computeScore({ dials, conversations, demos, closes });
  const dialsPerDay = dials / params.range.days;
  const conversationsPerDay = conversations / params.range.days;
  const demosPerDay = demos / params.range.days;
  const closesPerDay = closes / params.range.days;
  const talkMinutesPerDay = talkMinutes / params.range.days;
  const revenuePerDay = revenue / params.range.days;
  const contactRate = computeRate(conversations, dials);
  const demoConversionRate = computeRate(demos, conversations);
  const callsPerHour = params.range.isToday
    ? (params.workdayProgress.elapsedHours > 0 ? dials / params.workdayProgress.elapsedHours : 0)
    : dialsPerDay / SALES_DASHBOARD_WORKDAY_HOURS;
  const expectedDials = params.range.isToday
    ? params.workdayProgress.expectedDialsByNow
    : SALES_DASHBOARD_TARGETS.dialsPerDay;
  const expectedDemos = params.range.isToday
    ? getTodayExpectedTargetByNow({
        elapsedHours: params.workdayProgress.elapsedHours,
        perHourTarget: SALES_DASHBOARD_TARGETS_BY_HOUR.demosPerHour,
        dailyTarget: SALES_DASHBOARD_TARGETS.demosPerDay,
      })
    : SALES_DASHBOARD_TARGETS.demosPerDay;
  const dialsComparison = params.range.isToday ? dials : dialsPerDay;
  const demosComparison = params.range.isToday ? demos : demosPerDay;
  const dialsStatus = getPerformanceStatus(dialsComparison, expectedDials);
  const contactRateStatus = getPerformanceStatus(contactRate, SALES_DASHBOARD_TARGETS.contactRatePct);
  const demosStatus = params.range.isToday
    ? getTodayPacedStatus(demosComparison, expectedDemos)
    : getPerformanceStatus(demosComparison, SALES_DASHBOARD_TARGETS.demosPerDay);
  const demoConversionStatus = getPerformanceStatus(
    demoConversionRate,
    SALES_DASHBOARD_DERIVED_TARGETS.demoConversionRatePct,
  );

  return {
    key: params.range.key,
    label: params.range.label,
    shortLabel: params.range.shortLabel,
    days: params.range.days,
    isToday: params.range.isToday,
    startDate: params.range.startDate,
    endDate: params.range.endDate,
    dials,
    conversations,
    demos,
    closes,
    revenue,
    talkMinutes,
    score,
    callsPerHour,
    contactRate,
    demoConversionRate,
    dialsPerDay,
    conversationsPerDay,
    demosPerDay,
    closesPerDay,
    talkMinutesPerDay,
    revenuePerDay,
    expectedDials,
    expectedDemos,
    dialGap: dialsComparison - expectedDials,
    dialsStatus,
    contactRateStatus,
    demosStatus,
    demoConversionStatus,
    overallStatus: combineStatuses([dialsStatus, contactRateStatus, demosStatus]),
  } satisfies DashboardWindowMetrics;
}

function isLeadDemoBookedThisWeek(lead: Lead, now: Date) {
  const bookedAt = parseDate(lead.demoBooking?.bookedAt);
  if (bookedAt) return isOnOrAfterWeekStartInTimeZone(bookedAt, now);
  const demoAt = parseDemoDate(lead);
  return demoAt ? isOnOrAfterWeekStartInTimeZone(demoAt, now) : false;
}

function isLeadDemoBookedToday(lead: Lead, now: Date) {
  const bookedAt = parseDate(lead.demoBooking?.bookedAt);
  return bookedAt ? isSameDayInTimeZone(bookedAt, now) : false;
}

function buildNeedsAttentionReason(window: Pick<DashboardWindowMetrics, "isToday" | "dialGap" | "dials" | "dialsPerDay" | "contactRate" | "demos" | "demosPerDay" | "expectedDemos">) {
  const issues: string[] = [];

  if (window.dialGap < 0) {
    const paceGap = window.isToday ? `${Math.abs(Math.round(window.dialGap))}` : formatDecimal(Math.abs(window.dialGap));
    issues.push(`${paceGap} behind dial pace`);
  } else if (window.dials === 0) {
    issues.push("no dials yet");
  }

  if (window.dials > 0 && window.contactRate < SALES_DASHBOARD_TARGETS.contactRatePct) {
    issues.push(`${formatPercent(window.contactRate)} contact rate`);
  }

  if (window.isToday) {
    if (getTodayPacedStatus(window.demos, window.expectedDemos) === "off_track") {
      issues.push(`${window.demos}/${formatDecimal(window.expectedDemos)} demos by now`);
    }
  } else if (window.demosPerDay < SALES_DASHBOARD_TARGETS.demosPerDay) {
    issues.push(`${formatDecimal(window.demosPerDay)}/${SALES_DASHBOARD_TARGETS.demosPerDay} demos per day`);
  }

  return issues.slice(0, 2).join("; ");
}

function buildRepHeadline(window: DashboardWindowMetrics) {
  if (!window.isToday) {
    if (window.dialsStatus === "on_track" && window.contactRateStatus === "on_track" && window.demosStatus === "on_track") {
      return `${window.label}: ${formatDecimal(window.dialsPerDay)} dials/day, ${formatPercent(window.contactRate)} contact rate, ${formatDecimal(window.demosPerDay)} demos/day.`;
    }

    if (window.dialsStatus === "off_track") {
      return `${window.label}: averaging ${formatDecimal(window.dialsPerDay)} dials/day. Push back toward ${SALES_DASHBOARD_TARGETS.dialsPerDay} dials/day.`;
    }

    if (window.contactRateStatus === "off_track") {
      return `${window.label}: contact rate is ${formatPercent(window.contactRate)}. Tighten the opener and first 20 seconds.`;
    }

    if (window.demosStatus !== "on_track") {
      return `${window.label}: averaging ${formatDecimal(window.demosPerDay)} demos/day. Push harder on the close when the conversation lands.`;
    }

    return `${window.label}: ${formatDecimal(window.callsPerHour)} calls per hour on average. Keep stacking quality connects.`;
  }

  if (window.dialsStatus === "on_track" && window.contactRateStatus === "on_track" && window.demosStatus === "on_track") {
    return "On pace for 80 dials, 20% contact rate, and 4 booked demos.";
  }

  if (window.dialsStatus === "off_track") {
    return `Dial pace is behind. Recover the block and get back above ${SALES_DASHBOARD_TARGETS.dialsPerHour} calls per hour.`;
  }

  if (window.contactRateStatus === "off_track") {
    return `The dial volume is moving, but contact rate is only ${formatPercent(window.contactRate)}. Tighten the opener and the first 20 seconds.`;
  }

  if (window.demosStatus !== "on_track") {
    return `${window.demos} demo${window.demos === 1 ? "" : "s"} booked so far. Pace by now is ${formatDecimal(window.expectedDemos)}.`;
  }

  return `Current pace is ${formatDecimal(window.callsPerHour)} calls per hour. Keep stacking quality connects.`;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const workdayProgress = getWorkdayProgress(now);
    const url = new URL(request.url);
    const selectedRangeKey = parseDashboardRangeKey(url.searchParams.get("range"));
    const selectedRange = createDashboardRangeContext(now, selectedRangeKey);
    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const viewerRole = await getEffectiveUserRole(user.id, user.email);
    const includeRepBoard = viewerRole === "REP" || viewerRole === "SUPER_ADMIN";
    const includeTeamBoard = viewerRole === "TEAM_LEAD" || viewerRole === "MANAGER" || viewerRole === "SUPER_ADMIN";
    const includeAllUpcomingDemos = includeAll || viewerRole === "TEAM_LEAD";

    const [visibleLeads, tableUsersById, authUserDirectory, recentCalls, visibleDemoRows, allDemoSourceLeads, reviewedNotificationIds] = await Promise.all([
      listLeads(user.id, { includeAll }),
      includeTeamBoard ? listUsersById() : Promise.resolve(new Map<string, string>()),
      includeTeamBoard
        ? listAuthUsersById()
        : Promise.resolve({
            namesById: new Map<string, string>(),
            emailsById: new Map<string, string>(),
          }),
      listRecentCalls(),
      listDemoRows({ includeAll: includeAllUpcomingDemos, userId: user.id, userEmail: user.email }),
      viewerRole === "TEAM_LEAD" ? listLeads(user.id, { includeAll: true }) : Promise.resolve([] as Lead[]),
      includeTeamBoard ? getReviewedDashboardNotificationIds(user.id) : Promise.resolve([] as string[]),
    ]);

    const usersById = new Map<string, string>(authUserDirectory.namesById);
    const userEmailsById = new Map<string, string>(authUserDirectory.emailsById);
    for (const [id, name] of tableUsersById.entries()) {
      usersById.set(id, name);
    }

    const claimedLeadCountsMap = new Map<string, number>();
    for (const lead of visibleLeads) {
      if (typeof lead.ownerId !== "string" || !lead.ownerId) continue;
      claimedLeadCountsMap.set(lead.ownerId, (claimedLeadCountsMap.get(lead.ownerId) ?? 0) + 1);
    }

    const demoScheduleLeads = includeAllUpcomingDemos && viewerRole === "TEAM_LEAD"
      ? allDemoSourceLeads
      : visibleLeads;

    const persistedLeadDemos = demoScheduleLeads.flatMap((lead) => {
      if (!lead.demoBooking?.date || !lead.demoBooking?.time) return [];
      return [{
        leadId: lead.id,
        leadName: lead.businessName,
        date: lead.demoBooking.date,
        time: lead.demoBooking.time,
        scheduledAt: parseDemoDate(lead),
        bookedAt: parseDate(lead.demoBooking.bookedAt),
        repId: typeof lead.ownerId === "string" && lead.ownerId ? lead.ownerId : null,
        repEmail: null as string | null,
      }];
    });

    const allUpcomingDemoMap = new Map<string, UpcomingDemoScheduleEntry>();

    for (const demo of visibleDemoRows) {
      const scheduledAt = parseDemoRowDate(demo);
      if (!scheduledAt || scheduledAt.getTime() < now.getTime()) continue;
      const key = getDemoDedupeKey({
        leadId: demo.lead_id ?? null,
        leadName: demo.lead_name ?? null,
        date: demo.selected_date ?? null,
        time: demo.selected_time ?? null,
      });
      allUpcomingDemoMap.set(key, {
        leadId: demo.lead_id ?? null,
        leadName: demo.lead_name ?? "Unknown Lead",
        scheduledAt,
        repId: demo.rep_id ?? null,
        repEmail: demo.rep_email ?? null,
      });
    }

    for (const demo of persistedLeadDemos) {
      if (!demo.scheduledAt || demo.scheduledAt.getTime() < now.getTime()) continue;
      const key = getDemoDedupeKey({
        leadId: demo.leadId,
        leadName: demo.leadName,
        date: demo.date,
        time: demo.time,
      });
      allUpcomingDemoMap.set(key, {
        leadId: demo.leadId,
        leadName: demo.leadName,
        scheduledAt: demo.scheduledAt,
        repId: demo.repId ?? null,
        repEmail: demo.repEmail ?? null,
      });
    }

    const attributedDemoMap = new Map<string, AttributedDemoRecord>();
    const coveredDemoKeys = new Set<string>();

    for (const demo of visibleDemoRows) {
      const coverageKey = getDemoDedupeKey({
        leadId: demo.lead_id ?? null,
        leadName: demo.lead_name ?? null,
        date: demo.selected_date ?? null,
        time: demo.selected_time ?? null,
      });
      coveredDemoKeys.add(coverageKey);

      const attributionKey = getAttributedDemoKey({
        leadId: demo.lead_id ?? null,
        leadName: demo.lead_name ?? null,
        date: demo.selected_date ?? null,
        time: demo.selected_time ?? null,
        repId: demo.rep_id ?? null,
        repEmail: demo.rep_email ?? null,
      });
      const candidate: AttributedDemoRecord = {
        key: attributionKey,
        leadId: demo.lead_id ?? null,
        leadName: demo.lead_name ?? "Unknown Lead",
        date: demo.selected_date ?? null,
        time: demo.selected_time ?? null,
        scheduledAt: parseDemoRowDate(demo),
        bookedAt: parseDate(demo.created_at),
        repId: demo.rep_id ?? null,
        repEmail: normalizeEmail(demo.rep_email),
      };
      const existing = attributedDemoMap.get(attributionKey);
      const candidateTime = getDemoBookedAt(candidate)?.getTime() ?? 0;
      const existingTime = existing ? (getDemoBookedAt(existing)?.getTime() ?? 0) : 0;
      if (!existing || candidateTime >= existingTime) {
        attributedDemoMap.set(attributionKey, candidate);
      }
    }

    for (const demo of persistedLeadDemos) {
      const coverageKey = getDemoDedupeKey({
        leadId: demo.leadId,
        leadName: demo.leadName,
        date: demo.date,
        time: demo.time,
      });
      if (coveredDemoKeys.has(coverageKey)) continue;

      const attributionKey = getAttributedDemoKey({
        leadId: demo.leadId,
        leadName: demo.leadName,
        date: demo.date,
        time: demo.time,
        repId: demo.repId ?? null,
        repEmail: demo.repEmail ?? null,
      });
      attributedDemoMap.set(attributionKey, {
        key: attributionKey,
        leadId: demo.leadId,
        leadName: demo.leadName,
        date: demo.date,
        time: demo.time,
        scheduledAt: demo.scheduledAt,
        bookedAt: demo.bookedAt,
        repId: demo.repId ?? null,
        repEmail: normalizeEmail(demo.repEmail),
      });
    }

    const leadsById = new Map(visibleLeads.map((lead) => [lead.id, lead]));
    const visibleLeadIds = new Set(leadsById.keys());
    const attributedDemos = [...attributedDemoMap.values()];
    const calls = recentCalls.filter((call) => typeof call.lead_id === "string" && visibleLeadIds.has(call.lead_id));
    const repLeads = visibleLeads.filter((lead) => lead.ownerId === user.id);
    const repLeadIds = new Set(repLeads.map((lead) => lead.id));
    const repAttributedDemos = attributedDemos.filter((demo) => matchesDemoToUser(demo, user.id, user.email));
    const repAttributedLeadIds = new Set(
      repAttributedDemos
        .map((demo) => (typeof demo.leadId === "string" ? demo.leadId : ""))
        .filter(Boolean),
    );
    const repCallLeadIds = new Set([...repLeadIds, ...repAttributedLeadIds]);
    const repCalls = calls.filter((call) => {
      const attributedUserId = getCallAttributedUserId(call, leadsById);
      if (attributedUserId) return attributedUserId === user.id;
      return typeof call.lead_id === "string" && repCallLeadIds.has(call.lead_id);
    });

    const repCallsToday = repCalls.filter((call) => {
      const at = parseDate(call.created_at);
      return at ? isSameDayInTimeZone(at, now) : false;
    });
    const repConversationsToday = repCallsToday.filter(isConnectedCall);
    const repTalkSecondsToday = sum(repCallsToday.map((call) => getCallDurationSeconds(call)));
    const repDemosThisWeek = repAttributedDemos.filter((demo) => isDemoBookedOnOrAfterWeekStart(demo, now));
    const repDemosToday = repAttributedDemos.filter((demo) => isDemoBookedSameDay(demo, now));
    const repClosedLeads = visibleLeads.filter((lead) => getLeadCloseAttributionUserId(lead) === user.id);
    const repClosedThisMonth = repClosedLeads.filter((lead) => {
      const closedAt = parseDate(lead.closedAt);
      return closedAt ? isSameMonthInTimeZone(closedAt, now) : false;
    });
    const repClosedToday = repClosedThisMonth.filter((lead) => {
      const closedAt = parseDate(lead.closedAt);
      return closedAt ? isSameDayInTimeZone(closedAt, now) : false;
    });
    const repRevenueThisMonth = sum(repClosedThisMonth.map((lead) => (typeof lead.closedDealValue === "number" ? lead.closedDealValue : 0)));
    const repLiveSites = repLeads.filter((lead) => lead.siteStatus === "LIVE" || Boolean(lead.deployedUrl)).length;
    const repScoreToday = computeScore({
      dials: repCallsToday.length,
      conversations: repConversationsToday.length,
      demos: repDemosToday.length,
      closes: repClosedToday.length,
    });
    const repStreak = computeStreak(calls, visibleLeads, now, user.id, leadsById);
    const repCallsPerHourToday = workdayProgress.elapsedHours > 0 ? repCallsToday.length / workdayProgress.elapsedHours : 0;
    const repContactRateToday = computeRate(repConversationsToday.length, repCallsToday.length);
    const repDemoConversionRateToday = computeRate(repDemosToday.length, repConversationsToday.length);
    const repDialPaceStatus = getPerformanceStatus(repCallsToday.length, workdayProgress.expectedDialsByNow);
    const repContactStatus = getPerformanceStatus(repContactRateToday, SALES_DASHBOARD_TARGETS.contactRatePct);
    const repExpectedDemosByNow = getTodayExpectedTargetByNow({
      elapsedHours: workdayProgress.elapsedHours,
      perHourTarget: SALES_DASHBOARD_TARGETS_BY_HOUR.demosPerHour,
      dailyTarget: SALES_DASHBOARD_TARGETS.demosPerDay,
    });
    const repDemosStatus = getTodayPacedStatus(repDemosToday.length, repExpectedDemosByNow);
    const repDemoConversionStatus = getPerformanceStatus(
      repDemoConversionRateToday,
      SALES_DASHBOARD_DERIVED_TARGETS.demoConversionRatePct,
    );
    const repOverallStatus = combineStatuses([repDialPaceStatus, repContactStatus, repDemosStatus]);
    const repDialGapToday = repCallsToday.length - workdayProgress.expectedDialsByNow;
    const repSelectedWindow = buildWindowMetrics({
      range: selectedRange,
      calls: repCalls,
      demos: repAttributedDemos,
      closedLeads: repClosedLeads,
      workdayProgress,
    });
    const repSelectedWindowCallsPerHourStatus = getPerformanceStatus(
      repSelectedWindow.callsPerHour,
      SALES_DASHBOARD_TARGETS.dialsPerHour,
    );
    const repDailyAverages = DASHBOARD_DAILY_AVERAGE_RANGES.map((rangeKey) =>
      buildWindowMetrics({
        range: createDashboardRangeContext(now, rangeKey),
        calls: repCalls,
        demos: repAttributedDemos,
        closedLeads: repClosedLeads,
        workdayProgress,
      }),
    );

    const focusLeads = repLeads
      .map((lead) => ({
        id: lead.id,
        business: lead.businessName,
        score: scoreLeadPriority(lead, now),
        status: getLeadStatusLabel(lead, now),
        deploymentLabel: lead.deployedUrl || lead.siteStatus === "LIVE" ? "View Site" : "Deploy Site",
        deployed: Boolean(lead.deployedUrl) || lead.siteStatus === "LIVE",
      }))
      .filter((lead) => lead.score >= 0)
      .sort((a, b) => b.score - a.score || a.business.localeCompare(b.business))
      .slice(0, 5)
      .map((lead, index) => ({
        ...lead,
        rank: index + 1,
        hot: lead.score >= 30,
      }));

    const recentActivity = [
      ...repCalls.slice(0, 6).map((call) => {
        const lead = call.lead_id ? leadsById.get(call.lead_id) : null;
        if (!lead) return null;
        const at = parseDate(call.created_at) ?? now;
        const durationSeconds = typeof call.duration_seconds === "number" ? call.duration_seconds : 0;
        const talkSplit = typeof call.agent_talk_time_pct === "number" && typeof call.customer_talk_time_pct === "number"
          ? `${Math.round(call.agent_talk_time_pct)} / ${Math.round(call.customer_talk_time_pct)} talk split`
          : "Talk split pending";
        return {
          id: lead.id,
          business: lead.businessName,
          event: `completed a ${minutesLabel(durationSeconds)} call`,
          context: `${normalizeSentiment(call.overall_sentiment)} - ${talkSplit} - ${formatRelative(at, now)}`,
          live: getDayStampInTimeZone(at, DASHBOARD_TIME_ZONE) >= getDayStampInTimeZone(now, DASHBOARD_TIME_ZONE) - 1,
        };
      }).filter(Boolean),
      ...repLeads
        .filter((lead) => lead.siteStatus === "LIVE" || Boolean(lead.deployedUrl))
        .slice(0, 2)
        .map((lead) => ({
          id: lead.id,
          business: lead.businessName,
          event: "has a live site ready for follow-up",
          context: lead.deployedUrl ? "Deployment is live - send the link" : "Site is marked live in CRM",
          live: true,
        })),
    ].slice(0, 4);

    const repLeadIdSet = new Set(repLeads.map((lead) => lead.id));
    const bookedDemoLeadIds = new Set<string>();
    for (const lead of demoScheduleLeads) {
      if (lead.demoBooking?.date) {
        bookedDemoLeadIds.add(lead.id);
      }
    }
    for (const demo of visibleDemoRows) {
      if (typeof demo.lead_id === "string" && demo.lead_id) {
        bookedDemoLeadIds.add(demo.lead_id);
      }
    }
    const upcomingSchedule = [...allUpcomingDemoMap.values()]
      .filter((demo) => demo.leadId && repLeadIdSet.has(demo.leadId))
      .map((demo) => ({
        id: demo.leadId as string,
        startsAt: demo.scheduledAt.getTime(),
        label: `${demo.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - Demo: ${demo.leadName}`,
      }))
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, 4);

    const teamUpcomingSchedule = [...allUpcomingDemoMap.values()]
      .map((demo, index) => ({
        id: demo.leadId ?? `upcoming-demo-${index}-${demo.scheduledAt.getTime()}`,
        leadId: demo.leadId ?? null,
        startsAt: demo.scheduledAt.getTime(),
        label: `${demo.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${demo.scheduledAt.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })} - ${demo.leadName}`,
        repName:
          (demo.repId ? usersById.get(demo.repId) : null) ??
          (demo.repEmail ? prettyNameFromEmail(demo.repEmail) : null) ??
          "Unassigned",
      }))
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, 10);

    const repManagerAlerts = includeRepBoard && repLeads.length > 0
      ? (await Promise.all(
          repLeads.map(async (lead) => ({
            lead,
            notes: await listLeadNotesWithMetadata(lead.id).catch(() => []),
          })),
        ))
          .flatMap(({ lead, notes }) =>
            notes
              .filter((note) =>
                (note.channel || "").trim().toLowerCase() === MANAGER_CALL_REVIEW_CHANNEL &&
                note.targetUserId === user.id &&
                note.requiresAcknowledgement &&
                !note.acknowledgedAt,
              )
              .map((note) => ({
                id: `manager-review-${lead.id}-${note.id}`,
                noteId: note.id,
                leadId: lead.id,
                title: `Manager review note: ${lead.businessName}`,
                detail: `${note.createdByName ? `${note.createdByName}: ` : ""}${note.content}`,
                createdAt: note.createdAt,
              })),
          )
          .sort((left, right) => {
            const leftTime = parseDate(left.createdAt)?.getTime() ?? 0;
            const rightTime = parseDate(right.createdAt)?.getTime() ?? 0;
            return rightTime - leftTime;
          })
          .slice(0, 6)
      : [];

    const teamLeadIds = new Set<string>();
    const leaderboardSeed = new Map<string, DashboardLeaderboardRow>();

    for (const lead of visibleLeads) {
      if (typeof lead.ownerId === "string" && lead.ownerId) {
        teamLeadIds.add(lead.ownerId);
      }
      const soldByUserId = getLeadCloseAttributionUserId(lead);
      if (soldByUserId) {
        teamLeadIds.add(soldByUserId);
      }
    }

    for (const [userId, claimedLeads] of claimedLeadCountsMap.entries()) {
      teamLeadIds.add(userId);
      leaderboardSeed.set(userId, {
        userId,
        userName: usersById.get(userId) ?? userId,
        claimedLeads,
        dialsToday: 0,
        callsPerHourToday: 0,
        conversationsToday: 0,
        contactRateToday: 0,
        demosToday: 0,
        demoConversionRateToday: 0,
        expectedDialsByNow: workdayProgress.expectedDialsByNow,
        dialGapToday: 0,
        talkMinutesToday: 0,
        demosThisWeek: 0,
        closesThisMonth: 0,
        revenueThisMonth: 0,
        scoreToday: 0,
        streakDays: 0,
        overallStatus: "at_risk",
        needsAttentionReason: "",
        selectedWindow: buildWindowMetrics({
          range: selectedRange,
          calls: [],
          demos: [],
          closedLeads: [],
          workdayProgress,
        }),
        dailyAverages: DASHBOARD_DAILY_AVERAGE_RANGES.map((rangeKey) =>
          buildWindowMetrics({
            range: createDashboardRangeContext(now, rangeKey),
            calls: [],
            demos: [],
            closedLeads: [],
            workdayProgress,
          }),
        ),
      });
    }

    for (const userId of teamLeadIds) {
      if (!leaderboardSeed.has(userId)) {
        leaderboardSeed.set(userId, {
          userId,
          userName: usersById.get(userId) ?? userId,
          claimedLeads: 0,
          dialsToday: 0,
          callsPerHourToday: 0,
          conversationsToday: 0,
          contactRateToday: 0,
          demosToday: 0,
          demoConversionRateToday: 0,
          expectedDialsByNow: workdayProgress.expectedDialsByNow,
          dialGapToday: 0,
          talkMinutesToday: 0,
          demosThisWeek: 0,
          closesThisMonth: 0,
          revenueThisMonth: 0,
          scoreToday: 0,
          streakDays: 0,
          overallStatus: "at_risk",
          needsAttentionReason: "",
          selectedWindow: buildWindowMetrics({
            range: selectedRange,
            calls: [],
            demos: [],
            closedLeads: [],
            workdayProgress,
          }),
          dailyAverages: DASHBOARD_DAILY_AVERAGE_RANGES.map((rangeKey) =>
            buildWindowMetrics({
              range: createDashboardRangeContext(now, rangeKey),
              calls: [],
              demos: [],
              closedLeads: [],
              workdayProgress,
            }),
          ),
        });
      }
    }

    for (const row of leaderboardSeed.values()) {
      const ownedLeads = visibleLeads.filter((lead) => lead.ownerId === row.userId);
      const ownedLeadIds = new Set(ownedLeads.map((lead) => lead.id));
      const ownedCalls = calls.filter((call) => {
        const attributedUserId = getCallAttributedUserId(call, leadsById);
        if (attributedUserId) return attributedUserId === row.userId;
        return typeof call.lead_id === "string" && ownedLeadIds.has(call.lead_id);
      });
      const soldLeads = visibleLeads.filter((lead) => getLeadCloseAttributionUserId(lead) === row.userId);
      const rowAttributedDemos = attributedDemos.filter((demo) => matchesDemoToUser(demo, row.userId, userEmailsById.get(row.userId)));
      const callsToday = ownedCalls.filter((call) => {
        const at = parseDate(call.created_at);
        return at ? isSameDayInTimeZone(at, now) : false;
      });
      const conversationsToday = callsToday.filter(isConnectedCall);
      const talkMinutesToday = Math.round(sum(callsToday.map((call) => getCallDurationSeconds(call))) / 60);
      const demosThisWeek = rowAttributedDemos.filter((demo) => isDemoBookedOnOrAfterWeekStart(demo, now));
      const demosToday = rowAttributedDemos.filter((demo) => isDemoBookedSameDay(demo, now));
      const closedThisMonth = soldLeads.filter((lead) => {
        const closedAt = parseDate(lead.closedAt);
        return closedAt ? isSameMonthInTimeZone(closedAt, now) : false;
      });
      const closesToday = closedThisMonth.filter((lead) => {
        const closedAt = parseDate(lead.closedAt);
        return closedAt ? isSameDayInTimeZone(closedAt, now) : false;
      });

      row.userName = usersById.get(row.userId) ?? row.userName;
      row.dialsToday = callsToday.length;
      row.callsPerHourToday = workdayProgress.elapsedHours > 0 ? callsToday.length / workdayProgress.elapsedHours : 0;
      row.conversationsToday = conversationsToday.length;
      row.contactRateToday = computeRate(conversationsToday.length, callsToday.length);
      row.demosToday = demosToday.length;
      row.demoConversionRateToday = computeRate(demosToday.length, conversationsToday.length);
      row.expectedDialsByNow = workdayProgress.expectedDialsByNow;
      row.dialGapToday = row.dialsToday - row.expectedDialsByNow;
      row.talkMinutesToday = talkMinutesToday;
      row.demosThisWeek = demosThisWeek.length;
      row.closesThisMonth = closedThisMonth.length;
      row.revenueThisMonth = sum(closedThisMonth.map((lead) => (typeof lead.closedDealValue === "number" ? lead.closedDealValue : 0)));
      row.scoreToday = computeScore({
        dials: callsToday.length,
        conversations: conversationsToday.length,
        demos: demosToday.length,
        closes: closesToday.length,
      });
      row.streakDays = computeStreak(calls, visibleLeads, now, row.userId, leadsById);
      row.selectedWindow = buildWindowMetrics({
        range: selectedRange,
        calls: ownedCalls,
        demos: rowAttributedDemos,
        closedLeads: soldLeads,
        workdayProgress,
      });
      row.dailyAverages = DASHBOARD_DAILY_AVERAGE_RANGES.map((rangeKey) =>
        buildWindowMetrics({
          range: createDashboardRangeContext(now, rangeKey),
          calls: ownedCalls,
          demos: rowAttributedDemos,
          closedLeads: soldLeads,
          workdayProgress,
        }),
      );
      row.overallStatus = row.selectedWindow.overallStatus;
      row.needsAttentionReason = buildNeedsAttentionReason(row.selectedWindow);
    }

    const leaderboard = [...leaderboardSeed.values()]
      .filter((row) =>
        row.claimedLeads > 0 ||
        row.selectedWindow.dials > 0 ||
        row.selectedWindow.demos > 0 ||
        row.selectedWindow.closes > 0 ||
        row.selectedWindow.revenue > 0 ||
        row.dialsToday > 0 ||
        row.demosThisWeek > 0 ||
        row.closesThisMonth > 0 ||
        row.revenueThisMonth > 0,
      )
      .sort((a, b) =>
        getStatusRank(a.overallStatus) - getStatusRank(b.overallStatus) ||
        b.selectedWindow.demos - a.selectedWindow.demos ||
        b.selectedWindow.contactRate - a.selectedWindow.contactRate ||
        b.selectedWindow.score - a.selectedWindow.score ||
        b.selectedWindow.revenue - a.selectedWindow.revenue ||
        b.demosThisWeek - a.demosThisWeek ||
        b.claimedLeads - a.claimedLeads ||
        a.userName.localeCompare(b.userName))
      .slice(0, 8);

    const upcomingDemos = [...allUpcomingDemoMap.values()];
    const closedThisMonthAll = visibleLeads.filter((lead) => {
      const closedAt = parseDate(lead.closedAt);
      return closedAt ? isSameMonthInTimeZone(closedAt, now) : false;
    });
    const closedLeadsAll = visibleLeads.filter((lead) => Boolean(parseDate(lead.closedAt)));
    const liveSitesAll = visibleLeads.filter((lead) => lead.siteStatus === "LIVE" || Boolean(lead.deployedUrl)).length;
    const trackedReps = [...leaderboardSeed.values()].filter((row) => row.claimedLeads > 0);
    const teamDialsToday = sum(trackedReps.map((row) => row.dialsToday));
    const teamConversationsToday = sum(trackedReps.map((row) => row.conversationsToday));
    const teamDemosToday = sum(trackedReps.map((row) => row.demosToday));
    const avgContactRateToday = computeRate(teamConversationsToday, teamDialsToday);
    const repsOnTrack = trackedReps.filter((row) => row.overallStatus === "on_track").length;
    const repsOffTrack = trackedReps.filter((row) => row.overallStatus !== "on_track").length;
    const teamSelectedWindow = buildWindowMetrics({
      range: selectedRange,
      calls,
      demos: attributedDemos,
      closedLeads: closedLeadsAll,
      workdayProgress,
    });
    const teamDialsPerRepPerDay = trackedReps.length > 0
      ? average(trackedReps.map((row) => row.selectedWindow.dialsPerDay))
      : 0;
    const teamDemosPerRepPerDay = trackedReps.length > 0
      ? average(trackedReps.map((row) => row.selectedWindow.demosPerDay))
      : 0;
    const scorecards = [...leaderboard]
      .map((row) => {
        const ownedLeads = visibleLeads.filter((lead) => lead.ownerId === row.userId);
        const soldLeads = visibleLeads.filter((lead) => getLeadCloseAttributionUserId(lead) === row.userId);
        const demosBookedTotal = attributedDemos.filter((demo) => matchesDemoToUser(demo, row.userId, userEmailsById.get(row.userId))).length;
        const closesTotal = soldLeads.length;
        const demoToCloseRate = demosBookedTotal > 0 ? (closesTotal / demosBookedTotal) * 100 : 0;
        const workingRate = row.dialsToday > 0 ? (row.conversationsToday / row.dialsToday) * 100 : 0;
        return {
          userId: row.userId,
          userName: row.userName,
          pipelineLeads: row.claimedLeads,
          dialsToday: row.dialsToday,
          callsPerHourLabel: `${formatDecimal(row.callsPerHourToday)} / ${SALES_DASHBOARD_TARGETS.dialsPerHour}`,
          contactRateLabel: `${formatPercent(row.contactRateToday)} / ${SALES_DASHBOARD_TARGETS.contactRatePct}%`,
          demosToday: row.demosToday,
          demoConversionLabel: `${formatPercent(row.demoConversionRateToday)} / ${Math.round(SALES_DASHBOARD_DERIVED_TARGETS.demoConversionRatePct)}%`,
          talkMinutesToday: row.talkMinutesToday,
          workingRateLabel: formatPercent(workingRate),
          demoToCloseLabel: demosBookedTotal > 0 ? formatPercent(demoToCloseRate) : "No demo history",
          revenueThisMonth: row.revenueThisMonth,
          streakDays: row.streakDays,
          overallStatus: row.overallStatus,
          paceGapLabel: `${formatSignedNumber(row.dialGapToday)} vs pace`,
          selectedWindow: row.selectedWindow,
          dailyAverages: row.dailyAverages,
        };
      })
      .slice(0, 6);

    const repCallDrilldowns: DashboardRepCallDrilldown[] = scorecards.map((scorecard) => {
      const ownedLeadIds = new Set(
        visibleLeads
          .filter((lead) => lead.ownerId === scorecard.userId)
          .map((lead) => lead.id),
      );
      const repDemoLeadIds = new Set(
        attributedDemos
          .filter((demo) => matchesDemoToUser(demo, scorecard.userId, userEmailsById.get(scorecard.userId)))
          .map((demo) => (typeof demo.leadId === "string" ? demo.leadId : ""))
          .filter(Boolean),
      );
      const repCallLeadIds = new Set([...ownedLeadIds, ...repDemoLeadIds]);
      const repCalls = calls.filter((call) => {
        const attributedUserId = getCallAttributedUserId(call, leadsById);
        if (attributedUserId) return attributedUserId === scorecard.userId;
        return typeof call.lead_id === "string" && repCallLeadIds.has(call.lead_id);
      });
      const callsToday = repCalls.filter((call) => {
        const at = parseDate(call.created_at);
        return at ? isSameDayInTimeZone(at, now) : false;
      });
      const connectedToday = callsToday.filter(isConnectedCall);
      const recordedCalls = repCalls.filter((call) => Boolean(call.recording_s3_uri || call.recording_url));
      const recordedCallsToday = callsToday.filter((call) => Boolean(call.recording_s3_uri || call.recording_url));
      const bookedDemoCalls = repCalls.filter(
        (call) => typeof call.lead_id === "string" && bookedDemoLeadIds.has(call.lead_id),
      );
      const bookedDemoCallsToday = callsToday.filter(
        (call) => typeof call.lead_id === "string" && bookedDemoLeadIds.has(call.lead_id),
      );
      const talkMinutesToday = Math.round(
        sum(callsToday.map((call) => getCallDurationSeconds(call))) / 60,
      );

      return {
        userId: scorecard.userId,
        userName: scorecard.userName,
        totalCalls: repCalls.length,
        callsToday: callsToday.length,
        connectedToday: connectedToday.length,
        recordedCalls: recordedCalls.length,
        recordedCallsToday: recordedCallsToday.length,
        bookedDemoCalls: bookedDemoCalls.length,
        bookedDemoCallsToday: bookedDemoCallsToday.length,
        talkMinutesToday,
        selectedWindow: leaderboard.find((row) => row.userId === scorecard.userId)?.selectedWindow ?? buildWindowMetrics({
          range: selectedRange,
          calls: [],
          demos: [],
          closedLeads: [],
          workdayProgress,
        }),
        dailyAverages: leaderboard.find((row) => row.userId === scorecard.userId)?.dailyAverages ?? DASHBOARD_DAILY_AVERAGE_RANGES.map((rangeKey) =>
          buildWindowMetrics({
            range: createDashboardRangeContext(now, rangeKey),
            calls: [],
            demos: [],
            closedLeads: [],
            workdayProgress,
          }),
        ),
        recentCalls: repCalls.slice(0, 40).map((call) => {
          const leadId = typeof call.lead_id === "string" ? call.lead_id : "";
          const lead = leadId ? leadsById.get(leadId) : null;
          const isOwnedLead = ownedLeadIds.has(leadId);
          const hasRecording = Boolean(call.recording_s3_uri || call.recording_url);
          const hasAnalysis = Boolean(call.analysis_s3_uri || call.transcript_text || call.overall_sentiment);
          const hasBookedDemo = Boolean(lead?.demoBooking?.date) || bookedDemoLeadIds.has(leadId);
          const countsAsContact = isConnectedCall(call);
          return {
            contactId: typeof call.contact_id === "string" ? call.contact_id : "",
            leadId,
            leadName: lead?.businessName ?? "Unknown Lead",
            leadStatus: lead ? getLeadStatusLabel(lead, now) : "Lead status unavailable",
            callAt: call.created_at ?? now.toISOString(),
            durationSeconds: getCallDurationSeconds(call),
            countsAsContact,
            sentimentLabel: normalizeSentiment(call.overall_sentiment),
            hasRecording,
            hasAnalysis,
            hasBookedDemo,
            isOwnedLead,
          };
        }),
      };
    });

    const callLeaderboard = [...leaderboard]
      .filter((row) => row.selectedWindow.dials > 0 || row.selectedWindow.talkMinutes > 0 || row.dialsToday > 0 || row.talkMinutesToday > 0)
      .sort((a, b) =>
        b.selectedWindow.talkMinutes - a.selectedWindow.talkMinutes ||
        b.selectedWindow.conversations - a.selectedWindow.conversations ||
        b.selectedWindow.dials - a.selectedWindow.dials ||
        a.userName.localeCompare(b.userName))
      .slice(0, 6)
      .map((row) => ({
        userId: row.userId,
        userName: row.userName,
        talkMinutesToday: row.talkMinutesToday,
        dialsToday: row.dialsToday,
        conversationsToday: row.conversationsToday,
        callsPerHourLabel: `${formatDecimal(row.callsPerHourToday)} / ${SALES_DASHBOARD_TARGETS.dialsPerHour} hr`,
        contactRateLabel: formatPercent(row.contactRateToday),
        avgTalkPerCallLabel: row.dialsToday > 0 ? `${Math.round((row.talkMinutesToday / row.dialsToday) * 10) / 10} min` : "0 min",
        selectedWindow: row.selectedWindow,
        dailyAverages: row.dailyAverages,
      }));

    const funnel = [...leaderboardSeed.values()]
      .map((row) => {
        const soldLeads = visibleLeads.filter((lead) => getLeadCloseAttributionUserId(lead) === row.userId);
        const demosBooked = attributedDemos.filter((demo) => matchesDemoToUser(demo, row.userId, userEmailsById.get(row.userId))).length;
        const closesWon = soldLeads.length;
        const closeRate = demosBooked > 0 ? (closesWon / demosBooked) * 100 : 0;
        return {
          userId: row.userId,
          userName: row.userName,
          claimedLeads: row.claimedLeads,
          demosBooked,
          closesWon,
          closeRateLabel: demosBooked > 0 ? formatPercent(closeRate) : "No demos yet",
        };
      })
      .filter((row) => row.claimedLeads > 0 || row.demosBooked > 0 || row.closesWon > 0)
      .sort((a, b) => b.closesWon - a.closesWon || b.demosBooked - a.demosBooked || b.claimedLeads - a.claimedLeads)
      .slice(0, 8);

    const notifications: DashboardNotification[] = [];

    for (const lead of visibleLeads) {
      const bookedAt = parseDate(lead.demoBooking?.bookedAt);
      if (bookedAt && now.getTime() - bookedAt.getTime() <= 24 * 60 * 60 * 1000) {
        notifications.push({
          id: `demo-${lead.id}-${bookedAt.toISOString()}`,
          title: `New demo booked: ${lead.businessName}`,
          detail: `${lead.demoBooking?.date ?? "Upcoming"} ${lead.demoBooking?.time ?? ""}`.trim(),
          tone: "blue",
          href: `/leads/${lead.id}`,
          createdAt: bookedAt.toISOString(),
        });
      }

      const closedAt = parseDate(lead.closedAt);
      if (closedAt && now.getTime() - closedAt.getTime() <= 72 * 60 * 60 * 1000) {
        notifications.push({
          id: `close-${lead.id}-${closedAt.toISOString()}`,
          title: `Closed won: ${lead.businessName}`,
          detail: typeof lead.closedDealValue === "number" ? currency(lead.closedDealValue) : "Value pending",
          tone: "emerald",
          href: `/leads/${lead.id}`,
          createdAt: closedAt.toISOString(),
        });
      }

      if (lead.siteStatus === "FAILED") {
        notifications.push({
          id: `deploy-${lead.id}`,
          title: `Deploy failed: ${lead.businessName}`,
          detail: "Generated site needs a redeploy or template fix.",
          tone: "rose",
          href: `/leads/${lead.id}`,
          createdAt: lead.updatedAt,
        });
      }

      if (lead.billingProfile?.billingType === "RECURRING" && (lead.billingProfile.billingStatus === "PAUSED" || lead.billingProfile.billingStatus === "CANCELLED")) {
        notifications.push({
          id: `billing-${lead.id}`,
          title: `Recurring billing at risk: ${lead.businessName}`,
          detail: `Status is ${lead.billingProfile.billingStatus.toLowerCase()}.`,
          tone: "amber",
          href: `/leads/${lead.id}`,
          createdAt: lead.updatedAt,
        });
      }
    }

    for (const call of calls) {
      const callAt = parseDate(call.created_at);
      if (!callAt || now.getTime() - callAt.getTime() < 20 * 60 * 1000) continue;
      if (call.overall_sentiment) continue;
      const lead = call.lead_id ? leadsById.get(call.lead_id) : null;
      if (!lead) continue;
      notifications.push({
        id: `analysis-${call.contact_id ?? lead.id}-${callAt.toISOString()}`,
        title: `Call analysis still pending: ${lead.businessName}`,
        detail: `Recording landed ${formatRelative(callAt, now)} but Contact Lens has not filled sentiment yet.`,
        tone: "amber",
        href: `/leads/${lead.id}`,
        createdAt: callAt.toISOString(),
      });
    }

    const reviewedSet = new Set(reviewedNotificationIds);
    const visibleNotifications = notifications.filter((notification) => !reviewedSet.has(notification.id));

    visibleNotifications.sort((a, b) => {
      const bTime = parseDate(b.createdAt)?.getTime() ?? 0;
      const aTime = parseDate(a.createdAt)?.getTime() ?? 0;
      return bTime - aTime;
    });

    return NextResponse.json({
      generatedAt: now.toISOString(),
      viewerRole,
      range: {
        selectedKey: selectedRange.key,
        selectedLabel: selectedRange.label,
        selectedShortLabel: selectedRange.shortLabel,
        selectedDays: selectedRange.days,
        startDate: selectedRange.startDate,
        endDate: selectedRange.endDate,
        available: Object.entries(DASHBOARD_RANGE_OPTIONS).map(([key, option]) => ({
          key,
          label: option.label,
          shortLabel: option.shortLabel,
          days: option.days,
        })),
      },
      rep: {
        headline: buildRepHeadline(repSelectedWindow),
        scoreToday: repScoreToday,
        streakDays: repStreak,
        kpis: {
          claimedLeads: repLeads.length,
          dialsToday: repCallsToday.length,
          callsPerHourToday: repCallsPerHourToday,
          conversationsToday: repConversationsToday.length,
          contactRateToday: repContactRateToday,
          demosToday: repDemosToday.length,
          demoConversionRateToday: repDemoConversionRateToday,
          talkMinutesToday: Math.round(repTalkSecondsToday / 60),
          demosThisWeek: repDemosThisWeek.length,
          revenueThisMonth: repRevenueThisMonth,
          closesThisMonth: repClosedThisMonth.length,
          liveSites: repLiveSites,
        },
        selectedWindow: repSelectedWindow,
        dailyAverages: repDailyAverages,
        targets: [
          {
            label: repSelectedWindow.isToday ? "Dials Today" : "Avg Dials / Day",
            completed: repSelectedWindow.isToday ? repSelectedWindow.dials : repSelectedWindow.dialsPerDay,
            target: repSelectedWindow.isToday ? repSelectedWindow.expectedDials : SALES_DASHBOARD_TARGETS.dialsPerDay,
            valueLabel: repSelectedWindow.isToday ? String(repSelectedWindow.dials) : formatDecimal(repSelectedWindow.dialsPerDay),
            targetLabel: repSelectedWindow.isToday ? String(Math.round(repSelectedWindow.expectedDials)) : String(SALES_DASHBOARD_TARGETS.dialsPerDay),
            detail: repSelectedWindow.isToday
              ? `${formatSignedNumber(repDialGapToday)} vs pace by now`
              : `${formatSignedNumber(Math.round(repSelectedWindow.dialGap * 10) / 10)} vs ${SALES_DASHBOARD_TARGETS.dialsPerDay} daily target across ${repSelectedWindow.label.toLowerCase()}`,
            tone: "indigo",
            status: repSelectedWindow.dialsStatus,
          },
          {
            label: repSelectedWindow.isToday ? "Calls / Hour" : "Avg Calls / Hour",
            completed: repSelectedWindow.callsPerHour,
            target: SALES_DASHBOARD_TARGETS.dialsPerHour,
            valueLabel: formatDecimal(repSelectedWindow.callsPerHour),
            targetLabel: String(SALES_DASHBOARD_TARGETS.dialsPerHour),
            detail: repSelectedWindow.isToday
              ? `${workdayProgress.workdayLabel} worked today`
              : `${repSelectedWindow.label} rolling average`,
            tone: "indigo",
            status: repSelectedWindowCallsPerHourStatus,
          },
          {
            label: "Contact Rate",
            completed: repSelectedWindow.contactRate,
            target: SALES_DASHBOARD_TARGETS.contactRatePct,
            valueLabel: formatPercent(repSelectedWindow.contactRate),
            targetLabel: `${SALES_DASHBOARD_TARGETS.contactRatePct}%`,
            detail: `${repSelectedWindow.conversations} connects from ${repSelectedWindow.dials} dials in ${repSelectedWindow.label.toLowerCase()}`,
            tone: "amber",
            status: repSelectedWindow.contactRateStatus,
          },
          {
            label: repSelectedWindow.isToday ? "Booked Demos" : "Avg Demos / Day",
            completed: repSelectedWindow.isToday ? repSelectedWindow.demos : repSelectedWindow.demosPerDay,
            target: repSelectedWindow.isToday ? repSelectedWindow.expectedDemos : SALES_DASHBOARD_TARGETS.demosPerDay,
            valueLabel: repSelectedWindow.isToday ? String(repSelectedWindow.demos) : formatDecimal(repSelectedWindow.demosPerDay),
            targetLabel: repSelectedWindow.isToday ? formatDecimal(repSelectedWindow.expectedDemos) : String(SALES_DASHBOARD_TARGETS.demosPerDay),
            detail: repSelectedWindow.isToday
              ? `${formatPercent(repSelectedWindow.demoConversionRate)} conversion from connects; ${formatDecimal(repSelectedWindow.expectedDemos)} expected by now`
              : `${formatPercent(repSelectedWindow.demoConversionRate)} demo conversion from connects`,
            tone: "emerald",
            status: repSelectedWindow.demosStatus,
          },
        ],
        progress: {
          scoreLabel: compactNumber(repSelectedWindow.score),
          revenueLabel: currency(repSelectedWindow.revenue),
          talkLabel: `${Math.round(repSelectedWindow.talkMinutes)} min`,
        },
        accountability: {
          expectedDialsByNow: workdayProgress.expectedDialsByNow,
          workdayLabel: workdayProgress.workdayLabel,
          dialsStatus: repDialPaceStatus,
          contactRateStatus: repContactStatus,
          demosStatus: repDemosStatus,
          demoConversionStatus: repDemoConversionStatus,
          overallStatus: repOverallStatus,
        },
        focusLeads,
        recentActivity,
        upcomingSchedule,
        managerAlerts: repManagerAlerts,
      },
      team: {
        summary: {
          activeReps: new Set(visibleLeads.map((lead) => lead.ownerId).filter((value): value is string => typeof value === "string" && value.length > 0)).size,
          claimedLeads: visibleLeads.filter((lead) => Boolean(lead.ownerId)).length,
          upcomingDemos: upcomingDemos.length,
          closedRevenueThisMonth: sum(closedThisMonthAll.map((lead) => (typeof lead.closedDealValue === "number" ? lead.closedDealValue : 0))),
          liveSites: liveSitesAll,
          alerts: visibleNotifications.length,
          teamDialsToday,
          teamDemosToday,
          avgContactRateToday,
          repsOnTrack,
          repsOffTrack,
          selectedWindow: {
            ...teamSelectedWindow,
            dialsPerRepPerDay: teamDialsPerRepPerDay,
            demosPerRepPerDay: teamDemosPerRepPerDay,
          },
        },
        upcomingSchedule: teamUpcomingSchedule,
        leaderboard,
        scorecards,
        repCallDrilldowns,
        callLeaderboard,
        funnel,
        notifications: visibleNotifications.slice(0, 8),
        topPerformer: leaderboard[0] ?? null,
        needsAttention: leaderboard
          .filter((row) => row.claimedLeads > 0 && row.overallStatus !== "on_track")
          .sort((a, b) =>
            getStatusRank(b.overallStatus) - getStatusRank(a.overallStatus) ||
            a.selectedWindow.dialGap - b.selectedWindow.dialGap ||
            a.selectedWindow.contactRate - b.selectedWindow.contactRate ||
            a.selectedWindow.demos - b.selectedWindow.demos)
          .slice(0, 5),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build dashboard metrics." },
      { status: 500 },
    );
  }
}
