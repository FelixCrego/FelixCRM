"use client";

import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Check,
  ExternalLink,
  Flame,
  Mail,
  Phone,
  Rocket,
  Server,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRole } from "@/components/role-context";
import { useRouter } from "next/navigation";

const repKpis = [
  { label: "Earned Commission", value: "$18,250", trend: "+14%", icon: TrendingUp },
  { label: "Pipeline Value", value: "$94,000", trend: "+8%", icon: Flame },
  { label: "Proof Assets Shipped", value: "37", trend: "+6 today", icon: CheckCircle2 },
  { label: "Close Rate", value: "28%", trend: "+3.2%", icon: CalendarClock },
];

const focusLeads = [
  { id: "apex-roofing", rank: 1, business: "Apex Roofing", status: "Awaiting deployment", deploymentLabel: "Deploy Vercel Site", deployed: false, hot: true },
  { id: "texas-plumbing", rank: 2, business: "Texas Plumbing", status: "Demo follow-up due in 45m", deploymentLabel: "View Site", deployed: true, hot: false },
  { id: "maverick-legal", rank: 3, business: "Maverick Legal Co.", status: "Requested legal copy edits", deploymentLabel: "Deploy Vercel Site", deployed: false, hot: false },
  { id: "bloom-pediatrics", rank: 4, business: "Bloom Pediatrics", status: "Contract sent • no response", deploymentLabel: "View Site", deployed: true, hot: false },
  { id: "northline-roofing", rank: 5, business: "Northline Roofing", status: "Pricing approved • waiting on launch", deploymentLabel: "Deploy Vercel Site", deployed: false, hot: false },
];

const liveEngagement = [
  { id: "apex-roofing", business: "Apex Roofing", event: "is viewing their site RIGHT NOW", context: "Pricing section open • 40s active", live: true },
  { id: "texas-plumbing", business: "Texas Plumbing", event: "clicked the contact button 2 mins ago", context: "Mobile traffic • Austin, TX", live: true },
  { id: "maverick-legal", business: "Maverick Legal Co.", event: "returned for a second session 6 mins ago", context: "Viewed testimonials + FAQ", live: false },
  { id: "bloom-pediatrics", business: "Bloom Pediatrics", event: "opened the booking form 9 mins ago", context: "Desktop traffic • Houston, TX", live: false },
];

const dailyExecution = [
  { label: "Calls", completed: 34, target: 50, tone: "indigo" },
  { label: "Conversations", completed: 7, target: 12, tone: "amber" },
  { label: "Demos Booked", completed: 1, target: 2, tone: "emerald" },
] as const;

