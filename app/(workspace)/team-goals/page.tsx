"use client";

import { ManagerGoalEarningsPredictor } from "@/components/dashboard/manager-goal-earnings-predictor";

const goals = [
  { rep: "Aarav Patel", target: "60 calls/day", progress: 92 },
  { rep: "Jordan Kim", target: "5 demos/week", progress: 80 },
  { rep: "Skylar Lewis", target: "2 closes/week", progress: 50 },
  { rep: "Nia Ross", target: "$30k pipeline/week", progress: 76 },
];

export default function TeamGoalsPage() {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Manager Tooling</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Rep Goal Assignment</h1>
        <p className="mt-1 text-sm text-zinc-400">Assign individualized goals to each team member and monitor completion in one place.</p>
      </section>


      <ManagerGoalEarningsPredictor />

      <section className="grid gap-3 md:grid-cols-2">
        {goals.map((goal) => (
          <article key={goal.rep} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">{goal.rep}</p>
            <p className="mt-1 text-lg font-semibold text-white">{goal.target}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${goal.progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-zinc-400">{goal.progress}% complete</p>
          </article>
        ))}
      </section>
    </div>
  );
}
