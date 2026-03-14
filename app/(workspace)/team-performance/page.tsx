const reps = [
  { name: "Maya Chen", demos: 7, closes: 3, pipeline: "$28,000" },
  { name: "Carlos Vega", demos: 6, closes: 2, pipeline: "$18,400" },
  { name: "Nia Ross", demos: 5, closes: 4, pipeline: "$24,900" },
  { name: "Jordan Kim", demos: 4, closes: 1, pipeline: "$11,700" },
];

export default function TeamPerformancePage() {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Manager Tooling</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Sales Team Performance</h1>
        <p className="mt-1 text-sm text-zinc-400">Track each rep’s demos, closes, and active pipeline to guide coaching and accountability.</p>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950 text-zinc-400">
            <tr>
              <th className="px-4 py-3">Rep</th>
              <th className="px-4 py-3">Demos</th>
              <th className="px-4 py-3">Closes</th>
              <th className="px-4 py-3">Pipeline</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => (
              <tr key={rep.name} className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-200">
                <td className="px-4 py-3 font-medium">{rep.name}</td>
                <td className="px-4 py-3">{rep.demos}</td>
                <td className="px-4 py-3">{rep.closes}</td>
                <td className="px-4 py-3 text-emerald-300">{rep.pipeline}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
