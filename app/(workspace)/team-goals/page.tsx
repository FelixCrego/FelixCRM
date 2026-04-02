"use client";

import { ManagerGoalEarningsPredictor } from "@/components/dashboard/manager-goal-earnings-predictor";
import { ShiftQueueSettingsManager } from "@/components/dashboard/shift-queue-settings-manager";

export default function TeamGoalsPage() {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Manager Tooling</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Rep Goal Assignment</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Set live shift queue blueprints per rep, then lock weekly manager projections and accountability targets in one place.
        </p>
      </section>

      <ShiftQueueSettingsManager />
      <ManagerGoalEarningsPredictor />
    </div>
  );
}
