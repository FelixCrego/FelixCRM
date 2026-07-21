"use client";

import Link from "next/link";
import { ArrowRight, BrainCircuit, CircleDollarSign, Target } from "lucide-react";
import { useEffect, useState } from "react";

type Priority = {
  leadId: string;
  businessName: string;
  city: string;
  businessType: string;
  opportunityScore: number;
  confidence: number;
  estimatedRevenueOpportunity: { low: number; high: number; currency: "USD" };
  nextBestAction: { title: string; reason: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" };
  recommendedService: string;
};

type PrioritiesResponse = {
  priorities: Priority[];
  summary: { total: number; pipelineValue: number };
};

export default function DailyPriorities() {
  const [data, setData] = useState<PrioritiesResponse | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/intelligence/priorities?limit=6", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()) as PrioritiesResponse : null)
      .then((payload) => { if (active && payload) setData(payload); });
    return () => { active = false; };
  }, []);

  if (!data?.priorities.length) return null;
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/80 via-zinc-900 to-cyan-950/60 shadow-xl">
      <div className="flex flex-col gap-3 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300"><BrainCircuit className="h-4 w-4" /> Felix Intelligence</div>
          <h2 className="mt-1 text-xl font-bold text-white">Today’s highest-value actions</h2>
          <p className="mt-1 text-sm text-zinc-400">Prioritized by opportunity, reachability, funnel stage, and evidence confidence.</p>
        </div>
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-emerald-300"><CircleDollarSign className="h-4 w-4" /> Prioritized pipeline</div>
          <div className="mt-1 text-2xl font-black text-white">{money.format(data.summary.pipelineValue)}</div>
        </div>
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-2 xl:grid-cols-3">
        {data.priorities.map((priority, index) => (
          <Link key={priority.leadId} href={`/leads/${priority.leadId}`} className="group rounded-xl border border-white/10 bg-black/20 p-4 transition hover:border-indigo-400/50 hover:bg-white/5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-black text-indigo-200">{index + 1}</div>
                <div><div className="font-bold text-white">{priority.businessName}</div><div className="text-xs text-zinc-500">{[priority.businessType, priority.city].filter(Boolean).join(" · ")}</div></div>
              </div>
              <div className="rounded-lg bg-white/10 px-2.5 py-1 text-sm font-black text-white">{priority.opportunityScore}</div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-300"><Target className="h-3.5 w-3.5" /> {priority.nextBestAction.priority}</div>
            <div className="mt-1 font-semibold text-zinc-100">{priority.nextBestAction.title}</div>
            <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{priority.nextBestAction.reason}</p>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs"><span className="text-zinc-500">{priority.confidence}% confidence</span><span className="flex items-center gap-1 font-semibold text-indigo-300">Open lead <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></span></div>
          </Link>
        ))}
      </div>
    </section>
  );
}
