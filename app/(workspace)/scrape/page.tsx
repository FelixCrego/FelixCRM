"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Bot,
  BriefcaseBusiness,
  Building2,
  Check,
  ExternalLink,
  LineChart,
  Mail,
  MapPin,
  Phone,
  Plus,
  Radar,
  Search,
  Sparkles,
  Target,
  Triangle,
  Wand2,
  Zap,
} from "lucide-react";

type ScrapedLead = {
  id: string;
  business: string;
  phone: string;
  email: string;
  socialStatus: "Connected" | "Partial" | "Missing";
  websiteLive: boolean;
};

const initialLeads: ScrapedLead[] = [
  { id: "1", business: "Blue Atlas Dental", phone: "(555) 122-7700", email: "hello@blueatlasdental.com", socialStatus: "Connected", websiteLive: true },
  { id: "2", business: "Elevation Yoga Studio", phone: "(555) 211-4498", email: "team@elevationyoga.com", socialStatus: "Partial", websiteLive: false },
  { id: "3", business: "Silverline Attorneys", phone: "(555) 884-2100", email: "intake@silverlineattorneys.com", socialStatus: "Missing", websiteLive: false },
  { id: "4", business: "Prime Auto Spa", phone: "(555) 191-9931", email: "service@primeautospa.com", socialStatus: "Connected", websiteLive: true },
];

const aiMissions = [
  { title: "Autopilot sequences", detail: "Launches channel-specific outreach from lead health and intent data.", status: "Active" },
  { title: "Intent pulse detection", detail: "Monitors review changes, website velocity, and social freshness for urgency signals.", status: "Learning" },
  { title: "Revenue path simulator", detail: "Forecasts close probability by persona, timing, and offer angle.", status: "Ready" },
];

