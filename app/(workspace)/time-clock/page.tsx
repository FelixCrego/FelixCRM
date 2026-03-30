"use client";

import { useEffect, useMemo, useState } from "react";
import { AlarmClockCheck, BadgeDollarSign, Clock3, ShieldAlert, TimerReset, UserCog } from "lucide-react";

type PayType = "COMMISSION" | "HOURLY";
type OvertimeStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";
type TimeClockEntry = {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  durationMinutes: number | null;
  overtimeMinutes: number | null;
  overtimeStatus: OvertimeStatus;
};
type WorkforceUser = {
  id: string;
  email: string | null;
  name: string;
  role: string;
  settings: {
    payType: PayType;
    hourlyRate: number | null;
    maxWeeklyHours: number | null;
    requireOvertimeApproval: boolean;
  };
  currentEntry: TimeClockEntry | null;
  entries: TimeClockEntry[];
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
type Snapshot = {
  canManageWorkforce: boolean;
  self: WorkforceUser;
  team: WorkforceUser[];
  pendingApprovals: PendingApproval[];
};
type Draft = {
  payType: PayType;
  hourlyRate: string;
  maxWeeklyHours: string;
  requireOvertimeApproval: boolean;
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

function buildDraft(user: WorkforceUser): Draft {
  return {
    payType: user.settings.payType,
    hourlyRate: user.settings.hourlyRate !== null ? String(user.settings.hourlyRate) : "",
    maxWeeklyHours: user.settings.maxWeeklyHours !== null ? String(user.settings.maxWeeklyHours) : "",
    requireOvertimeApproval: user.settings.requireOvertimeApproval,
  };
}

function parseDraftNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function badgeTone(status: OvertimeStatus) {
  if (status === "APPROVED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "PENDING") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (status === "REJECTED") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  return "border-zinc-700 bg-zinc-800/70 text-zinc-300";
}

export default function TimeClockPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
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
      setDrafts((current) => {
        const next = { ...current };
        for (const user of payload.team) next[user.id] = next[user.id] ?? buildDraft(user);
        return next;
      });
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
      setDrafts((current) => {
        const next = { ...current };
        for (const user of payload.team) next[user.id] = buildDraft(user);
        return next;
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    void loadSnapshot("initial");
  }, []);

  const self = snapshot?.self ?? null;
  const weeklyGross = useMemo(() => {
    if (!self || self.settings.hourlyRate === null) return null;
    return (self.weeklyWorkedMinutes / 60) * self.settings.hourlyRate;
  }, [self]);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-blue-950/40 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-blue-200">Workforce</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Time Clock</h1>
            <p className="mt-3 max-w-3xl text-sm text-zinc-300">Hourly employees can clock in and out here. Managers can set rate, weekly cap, and overtime approval from the same page.</p>
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
          <section className="grid gap-4 lg:grid-cols-4">
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
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">My Shift</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{self.currentEntry ? "Clocked In" : self.settings.payType === "HOURLY" ? "Ready To Clock In" : "Hourly Tracking Not Enabled"}</h2>
                <p className="mt-2 text-sm text-zinc-400">{self.currentEntry ? `Started ${formatDateTime(self.currentEntry.clockInAt)}` : self.settings.payType === "HOURLY" ? "Punch in when your shift starts and clock out when you finish." : "A manager needs to switch you to hourly before you can use the clock."}</p>
              </div>
              <button
                type="button"
                onClick={() => void runRequest("POST", { action: self.currentEntry ? "CLOCK_OUT" : "CLOCK_IN" }, "clock")}
                disabled={busyKey === "clock" || self.settings.payType !== "HOURLY"}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                  self.currentEntry ? "border border-rose-500/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15" : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
                }`}
              >
                <AlarmClockCheck className="h-4 w-4" />
                {busyKey === "clock" ? "Updating..." : self.currentEntry ? "Clock Out" : "Clock In"}
              </button>
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
            <div className="overflow-hidden rounded-2xl border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-950 text-zinc-400"><tr><th className="px-4 py-3">Clock In</th><th className="px-4 py-3">Clock Out</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">OT</th><th className="px-4 py-3">Approval</th></tr></thead>
                <tbody>
                  {self.entries.length === 0 ? <tr className="border-t border-zinc-800 bg-zinc-900/70 text-zinc-400"><td className="px-4 py-4" colSpan={5}>No shifts logged yet.</td></tr> : self.entries.slice(0, 14).map((entry) => (
                    <tr key={entry.id} className="border-t border-zinc-800 bg-zinc-900/70 text-zinc-200">
                      <td className="px-4 py-3">{formatDateTime(entry.clockInAt)}</td>
                      <td className="px-4 py-3">{formatDateTime(entry.clockOutAt)}</td>
                      <td className="px-4 py-3">{formatHours(entry.durationMinutes)}</td>
                      <td className="px-4 py-3">{formatHours(entry.overtimeMinutes ?? 0)}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${badgeTone(entry.overtimeStatus)}`}>{entry.overtimeStatus === "NONE" ? "No OT" : entry.overtimeStatus}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {snapshot.canManageWorkforce ? (
            <>
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
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Manager Controls</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Hourly Employee Setup</h2>
                  </div>
                  <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">{snapshot.team.length} users</span>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {snapshot.team.map((employee) => {
                    const draft = drafts[employee.id] ?? buildDraft(employee);
                    return (
                      <article key={employee.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-white">{employee.name}</p>
                            <p className="mt-1 text-sm text-zinc-400">{employee.email ?? employee.id} | {employee.role.replace("_", " ")}</p>
                          </div>
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-right">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Worked This Week</p>
                            <p className="mt-1 text-sm font-semibold text-white">{formatHours(employee.weeklyWorkedMinutes)}</p>
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Pay Type</span>
                            <select
                              value={draft.payType}
                              onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, payType: event.target.value === "HOURLY" ? "HOURLY" : "COMMISSION" } }))}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                            >
                              <option value="COMMISSION">Commission</option>
                              <option value="HOURLY">Hourly</option>
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
                              disabled={draft.payType !== "HOURLY"}
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
                              disabled={draft.payType !== "HOURLY"}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none disabled:opacity-50"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200">
                            <span className="flex items-center gap-2"><UserCog className="h-4 w-4 text-zinc-400" />Require OT Approval</span>
                            <input
                              type="checkbox"
                              checked={draft.requireOvertimeApproval}
                              onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: { ...draft, requireOvertimeApproval: event.target.checked } }))}
                              disabled={draft.payType !== "HOURLY"}
                              className="size-4 rounded border-zinc-700 bg-zinc-900"
                            />
                          </label>
                        </div>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-xs text-zinc-500">{employee.currentEntry ? `Clocked in since ${formatDateTime(employee.currentEntry.clockInAt)}` : employee.settings.payType === "HOURLY" ? "Currently clocked out" : "Hourly tracking disabled"}</div>
                          <button
                            type="button"
                            onClick={() => void runRequest("PATCH", { action: "SAVE_SETTINGS", userId: employee.id, payType: draft.payType, hourlyRate: draft.payType === "HOURLY" ? parseDraftNumber(draft.hourlyRate) : null, maxWeeklyHours: draft.payType === "HOURLY" ? parseDraftNumber(draft.maxWeeklyHours) : null, requireOvertimeApproval: draft.requireOvertimeApproval }, `save-${employee.id}`)}
                            disabled={busyKey === `save-${employee.id}`}
                            className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/15 disabled:opacity-60"
                          >
                            {busyKey === `save-${employee.id}` ? "Saving..." : "Save Settings"}
                          </button>
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
