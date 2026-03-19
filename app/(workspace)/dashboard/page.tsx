"use client";

import {
  CalendarClock,
  Check,
  RefreshCw,
  Phone,
  Rocket,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRole } from "@/components/role-context";
import { buildManagerActionPlan, type PredictorInputs } from "@/lib/manager-action-engine";

type DashboardMetrics = {
  generatedAt: string;
  viewerRole: string;
  rep: {
    headline: string;
    scoreToday: number;
    streakDays: number;
    kpis: {
      claimedLeads: number;
      dialsToday: number;
      conversationsToday: number;
      talkMinutesToday: number;
      demosThisWeek: number;
      revenueThisMonth: number;
      closesThisMonth: number;
      liveSites: number;
    };
    targets: Array<{
      label: string;
      completed: number;
      target: number;
      tone: "indigo" | "amber" | "emerald";
    }>;
    progress: {
      scoreLabel: string;
      revenueLabel: string;
      talkLabel: string;
    };
    focusLeads: Array<{
      id: string;
      business: string;
      rank: number;
      status: string;
      deploymentLabel: string;
      deployed: boolean;
      hot: boolean;
    }>;
    recentActivity: Array<{
      id: string;
      business: string;
      event: string;
      context: string;
      live: boolean;
    }>;
    upcomingSchedule: Array<{
      id: string;
      startsAt: number;
      label: string;
    }>;
  };
  team: {
    summary: {
      activeReps: number;
      claimedLeads: number;
      upcomingDemos: number;
      closedRevenueThisMonth: number;
      liveSites: number;
    };
    leaderboard: Array<{
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
    }>;
    topPerformer: {
      userId: string;
      userName: string;
      scoreToday: number;
      demosThisWeek: number;
      revenueThisMonth: number;
    } | null;
    needsAttention: Array<{
      userId: string;
      userName: string;
      claimedLeads: number;
      dialsToday: number;
    }>;
  };
};

type ManagerLockedPlan = {
  id: string;
  week_start_date: string;
  projected_income: number;
  created_at: string;
  locked_metrics_json: {
    inputs: PredictorInputs;
  };
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <article className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700 hover:shadow-[0_0_0_1px_rgba(113,113,122,0.25)]">
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <h2 className="text-3xl font-semibold tracking-tight text-white">{value}</h2>
        <Icon className="h-4 w-4 text-blue-300 transition-transform duration-200 group-hover:-translate-y-0.5" />
      </div>
      <p className="mt-2 text-xs font-medium text-zinc-300">{detail}</p>
    </article>
  );
}

