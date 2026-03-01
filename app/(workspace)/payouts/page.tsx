const payoutHistory = [
  { date: "2026-02-15", amount: "$5,200.00", destination: "Chase ****4092" },
  { date: "2026-01-31", amount: "$4,750.00", destination: "Chase ****4092" },
  { date: "2026-01-15", amount: "$3,980.00", destination: "Chase ****4092" },
];

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 3.75v8.5" strokeLinecap="round" />
      <path d="m6.75 9.75 3.25 3.25 3.25-3.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 15.5h11" strokeLinecap="round" />
    </svg>
  );
}

export default function PayoutsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-lg">🏦</div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Connected Bank Account</p>
              <p className="mt-1 font-medium text-zinc-100 tabular-nums">Chase Bank ****4092</p>
            </div>
          </div>
          <button className="rounded-lg border border-zinc-700 p-2 text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200" aria-label="Edit bank info">
            ✎
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-900/40 bg-gradient-to-r from-zinc-900 to-indigo-950/30 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Next Disbursement</p>
        <h1 className="mt-2 text-3xl font-semibold text-white tabular-nums">March 15, 2026 · $6,420.00</h1>
        <p className="mt-2 text-sm text-zinc-300">Funds are scheduled to settle in your connected account by end of day.</p>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h3 className="mb-3 text-lg font-semibold">Historical Payouts</h3>
        <table className="w-full text-left text-sm">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="py-2">Date</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Destination Account</th>
              <th className="py-2">Download</th>
            </tr>
          </thead>
          <tbody>
            {payoutHistory.map((row) => (
              <tr key={row.date} className="border-b border-zinc-800/70 text-zinc-200 transition hover:bg-zinc-900/50">
                <td className="py-3 tabular-nums">{row.date}</td>
                <td className="py-3 font-semibold text-white tabular-nums">{row.amount}</td>
                <td className="py-3 tabular-nums">{row.destination}</td>
                <td className="py-3">
                  <button className="rounded-lg border border-zinc-700 p-2 text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100" aria-label="Download payout receipt">
                    <DownloadIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
