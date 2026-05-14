"use client";

import { useEffect, useMemo, useState } from "react";
import { AlarmClockCheck, BadgeDollarSign, Clock3, ShieldAlert, TimerReset, UserCog } from "lucide-react";
import { getEffectiveCommissionRate } from "@/lib/commission-utils";

type PayType = "COMMISSION" | "HOURLY" | "HOURLY_PLUS_COMMISSION";
type OvertimeStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";
type TimeEditRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
type TimeEditRequestType = "ADD_SHIFT" | "EDIT_SHIFT";
type CrmPresenceStatus = "ACTIVE" | "STALE" | "ENDED";
type TimeClockEntry = {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  durationMinutes: number | null;
  overtimeMinutes: number | null;
  overtimeStatus: OvertimeStatus;
  approvedByName: string | null;
  approvedAt: string | null;
};
type TimeEditRequest = {
  id: string;
  requestType: TimeEditRequestType;
  targetEntryId: string | null;
  requestedClockInAt: string;
  requestedClockOutAt: string;
  note: string | null;
  status: TimeEditRequestStatus;
  submittedAt: string;
  submittedByName: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
};
type WorkforceUser = {
  id: string;
  email: string | null;
  name: string;
  role: string;
  crmPresence: {
    displayStatus: CrmPresenceStatus;
    startedAt: string;
    lastSeenAt: string;
    lastPath: string | null;
    durationMinutes: number;
  } | null;
  settings: {
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
  currentEntry: TimeClockEntry | null;
  entries: TimeClockEntry[];
  editRequests: TimeEditRequest[];
  weeklyWorkedMinutes: number;
  weeklyPendingOvertimeMinutes: number;
  weeklyApprovedOvertimeMinutes: number;
  weeklyRemainingMinutes: number | null;
};
type PendingApproval = {
  employeeUserId: string;
  employeeName: string;
  employeeEmail: string | null;
  entryId: string;
  clockInAt: string;
  clockOutAt: string | null;
  overtimeMinutes: number;
  maxWeeklyHours: number | null;
};
type PendingTimeEditRequest = {
  employeeUserId: string;
  employeeName: string;
  employeeEmail: string | null;
  requestId: string;
  requestType: TimeEditRequestType;
  submittedAt: string;
  submittedByName: string;
  requestedClockInAt: string;
  requestedClockOutAt: string;
  note: string | null;
  targetEntryId: string | null;
  originalClockInAt: string | null;
  originalClockOutAt: string | null;
};
type Snapshot = {
  viewerRole?: string;
  canManageWorkforce: boolean;
  canEditAssignments: boolean;
  crmSessionTrackingAvailable: boolean;
  self: WorkforceUser;
  team: WorkforceUser[];
  liveWorkforce: {
    sessionTrackingEnabled: boolean;
    summary: {
      clockedInCount: number;
      activeInCrmCount: number;
      idleCount: number;
    };
    clockedInUsers: Array<{
      userId: string;
      name: string;
      email: string | null;
      role: string;
      payType: PayType;
      clockInAt: string;
      clockedInMinutes: number;
      weeklyWorkedMinutes: number;
      crmPresence: "ACTIVE" | "IDLE" | "UNAVAILABLE";
      lastSeenAt: string | null;
      lastPath: string | null;
    }>;
  } | null;
  payroll: {
    self: UserPayrollSummary;
    team: UserPayrollSummary[];
  };
  pendingApprovals: PendingApproval[];
  pendingTimeEditRequests: PendingTimeEditRequest[];
};
type WeeklyPayrollSummary = {
  weekStart: string;
  weekEnd: string;
  regularMinutes: number;
  overtimeApprovedMinutes: number;
  overtimePendingMinutes: number;
  commissionDeals: number;
  commissionEarned: number;
  commissionPaid: number;
  commissionUnpaid: number;
  overrideDeals: number;
  managerOverrideEarned: number;
  teamLeadOverrideEarned: number;
  overrideEarned: number;
  regularPay: number;
  overtimeApprovedPay: number;
  overtimePendingPay: number;
  totalOwed: number;
  totalProjected: number;
};
type UserPayrollSummary = {
  userId: string;
  name: string;
  email: string | null;
  payType: PayType;
  hourlyRate: number | null;
  commissionRate: number;
  currentWeek: WeeklyPayrollSummary;
  history: WeeklyPayrollSummary[];
};
type Draft = {
  role: string;
  payType: PayType;
  hourlyRate: string;
  commissionRate: string;
  maxWeeklyHours: string;
  requireOvertimeApproval: boolean;
  managerUserId: string;
  teamLeadUserId: string;
  managerOverrideRate: string;
  teamLeadOverrideRate: string;
  editEntryId: string;
  editClockInAt: string;
  editClockOutAt: string;
};
type SelfRequestDraft = {
  targetEntryId: string;
  requestedClockInAt: string;
  requestedClockOutAt: string;
  note: string;
};

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatHours(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "--";
  const wholeHours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (wholeHours === 0) return `${remainder}m`;
  return remainder === 0 ? `${wholeHours}h` : `${wholeHours}h ${remainder}m`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Pending";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Pending";
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function toLocalInputValue(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function localInputToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildDraft(user: WorkforceUser): Draft {
  return {
    role: user.role,
    payType: user.settings.payType,
    hourlyRate: user.settings.hourlyRate !== null ? String(user.settings.hourlyRate) : "",
    commissionRate: String(Math.round(getEffectiveCommissionRate(user.email, user.settings.commissionRate) * 100)),
    maxWeeklyHours: user.settings.maxWeeklyHours !== null ? String(user.settings.maxWeeklyHours) : "",
    requireOvertimeApproval: user.settings.requireOvertimeApproval,
    managerUserId: user.settings.managerUserId ?? "",
    teamLeadUserId: user.settings.teamLeadUserId ?? "",
    managerOverrideRate:
      user.settings.managerOverrideRate !== null && user.settings.managerOverrideRate !== undefined
        ? String(Math.round(user.settings.managerOverrideRate * 1000) / 10)
        : "",
    teamLeadOverrideRate:
      user.settings.teamLeadOverrideRate !== null && user.settings.teamLeadOverrideRate !== undefined
        ? String(Math.round(user.settings.teamLeadOverrideRate * 1000) / 10)
        : "",
    editEntryId: "",
    editClockInAt: "",
    editClockOutAt: "",
  };
}

function emptySelfRequestDraft(): SelfRequestDraft {
  return {
    targetEntryId: "",
    requestedClockInAt: "",
    requestedClockOutAt: "",
    note: "",
  };
}

function parseDraftNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function badgeTone(status: OvertimeStatus | TimeEditRequestStatus) {
  if (status === "APPROVED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "PENDING") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (status === "REJECTED") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  return "border-zinc-700 bg-zinc-800/70 text-zinc-300";
}

function crmPresenceTone(status: CrmPresenceStatus | null, trackingAvailable: boolean) {
  if (!trackingAvailable) return "border-zinc-700 bg-zinc-800/70 text-zinc-400";
  if (status === "ACTIVE") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "STALE") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (status === "ENDED") return "border-zinc-600/40 bg-zinc-700/20 text-zinc-200";
  return "border-zinc-700 bg-zinc-800/70 text-zinc-400";
}

function crmPresenceLabel(status: CrmPresenceStatus | null, trackingAvailable: boolean) {
  if (!trackingAvailable) return "CRM Unavailable";
  if (status === "ACTIVE") return "CRM Active";
  if (status === "STALE") return "CRM Stale";
  if (status === "ENDED") return "CRM Ended";
  return "No CRM Activity";
}

function clockBadgeTone(user: WorkforceUser) {
  if (user.currentEntry) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (supportsHourlyTracking(user.settings.payType)) return "border-zinc-700 bg-zinc-800/70 text-zinc-300";
  return "border-zinc-800 bg-zinc-900 text-zinc-500";
}

function clockBadgeLabel(user: WorkforceUser) {
  if (user.currentEntry) return "Clocked In";
  if (supportsHourlyTracking(user.settings.payType)) return "Clocked Out";
  return "Hourly Disabled";
}

function crmActivitySummary(user: WorkforceUser, trackingAvailable: boolean) {
  if (!trackingAvailable) return "CRM activity tracking is unavailable right now.";
  if (!user.crmPresence) return "No CRM activity has been captured for this user yet.";
  return `Last CRM activity ${formatDateTime(user.crmPresence.lastSeenAt)}`;
}

function supportsHourlyTracking(payType: PayType) {
  return payType === "HOURLY" || payType === "HOURLY_PLUS_COMMISSION";
}

function supportsCommission(payType: PayType) {
  return payType === "COMMISSION" || payType === "HOURLY_PLUS_COMMISSION";
}

function payTypeLabel(payType: PayType) {
  if (payType === "HOURLY_PLUS_COMMISSION") return "Hourly + Commission";
  if (payType === "HOURLY") return "Hourly";
  return "Commission";
}

function roleLabel(role: string) {
  return role.replaceAll("_", " ");
}

function requestTypeLabel(requestType: TimeEditRequestType) {
  return requestType === "EDIT_SHIFT" ? "Edit Shift" : "Add Shift";
}

function entryOptionLabel(entry: TimeClockEntry) {
  return `${formatDateTime(entry.clockInAt)}${entry.clockOutAt ? ` -> ${formatDateTime(entry.clockOutAt)}` : " -> Open shift"}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function liveCrmPresenceTone(presence: "ACTIVE" | "IDLE" | "UNAVAILABLE") {
  if (presence === "ACTIVE") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (presence === "IDLE") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-zinc-700 bg-zinc-800/70 text-zinc-300";
}

function liveCrmPresenceLabel(presence: "ACTIVE" | "IDLE" | "UNAVAILABLE") {
  if (presence === "ACTIVE") return "Active In CRM";
  if (presence === "IDLE") return "Clocked In, Idle";
  return "CRM Activity Unknown";
}

export default function TimeClockPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selfRequestDraft, setSelfRequestDraft] = useState<SelfRequestDraft>(emptySelfRequestDraft());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSnapshot(mode: "initial" | "refresh" = "initial") {
    try {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);
      const response = await fetch("/api/time-clock", { cache: "no-store", credentials: "include" });
      const payload = (await response.json().catch(() => null)) as Snapshot | { error?: string } | null;
      if (!response.ok || !payload || !("self" in payload)) {
        throw new Error(payload && "error" in payload && typeof payload.error === "string" ? payload.error : "Failed to load time clock.");
      }
      setSnapshot(payload);
      setDrafts(Object.fromEntries(payload.team.map((user) => [user.id, buildDraft(user)])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load time clock.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function runRequest(method: "POST" | "PATCH", body: Record<string, unknown>, busy: string) {
    try {
      setBusyKey(busy);
      setError(null);
      const response = await fetch("/api/time-clock", {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as Snapshot | { error?: string } | null;
      if (!response.ok || !payload || !("self" in payload)) {
        throw new Error(payload && "error" in payload && typeof payload.error === "string" ? payload.error : "Request failed.");
      }
      setSnapshot(payload);
      setDrafts(Object.fromEntries(payload.team.map((user) => [user.id, buildDraft(user)])));
      return payload;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
      return null;
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    void loadSnapshot("initial");
  }, []);

  const self = snapshot?.self ?? null;
  const payrollSelf = snapshot?.payroll?.self ?? null;
  const selfSupportsHourly = self ? supportsHourlyTracking(self.settings.payType) : false;
  const selfSupportsCommission = self ? supportsCommission(self.settings.payType) : false;
  const weeklyGross = useMemo(() => {
    if (!self || self.settings.hourlyRate === null) return null;
    return (self.weeklyWorkedMinutes / 60) * self.settings.hourlyRate;
  }, [self]);
  const effectiveSelfCommissionRate = self ? getEffectiveCommissionRate(self.email, self.settings.commissionRate) : 0;
  const teamUserById = useMemo(() => new Map((snapshot?.team ?? []).map((user) => [user.id, user])), [snapshot?.team]);
  const liveWorkforce = snapshot?.liveWorkforce ?? null;
  const managerOptions = useMemo(
    () => (snapshot?.team ?? []).filter((user) => user.role === "MANAGER" || user.role === "SUPER_ADMIN"),
    [snapshot?.team],
  );
  const teamLeadOptions = useMemo(
    () => (snapshot?.team ?? []).filter((user) => user.role === "TEAM_LEAD"),
    [snapshot?.team],
  );
  const managerReports = useMemo(() => {
    const map = new Map<string, WorkforceUser[]>();
    for (const user of snapshot?.team ?? []) {
      if (!user.settings.managerUserId) continue;
      const bucket = map.get(user.settings.managerUserId) ?? [];
      bucket.push(user);
      map.set(user.settings.managerUserId, bucket);
    }
    return map;
  }, [snapshot?.team]);
  const teamLeadReports = useMemo(() => {
    const map = new Map<string, WorkforceUser[]>();
    for (const user of snapshot?.team ?? []) {
      if (!user.settings.teamLeadUserId) continue;
      const bucket = map.get(user.settings.teamLeadUserId) ?? [];
      bucket.push(user);
      map.set(user.settings.teamLeadUserId, bucket);
    }
    return map;
  }, [snapshot?.team]);
  const sortedTeam = useMemo(() => {
    const crmStatusRank = (user: WorkforceUser) => {
      const status = user.crmPresence?.displayStatus;
      if (status === "ACTIVE") return 0;
      if (status === "STALE") return 1;
      if (status === "ENDED") return 2;
      return 3;
    };

    return [...(snapshot?.team ?? [])].sort((left, right) => {
      const clockPriority = Number(Boolean(right.currentEntry)) - Number(Boolean(left.currentEntry));
      if (clockPriority !== 0) return clockPriority;

      const crmPriority = crmStatusRank(left) - crmStatusRank(right);
      if (crmPriority !== 0) return crmPriority;

      const leftLastSeen = left.crmPresence ? new Date(left.crmPresence.lastSeenAt).getTime() : 0;
      const rightLastSeen = right.crmPresence ? new Date(right.crmPresence.lastSeenAt).getTime() : 0;
      if (rightLastSeen !== leftLastSeen) return rightLastSeen - leftLastSeen;

      return left.name.localeCompare(right.name);
    });
  }, [snapshot?.team]);
  const clockedInTeam = useMemo(() => sortedTeam.filter((user) => Boolean(user.currentEntry)), [sortedTeam]);
  const activeCrmTeam = useMemo(
    () => sortedTeam.filter((user) => user.crmPresence?.displayStatus === "ACTIVE"),
    [sortedTeam],
  );
  const latestCrmActivity = useMemo(
    () =>
      sortedTeam
        .filter((user) => user.crmPresence)
        .sort((left, right) => {
          const leftLastSeen = left.crmPresence ? new Date(left.crmPresence.lastSeenAt).getTime() : 0;
          const rightLastSeen = right.crmPresence ? new Date(right.crmPresence.lastSeenAt).getTime() : 0;
          return rightLastSeen - leftLastSeen;
        })[0] ?? null,
    [sortedTeam],
  );
  const teamPayrollHistory = useMemo(
    () =>
      (snapshot?.payroll.team ?? [])
        .flatMap((user) =>
          user.history.map((week) => ({
            userId: user.userId,
            name: user.name,
            payType: user.payType,
            week,
          })),
        )
        .sort(
          (left, right) =>
            new Date(right.week.weekStart).getTime() - new Date(left.week.weekStart).getTime() ||
            left.name.localeCompare(right.name),
        )
        .slice(0, 24),
    [snapshot?.payroll.team],
  );

  async function submitSelfEditRequest() {
    const requestedClockInAt = localInputToIso(selfRequestDraft.requestedClockInAt);
    const requestedClockOutAt = localInputToIso(selfRequestDraft.requestedClockOutAt);
    if (!requestedClockInAt || !requestedClockOutAt) {
      setError("Pick both the requested clock-in and clock-out times.");
      return;
    }

    const payload = await runRequest(
      "POST",
      {
        action: "SUBMIT_EDIT_REQUEST",
        targetEntryId: selfRequestDraft.targetEntryId || null,
        requestedClockInAt,
        requestedClockOutAt,
        note: selfRequestDraft.note.trim() || null,
      },
      "submit-edit-request",
    );

    if (payload) {
      setSelfRequestDraft(emptySelfRequestDraft());
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-blue-950/40 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-blue-200">Workforce</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Time Clock & Payroll</h1>
            <p className="mt-3 max-w-3xl text-sm text-zinc-300">Reps can clock in, track payroll, and submit missed-punch fixes here. Management can review overtime, approve edit requests, correct time directly, and manage team overrides from the same page.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadSnapshot("refresh")}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 disabled:opacity-60"
          >
            <TimerReset className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {error ? <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</section> : null}
      {!snapshot || !self ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-sm text-zinc-400">{loading ? "Loading time clock..." : "No workforce data found."}</section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-6">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Pay Mode</p>
              <p className="mt-2 text-2xl font-semibold text-white">{payTypeLabel(self.settings.payType)}</p>
              <p className="mt-2 text-sm text-zinc-400">{selfSupportsHourly ? "Clock and cap tracking enabled" : "Commission-only tracking"}</p>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Commission Rate</p>
              <p className="mt-2 text-3xl font-semibold text-white">{selfSupportsCommission ? formatPercent(effectiveSelfCommissionRate) : "--"}</p>
              <p className="mt-2 text-sm text-zinc-400">{selfSupportsCommission ? "Auto-pulled from your rep settings" : "Not active in this pay mode"}</p>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Hourly Rate</p>
              <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(self.settings.hourlyRate)}</p>
              <div className="mt-3 text-blue-300"><BadgeDollarSign className="h-4 w-4" /></div>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Weekly Cap</p>
              <p className="mt-2 text-3xl font-semibold text-white">{self.settings.maxWeeklyHours !== null ? `${self.settings.maxWeeklyHours}h` : "--"}</p>
              <div className="mt-3 text-blue-300"><Clock3 className="h-4 w-4" /></div>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Worked This Week</p>
              <p className="mt-2 text-3xl font-semibold text-white">{formatHours(self.weeklyWorkedMinutes)}</p>
              <p className="mt-2 text-sm text-zinc-400">{self.weeklyRemainingMinutes !== null ? `${formatHours(self.weeklyRemainingMinutes)} left before overtime` : "No weekly cap set"}</p>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Pending OT</p>
              <p className="mt-2 text-3xl font-semibold text-white">{formatHours(self.weeklyPendingOvertimeMinutes)}</p>
              <p className="mt-2 text-sm text-zinc-400">{weeklyGross !== null ? `Estimated gross ${formatCurrency(weeklyGross)}` : "Set a rate to estimate pay"}</p>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Current Week Owed</p>
              <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(payrollSelf?.currentWeek.totalOwed ?? 0)}</p>
              <p className="mt-2 text-sm text-zinc-400">{payrollSelf ? `${formatCurrency(payrollSelf.currentWeek.commissionUnpaid)} rep commission unpaid this week` : "Payroll summary unavailable"}</p>
            </article>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">My Shift</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{self.currentEntry ? "Clocked In" : selfSupportsHourly ? "Ready To Clock In" : "Hourly Tracking Not Enabled"}</h2>
                <p className="mt-2 text-sm text-zinc-400">{self.currentEntry ? `Started ${formatDateTime(self.currentEntry.clockInAt)}` : selfSupportsHourly ? "Punch in when your shift starts and clock out when you finish." : "A manager needs to switch you to an hourly pay mode before you can use the clock."}</p>
              </div>
              <button
                type="button"
                onClick={() => void runRequest("POST", { action: self.currentEntry ? "CLOCK_OUT" : "CLOCK_IN" }, "clock")}
                disabled={busyKey === "clock" || !selfSupportsHourly}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                  self.currentEntry ? "border border-rose-500/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15" : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
                }`}
              >
                <AlarmClockCheck className="h-4 w-4" />
                {busyKey === "clock" ? "Updating..." : self.currentEntry ? "Clock Out" : "Clock In"}
              </button>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <article className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
              <div className="mb-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Corrections</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Missed Punch Request</h2>
                <p className="mt-2 text-sm text-zinc-400">Use this when you missed a clock-in or clock-out. Management can approve the correction directly into payroll.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 md:col-span-2">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Existing Shift</span>
                  <select
                    value={selfRequestDraft.targetEntryId}
                    onChange={(event) => {
                      const entryId = event.target.value;
                      const entry = self.entries.find((item) => item.id === entryId) ?? null;
                      setSelfRequestDraft((current) => ({
                        ...current,
                        targetEntryId: entryId,
                        requestedClockInAt: entry ? toLocalInputValue(entry.clockInAt) : current.requestedClockInAt,
                        requestedClockOutAt: entry ? toLocalInputValue(entry.clockOutAt) : current.requestedClockOutAt,
                      }));
                    }}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                  >
                    <option value="">New missed shift</option>
                    {self.entries.slice(0, 12).map((entry) => (
                      <option key={entry.id} value={entry.id}>{entryOptionLabel(entry)}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Requested Clock In</span>
                  <input
                    type="datetime-local"
                    value={selfRequestDraft.requestedClockInAt}
                    onChange={(event) => setSelfRequestDraft((current) => ({ ...current, requestedClockInAt: event.target.value }))}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Requested Clock Out</span>
                  <input
                    type="datetime-local"
                    value={selfRequestDraft.requestedClockOutAt}
                    onChange={(event) => setSelfRequestDraft((current) => ({ ...current, requestedClockOutAt: event.target.value }))}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Reason</span>
                  <textarea
                    rows={3}
                    value={selfRequestDraft.note}
                    onChange={(event) => setSelfRequestDraft((current) => ({ ...current, note: event.target.value }))}
                    placeholder="Example: forgot to clock out after the 4:30 PM demo"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-zinc-500">Approved requests write back into payroll and the shift history automatically.</p>
                <button
                  type="button"
                  onClick={() => void submitSelfEditRequest()}
                  disabled={busyKey === "submit-edit-request"}
                  className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/15 disabled:opacity-60"
                >
                  {busyKey === "submit-edit-request" ? "Submitting..." : "Submit Edit Request"}
                </button>
              </div>
            </article>

            <article className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Request History</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">My Time Edit Requests</h2>
                </div>
                <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">{self.editRequests.length} total</span>
              </div>
              <div className="space-y-3">
                {self.editRequests.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">No edit requests submitted yet.</div>
                ) : (
                  self.editRequests.slice(0, 6).map((request) => (
                    <article key={request.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{requestTypeLabel(request.requestType)}</p>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${badgeTone(request.status)}`}>{request.status}</span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-300">{formatDateTime(request.requestedClockInAt)} to {formatDateTime(request.requestedClockOutAt)}</p>
                      <p className="mt-1 text-xs text-zinc-500">Submitted {formatDateTime(request.submittedAt)}{request.reviewedAt ? ` | Reviewed by ${request.reviewedByName ?? "Manager"} ${formatDateTime(request.reviewedAt)}` : ""}</p>
                      {request.note ? <p className="mt-2 text-sm text-zinc-400">{request.note}</p> : null}
                    </article>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Payroll</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">This Week Payroll</h2>
                <p className="mt-2 text-sm text-zinc-400">Hourly pay, overtime, rep commission, and team overrides are split into separate lines so payroll is easy to audit.</p>
              </div>
              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                OT uses 1.5x
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-6">
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Base Hourly</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(payrollSelf?.currentWeek.regularPay ?? 0)}</p>
                <p className="mt-2 text-sm text-zinc-400">{formatHours(payrollSelf?.currentWeek.regularMinutes ?? 0)}</p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Approved OT</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(payrollSelf?.currentWeek.overtimeApprovedPay ?? 0)}</p>
                <p className="mt-2 text-sm text-zinc-400">{formatHours(payrollSelf?.currentWeek.overtimeApprovedMinutes ?? 0)}</p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Pending OT</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(payrollSelf?.currentWeek.overtimePendingPay ?? 0)}</p>
                <p className="mt-2 text-sm text-zinc-400">{formatHours(payrollSelf?.currentWeek.overtimePendingMinutes ?? 0)}</p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Rep Commission</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(payrollSelf?.currentWeek.commissionEarned ?? 0)}</p>
                <p className="mt-2 text-sm text-zinc-400">{payrollSelf?.currentWeek.commissionDeals ?? 0} closed deal(s)</p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Team Overrides</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(payrollSelf?.currentWeek.overrideEarned ?? 0)}</p>
                <p className="mt-2 text-sm text-zinc-400">{payrollSelf?.currentWeek.overrideDeals ?? 0} team deal(s)</p>
              </article>
              <article className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-blue-200">Total Owed</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(payrollSelf?.currentWeek.totalOwed ?? 0)}</p>
                <p className="mt-2 text-sm text-blue-100/80">Projected with pending OT: {formatCurrency(payrollSelf?.currentWeek.totalProjected ?? 0)}</p>
              </article>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">History</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Recent Shifts</h2>
              </div>
              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">{self.entries.length} entries</span>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-zinc-800">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-zinc-950 text-zinc-400"><tr><th className="px-4 py-3">Clock In</th><th className="px-4 py-3">Clock Out</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">OT</th><th className="px-4 py-3">Approval</th><th className="px-4 py-3">Reviewed By</th></tr></thead>
                <tbody>
                  {self.entries.length === 0 ? <tr className="border-t border-zinc-800 bg-zinc-900/70 text-zinc-400"><td className="px-4 py-4" colSpan={6}>No shifts logged yet.</td></tr> : self.entries.slice(0, 14).map((entry) => (
                    <tr key={entry.id} className="border-t border-zinc-800 bg-zinc-900/70 text-zinc-200">
                      <td className="px-4 py-3">{formatDateTime(entry.clockInAt)}</td>
                      <td className="px-4 py-3">{formatDateTime(entry.clockOutAt)}</td>
                      <td className="px-4 py-3">{formatHours(entry.durationMinutes)}</td>
                      <td className="px-4 py-3">{formatHours(entry.overtimeMinutes ?? 0)}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${badgeTone(entry.overtimeStatus)}`}>{entry.overtimeStatus === "NONE" ? "No OT" : entry.overtimeStatus}</span></td>
                      <td className="px-4 py-3 text-zinc-400">{entry.approvedByName ?? "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Payroll History</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Weekly Payroll Snapshot</h2>
              </div>
              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                {payrollSelf?.history.length ?? 0} weeks
              </span>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-zinc-800">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Week</th>
                    <th className="px-4 py-3">Hourly</th>
                    <th className="px-4 py-3">Approved OT</th>
                    <th className="px-4 py-3">Pending OT</th>
                    <th className="px-4 py-3">Rep Commission</th>
                    <th className="px-4 py-3">Overrides</th>
                    <th className="px-4 py-3">Total Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {(payrollSelf?.history.length ?? 0) === 0 ? (
                    <tr className="border-t border-zinc-800 bg-zinc-900/70 text-zinc-400">
                      <td className="px-4 py-4" colSpan={7}>No payroll history yet.</td>
                    </tr>
                  ) : (
                    payrollSelf?.history.map((week) => (
                      <tr key={week.weekStart} className="border-t border-zinc-800 bg-zinc-900/70 text-zinc-200">
                        <td className="px-4 py-3">{new Date(week.weekStart).toLocaleDateString()} - {new Date(week.weekEnd).toLocaleDateString()}</td>
                        <td className="px-4 py-3">{formatCurrency(week.regularPay)}</td>
                        <td className="px-4 py-3">{formatCurrency(week.overtimeApprovedPay)}</td>
                        <td className="px-4 py-3 text-amber-300">{formatCurrency(week.overtimePendingPay)}</td>
                        <td className="px-4 py-3">{formatCurrency(week.commissionEarned)}</td>
                        <td className="px-4 py-3">{formatCurrency(week.overrideEarned)}</td>
                        <td className="px-4 py-3 font-semibold text-white">{formatCurrency(week.totalOwed)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {snapshot.canManageWorkforce ? (
            <>
              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Live Workforce</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Who Is Clocked In Right Now</h2>
                    <p className="mt-2 text-sm text-zinc-400">Open shifts plus whether the rep is actively moving inside the CRM.</p>
                  </div>
                  <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                    {liveWorkforce?.summary.clockedInCount ?? 0} clocked in
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <article className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Clocked In Now</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{liveWorkforce?.summary.clockedInCount ?? 0}</p>
                    <p className="mt-2 text-sm text-zinc-400">Anyone with an open shift on the payroll clock.</p>
                  </article>
                  <article className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-200/70">Active In CRM</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{liveWorkforce?.summary.activeInCrmCount ?? 0}</p>
                    <p className="mt-2 text-sm text-zinc-400">Clocked in and recently active in FelixCRM.</p>
                  </article>
                  <article className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-amber-200/70">Clocked In, Idle</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{liveWorkforce?.summary.idleCount ?? 0}</p>
                    <p className="mt-2 text-sm text-zinc-400">
                      {liveWorkforce?.sessionTrackingEnabled === false
                        ? "CRM session tracking is not installed, so idle vs active is unavailable."
                        : "Open shift but no recent CRM heartbeat."}
                    </p>
                  </article>
                </div>

                <div className="mt-4 space-y-3">
                  {(liveWorkforce?.clockedInUsers.length ?? 0) === 0 ? (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                      Nobody is clocked in right now.
                    </div>
                  ) : (
                    liveWorkforce?.clockedInUsers.map((employee) => (
                      <article key={employee.userId} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-lg font-semibold text-white">{employee.name}</p>
                              <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${liveCrmPresenceTone(employee.crmPresence)}`}>
                                {liveCrmPresenceLabel(employee.crmPresence)}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-zinc-400">
                              {employee.email ?? employee.userId} | {roleLabel(employee.role)} | {payTypeLabel(employee.payType)}
                            </p>
                            <p className="mt-2 text-sm text-zinc-300">
                              Clocked in {formatDateTime(employee.clockInAt)} | Live shift {formatHours(employee.clockedInMinutes)} | Worked this week {formatHours(employee.weeklyWorkedMinutes)}
                            </p>
                            {employee.lastSeenAt ? (
                              <p className="mt-1 text-xs text-zinc-500">
                                Last CRM activity {formatDateTime(employee.lastSeenAt)}
                                {employee.lastPath ? ` | ${employee.lastPath}` : ""}
                              </p>
                            ) : liveWorkforce?.sessionTrackingEnabled === false ? (
                              <p className="mt-1 text-xs text-zinc-500">CRM session tracking is unavailable in this environment.</p>
                            ) : (
                              <p className="mt-1 text-xs text-zinc-500">No active CRM session detected for this rep.</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const worker = teamUserById.get(employee.userId);
                              if (!worker) return;
                              setDrafts((current) => ({
                                ...current,
                                [employee.userId]: current[employee.userId] ?? buildDraft(worker),
                              }));
                              document.getElementById(`employee-${employee.userId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-600"
                          >
                            Open Employee Card
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Team Payroll</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Current Week Payroll Owed</h2>
                  </div>
                  <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                    {snapshot.payroll.team.length} reps
                  </span>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                  <table className="w-full min-w-[1080px] text-left text-sm">
                    <thead className="bg-zinc-950 text-zinc-400">
                      <tr>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Manager / Team Lead</th>
                        <th className="px-4 py-3">Pay Mode</th>
                        <th className="px-4 py-3">Commission Rate</th>
                        <th className="px-4 py-3">Hourly</th>
                        <th className="px-4 py-3">Approved OT</th>
                        <th className="px-4 py-3">Rep Commission</th>
                        <th className="px-4 py-3">Overrides</th>
                        <th className="px-4 py-3">Total Owed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.payroll.team.length === 0 ? (
                        <tr className="border-t border-zinc-800 bg-zinc-900/70 text-zinc-400">
                          <td className="px-4 py-4" colSpan={10}>No team payroll data yet.</td>
                        </tr>
                      ) : (
                        snapshot.payroll.team.map((user) => {
                          const worker = teamUserById.get(user.userId);
                          const managerName = worker?.settings.managerUserId ? teamUserById.get(worker.settings.managerUserId)?.name ?? "--" : "--";
                          const teamLeadName = worker?.settings.teamLeadUserId ? teamUserById.get(worker.settings.teamLeadUserId)?.name ?? "--" : "--";
                          return (
                            <tr key={user.userId} className="border-t border-zinc-800 bg-zinc-900/70 text-zinc-200">
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span className="font-medium text-white">{user.name}</span>
                                  <span className="text-xs text-zinc-500">{user.email ?? user.userId}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">{worker ? roleLabel(worker.role) : "--"}</td>
                              <td className="px-4 py-3 text-xs text-zinc-300">{managerName} / {teamLeadName}</td>
                              <td className="px-4 py-3">{payTypeLabel(user.payType)}</td>
                              <td className="px-4 py-3">{supportsCommission(user.payType) ? formatPercent(user.commissionRate) : "--"}</td>
                              <td className="px-4 py-3">{formatCurrency(user.currentWeek.regularPay)}</td>
                              <td className="px-4 py-3">{formatCurrency(user.currentWeek.overtimeApprovedPay)}</td>
                              <td className="px-4 py-3">{formatCurrency(user.currentWeek.commissionEarned)}</td>
                              <td className="px-4 py-3">{formatCurrency(user.currentWeek.overrideEarned)}</td>
                              <td className="px-4 py-3 font-semibold text-white">{formatCurrency(user.currentWeek.totalOwed)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Team Payroll History</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Recent Weekly Payroll</h2>
                  </div>
                  <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                    last 24 rows
                  </span>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                  <table className="w-full min-w-[920px] text-left text-sm">
                    <thead className="bg-zinc-950 text-zinc-400">
                      <tr>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">Week</th>
                        <th className="px-4 py-3">Hourly</th>
                        <th className="px-4 py-3">Approved OT</th>
                        <th className="px-4 py-3">Rep Commission</th>
                        <th className="px-4 py-3">Overrides</th>
                        <th className="px-4 py-3">Total Owed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamPayrollHistory.length === 0 ? (
                        <tr className="border-t border-zinc-800 bg-zinc-900/70 text-zinc-400">
                          <td className="px-4 py-4" colSpan={7}>No historical payroll rows yet.</td>
                        </tr>
                      ) : (
                        teamPayrollHistory.map((row) => (
                          <tr key={`${row.userId}-${row.week.weekStart}`} className="border-t border-zinc-800 bg-zinc-900/70 text-zinc-200">
                            <td className="px-4 py-3">{row.name}</td>
                            <td className="px-4 py-3">{new Date(row.week.weekStart).toLocaleDateString()} - {new Date(row.week.weekEnd).toLocaleDateString()}</td>
                            <td className="px-4 py-3">{formatCurrency(row.week.regularPay)}</td>
                            <td className="px-4 py-3">{formatCurrency(row.week.overtimeApprovedPay)}</td>
                            <td className="px-4 py-3">{formatCurrency(row.week.commissionEarned)}</td>
                            <td className="px-4 py-3">{formatCurrency(row.week.overrideEarned)}</td>
                            <td className="px-4 py-3 font-semibold text-white">{formatCurrency(row.week.totalOwed)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Manager Queue</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Overtime Approvals</h2>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {snapshot.pendingApprovals.length} pending
                  </div>
                </div>
                <div className="space-y-3">
                  {snapshot.pendingApprovals.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">No overtime approvals are waiting right now.</div>
                  ) : snapshot.pendingApprovals.map((approval) => (
                    <article key={approval.entryId} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-white">{approval.employeeName}</p>
                          <p className="mt-1 text-sm text-zinc-400">{approval.employeeEmail ?? "No email"} | Overtime {formatHours(approval.overtimeMinutes)}</p>
                          <p className="mt-2 text-xs text-zinc-500">Shift: {formatDateTime(approval.clockInAt)} to {formatDateTime(approval.clockOutAt)} | Weekly cap {approval.maxWeeklyHours !== null ? `${approval.maxWeeklyHours}h` : "Not set"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void runRequest("PATCH", { action: "REVIEW_OVERTIME", userId: approval.employeeUserId, entryId: approval.entryId, approved: true }, `approve-${approval.entryId}`)}
                            disabled={busyKey === `approve-${approval.entryId}` || busyKey === `reject-${approval.entryId}`}
                            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:opacity-60"
                          >
                            {busyKey === `approve-${approval.entryId}` ? "Saving..." : "Approve OT"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void runRequest("PATCH", { action: "REVIEW_OVERTIME", userId: approval.employeeUserId, entryId: approval.entryId, approved: false }, `reject-${approval.entryId}`)}
                            disabled={busyKey === `approve-${approval.entryId}` || busyKey === `reject-${approval.entryId}`}
                            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/15 disabled:opacity-60"
                          >
                            {busyKey === `reject-${approval.entryId}` ? "Saving..." : "Reject OT"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Manager Queue</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Time Edit Requests</h2>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {snapshot.pendingTimeEditRequests.length} pending
                  </div>
                </div>
                <div className="space-y-3">
                  {snapshot.pendingTimeEditRequests.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">No time-edit requests are waiting right now.</div>
                  ) : snapshot.pendingTimeEditRequests.map((request) => (
                    <article key={request.requestId} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <div className="flex flex-col gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-white">{request.employeeName}</p>
                            <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-200">{requestTypeLabel(request.requestType)}</span>
                          </div>
                          <p className="mt-1 text-sm text-zinc-400">{request.employeeEmail ?? "No email"} | Submitted by {request.submittedByName} {formatDateTime(request.submittedAt)}</p>
                          <p className="mt-2 text-sm text-zinc-300">Requested: {formatDateTime(request.requestedClockInAt)} to {formatDateTime(request.requestedClockOutAt)}</p>
                          {request.originalClockInAt || request.originalClockOutAt ? (
                            <p className="mt-1 text-xs text-zinc-500">Current record: {formatDateTime(request.originalClockInAt)} to {formatDateTime(request.originalClockOutAt)}</p>
                          ) : null}
                          {request.note ? <p className="mt-2 text-sm text-zinc-400">{request.note}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void runRequest("PATCH", { action: "REVIEW_TIME_EDIT", userId: request.employeeUserId, requestId: request.requestId, approved: true }, `approve-request-${request.requestId}`)}
                            disabled={busyKey === `approve-request-${request.requestId}` || busyKey === `reject-request-${request.requestId}`}
                            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:opacity-60"
                          >
                            {busyKey === `approve-request-${request.requestId}` ? "Saving..." : "Approve Request"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void runRequest("PATCH", { action: "REVIEW_TIME_EDIT", userId: request.employeeUserId, requestId: request.requestId, approved: false }, `reject-request-${request.requestId}`)}
                            disabled={busyKey === `approve-request-${request.requestId}` || busyKey === `reject-request-${request.requestId}`}
                            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/15 disabled:opacity-60"
                          >
                            {busyKey === `reject-request-${request.requestId}` ? "Saving..." : "Reject Request"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Manager Controls</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Payroll Setup, Teams, and Time Edits</h2>
                    <p className="mt-2 text-sm text-zinc-400">Super Admin can attach reps to managers and team leads, set override percentages, and fix time entries directly. Managers can still update pay mode and approve requests.</p>
                  </div>
                  <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">{snapshot.team.length} users</span>
                </div>
                <div className="mb-4 grid gap-3 xl:grid-cols-3">
                  <article className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Clocked In Now</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{clockedInTeam.length}</p>
                    <p className="mt-2 text-sm text-zinc-400">
                      {clockedInTeam.length > 0 ? clockedInTeam.map((user) => user.name).join(", ") : "Nobody is currently clocked in."}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">CRM Active Now</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {snapshot.crmSessionTrackingAvailable ? activeCrmTeam.length : "--"}
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      {!snapshot.crmSessionTrackingAvailable
                        ? "CRM session tracking is unavailable."
                        : activeCrmTeam.length > 0
                          ? activeCrmTeam.map((user) => user.name).join(", ")
                          : "No one is actively using the CRM right now."}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Latest CRM Activity</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {!snapshot.crmSessionTrackingAvailable
                        ? "Unavailable"
                        : latestCrmActivity?.crmPresence
                          ? `${latestCrmActivity.name} at ${formatDateTime(latestCrmActivity.crmPresence.lastSeenAt)}`
                          : "No activity yet"}
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      {latestCrmActivity?.crmPresence?.lastPath ? latestCrmActivity.crmPresence.lastPath : "No tracked CRM page yet."}
                    </p>
                  </article>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {sortedTeam.map((employee) => {
                    const draft = drafts[employee.id] ?? buildDraft(employee);
                    const draftCommissionRate = parseDraftNumber(draft.commissionRate);
                    const draftManagerOverrideRate = parseDraftNumber(draft.managerOverrideRate);
                    const draftTeamLeadOverrideRate = parseDraftNumber(draft.teamLeadOverrideRate);
                    const directClockInAt = localInputToIso(draft.editClockInAt);
                    const directClockOutAt = localInputToIso(draft.editClockOutAt);
                    const assignedManager = employee.settings.managerUserId ? teamUserById.get(employee.settings.managerUserId)?.name ?? "--" : "--";
                    const assignedTeamLead = employee.settings.teamLeadUserId ? teamUserById.get(employee.settings.teamLeadUserId)?.name ?? "--" : "--";
                    const managedReports = managerReports.get(employee.id) ?? [];
                    const leadReports = teamLeadReports.get(employee.id) ?? [];

                    return (
                      <article id={`employee-${employee.id}`} key={employee.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-lg font-semibold text-white">{employee.name}</p>
                              <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${clockBadgeTone(employee)}`}>
                                {clockBadgeLabel(employee)}
                              </span>
                              <span
                                className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${crmPresenceTone(employee.crmPresence?.displayStatus ?? null, snapshot.crmSessionTrackingAvailable)}`}
                              >
                                {crmPresenceLabel(employee.crmPresence?.displayStatus ?? null, snapshot.crmSessionTrackingAvailable)}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-zinc-400">{employee.email ?? employee.id} | {roleLabel(employee.role)}</p>
                            <p className="mt-2 text-xs text-zinc-500">Assigned manager: {assignedManager} | Assigned team lead: {assignedTeamLead}</p>
                            <p className="mt-2 text-xs text-zinc-400">
                              {crmActivitySummary(employee, snapshot.crmSessionTrackingAvailable)}
                              {employee.crmPresence?.lastPath ? ` | ${employee.crmPresence.lastPath}` : ""}
                            </p>
                          </div>
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-right">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Worked This Week</p>
                            <p className="mt-1 text-sm font-semibold text-white">{formatHours(employee.weeklyWorkedMinutes)}</p>
                          </div>
                        </div>

                        {(managedReports.length > 0 || leadReports.length > 0) ? (
                          <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 text-sm text-zinc-300">
                            {managedReports.length > 0 ? <p>Manager roster: {managedReports.map((user) => user.name).join(", ")}</p> : null}
                            {leadReports.length > 0 ? <p className={managedReports.length > 0 ? "mt-1" : ""}>Team lead roster: {leadReports.map((user) => user.name).join(", ")}</p> : null}
                          </div>
                        ) : null}

                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Role</span>
                            <select
                              value={draft.role}
                              onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, role: event.target.value } }))}
                              disabled={!snapshot.canEditAssignments}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none disabled:opacity-50"
                            >
                              <option value="REP">Rep</option>
                              <option value="TEAM_LEAD">Team Lead</option>
                              <option value="MANAGER">Manager</option>
                              <option value="SUPER_ADMIN">Super Admin</option>
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Pay Type</span>
                            <select
                              value={draft.payType}
                              onChange={(event) => {
                                const nextPayType =
                                  event.target.value === "HOURLY_PLUS_COMMISSION"
                                    ? "HOURLY_PLUS_COMMISSION"
                                    : event.target.value === "HOURLY"
                                      ? "HOURLY"
                                      : "COMMISSION";
                                setDrafts((current) => ({ ...current, [employee.id]: { ...draft, payType: nextPayType } }));
                              }}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                            >
                              <option value="COMMISSION">Commission</option>
                              <option value="HOURLY">Hourly</option>
                              <option value="HOURLY_PLUS_COMMISSION">Hourly + Commission</option>
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Hourly Rate</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={draft.hourlyRate}
                              onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, hourlyRate: event.target.value } }))}
                              disabled={!supportsHourlyTracking(draft.payType)}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none disabled:opacity-50"
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Commission %</span>
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              value={draft.commissionRate}
                              onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, commissionRate: event.target.value } }))}
                              disabled={!supportsCommission(draft.payType)}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none disabled:opacity-50"
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Max Hours / Week</span>
                            <input
                              type="number"
                              min={0}
                              step="0.25"
                              value={draft.maxWeeklyHours}
                              onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, maxWeeklyHours: event.target.value } }))}
                              disabled={!supportsHourlyTracking(draft.payType)}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none disabled:opacity-50"
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Manager</span>
                            <select
                              value={draft.managerUserId}
                              onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, managerUserId: event.target.value } }))}
                              disabled={!snapshot.canEditAssignments}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none disabled:opacity-50"
                            >
                              <option value="">No manager</option>
                              {managerOptions.filter((option) => option.id !== employee.id).map((option) => (
                                <option key={option.id} value={option.id}>{option.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Team Lead</span>
                            <select
                              value={draft.teamLeadUserId}
                              onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, teamLeadUserId: event.target.value } }))}
                              disabled={!snapshot.canEditAssignments}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none disabled:opacity-50"
                            >
                              <option value="">No team lead</option>
                              {teamLeadOptions.filter((option) => option.id !== employee.id).map((option) => (
                                <option key={option.id} value={option.id}>{option.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Manager Override %</span>
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              value={draft.managerOverrideRate}
                              onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, managerOverrideRate: event.target.value } }))}
                              disabled={!snapshot.canEditAssignments || !draft.managerUserId}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none disabled:opacity-50"
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Team Lead Override %</span>
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              value={draft.teamLeadOverrideRate}
                              onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, teamLeadOverrideRate: event.target.value } }))}
                              disabled={!snapshot.canEditAssignments || !draft.teamLeadUserId}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none disabled:opacity-50"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 md:col-span-2">
                            <span className="flex items-center gap-2"><UserCog className="h-4 w-4 text-zinc-400" />Require OT Approval</span>
                            <input
                              type="checkbox"
                              checked={draft.requireOvertimeApproval}
                              onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, requireOvertimeApproval: event.target.checked } }))}
                              disabled={!supportsHourlyTracking(draft.payType)}
                              className="size-4 rounded border-zinc-700 bg-zinc-900"
                            />
                          </label>
                        </div>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-xs text-zinc-500">
                            {employee.currentEntry ? `Clocked in since ${formatDateTime(employee.currentEntry.clockInAt)}` : supportsHourlyTracking(employee.settings.payType) ? "Currently clocked out" : "Hourly tracking disabled"}
                            {employee.crmPresence ? ` | Last CRM activity ${formatDateTime(employee.crmPresence.lastSeenAt)}` : ""}
                            {!snapshot.canEditAssignments ? " | Team assignments and override rates are Super Admin only." : ""}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              void runRequest(
                                "PATCH",
                                {
                                  action: "SAVE_SETTINGS",
                                  userId: employee.id,
                                  role: draft.role,
                                  payType: draft.payType,
                                  hourlyRate: supportsHourlyTracking(draft.payType) ? parseDraftNumber(draft.hourlyRate) : null,
                                  commissionRate: supportsCommission(draft.payType) && draftCommissionRate !== null ? draftCommissionRate / 100 : null,
                                  maxWeeklyHours: supportsHourlyTracking(draft.payType) ? parseDraftNumber(draft.maxWeeklyHours) : null,
                                  requireOvertimeApproval: draft.requireOvertimeApproval,
                                  managerUserId: draft.managerUserId || null,
                                  teamLeadUserId: draft.teamLeadUserId || null,
                                  managerOverrideRate: draft.managerUserId && draftManagerOverrideRate !== null ? draftManagerOverrideRate / 100 : null,
                                  teamLeadOverrideRate: draft.teamLeadUserId && draftTeamLeadOverrideRate !== null ? draftTeamLeadOverrideRate / 100 : null,
                                },
                                `save-${employee.id}`,
                              )
                            }
                            disabled={busyKey === `save-${employee.id}`}
                            className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/15 disabled:opacity-60"
                          >
                            {busyKey === `save-${employee.id}` ? "Saving..." : "Save Settings"}
                          </button>
                        </div>

                        <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Direct Time Edit</p>
                              <h3 className="mt-1 text-lg font-semibold text-white">Add or Correct Shift</h3>
                            </div>
                            <span className="text-xs text-zinc-500">Leave clock out blank to fix only the start time on an existing or open shift.</span>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="space-y-2 md:col-span-2">
                              <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Existing Shift</span>
                              <select
                                value={draft.editEntryId}
                                onChange={(event) => {
                                  const entryId = event.target.value;
                                  const entry = employee.entries.find((item) => item.id === entryId) ?? null;
                                  setDrafts((current) => ({
                                    ...current,
                                    [employee.id]: {
                                      ...draft,
                                      editEntryId: entryId,
                                      editClockInAt: entry ? toLocalInputValue(entry.clockInAt) : "",
                                      editClockOutAt: entry ? toLocalInputValue(entry.clockOutAt) : "",
                                    },
                                  }));
                                }}
                                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                              >
                                <option value="">New missed shift</option>
                                {employee.entries.slice(0, 12).map((entry) => (
                                  <option key={entry.id} value={entry.id}>{entryOptionLabel(entry)}</option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-2">
                              <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Clock In</span>
                              <input
                                type="datetime-local"
                                value={draft.editClockInAt}
                                onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, editClockInAt: event.target.value } }))}
                                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                              />
                            </label>
                            <label className="space-y-2">
                              <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Clock Out</span>
                              <input
                                type="datetime-local"
                                value={draft.editClockOutAt}
                                onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, editClockOutAt: event.target.value } }))}
                                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                              />
                            </label>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-zinc-500">Use this when the time should be corrected immediately instead of waiting on a rep request.</p>
                            <button
                              type="button"
                              onClick={() =>
                                directClockInAt && (directClockOutAt || draft.editEntryId)
                                  ? void runRequest(
                                      "PATCH",
                                      {
                                        action: "SAVE_TIME_ENTRY",
                                        userId: employee.id,
                                        entryId: draft.editEntryId || null,
                                        clockInAt: directClockInAt,
                                        clockOutAt: directClockOutAt,
                                      },
                                      `save-entry-${employee.id}`,
                                    )
                                  : setError("Pick a clock-in time, then either select an existing shift or add a clock-out time.")
                              }
                              disabled={busyKey === `save-entry-${employee.id}`}
                              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:opacity-60"
                            >
                              {busyKey === `save-entry-${employee.id}` ? "Saving..." : draft.editEntryId ? "Update Time Entry" : "Add Time Entry"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
