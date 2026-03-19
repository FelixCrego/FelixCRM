import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, getEffectiveUserRole, listLeads } from "@/lib/store";
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
  agent_talk_time_pct?: number | null;
  customer_talk_time_pct?: number | null;
  interruptions?: number | null;
  created_at?: string | null;
};

type DashboardLeaderboardRow = {
  userId: string;
  userName: string;
  claimedLeads: number;
  dialsToday: number;
  conversationsToday: number;
  demosThisWeek: number;
  closesThisMonth: number;
  revenueThisMonth: number;
  scoreToday: number;
  streakDays: number;
};

type DemoRow = {
  id: string;
  lead_id?: string | null;
  lead_name?: string | null;
  selected_date?: string | null;
  selected_time?: string | null;
  rep_id?: string | null;
  rep_email?: string | null;
};

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
  if (!supabaseUrl || !supabaseServiceRoleKey) return new Map<string, string>();

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
  }
  return users;
}

async function listRecentCalls(limit = 1500) {
  const rows = await requestFirstWorkingTable<CallAnalyticsRow[]>(CALLS_TABLE_CANDIDATES, {
    select: "contact_id,lead_id,duration_seconds,overall_sentiment,agent_talk_time_pct,customer_talk_time_pct,interruptions,created_at",
    order: "created_at.desc",
    limit: String(limit),
  });

  return rows.filter((row) => typeof row.lead_id === "string" && row.lead_id);
}

