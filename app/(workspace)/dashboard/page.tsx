import {
  CalendarClock,
  CheckCircle2,
  Flame,
  Mail,
  Phone,
  Rocket,
  TrendingUp,
  ExternalLink,
} from "lucide-react";

const kpis = [
  { label: "Earned Commission", value: "$18,250", trend: "+14%", icon: TrendingUp },
  { label: "Pipeline Value", value: "$94,000", trend: "+8%", icon: Flame },
  { label: "Proof Assets Shipped", value: "37", trend: "+6 today", icon: CheckCircle2 },
  { label: "Close Rate", value: "28%", trend: "+3.2%", icon: CalendarClock },
];

const focusLeads = [
  {
    rank: 1,
    business: "Apex Roofing",
    status: "Awaiting deployment",
    deploymentLabel: "Deploy Vercel Site",
    deployed: false,
  },
  {
    rank: 2,
    business: "Texas Plumbing",
    status: "Demo follow-up due in 45m",
    deploymentLabel: "View Site",
    deployed: true,
  },
  {
    rank: 3,
    business: "Maverick Legal Co.",
    status: "Requested legal copy edits",
    deploymentLabel: "Deploy Vercel Site",
    deployed: false,
  },
  {
    rank: 4,
    business: "Bloom Pediatrics",
    status: "Contract sent • no response",
    deploymentLabel: "View Site",
    deployed: true,
  },
  {
    rank: 5,
    business: "Northline Roofing",
    status: "Pricing approved • waiting on launch",
    deploymentLabel: "Deploy Vercel Site",
    deployed: false,
  },
];

const liveEngagement = [
  {
    business: "Apex Roofing",
    event: "is viewing their site RIGHT NOW",
    context: "Pricing section open • 40s active",
    live: true,
  },
  {
    business: "Texas Plumbing",
    event: "clicked the contact button 2 mins ago",
    context: "Mobile traffic • Austin, TX",
    live: true,
  },
  {
    business: "Maverick Legal Co.",
    event: "returned for a second session 6 mins ago",
    context: "Viewed testimonials + FAQ",
    live: false,
  },
  {
    business: "Bloom Pediatrics",
    event: "opened the booking form 9 mins ago",
    context: "Desktop traffic • Houston, TX",
    live: false,
  },
];

export default function DashboardPage() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_350px]">
      <div className="space-y-5">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <article
                key={kpi.label}
                className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700 hover:shadow-[0_0_0_1px_rgba(113,113,122,0.25)]"
              >
                <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-zinc-400">{kpi.label}</p>
                <div className="flex items-end justify-between gap-2">
                  <h2 className="text-3xl font-semibold tracking-tight text-white">{kpi.value}</h2>
                  <Icon className="h-4 w-4 text-blue-300 transition-transform duration-200 group-hover:-translate-y-0.5" />
                </div>
                <p className="mt-2 text-xs font-medium text-emerald-300">{kpi.trend}</p>
              </article>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Today&apos;s Schedule</h3>
            <div className="space-y-2 text-sm">
              {[
                "09:30 - Team standup",
                "11:00 - Demo: Pulse Fitness",
                "14:30 - Call: Northline Roofing",
                "17:00 - Daily close review",
              ].map((event) => (
                <div key={event} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
                  {event}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all duration-200 hover:border-zinc-700">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">Top Priority Focus List</h3>
              <span className="text-xs text-zinc-500">1-click actions</span>
            </div>
            <ul className="space-y-2">
              {focusLeads.map((lead) => (
                <li
                  key={lead.business}
                  className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 transition-all duration-200 hover:border-zinc-700"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10 text-[11px] font-semibold text-blue-200">
                    {lead.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{lead.business}</p>
                    <p className="truncate text-xs text-zinc-400">{lead.status}</p>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-80 transition group-hover:opacity-100">
                    <button
                      aria-label={`Call ${lead.business}`}
                      className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 transition hover:border-emerald-400/40 hover:text-emerald-300"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label={`Email ${lead.business}`}
                      className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 transition hover:border-sky-400/40 hover:text-sky-300"
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label={`${lead.deploymentLabel} for ${lead.business}`}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                        lead.deployed
                          ? "border-zinc-700 bg-zinc-800 text-zinc-200 hover:border-zinc-600"
                          : "border-blue-500/40 bg-blue-500/15 text-blue-100 hover:border-blue-400/60 hover:bg-blue-500/20"
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
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 transition-all duration-200 hover:border-zinc-700"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-sm text-zinc-100">
                  <span className="font-semibold">{feed.business}</span> {feed.event}
                </p>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                  <span className={`h-1.5 w-1.5 rounded-full bg-emerald-300 ${feed.live ? "animate-pulse" : "opacity-60"}`} />
                  Live
                </span>
              </div>
              <p className="mb-2 text-xs text-zinc-400">{feed.context}</p>
              <button className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200 transition hover:border-emerald-300/50 hover:bg-emerald-500/20">
                <Phone className="h-3.5 w-3.5" />
                Call Now
              </button>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
