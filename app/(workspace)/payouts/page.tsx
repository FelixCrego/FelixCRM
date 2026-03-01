const payouts = [
  { date: "2026-02-15", amount: "$5,200", status: "Paid" },
  { date: "2026-01-31", amount: "$4,750", status: "Paid" },
  { date: "2026-01-15", amount: "$3,980", status: "Paid" },
];

export default function PayoutsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6">
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-200">Next Payout</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">March 15, 2026 · $6,420 pending</h1>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="mb-2 text-lg font-semibold">Stripe Connect</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
          Connected Bank: <span className="font-medium text-zinc-100">Chase ****1234</span>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h3 className="mb-3 text-lg font-semibold">Payout History</h3>
        <table className="w-full text-left text-sm">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="py-2">Date</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((row) => (
              <tr key={row.date} className="border-b border-zinc-800/70 text-zinc-200">
                <td className="py-3">{row.date}</td>
                <td className="py-3">{row.amount}</td>
                <td className="py-3 text-emerald-300">{row.status}</td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:border-zinc-500">Download Invoice</button>
                    <button className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:border-zinc-500">Download Tax Form</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
