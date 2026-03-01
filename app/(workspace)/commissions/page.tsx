const earnings = [5, 12, 9, 18, 16, 24, 27, 30];
const ledger = [
  { deal: "Bloom Pediatrics", date: "2026-02-18", commission: "$1,100", bonus: "$250" },
  { deal: "Northline Roofing", date: "2026-02-22", commission: "$1,450", bonus: "$400" },
  { deal: "Maverick Legal", date: "2026-02-27", commission: "$1,300", bonus: "$350" },
];

function QuotaRing({ label, progress, value }: { label: string; progress: number; value: string }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference - (progress / 100) * circumference;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center">
      <svg viewBox="0 0 120 120" className="mx-auto h-32 w-32">
        <circle cx="60" cy="60" r={radius} className="fill-none stroke-zinc-800" strokeWidth="10" />
        <circle cx="60" cy="60" r={radius} className="fill-none stroke-blue-400" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dash} transform="rotate(-90 60 60)" />
      </svg>
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export default function CommissionsPage() {
  const points = earnings
    .map((point, idx) => `${(idx / (earnings.length - 1)) * 100},${100 - (point / 32) * 100}`)
    .join(" ");

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="mb-3 text-lg font-semibold">Earnings over Time</h2>
        <div className="h-56 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.04" />
              </linearGradient>
            </defs>
            <polygon points={`0,100 ${points} 100,100`} fill="url(#area)" />
            <polyline points={points} fill="none" stroke="#60a5fa" strokeWidth="2" />
          </svg>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <QuotaRing label="Monthly Revenue Goal" progress={74} value="$18,250 / $25,000" />
        <QuotaRing label="Site Deployments Goal" progress={62} value="31 / 50" />
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h3 className="mb-3 text-lg font-semibold">Deal Attribution Ledger</h3>
        <table className="w-full text-left text-sm">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="py-2">Deal</th>
              <th className="py-2">Date Closed</th>
              <th className="py-2">Commission</th>
              <th className="py-2">Tier Bonus</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((item) => (
              <tr key={item.deal} className="border-b border-zinc-800/70 text-zinc-200">
                <td className="py-3">{item.deal}</td>
                <td className="py-3">{item.date}</td>
                <td className="py-3">{item.commission}</td>
                <td className="py-3 text-emerald-300">{item.bonus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
