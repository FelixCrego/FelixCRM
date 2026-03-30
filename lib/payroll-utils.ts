import { COMMISSION_FEE_HOLDBACK_RATE, getEffectiveCommissionRate } from "@/lib/commission-utils";
import type { Lead } from "@/lib/types";
import type { PayType, WorkforceUser, TimeClockEntry } from "@/lib/workforce-store";

export const OVERTIME_RATE_MULTIPLIER = 1.5;

export type WeeklyPayrollSummary = {
  weekStart: string;
  weekEnd: string;
  regularMinutes: number;
  overtimeApprovedMinutes: number;
  overtimePendingMinutes: number;
  commissionDeals: number;
  commissionEarned: number;
  commissionPaid: number;
  commissionUnpaid: number;
  regularPay: number;
  overtimeApprovedPay: number;
  overtimePendingPay: number;
  totalOwed: number;
  totalProjected: number;
};

export type UserPayrollSummary = {
  userId: string;
  name: string;
  email: string | null;
  payType: PayType;
  hourlyRate: number | null;
  commissionRate: number;
  currentWeek: WeeklyPayrollSummary;
  history: WeeklyPayrollSummary[];
};

type MutablePayrollSummary = {
  weekStart: string;
  regularMinutes: number;
  overtimeApprovedMinutes: number;
  overtimePendingMinutes: number;
  commissionDeals: number;
  commissionEarned: number;
  commissionPaid: number;
};

function getWeekStart(date: Date) {
  const normalized = new Date(date);
  const day = normalized.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + diff);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized.toISOString();
}

