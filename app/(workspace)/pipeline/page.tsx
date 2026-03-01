"use client";

import { useMemo, useState } from "react";

type Stage = "New" | "Contacted" | "Vercel Deployed" | "Demo Booked" | "Closed Won";
type VercelStatus = "Live" | "Deploying" | "Unbuilt";

type Deal = {
  id: string;
  name: string;
  rep: string;
  value: string;
  stage: Stage;
  vercelStatus: VercelStatus;
};

const deals: Deal[] = [
  { id: "d1", name: "Aurora Dental", rep: "AM", value: "$4,500", stage: "New", vercelStatus: "Unbuilt" },
  { id: "d2", name: "Pulse Fitness", rep: "JS", value: "$7,800", stage: "Contacted", vercelStatus: "Deploying" },
  { id: "d3", name: "Northline Roofing", rep: "TR", value: "$9,200", stage: "Vercel Deployed", vercelStatus: "Live" },
  { id: "d4", name: "Maverick Legal", rep: "AM", value: "$6,900", stage: "Demo Booked", vercelStatus: "Live" },
  { id: "d5", name: "Bloom Pediatrics", rep: "KL", value: "$5,400", stage: "Closed Won", vercelStatus: "Live" },
];

const stages: Stage[] = ["New", "Contacted", "Vercel Deployed", "Demo Booked", "Closed Won"];

export default function PipelinePage() {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const byStage = useMemo(() => Object.fromEntries(stages.map((s) => [s, deals.filter((d) => d.stage === s)])), []);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-5">
        {stages.map((stage) => (
          <section key={stage} className="min-h-[520px] rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">{stage}</h2>
            <div className="space-y-3">
              {(byStage[stage] as Deal[]).map((deal) => (
                <button
                  key={deal.id}
                  onClick={() => setActiveDeal(deal)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 p-3 text-left transition hover:border-blue-400/50"
                >
                  <p className="font-medium text-zinc-100">{deal.name}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-zinc-200">{deal.rep}</span>
                    <span className="font-medium text-zinc-200">{deal.value}</span>
                  </div>
                  <span className={`mt-3 inline-block rounded-full px-2 py-1 text-xs ${deal.vercelStatus === "Live" ? "bg-emerald-500/20 text-emerald-300" : deal.vercelStatus === "Deploying" ? "bg-amber-500/20 text-amber-200" : "bg-zinc-700 text-zinc-300"}`}>
                    Vercel: {deal.vercelStatus}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {activeDeal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setActiveDeal(null)}>
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold">{activeDeal.name}</h3>
            <p className="mb-4 mt-1 text-sm text-zinc-400">Communication history & deployment actions</p>
            <div className="space-y-3 text-sm">
              {["Intro email sent • 09:12", "SMS follow-up delivered • 11:45", "Prospect requested revised pricing • 14:10"].map((event) => (
                <div key={event} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-300">
                  {event}
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-xl border border-zinc-700 px-4 py-2 text-sm" onClick={() => setActiveDeal(null)}>
                Close
              </button>
              <button className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400">Instant Site: Deploy Now</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