export default function ScrapePage() {
  const [city, setCity] = useState("Austin");
  const [niche, setNiche] = useState("Dental");
  const [rating, setRating] = useState(4.2);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  const allSelected = selected.length === initialLeads.length;
  const selectedLeads = useMemo(() => initialLeads.filter((lead) => selected.includes(lead.id)), [selected]);

  const aiSnapshot = useMemo(() => {
    const missingSite = initialLeads.filter((lead) => !lead.websiteLive).length;
    const connectedSocial = initialLeads.filter((lead) => lead.socialStatus === "Connected").length;
    const avgReadiness = Math.round(((connectedSocial * 1.1 + (initialLeads.length - missingSite) * 1.3) / (initialLeads.length * 2.4)) * 100);

    return {
      missingSite,
      connectedSocial,
      avgReadiness,
      hotNow: initialLeads.filter((lead) => !lead.websiteLive || lead.socialStatus !== "Connected").length,
    };
  }, []);

  function handleScrape() {
    setIsLoading(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsLoading(false);
          return 100;
        }

        return prev + 10;
      });
    }, 140);
  }

  function toggleLead(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-zinc-100">Scrape Leads</h2>
          <p className="text-xs tracking-wide text-zinc-500">Command center</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.3fr_auto]">
          <label className="relative block">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900/90 pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700/70"
              placeholder="City"
            />
          </label>

          <label className="relative block">
            <BriefcaseBusiness className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900/90 pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700/70"
              placeholder="Niche"
            />
          </label>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-2.5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <p className="text-zinc-400">Minimum Google Rating</p>
              <p className="font-medium text-zinc-100">{rating.toFixed(1)}</p>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={0.1}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800
                [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-zinc-950 [&::-moz-range-thumb]:bg-white
                [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-zinc-800
                [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-zinc-950 [&::-webkit-slider-thumb]:bg-white"
            />
          </div>

          <button
            onClick={handleScrape}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-zinc-200"
          >
            <Search className="size-4" />
            <span>Find Leads</span>
            <Sparkles className="size-4" />
          </button>
        </div>

        {isLoading && (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-emerald-300">
            <p className="mb-2">
              [extractor] scanning {city} / {niche} with rating ≥ {rating.toFixed(1)}...
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-zinc-300">Progress: {progress}%</p>
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <article className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/15 via-zinc-900 to-zinc-950 p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-200">AI Lead Command</h3>
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-violet-100">
              <Bot className="size-3" />
              Quantum Assist
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/70 p-3">
              <p className="text-xs text-zinc-400">Readiness Score</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-100">{aiSnapshot.avgReadiness}%</p>
              <p className="mt-1 text-xs text-emerald-300">+12% week over week</p>
            </div>
            <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/70 p-3">
              <p className="text-xs text-zinc-400">Hot Opportunities</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-100">{aiSnapshot.hotNow}</p>
              <p className="mt-1 text-xs text-amber-300">Need immediate follow-up</p>
            </div>
            <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/70 p-3">
              <p className="text-xs text-zinc-400">No-site targets</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-100">{aiSnapshot.missingSite}</p>
              <p className="mt-1 text-xs text-blue-300">Perfect for instant demo builds</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {aiMissions.map((mission) => (
              <div key={mission.title} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2.5">
                <Wand2 className="mt-0.5 size-4 text-violet-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-100">{mission.title}</p>
                  <p className="text-xs text-zinc-400">{mission.detail}</p>
                </div>
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.11em] text-zinc-300">{mission.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">Live AI Radar</h3>
          <div className="space-y-2">
            {[
              { icon: Radar, label: "Intent spike", value: "Blue Atlas Dental opened pricing 3x today" },
              { icon: Activity, label: "Engagement drift", value: "Silverline Attorneys hasn't replied in 5 days" },
              { icon: Target, label: "Best close path", value: "Call + 45s voicemail + SMS follow-up" },
              { icon: LineChart, label: "Pipeline projection", value: "$31,200 likely in next 14 days" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5">
                  <p className="mb-1 inline-flex items-center gap-1 text-xs uppercase tracking-[0.11em] text-zinc-400">
                    <Icon className="size-3.5 text-cyan-300" />
                    {item.label}
                  </p>
                  <p className="text-sm text-zinc-100">{item.value}</p>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.13em] text-zinc-200">Lead Table</h3>
            <p className="text-xs text-zinc-500">AI-ranked outreach queue with one-tap actions</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200">
            <Zap className="size-3" />
            Auto-prioritizing
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-zinc-950/70 text-xs uppercase tracking-[0.12em] text-zinc-400">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : initialLeads.map((lead) => lead.id))}
                    className="size-4 rounded border-zinc-600 bg-zinc-900 text-zinc-100"
                  />
                </th>
                <th className="px-2 py-3">Business Name</th>
                <th className="px-2 py-3">Phone</th>
                <th className="px-2 py-3">Social</th>
                <th className="px-2 py-3">Website Status</th>
                <th className="px-2 py-3">AI Next Step</th>
                <th className="px-2 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {initialLeads.map((lead) => (
                <tr key={lead.id} className="group border-b border-zinc-800/80 text-zinc-200 transition hover:bg-zinc-800/50">
                  <td className="px-3 py-3 align-middle">
                    <input
                      type="checkbox"
                      checked={selected.includes(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                      className="size-4 rounded border-zinc-600 bg-zinc-900 text-zinc-100"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-300">
                        <Building2 className="size-4" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-100">{lead.business}</p>
                        <p className="text-xs text-zinc-500">{lead.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-zinc-300">{lead.phone}</td>
                  <td className="px-2 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs ${
                        lead.socialStatus === "Connected"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : lead.socialStatus === "Partial"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      {lead.socialStatus}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs ${lead.websiteLive ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                        {lead.websiteLive ? "Live" : "Needs Build"}
                      </span>

                      {lead.websiteLive ? (
                        <button className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20">
                          View Site
                          <ExternalLink className="size-3" />
                        </button>
                      ) : (
                        <button className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/70 px-2 py-1 text-xs font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-700">
                          <Triangle className="size-3 fill-current" />
                          Deploy Site
                          <Zap className="size-3" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <p className="inline-flex items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 py-1 text-xs text-violet-200">
                      <Sparkles className="size-3" />
                      {lead.websiteLive ? "Send personalization email" : "Deploy demo + send loom"}
                    </p>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex justify-end gap-1 opacity-35 transition group-hover:opacity-100">
                      <button className="rounded-md border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100" aria-label="Call lead">
                        <Phone className="size-3.5" />
                      </button>
                      <button className="rounded-md border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100" aria-label="Email lead">
                        <Mail className="size-3.5" />
                      </button>
                      <button className="rounded-md border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100" aria-label="Add lead to pipeline">
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div
        className={`fixed bottom-6 left-1/2 z-30 w-[min(760px,calc(100%-1.5rem))] -translate-x-1/2 transition-all duration-300 ${
          selectedLeads.length > 0 ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
        }`}
      >
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-zinc-200">
              <span className="font-semibold text-white">{selectedLeads.length}</span> Leads Selected
            </p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:border-zinc-500 hover:bg-zinc-700">
                <Check className="size-4" />
                Push to Pipeline
              </button>
              <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/20 px-4 py-2 text-sm font-semibold text-violet-100 hover:border-violet-300/40 hover:bg-violet-500/30">
                <Bot className="size-4" />
                Run AI Multichannel Sequence
              </button>
              <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200">
                <Triangle className="size-4 fill-current" />
                Bulk Deploy Sites
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