function addDays(iso: string, days: number) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function minutesBetween(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.max(1, Math.round((end - start) / 60000));
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isClosedDeal(lead: Lead) {
  return lead.status === "CLOSED" && typeof lead.closedDealValue === "number" && lead.closedDealValue > 0 && Boolean(lead.closedAt);
}

function getAttributedRepId(lead: Lead) {
  return lead.soldByUserId ?? lead.ownerId ?? null;
}

export function supportsHourlyTracking(payType: PayType) {
  return payType === "HOURLY" || payType === "HOURLY_PLUS_COMMISSION";
}

export function supportsCommission(payType: PayType) {
  return payType === "COMMISSION" || payType === "HOURLY_PLUS_COMMISSION";
}

function createMutableWeek(weekStart: string): MutablePayrollSummary {
  return {
    weekStart,
    regularMinutes: 0,
    overtimeApprovedMinutes: 0,
    overtimePendingMinutes: 0,
    commissionDeals: 0,
    commissionEarned: 0,
    commissionPaid: 0,
  };
}

function getOrCreateWeek(weeks: Map<string, MutablePayrollSummary>, weekStart: string) {
  const existing = weeks.get(weekStart);
  if (existing) return existing;
  const created = createMutableWeek(weekStart);
  weeks.set(weekStart, created);
  return created;
}

function getEntryDuration(entry: TimeClockEntry, nowIso: string) {
  if (typeof entry.durationMinutes === "number" && entry.durationMinutes > 0) return entry.durationMinutes;
  if (entry.clockOutAt) return minutesBetween(entry.clockInAt, entry.clockOutAt);
  return minutesBetween(entry.clockInAt, nowIso);
}

function applyEntryToWeeks(user: WorkforceUser, weeks: Map<string, MutablePayrollSummary>, nowIso: string) {
  const entriesByWeek = new Map<string, TimeClockEntry[]>();
  for (const entry of user.entries) {
    const weekStart = entry.weekStart || getWeekStart(new Date(entry.clockInAt));
    const bucket = entriesByWeek.get(weekStart) ?? [];
    bucket.push(entry);
    entriesByWeek.set(weekStart, bucket);
  }

  for (const [weekStart, entries] of entriesByWeek) {
    const week = getOrCreateWeek(weeks, weekStart);
    const maxWeeklyMinutes = user.settings.maxWeeklyHours !== null ? Math.round(user.settings.maxWeeklyHours * 60) : null;
    let cumulativeMinutes = 0;
    const sortedEntries = [...entries].sort((a, b) => new Date(a.clockInAt).getTime() - new Date(b.clockInAt).getTime());

    for (const entry of sortedEntries) {
      const durationMinutes = getEntryDuration(entry, nowIso);
      const hasRecordedBreakdown = typeof entry.regularMinutes === "number" && typeof entry.overtimeMinutes === "number";
      let regularMinutes = hasRecordedBreakdown ? Math.max(0, entry.regularMinutes ?? 0) : durationMinutes;
      let overtimeMinutes = hasRecordedBreakdown ? Math.max(0, entry.overtimeMinutes ?? 0) : 0;

      if (!hasRecordedBreakdown && maxWeeklyMinutes !== null) {
        const overtimeBefore = Math.max(0, cumulativeMinutes - maxWeeklyMinutes);
        const overtimeAfter = Math.max(0, cumulativeMinutes + durationMinutes - maxWeeklyMinutes);
        overtimeMinutes = Math.max(0, overtimeAfter - overtimeBefore);
        regularMinutes = Math.max(0, durationMinutes - overtimeMinutes);
      }

      cumulativeMinutes += durationMinutes;
      week.regularMinutes += regularMinutes;

      if (overtimeMinutes <= 0) continue;
      if (entry.overtimeStatus === "PENDING") {
        week.overtimePendingMinutes += overtimeMinutes;
      } else if (entry.overtimeStatus === "APPROVED" || entry.overtimeStatus === "NONE") {
        week.overtimeApprovedMinutes += overtimeMinutes;
      }
    }
  }
}

function applyLeadToWeeks(user: WorkforceUser, weeks: Map<string, MutablePayrollSummary>, lead: Lead) {
  const closedAt = parseDate(lead.closedAt);
  if (!closedAt || !supportsCommission(user.settings.payType)) return;

  const week = getOrCreateWeek(weeks, getWeekStart(closedAt));
  const grossRevenue = lead.closedDealValue ?? 0;
  const netRevenue = grossRevenue - grossRevenue * COMMISSION_FEE_HOLDBACK_RATE;
  const commissionRate = getEffectiveCommissionRate(lead.soldByEmail ?? user.email, user.settings.commissionRate);
  const commissionEarned = netRevenue * commissionRate;
  const paidAmount =
    lead.commissionPayout?.status === "PAID"
      ? Math.min(commissionEarned, lead.commissionPayout?.paidAmount ?? commissionEarned)
      : 0;

  week.commissionDeals += 1;
  week.commissionEarned += commissionEarned;
  week.commissionPaid += paidAmount;
}

function finalizeWeek(user: WorkforceUser, week: MutablePayrollSummary): WeeklyPayrollSummary {
  const hourlyRate = user.settings.hourlyRate ?? 0;
  const regularPay = (week.regularMinutes / 60) * hourlyRate;
  const overtimeApprovedPay = (week.overtimeApprovedMinutes / 60) * hourlyRate * OVERTIME_RATE_MULTIPLIER;
  const overtimePendingPay = (week.overtimePendingMinutes / 60) * hourlyRate * OVERTIME_RATE_MULTIPLIER;
  const commissionUnpaid = Math.max(0, week.commissionEarned - week.commissionPaid);
  const totalOwed = regularPay + overtimeApprovedPay + commissionUnpaid;
  const totalProjected = totalOwed + overtimePendingPay;

  return {
    weekStart: week.weekStart,
    weekEnd: addDays(week.weekStart, 6),
    regularMinutes: week.regularMinutes,
    overtimeApprovedMinutes: week.overtimeApprovedMinutes,
    overtimePendingMinutes: week.overtimePendingMinutes,
    commissionDeals: week.commissionDeals,
    commissionEarned: week.commissionEarned,
    commissionPaid: week.commissionPaid,
    commissionUnpaid,
    regularPay,
    overtimeApprovedPay,
    overtimePendingPay,
    totalOwed,
    totalProjected,
  };
}

export function buildPayrollSummaries(users: WorkforceUser[], leads: Lead[], weeksToInclude = 8): UserPayrollSummary[] {
  const nowIso = new Date().toISOString();
  const currentWeek = getWeekStart(new Date());
  const leadsByUserId = new Map<string, Lead[]>();

  for (const lead of leads) {
    if (!isClosedDeal(lead)) continue;
    const userId = getAttributedRepId(lead);
    if (!userId) continue;
    const bucket = leadsByUserId.get(userId) ?? [];
    bucket.push(lead);
    leadsByUserId.set(userId, bucket);
  }

  return users.map((user) => {
    const weeks = new Map<string, MutablePayrollSummary>();
    weeks.set(currentWeek, createMutableWeek(currentWeek));
    applyEntryToWeeks(user, weeks, nowIso);
    for (const lead of leadsByUserId.get(user.id) ?? []) {
      applyLeadToWeeks(user, weeks, lead);
    }

    const history = [...weeks.values()]
      .sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime())
      .slice(0, weeksToInclude)
      .map((week) => finalizeWeek(user, week));
    const currentWeekSummary = history.find((week) => week.weekStart === currentWeek) ?? finalizeWeek(user, createMutableWeek(currentWeek));

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      payType: user.settings.payType,
      hourlyRate: user.settings.hourlyRate,
      commissionRate: supportsCommission(user.settings.payType) ? getEffectiveCommissionRate(user.email, user.settings.commissionRate) : 0,
      currentWeek: currentWeekSummary,
      history,
    };
  });
}
