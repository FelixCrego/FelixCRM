"use client";

import { useMemo, useState } from "react";

type ScrapedLead = {
  id: string;
  business: string;
  phone: string;
  socialStatus: "Connected" | "Partial" | "Missing";
  websiteLive: boolean;
};

const initialLeads: ScrapedLead[] = [
  { id: "1", business: "Blue Atlas Dental", phone: "(555) 122-7700", socialStatus: "Connected", websiteLive: true },
  { id: "2", business: "Elevation Yoga Studio", phone: "(555) 211-4498", socialStatus: "Partial", websiteLive: false },
  { id: "3", business: "Silverline Attorneys", phone: "(555) 884-2100", socialStatus: "Missing", websiteLive: false },
  { id: "4", business: "Prime Auto Spa", phone: "(555) 191-9931", socialStatus: "Connected", websiteLive: true },
];

export default function ScrapePage() {
  const [city, setCity] = useState("Austin");
  const [niche, setNiche] = useState("Dental");
  const [rating, setRating] = useState(4.2);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  const allSelected = selected.length === initialLeads.length;

  const selectedLeads = useMemo(() => initialLeads.filter((l) => selected.includes(l.id)), [selected]);

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
    <div className="space-y-5">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="mb-4 text-xl font-semibold">Scrape Leads</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <input value={city} onChange={(e) => setCity(e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="City" />
          <input value={niche} onChange={(e) => setNiche(e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="Niche" />
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
            <p className="mb-2 text-xs text-zinc-500">Minimum Google Rating: {rating.toFixed(1)}</p>
            <input type="range" min={1} max={5} step={0.1} value={rating} onChange={(e) => setRating(Number(e.target.value))} className="w-full" />
          </div>
          <button onClick={handleScrape} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400">
            Find Leads
          </button>
        </div>

        {isLoading && (
          <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950 p-4 font-mono text-xs text-emerald-300">
            <p className="mb-2">[extractor] scanning {city} / {niche} with rating ≥ {rating.toFixed(1)}...</p>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2">Progress: {progress}%</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <table className="w-full text-left text-sm">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="px-2 py-3"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : initialLeads.map((l) => l.id))} /></th>
              <th className="px-2 py-3">Business Name</th>
              <th className="px-2 py-3">Phone</th>
              <th className="px-2 py-3">Social Links Status</th>
              <th className="px-2 py-3">Website Status</th>
            </tr>
          </thead>
          <tbody>
            {initialLeads.map((lead) => (
              <tr key={lead.id} className="border-b border-zinc-800/60 text-zinc-200">
                <td className="px-2 py-3"><input type="checkbox" checked={selected.includes(lead.id)} onChange={() => toggleLead(lead.id)} /></td>
                <td className="px-2 py-3">{lead.business}</td>
                <td className="px-2 py-3">{lead.phone}</td>
                <td className="px-2 py-3">{lead.socialStatus}</td>
                <td className="px-2 py-3">
                  <span className={`inline-block rounded-full px-2 py-1 text-xs ${lead.websiteLive ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                    {lead.websiteLive ? "Live" : "Needs Build"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {selectedLeads.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-30 w-[min(700px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-blue-500/30 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-200">{selectedLeads.length} leads selected for pipeline push and instant site generation.</p>
            <button className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400">
              Push to Pipeline &amp; Generate Vercel Sites
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
