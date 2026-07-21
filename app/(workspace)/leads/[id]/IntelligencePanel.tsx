"use client";

import type { LeadIntelligenceProfile } from "@/lib/types";
import { BrainCircuit, CircleDollarSign, Gauge, Lightbulb, ShieldAlert, Sparkles, Target } from "lucide-react";

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500"><span>{label}</span><span>{value}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export default function IntelligencePanel({ intelligence }: { intelligence: LeadIntelligenceProfile }) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: intelligence.estimatedRevenueOpportunity.currency, maximumFractionDigits: 0 });
  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 shadow-sm">
      <div className="border-b border-indigo-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700"><BrainCircuit className="h-4 w-4" /> Felix Intelligence</div>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Opportunity diagnosis</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">A shared, evidence-backed recommendation generated from the lead record and research profile.</p>
          </div>
          <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white">
            <div className="text-xs uppercase tracking-wider text-slate-300">Opportunity score</div>
            <div className="mt-1 flex items-end gap-2"><span className="text-4xl font-black">{intelligence.opportunityScore}</span><span className="pb-1 text-sm text-slate-300">/ 100</span></div>
            <div className="mt-1 text-xs text-slate-300">{intelligence.confidence}% confidence</div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Score label="Website" value={intelligence.websiteScore} />
            <Score label="Marketing" value={intelligence.marketingScore} />
            <Score label="Automation" value={intelligence.automationScore} />
            <Score label="Sales process" value={intelligence.salesProcessScore} />
            <Score label="AI adoption" value={intelligence.aiAdoptionScore} />
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-600 p-4 text-white">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-100"><Target className="h-4 w-4" /> Next best action · {intelligence.nextBestAction.priority}</div>
            <div className="mt-2 text-lg font-bold">{intelligence.nextBestAction.title}</div>
            <p className="mt-1 text-sm text-indigo-100">{intelligence.nextBestAction.reason}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><Sparkles className="h-4 w-4" /> Buying signals</div>
              <ul className="mt-2 space-y-1 text-sm text-emerald-950">{(intelligence.buyingSignals.length ? intelligence.buyingSignals : ["No strong buying signal is recorded yet."]).map((item) => <li key={item}>• {item}</li>)}</ul>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800"><ShieldAlert className="h-4 w-4" /> Risk factors</div>
              <ul className="mt-2 space-y-1 text-sm text-amber-950">{(intelligence.riskFactors.length ? intelligence.riskFactors : ["No material risk is currently recorded."]).map((item) => <li key={item}>• {item}</li>)}</ul>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><CircleDollarSign className="h-4 w-4" /> Estimated opportunity</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{money.format(intelligence.estimatedRevenueOpportunity.low)}–{money.format(intelligence.estimatedRevenueOpportunity.high)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Lightbulb className="h-4 w-4" /> Recommended offer</div>
            <div className="mt-2 font-bold text-slate-950">{intelligence.recommendedService}</div>
            <p className="mt-2 text-sm text-slate-600">{intelligence.recommendedSalesAngle}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Gauge className="h-4 w-4" /> Evidence ledger</div>
            <div className="mt-3 space-y-2">{intelligence.evidence.slice(0, 6).map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3"><div className="flex justify-between gap-3 text-sm font-semibold text-slate-900"><span>{item.label}</span><span className={item.weight >= 0 ? "text-emerald-600" : "text-rose-600"}>{item.weight >= 0 ? "+" : ""}{item.weight}</span></div><p className="mt-1 text-xs text-slate-600">{item.detail}</p></div>)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
