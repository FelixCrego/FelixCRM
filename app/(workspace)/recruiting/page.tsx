export default function RecruitingPage() {
  const stages = [
    { label: "Sourced", count: 18 },
    { label: "Phone Screen", count: 9 },
    { label: "Final Interview", count: 5 },
    { label: "Offer Extended", count: 3 },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Manager Tooling</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Recruiting Pipeline</h1>
        <p className="mt-1 text-sm text-zinc-400">Manage outbound recruiting and candidate progression for commission-only sales reps.</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage) => (
          <article key={stage.label} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">{stage.label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{stage.count}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