function DailyTargets({ targets }: { targets: DashboardMetrics["rep"]["targets"] }) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Daily Execution</h3>
      <div className="space-y-3">
        {targets.map((kpi) => {
          const percentage = Math.min((kpi.completed / kpi.target) * 100, 100);
          const isHit = kpi.completed >= kpi.target;
          const toneStyles = {
            indigo: "bg-indigo-500",
            amber: "bg-amber-500",
            emerald: "bg-emerald-500",
          } as const;

          return (
            <div key={kpi.label} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-medium">
                <p className={isHit ? "text-emerald-300" : "text-zinc-300"}>{kpi.label}</p>
                <span className={`inline-flex items-center gap-1 ${isHit ? "text-emerald-300" : "text-zinc-400"}`}>
                  {isHit && <Check className="h-3.5 w-3.5" />}
                  [{kpi.completed} / {kpi.target}]
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isHit ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" : toneStyles[kpi.tone]}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function RepDashboard({ metrics, loading }: { metrics: DashboardMetrics | null; loading: boolean }) {
  const rep = metrics?.rep;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_350px]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-500/10 to-zinc-900 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-blue-200">Rep Momentum</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {rep?.headline ?? "Loading live dashboard data..."}
              </h2>
              <p className="mt-1 text-sm text-zinc-300">
                Real activity only. Calls, demos, closes, and live site movement update this board.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Score Today</p>
                <p className="mt-1 text-2xl font-semibold text-white">{rep?.progress.scoreLabel ?? "--"}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Streak</p>
                <p className="mt-1 text-2xl font-semibold text-white">{rep?.streakDays ?? 0} days</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Dials Today"
            value={rep ? String(rep.kpis.dialsToday) : "--"}
            detail={rep ? `${rep.kpis.conversationsToday} connected conversations` : "Loading"}
            icon={Phone}
          />
          <KpiCard
            label="Talk Time"
            value={rep ? `${rep.kpis.talkMinutesToday}m` : "--"}
            detail={rep ? `${rep.kpis.claimedLeads} claimed leads in rotation` : "Loading"}
            icon={CalendarClock}
          />
          <KpiCard
            label="Demos This Week"
            value={rep ? String(rep.kpis.demosThisWeek) : "--"}
            detail={rep ? `${rep.kpis.liveSites} live sites ready for follow-up` : "Loading"}
            icon={Rocket}
          />
          <KpiCard
            label="Revenue This Month"
            value={rep ? formatCurrency(rep.kpis.revenueThisMonth) : "--"}
            detail={rep ? `${rep.kpis.closesThisMonth} closed deals` : "Loading"}
            icon={Wallet}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <DailyTargets targets={rep?.targets ?? []} />

            <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Upcoming Schedule</h3>
              <div className="space-y-2 text-sm">
                {(rep?.upcomingSchedule.length ?? 0) === 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
                    No upcoming demos yet. Book the next one and it lands here automatically.
                  </div>
                ) : (
                  rep?.upcomingSchedule.map((event) => (
                    <Link
                      key={event.id + event.label}
                      href={`/leads/${event.id}`}
                      className="block rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 transition hover:border-zinc-700"
                    >
                      {event.label}
                    </Link>
                  ))
                )}
              </div>
            </article>
          </div>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Priority Focus List</h3>
              <span className="text-xs text-zinc-500">Real lead urgency</span>
            </div>
            <ul className="space-y-2">
              {(rep?.focusLeads.length ?? 0) === 0 ? (
                <li className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-zinc-400">
                  No owned leads yet. Claim leads to start your board.
                </li>
              ) : (
                rep?.focusLeads.map((lead) => (
                  <li key={lead.id} className={`rounded-xl border bg-zinc-950 px-3 py-2.5 ${lead.hot ? "border-emerald-500/40" : "border-zinc-800"}`}>
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10 text-[11px] font-semibold text-blue-200">
                        {lead.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-zinc-100">{lead.business}</p>
                          {lead.hot ? (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                              Hot
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-zinc-400">{lead.status}</p>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600"
                        >
                          Open Lead
                        </Link>
                        <span
                          className={`inline-flex items-center rounded-lg border px-2 py-1.5 text-xs font-medium ${
                            lead.deployed
                              ? "border-zinc-700 bg-zinc-800 text-zinc-200"
                              : "border-blue-500/40 bg-blue-500/15 text-blue-100"
                          }`}
                        >
                          {lead.deploymentLabel}
                        </span>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </article>
        </section>
      </div>

      <aside className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700">
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Recent Movement</h3>
          <div className="space-y-2">
            {(rep?.recentActivity.length ?? 0) === 0 ? (
              <article className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-zinc-400">
                Calls, demos, and live-site activity will populate here once rep activity starts landing.
              </article>
            ) : (
              rep?.recentActivity.map((feed) => (
                <Link
                  key={feed.id + feed.event}
                  href={`/leads/${feed.id}`}
                  className="block rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 transition-all duration-200 hover:border-zinc-700"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-sm text-zinc-100">
                      <span className="font-semibold">{feed.business}</span> {feed.event}
                    </p>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                      <span className={`h-1.5 w-1.5 rounded-full bg-emerald-300 ${feed.live ? "animate-pulse" : "opacity-60"}`} />
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{feed.context}</p>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Game Layer</p>
          <h4 className="mt-2 text-lg font-semibold text-white">Momentum Targets</h4>
          <div className="mt-3 space-y-2 text-sm text-zinc-300">
            <p className="flex items-center justify-between"><span>Hit 20 points</span><span>{rep && rep.scoreToday >= 20 ? "Done" : "In play"}</span></p>
            <p className="flex items-center justify-between"><span>Book 2 demos this week</span><span>{rep ? `${rep.kpis.demosThisWeek} / 2` : "--"}</span></p>
            <p className="flex items-center justify-between"><span>Extend streak</span><span>{rep?.streakDays ?? 0} days</span></p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ManagerDashboard({
  metrics,
  loading,
  showRepWorkspace = true,
}: {
  metrics: DashboardMetrics | null;
  loading: boolean;
  showRepWorkspace?: boolean;
}) {
  const [lockedPlan, setLockedPlan] = useState<ManagerLockedPlan | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadLockedPlan() {
      try {
        const response = await fetch("/api/manager-plans", { cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json().catch(() => null)) as { plan?: ManagerLockedPlan | null } | null;
        if (!isActive || !payload?.plan) return;
        setLockedPlan(payload.plan);
      } catch {
        // Keep dashboard usable without manager plans.
      }
    }

    void loadLockedPlan();
    return () => {
      isActive = false;
    };
  }, []);

  const dashboardActionPlan = useMemo(() => {
    if (!lockedPlan?.locked_metrics_json?.inputs) return null;
    return buildManagerActionPlan(lockedPlan.locked_metrics_json.inputs, lockedPlan.locked_metrics_json.inputs);
  }, [lockedPlan]);

  const leaderboard = metrics?.team.leaderboard ?? [];
  const topPerformer = metrics?.team.topPerformer ?? null;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-500/10 to-zinc-900 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-blue-200">Manager Workspace</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Team command center with live rep pacing</h2>
        <p className="mt-1 text-sm text-zinc-300">
          No filler metrics. This board ranks reps by real activity, booked demos, closes, and current streaks.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Closed Revenue"
          value={metrics ? formatCurrency(metrics.team.summary.closedRevenueThisMonth) : "--"}
          detail="Month to date"
          icon={Wallet}
        />
        <KpiCard
          label="Active Reps"
          value={metrics ? String(metrics.team.summary.activeReps) : "--"}
          detail="Owners with claimed leads"
          icon={Users}
        />
        <KpiCard
          label="Claimed Leads"
          value={metrics ? String(metrics.team.summary.claimedLeads) : "--"}
          detail="Current team pipeline"
          icon={Target}
        />
        <KpiCard
          label="Upcoming Demos"
          value={metrics ? String(metrics.team.summary.upcomingDemos) : "--"}
          detail="Scheduled from live leads"
          icon={CalendarClock}
        />
        <KpiCard
          label="Live Sites"
          value={metrics ? String(metrics.team.summary.liveSites) : "--"}
          detail="Ready for proof-driven follow-up"
          icon={Rocket}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Leaderboard</h3>
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950 text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Rep</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Dials</th>
                  <th className="px-4 py-3">Demos</th>
                  <th className="px-4 py-3">Revenue</th>
                  <th className="px-4 py-3">Streak</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.length === 0 ? (
                  <tr className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-400">
                    <td className="px-4 py-3" colSpan={6}>
                      {loading ? "Loading team performance..." : "No live rep metrics yet."}
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((rep, index) => (
                    <tr key={rep.userId} className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-200">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-xs text-zinc-300">
                            #{index + 1}
                          </span>
                          {rep.userName}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-emerald-300">{rep.scoreToday}</td>
                      <td className="px-4 py-3">{rep.dialsToday}</td>
                      <td className="px-4 py-3">{rep.demosThisWeek}</td>
                      <td className="px-4 py-3">{formatCurrency(rep.revenueThisMonth)}</td>
                      <td className="px-4 py-3">{rep.streakDays}d</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Top Performer</p>
            {topPerformer ? (
              <>
                <h3 className="mt-1 text-lg font-semibold text-white">{topPerformer.userName}</h3>
                <div className="mt-3 space-y-2 text-sm text-zinc-200">
                  <p className="flex items-center justify-between"><span>Score Today</span><span className="text-emerald-300">{topPerformer.scoreToday}</span></p>
                  <p className="flex items-center justify-between"><span>Demos This Week</span><span className="text-blue-300">{topPerformer.demosThisWeek}</span></p>
                  <p className="flex items-center justify-between"><span>Revenue This Month</span><span className="text-blue-300">{formatCurrency(topPerformer.revenueThisMonth)}</span></p>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">No rep has activity on the board yet.</p>
            )}
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Coach Queue</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Reps needing a push</h3>
            <div className="mt-3 space-y-2 text-sm text-zinc-200">
              {(metrics?.team.needsAttention.length ?? 0) === 0 ? (
                <p className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-zinc-400">
                  No zero-dial reps right now.
                </p>
              ) : (
                metrics?.team.needsAttention.map((rep) => (
                  <p key={rep.userId} className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2">
                    {rep.userName} - {rep.claimedLeads} claimed leads, {rep.dialsToday} dials today
                  </p>
                ))
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Daily Action Board</h3>
        {!dashboardActionPlan ? (
          <p className="text-sm text-zinc-400">
            No locked weekly plan found yet. Lock a weekly plan in Rep Goals to generate manager actions.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-100">
              {dashboardActionPlan.headline}
            </p>
            {dashboardActionPlan.lockedGapSummary ? <p className="text-xs text-zinc-400">{dashboardActionPlan.lockedGapSummary}</p> : null}
            <div className="grid gap-2 md:grid-cols-2">
              {dashboardActionPlan.tasks.map((task) => (
                <article key={task.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{task.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${task.priority === "critical" ? "bg-rose-500/15 text-rose-200" : task.priority === "high" ? "bg-amber-500/15 text-amber-200" : "bg-blue-500/15 text-blue-200"}`}>
                      {task.priority}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300">{task.play}</p>
                  <p className="mt-1 text-xs text-zinc-400">Target: {task.target}</p>
                  <p className="mt-1 text-xs text-emerald-300">Time Block: {task.minutes} min today</p>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {showRepWorkspace ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Rep Workspace</h3>
          <p className="mb-4 text-sm text-zinc-400">
            Managers still see the same real rep board below, based on their own assigned leads.
          </p>
          <RepDashboard metrics={metrics} loading={loading} />
        </section>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  const { activeRole, setActiveRole } = useRole();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadMetrics(mode: "initial" | "refresh" = "initial") {
      try {
        if (mode === "initial") {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
        const response = await fetch("/api/dashboard/metrics", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as DashboardMetrics | null;
        if (!isActive || !payload) return;
        setMetrics(payload);
      } finally {
        if (isActive) {
          if (mode === "initial") {
            setLoading(false);
          } else {
            setRefreshing(false);
          }
        }
      }
    }

    void loadMetrics("initial");

    const handleFocus = () => {
      void loadMetrics("refresh");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadMetrics("refresh");
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const generatedLabel = metrics?.generatedAt
    ? new Date(metrics.generatedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  useEffect(() => {
    const serverRole = metrics?.viewerRole;
    if (!serverRole) return;
    if (serverRole === activeRole) return;
    if (serverRole === "TEAM_LEAD" || serverRole === "MANAGER" || serverRole === "SUPER_ADMIN") {
      setActiveRole(serverRole);
    }
  }, [activeRole, metrics?.viewerRole, setActiveRole]);

  const effectiveRole = metrics?.viewerRole ?? activeRole;
  const shouldShowTeamBoard = effectiveRole === "TEAM_LEAD" || effectiveRole === "MANAGER" || effectiveRole === "SUPER_ADMIN";
  const shouldShowBothBoards = effectiveRole === "SUPER_ADMIN";
  const refreshBoard = () => {
    setRefreshing(true);
    void fetch("/api/dashboard/metrics", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json().catch(() => null)) as DashboardMetrics | null;
      })
      .then((payload) => {
        if (payload) {
          setMetrics(payload);
        }
      })
      .finally(() => {
        setRefreshing(false);
      });
  };

  if (shouldShowTeamBoard) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-zinc-400">
          <span>{generatedLabel ? `Live board last updated ${generatedLabel}` : "Loading live board..."}</span>
          <button
            type="button"
            onClick={refreshBoard}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Board
          </button>
        </div>
        <ManagerDashboard metrics={metrics} loading={loading} showRepWorkspace={!shouldShowBothBoards} />
        {shouldShowBothBoards ? (
          <section className="space-y-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Personal View</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Your individual production board</h2>
              <p className="mt-1 text-sm text-zinc-300">
                This section shows only leads and activity directly owned by your user, while the board above stays team-wide.
              </p>
            </div>
            <RepDashboard metrics={metrics} loading={loading} />
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-zinc-400">
        <span>{generatedLabel ? `Live board last updated ${generatedLabel}` : "Loading live board..."}</span>
        <button
          type="button"
          onClick={refreshBoard}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh Board
        </button>
      </div>
      <RepDashboard metrics={metrics} loading={loading} />
    </div>
  );
}
