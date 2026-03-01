const earnings = [5, 12, 9, 18, 16, 24, 27, 30];

const ledger = [
  { deal: "Bloom Pediatrics", date: "2026-02-18", commission: "$1,100.00", bonus: "$250.00", status: "Cleared" },
  { deal: "Northline Roofing", date: "2026-02-22", commission: "$1,450.00", bonus: "$400.00", status: "Pending" },
  { deal: "Maverick Legal", date: "2026-02-27", commission: "$1,300.00", bonus: "$350.00", status: "Cleared" },
];

function QuotaRing({
  label,
  progress,
  value,
  accent,
  stats,
}: {
  label: string;
  progress: number;
  value: string;
  accent: string;
  stats: Array<{ label: string; value: string }>;
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference - (progress / 100) * circumference;

  return (
    <div className="flex items-center gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <svg viewBox="0 0 96 96" className="h-24 w-24">
          <circle cx="48" cy="48" r={radius} className="fill-none stroke-zinc-800" strokeWidth="9" />
          <circle
            cx="48"
            cy="48"
            r={radius}
            className="fill-none"
            stroke={accent}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dash}
            transform="rotate(-90 48 48)"
          />
        </svg>
        <span className="absolute text-sm font-semibold text-zinc-100 tabular-nums">{progress}%</span>
      </div>

      <div className="flex-1 space-y-2">
        <p className="text-sm text-zinc-400">{label}</p>
        <p className="text-lg font-semibold text-zinc-100 tabular-nums">{value}</p>
        <div className="space-y-1.5 border-l border-zinc-700 pl-3 text-sm">
          {stats.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-zinc-400">
              <span>{item.label}</span>
              <span className="font-medium text-zinc-200 tabular-nums">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CommissionsPage() {
  const points = earnings
    .map((point, idx) => `${(idx / (earnings.length - 1)) * 100},${100 - (point / 32) * 100}`)
    .join(" ");

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Available for Withdrawal</p>
          <h1 className="mt-3 text-4xl font-semibold text-white tabular-nums sm:text-5xl">$4,250.00</h1>
          <p className="mt-2 text-sm text-zinc-400">Your balance is synced and ready for transfer.</p>
          <button className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200">
            Withdraw Funds
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-3 text-lg font-semibold">Earnings over Time</h2>
          <div className="h-52 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
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
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <QuotaRing
          label="Monthly Revenue Goal"
          progress={74}
          value="$18,250.00 / $25,000.00"
          accent="#60a5fa"
          stats={[
            { label: "Pacing", value: "On Track" },
            { label: "Required Daily Avg", value: "$450" },
          ]}
        />

        <QuotaRing
          label="Site Deployments Goal"
          progress={62}
          value="31 / 50"
          accent="#34d399"
          stats={[
            { label: "Current Conversion Rate", value: "12%" },
            { label: "Top Niche", value: "Roofers" },
          ]}
        />
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h3 className="mb-3 text-lg font-semibold">Deal Attribution Ledger</h3>
        <table className="w-full text-left text-sm">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="py-2">Deal</th>
              <th className="py-2">Date Closed</th>
              <th className="py-2">Status</th>
              <th className="py-2">Commission</th>
              <th className="py-2">Tier Bonus</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((item) => (
              <tr key={item.deal} className="border-b border-zinc-800/70 text-zinc-300 transition hover:bg-zinc-900/50">
                <td className="py-3">{item.deal}</td>
                <td className="py-3 tabular-nums">{item.date}</td>
                <td className="py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      item.status === "Cleared"
                        ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                        : "border border-amber-400/30 bg-amber-500/10 text-amber-200"
                    }`}
                  >
                    {item.status}
                  </span>
                </td>
                <td className="py-3 font-semibold text-white tabular-nums">{item.commission}</td>
                <td className="py-3 text-emerald-300 tabular-nums">{item.bonus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
