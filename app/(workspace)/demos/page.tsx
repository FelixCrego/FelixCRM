const upcomingDemos = [
  {
    id: "demo-1",
    dateTimeLabel: "Today, 2:30 PM",
    businessName: "Northstar Fitness Club",
    leadStatus: "Proposal Sent",
    isToday: true,
  },
  {
    id: "demo-2",
    dateTimeLabel: "Tomorrow, 10:00 AM",
    businessName: "Hillside Dental Group",
    leadStatus: "Discovery Call Complete",
    isToday: false,
  },
  {
    id: "demo-3",
    dateTimeLabel: "Friday, 4:15 PM",
    businessName: "Riverfront Spa & Wellness",
    leadStatus: "Follow-up Scheduled",
    isToday: false,
  },
];

export default function DemosPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Agenda Hub</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-50">Upcoming Demos</h1>
          <p className="mt-2 text-sm text-zinc-400">Manage your scheduled Vercel deployments and sales presentations.</p>
        </header>

        <section className="space-y-3">
          {upcomingDemos.map((demo) => (
            <article
              key={demo.id}
              className={`rounded-2xl border bg-zinc-900/60 p-4 shadow-[0_8px_35px_rgba(0,0,0,0.25)] backdrop-blur ${
                demo.isToday ? "border-emerald-500/60" : "border-zinc-800"
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="min-w-36 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
                    {demo.dateTimeLabel}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-100">{demo.businessName}</h2>
                    <p className="mt-1 text-sm text-zinc-400">Lead Status: {demo.leadStatus}</p>
                    {demo.isToday ? (
                      <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                        Happening today
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end lg:self-auto">
                  <button className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800">
                    Reschedule
                  </button>
                  <button className="rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:from-indigo-400 hover:to-blue-400">
                    Join Google Meet
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
