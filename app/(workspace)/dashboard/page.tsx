import { CalendarClock, CheckCircle2, Flame, TrendingUp } from "lucide-react";

const kpis = [
  { label: "Earned Commission", value: "$18,250", trend: "+14%", icon: TrendingUp },
  { label: "Pipeline Value", value: "$94,000", trend: "+8%", icon: Flame },
  { label: "Proof Assets Shipped", value: "37", trend: "+6 today", icon: CheckCircle2 },
  { label: "Close Rate", value: "28%", trend: "+3.2%", icon: CalendarClock },
];

const focusLeads = [
  "Aurora Dental Group — needs proposal revisions",
  "Pulse Fitness Studio — demo follow-up due in 2h",
  "Maverick Legal Co. — awaiting deployment proof",
  "Bloom Pediatrics — contract sent, no response",
  "Northline Roofing — requested custom pricing",
];

export default function DashboardPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <article key={kpi.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">{kpi.label}</p>
                <div className="flex items-end justify-between">
                  <h2 className="text-2xl font-semibold">{kpi.value}</h2>
                  <Icon className="h-4 w-4 text-blue-300" />
                </div>
                <p className="mt-2 text-sm text-emerald-300">{kpi.trend}</p>
              </article>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h3 className="mb-4 text-lg font-semibold">Today&apos;s Schedule</h3>
            <div className="space-y-3 text-sm">
              {["09:30 - Team standup", "11:00 - Demo: Pulse Fitness", "14:30 - Call: Northline Roofing", "17:00 - Daily close review"].map((event) => (
                <div key={event} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-zinc-300">
                  {event}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h3 className="mb-4 text-lg font-semibold">Top Priority Focus List</h3>
            <ul className="space-y-3 text-sm">
              {focusLeads.map((lead, idx) => (
                <li key={lead} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20 text-xs font-semibold text-blue-200">#{idx + 1}</span>
                  <p className="text-zinc-300">{lead}</p>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </div>

      <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h3 className="mb-4 text-lg font-semibold">Live Site Engagement</h3>
        <div className="space-y-3 text-sm">
          {["Aurora Dental: +320 visits (last 24h)", "Pulse Fitness: 6 CTA clicks in 10 min", "Northline Roofing: bounce rate improved 17%", "Maverick Legal: 3 form submissions"].map((feed) => (
            <div key={feed} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-zinc-300">
              {feed}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