async function listDemoRows(params: { includeAll: boolean; userId: string; userEmail?: string | null }) {
  const select = "id,lead_id,lead_name,selected_date,selected_time,rep_id,rep_email";

  if (params.includeAll) {
    return requestOptionalTable<DemoRow[]>(DEMOS_TABLE_CANDIDATES, {
      select,
      order: "selected_date.asc,selected_time.asc",
      limit: "500",
    });
  }

  const [byUserId, byEmail] = await Promise.all([
    requestOptionalTable<DemoRow[]>(DEMOS_TABLE_CANDIDATES, {
      select,
      rep_id: `eq.${params.userId}`,
      order: "selected_date.asc,selected_time.asc",
      limit: "500",
    }),
    params.userEmail
      ? requestOptionalTable<DemoRow[]>(DEMOS_TABLE_CANDIDATES, {
          select,
          rep_email: `eq.${params.userEmail}`,
          order: "selected_date.asc,selected_time.asc",
          limit: "500",
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

function toDayStamp(year: number, month: number, day: number) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function getDayStampInTimeZone(date: Date, timeZone = DASHBOARD_TIME_ZONE) {
  const parts = getZonedParts(date, timeZone);
  return toDayStamp(parts.year, parts.month, parts.day);
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

function parseDemoDate(lead: Lead) {
  const booking = lead.demoBooking;
  if (!booking?.date) return null;
  const time = booking.time && booking.time.trim() ? booking.time.trim() : "12:00";
  const parsed = new Date(`${booking.date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDemoRowDate(demo: DemoRow) {
  if (!demo.selected_date || !demo.selected_time) return null;
  const normalized = demo.selected_time.trim().match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i);
  if (!normalized) {
    const parsed = new Date(`${demo.selected_date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const rawHour = Number(normalized[1]);
  const minutes = Number(normalized[2]);
  const period = normalized[3].toUpperCase();
  const hours24 = rawHour % 12 + (period === "PM" ? 12 : 0);
  const parsed = new Date(`${demo.selected_date}T00:00:00`);
  parsed.setHours(hours24, minutes, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
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

function computeStreak(
  calls: CallAnalyticsRow[],
  leads: Lead[],
  now: Date,
  ownerId: string,
  leadIdsByOwner: Set<string>,
) {
  const scoresByDay = new Map<string, number>();

  for (const call of calls) {
    if (typeof call.lead_id !== "string" || !leadIdsByOwner.has(call.lead_id)) continue;
    const at = parseDate(call.created_at);
    if (!at) continue;
    const key = dayKey(at);
    scoresByDay.set(key, (scoresByDay.get(key) ?? 0) + computeScore({
      dials: 1,
      conversations: typeof call.duration_seconds === "number" && call.duration_seconds >= 45 ? 1 : 0,
      demos: 0,
      closes: 0,
    }));
  }

  for (const lead of leads) {
    if (lead.ownerId !== ownerId) continue;
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
  if (demoAt && demoAt.getTime() >= now.getTime()) {
    return `Demo ${formatRelative(demoAt, now)}`;
  }
  if (lead.closedAt) return "Closed won";
  if (lead.siteStatus === "LIVE" || lead.deployedUrl) return "Site live - follow up";
  if (lead.siteStatus === "BUILDING") return "Site deploying";
  if (lead.siteStatus === "FAILED") return "Deploy failed - recover";
  if (lead.status === "CONTACTED") return "Needs next touch";
  if (lead.status === "IN_PROGRESS") return "In motion";
  return "Fresh lead";
}

function scoreLeadPriority(lead: Lead, now: Date) {
  const demoAt = parseDemoDate(lead);
  const updatedAt = parseDate(lead.updatedAt);
  let score = 0;

  if (lead.status === "CLOSED" || lead.status === "DISQUALIFIED") return -1;
  if (demoAt && demoAt.getTime() >= now.getTime()) score += demoAt.getTime() - now.getTime() <= 86400000 ? 40 : 28;
  if (lead.siteStatus === "FAILED") score += 30;
  if (lead.siteStatus === "BUILDING") score += 22;
  if (lead.siteStatus === "LIVE" || lead.deployedUrl) score += 16;
  if (lead.status === "CONTACTED") score += 12;
  if (lead.status === "IN_PROGRESS") score += 8;
  if (lead.phone) score += 2;
  if (lead.email) score += 2;
  if (updatedAt && now.getTime() - updatedAt.getTime() <= 2 * 86400000) score += 5;

  return score;
}

function normalizeSentiment(value?: string | null) {
  if (!value) return "No sentiment yet";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const viewerRole = await getEffectiveUserRole(user.id, user.email);

    const [visibleLeads, tableUsersById, authUsersById, recentCalls, visibleDemoRows] = await Promise.all([
      listLeads(user.id, { includeAll }),
      listUsersById(),
      listAuthUsersById(),
      listRecentCalls(),
      listDemoRows({ includeAll, userId: user.id, userEmail: user.email }),
    ]);

    const usersById = new Map<string, string>(authUsersById);
    for (const [id, name] of tableUsersById.entries()) {
      usersById.set(id, name);
    }

    const claimedLeadCountsMap = new Map<string, number>();
    for (const lead of visibleLeads) {
      if (typeof lead.ownerId !== "string" || !lead.ownerId) continue;
      claimedLeadCountsMap.set(lead.ownerId, (claimedLeadCountsMap.get(lead.ownerId) ?? 0) + 1);
    }

    const persistedLeadDemos = visibleLeads
      .map((lead) => {
        if (!lead.demoBooking?.date || !lead.demoBooking?.time) return null;
        return {
          leadId: lead.id,
          leadName: lead.businessName,
          date: lead.demoBooking.date,
          time: lead.demoBooking.time,
          scheduledAt: parseDemoDate(lead),
        };
      })
      .filter((demo): demo is { leadId: string; leadName: string; date: string; time: string; scheduledAt: Date | null } => Boolean(demo));

    const allUpcomingDemoMap = new Map<string, { leadId?: string | null; leadName: string; scheduledAt: Date }>();

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
      });
    }

    const calls = recentCalls.filter((call) => typeof call.lead_id === "string" && visibleLeads.some((lead) => lead.id === call.lead_id));
    const leadsById = new Map(visibleLeads.map((lead) => [lead.id, lead]));
    const repLeads = visibleLeads.filter((lead) => lead.ownerId === user.id);
    const repLeadIds = new Set(repLeads.map((lead) => lead.id));
    const repCalls = calls.filter((call) => typeof call.lead_id === "string" && repLeadIds.has(call.lead_id));

    const repCallsToday = repCalls.filter((call) => {
      const at = parseDate(call.created_at);
      return at ? isSameDayInTimeZone(at, now) : false;
    });
    const repConversationsToday = repCallsToday.filter((call) => typeof call.duration_seconds === "number" && call.duration_seconds >= 45);
    const repTalkSecondsToday = sum(repCallsToday.map((call) => (typeof call.duration_seconds === "number" ? call.duration_seconds : 0)));
    const repDemosThisWeek = repLeads.filter((lead) => {
      const bookedAt = parseDate(lead.demoBooking?.bookedAt);
      if (bookedAt) return isOnOrAfterWeekStartInTimeZone(bookedAt, now);
      const demoAt = parseDemoDate(lead);
      return demoAt ? isOnOrAfterWeekStartInTimeZone(demoAt, now) : false;
    });
    const repDemosToday = repLeads.filter((lead) => {
      const bookedAt = parseDate(lead.demoBooking?.bookedAt);
      return bookedAt ? isSameDayInTimeZone(bookedAt, now) : false;
    });
    const repClosedThisMonth = repLeads.filter((lead) => {
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
    const repStreak = computeStreak(calls, visibleLeads, now, user.id, repLeadIds);

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
    const upcomingSchedule = [...allUpcomingDemoMap.values()]
      .filter((demo) => demo.leadId && repLeadIdSet.has(demo.leadId))
      .map((demo) => ({
        id: demo.leadId as string,
        startsAt: demo.scheduledAt.getTime(),
        label: `${demo.scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - Demo: ${demo.leadName}`,
      }))
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, 4);

    const teamLeadIds = new Set<string>();
    const leaderboardSeed = new Map<string, DashboardLeaderboardRow>();

    for (const lead of visibleLeads) {
      if (typeof lead.ownerId === "string" && lead.ownerId) {
        teamLeadIds.add(lead.ownerId);
      }
    }

    for (const [userId, claimedLeads] of claimedLeadCountsMap.entries()) {
      teamLeadIds.add(userId);
      leaderboardSeed.set(userId, {
        userId,
        userName: usersById.get(userId) ?? userId,
        claimedLeads,
        dialsToday: 0,
        conversationsToday: 0,
        demosThisWeek: 0,
        closesThisMonth: 0,
        revenueThisMonth: 0,
        scoreToday: 0,
        streakDays: 0,
      });
    }

    for (const userId of teamLeadIds) {
      if (!leaderboardSeed.has(userId)) {
        leaderboardSeed.set(userId, {
          userId,
          userName: usersById.get(userId) ?? userId,
          claimedLeads: 0,
          dialsToday: 0,
          conversationsToday: 0,
          demosThisWeek: 0,
          closesThisMonth: 0,
          revenueThisMonth: 0,
          scoreToday: 0,
          streakDays: 0,
        });
      }
    }

    for (const row of leaderboardSeed.values()) {
      const ownedLeads = visibleLeads.filter((lead) => lead.ownerId === row.userId);
      const ownedLeadIds = new Set(ownedLeads.map((lead) => lead.id));
      const ownedCalls = calls.filter((call) => typeof call.lead_id === "string" && ownedLeadIds.has(call.lead_id));
      const callsToday = ownedCalls.filter((call) => {
        const at = parseDate(call.created_at);
        return at ? isSameDayInTimeZone(at, now) : false;
      });
      const conversationsToday = callsToday.filter((call) => typeof call.duration_seconds === "number" && call.duration_seconds >= 45);
      const demosThisWeek = ownedLeads.filter((lead) => {
        const bookedAt = parseDate(lead.demoBooking?.bookedAt);
        if (bookedAt) return isOnOrAfterWeekStartInTimeZone(bookedAt, now);
        const demoAt = parseDemoDate(lead);
        return demoAt ? isOnOrAfterWeekStartInTimeZone(demoAt, now) : false;
      });
      const closedThisMonth = ownedLeads.filter((lead) => {
        const closedAt = parseDate(lead.closedAt);
        return closedAt ? isSameMonthInTimeZone(closedAt, now) : false;
      });
      const closesToday = closedThisMonth.filter((lead) => {
        const closedAt = parseDate(lead.closedAt);
        return closedAt ? isSameDayInTimeZone(closedAt, now) : false;
      });

      row.userName = usersById.get(row.userId) ?? row.userName;
      row.dialsToday = callsToday.length;
      row.conversationsToday = conversationsToday.length;
      row.demosThisWeek = demosThisWeek.length;
      row.closesThisMonth = closedThisMonth.length;
      row.revenueThisMonth = sum(closedThisMonth.map((lead) => (typeof lead.closedDealValue === "number" ? lead.closedDealValue : 0)));
      row.scoreToday = computeScore({
        dials: callsToday.length,
        conversations: conversationsToday.length,
        demos: ownedLeads.filter((lead) => {
          const bookedAt = parseDate(lead.demoBooking?.bookedAt);
          return bookedAt ? isSameDayInTimeZone(bookedAt, now) : false;
        }).length,
        closes: closesToday.length,
      });
      row.streakDays = computeStreak(calls, visibleLeads, now, row.userId, ownedLeadIds);
    }

    const leaderboard = [...leaderboardSeed.values()]
      .filter((row) => row.claimedLeads > 0 || row.dialsToday > 0 || row.demosThisWeek > 0 || row.closesThisMonth > 0 || row.revenueThisMonth > 0)
      .sort((a, b) =>
        b.scoreToday - a.scoreToday ||
        b.revenueThisMonth - a.revenueThisMonth ||
        b.demosThisWeek - a.demosThisWeek ||
        b.claimedLeads - a.claimedLeads ||
        a.userName.localeCompare(b.userName))
      .slice(0, 8);

    const upcomingDemos = [...allUpcomingDemoMap.values()];
    const closedThisMonthAll = visibleLeads.filter((lead) => {
      const closedAt = parseDate(lead.closedAt);
      return closedAt ? isSameMonthInTimeZone(closedAt, now) : false;
    });
    const liveSitesAll = visibleLeads.filter((lead) => lead.siteStatus === "LIVE" || Boolean(lead.deployedUrl)).length;

    return NextResponse.json({
      generatedAt: now.toISOString(),
      viewerRole,
      rep: {
        headline: repScoreToday >= 40 ? "Strong day. Keep stacking real conversations." : repScoreToday >= 20 ? "Momentum is building. Push for the next booked demo." : "Early board. The next call matters.",
        scoreToday: repScoreToday,
        streakDays: repStreak,
        kpis: {
          claimedLeads: repLeads.length,
          dialsToday: repCallsToday.length,
          conversationsToday: repConversationsToday.length,
          talkMinutesToday: Math.round(repTalkSecondsToday / 60),
          demosThisWeek: repDemosThisWeek.length,
          revenueThisMonth: repRevenueThisMonth,
          closesThisMonth: repClosedThisMonth.length,
          liveSites: repLiveSites,
        },
        targets: [
          { label: "Dials", completed: repCallsToday.length, target: 40, tone: "indigo" },
          { label: "Conversations", completed: repConversationsToday.length, target: 8, tone: "amber" },
          { label: "Demos Booked", completed: repDemosThisWeek.length, target: 2, tone: "emerald" },
        ],
        progress: {
          scoreLabel: compactNumber(repScoreToday),
          revenueLabel: currency(repRevenueThisMonth),
          talkLabel: minutesLabel(repTalkSecondsToday),
        },
        focusLeads,
        recentActivity,
        upcomingSchedule,
      },
      team: {
        summary: {
          activeReps: new Set(visibleLeads.map((lead) => lead.ownerId).filter((value): value is string => typeof value === "string" && value.length > 0)).size,
          claimedLeads: visibleLeads.filter((lead) => Boolean(lead.ownerId)).length,
          upcomingDemos: upcomingDemos.length,
          closedRevenueThisMonth: sum(closedThisMonthAll.map((lead) => (typeof lead.closedDealValue === "number" ? lead.closedDealValue : 0))),
          liveSites: liveSitesAll,
        },
        leaderboard,
        topPerformer: leaderboard[0] ?? null,
        needsAttention: leaderboard
          .filter((row) => row.dialsToday === 0 && row.claimedLeads > 0)
          .sort((a, b) => b.claimedLeads - a.claimedLeads)
          .slice(0, 3),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build dashboard metrics." },
      { status: 500 },
    );
  }
}