function RepDashboard() {
  const router = useRouter();

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_350px]">
      <div className="space-y-5">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {repKpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <article key={kpi.label} className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700 hover:shadow-[0_0_0_1px_rgba(113,113,122,0.25)]">
                <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-zinc-400">{kpi.label}</p>
                <div className="flex items-end justify-between gap-2">
                  <h2 className="text-3xl font-semibold tracking-tight text-white">{kpi.value}</h2>
                  <Icon className="h-4 w-4 text-blue-300 transition-transform duration-200 group-hover:-translate-y-0.5" />
                </div>
                {kpi.label === "Earned Commission" || kpi.label === "Pipeline Value" ? (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full w-[90%] rounded-full bg-emerald-500" />
                    </div>
                    <p className="mt-2 text-xs font-medium text-zinc-300">91% to $20k Monthly Quota</p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-medium text-emerald-300">{kpi.trend}</p>
                )}
              </article>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Daily Execution</h3>
              <div className="space-y-3">
                {dailyExecution.map((kpi) => {
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
                        <p className={isHit ? "text-emerald-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "text-zinc-300"}>{kpi.label}</p>
                        <span className={`inline-flex items-center gap-1 ${isHit ? "text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "text-zinc-400"}`}>
                          {isHit && <Check className="h-3.5 w-3.5" />}
                          [{" "}{kpi.completed} / {kpi.target} ]
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

            <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Today&apos;s Schedule</h3>
              <div className="space-y-2 text-sm">
                {["09:30 - Team standup", "11:00 - Demo: Pulse Fitness", "14:30 - Call: Northline Roofing", "17:00 - Daily close review"].map((event) => (
                  <div key={event} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
                    {event}
                  </div>
                ))}
              </div>
            </article>
          </div>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Top Priority Focus List</h3>
              <span className="text-xs text-zinc-500">1-click actions</span>
            </div>
            <ul className="space-y-2">
              {focusLeads.map((lead) => (
                <li
                  key={lead.business}
                  onClick={() => router.push(`/leads/${lead.id}`)}
                  className={`group flex cursor-pointer items-center gap-3 rounded-xl border bg-zinc-950 px-3 py-2.5 transition-all duration-200 hover:border-zinc-700 ${
                    lead.hot ? "ring-1 ring-emerald-500/50 animate-pulse" : "border-zinc-800"
                  }`}
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10 text-[11px] font-semibold text-blue-200">{lead.rank}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium text-zinc-100">{lead.business}</p>
                      {lead.hot && <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">🔥 HOT</span>}
                    </div>
                    <p className="truncate text-xs text-zinc-400">{lead.status}</p>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-80 transition group-hover:opacity-100">
                    <button onClick={(event) => event.stopPropagation()} aria-label={`Call ${lead.business}`} className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 transition hover:border-emerald-400/40 hover:text-emerald-300"><Phone className="h-3.5 w-3.5" /></button>
                    <button onClick={(event) => event.stopPropagation()} aria-label={`Email ${lead.business}`} className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 transition hover:border-sky-400/40 hover:text-sky-300"><Mail className="h-3.5 w-3.5" /></button>
                    <button
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`${lead.deploymentLabel} for ${lead.business}`}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                        lead.deployed ? "border-zinc-700 bg-zinc-800 text-zinc-200 hover:border-zinc-600" : "border-blue-500/40 bg-blue-500/15 text-blue-100 hover:border-blue-400/60 hover:bg-blue-500/20"
                      }`}
                    >
                      {lead.deployed ? <ExternalLink className="h-3.5 w-3.5" /> : <Rocket className="h-3.5 w-3.5" />}
                      <span className="hidden xl:inline">{lead.deploymentLabel}</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </div>

      <aside className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Live Site Engagement</h3>
        <div className="space-y-2">
          {liveEngagement.map((feed) => (
            <article
              key={feed.business + feed.event}
              onClick={() => router.push(`/leads/${feed.id}`)}
              className="cursor-pointer rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 transition-all duration-200 hover:border-zinc-700"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-sm text-zinc-100"><span className="font-semibold">{feed.business}</span> {feed.event}</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                  <span className={`h-1.5 w-1.5 rounded-full bg-emerald-300 ${feed.live ? "animate-pulse" : "opacity-60"}`} />Live
                </span>
              </div>
              <p className="mb-2 text-xs text-zinc-400">{feed.context}</p>
              <button onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200 transition hover:border-emerald-300/50 hover:bg-emerald-500/20">
                <Phone className="h-3.5 w-3.5" />Call Now
              </button>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

function TeamLeadDashboard() {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Squad Pacing</p>
        <div className="mt-2 flex items-end justify-between">
          <h2 className="text-3xl font-semibold text-white">Squad Quota: 85% to goal</h2>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">+12% this week</span>
        </div>
      </section>
      <RepDashboard />
    </div>
  );
}

function ManagerDashboard() {
  const [claimedLeadCounts, setClaimedLeadCounts] = useState<Array<{ userId: string; userName: string; claimedLeads: number }>>([]);

  useEffect(() => {
    let isActive = true;

    async function loadClaimedLeadCounts() {
      try {
        const response = await fetch("/api/leads/claimed-counts", { cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json().catch(() => null)) as { counts?: Array<{ userId?: string; userName?: string; claimedLeads?: number }> } | null;
        if (!isActive || !Array.isArray(payload?.counts)) return;

        const normalized = payload.counts
          .filter((row) => typeof row?.userId === "string" && typeof row?.userName === "string")
          .map((row) => ({
            userId: row.userId as string,
            userName: row.userName as string,
            claimedLeads: typeof row.claimedLeads === "number" ? row.claimedLeads : 0,
          }))
          .sort((a, b) => b.claimedLeads - a.claimedLeads || a.userName.localeCompare(b.userName));

        setClaimedLeadCounts(normalized);
      } catch {
        // Keep dashboard shell usable if stats endpoint is unavailable.
      }
    }

    void loadClaimedLeadCounts();
    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        {[
          { title: "Total Pipeline", value: "$1.2M", icon: Wallet },
          { title: "Active Reps", value: "14", icon: Users },
          { title: "Deals Deployed", value: "142", icon: Rocket },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.title} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">{card.title}</p>
              <div className="mt-3 flex items-center justify-between">
                <h2 className="text-4xl font-semibold tracking-tight text-white">{card.value}</h2>
                <Icon className="h-5 w-5 text-blue-300" />
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Claimed Leads by User</h3>
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Claimed Leads</th>
              </tr>
            </thead>
            <tbody>
              {claimedLeadCounts.length === 0 ? (
                <tr className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-400">
                  <td className="px-4 py-3" colSpan={3}>No claimed leads yet.</td>
                </tr>
              ) : (
                claimedLeadCounts.map((rep, idx) => (
                  <tr key={rep.userId} className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-200">
                    <td className="px-4 py-3">#{idx + 1}</td>
                    <td className="px-4 py-3 font-medium">{rep.userName}</td>
                    <td className="px-4 py-3 text-emerald-300">{rep.claimedLeads}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SuperAdminDashboard() {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        {[
          { title: "Server Uptime", value: "99.9%", detail: "30-day rolling", icon: Server },
          { title: "Monthly Recurring Revenue", value: "$82,400", detail: "+9.4% MoM", icon: TrendingUp },
          { title: "Request Throughput", value: "1.8M", detail: "Last 24h", icon: Activity },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.title} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">{card.title}</p>
                <Icon className="h-4 w-4 text-blue-300" />
              </div>
              <h2 className="mt-2 text-3xl font-semibold text-white">{card.value}</h2>
              <p className="mt-1 text-xs text-zinc-400">{card.detail}</p>
              <div className="mt-4 h-16 rounded-lg border border-zinc-800 bg-zinc-950" />
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">System Log Feed</h3>
        <div className="space-y-2 text-sm">
          {[
            "New user joined: maria@northline.com",
            "Database backup complete",
            "Billing webhook processed for org_721",
            "Role updated: TEAM_LEAD -> MANAGER",
          ].map((event) => (
            <div key={event} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-300">
              {event}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  const { activeRole } = useRole();

  if (activeRole === "TEAM_LEAD") {
    return <TeamLeadDashboard />;
  }

  if (activeRole === "MANAGER") {
    return <ManagerDashboard />;
  }

  if (activeRole === "SUPER_ADMIN") {
    return <SuperAdminDashboard />;
  }

  return <RepDashboard />;
}
