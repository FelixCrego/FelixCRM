"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Loader2, MapPin, RefreshCcw, Search } from "lucide-react";

type Lead = {
  id: string;
  businessName: string;
  phone?: string | null;
  websiteUrl?: string | null;
  websiteStatus?: string | null;
  sourceQuery?: string | null;
  aiResearchSummary?: string | null;
};

export default function ScrapePage() {
  const [city, setCity] = useState("Austin");
  const [niche, setNiche] = useState("Garage Door Repair");
  const [minRating, setMinRating] = useState(0);
  const [includeNoWebsiteOnly, setIncludeNoWebsiteOnly] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResearchingLeadId, setIsResearchingLeadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<{ fetched: number; inserted: number } | null>(null);

  async function refreshLeads() {
    setIsRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/leads", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load leads.");
      const data = await response.json();
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads.");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void refreshLeads();
  }, []);

  async function handleScrape() {
    setIsScraping(true);
    setError(null);
    setStats(null);
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, businessType: niche, minRating, includeNoWebsiteOnly }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Scrape failed.");

      setStats({ fetched: Number(payload.fetched ?? 0), inserted: Number(payload.inserted ?? 0) });
      await refreshLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scrape failed.");
    } finally {
      setIsScraping(false);
    }
  }

  async function handleResearchLead(leadId: string) {
    setIsResearchingLeadId(leadId);
    setError(null);
    try {
      const response = await fetch("/api/leads/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Research failed.");
      await refreshLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed.");
    } finally {
      setIsResearchingLeadId(null);
    }
  }

  const latestLeads = useMemo(() => leads.slice(0, 30), [leads]);

  return (
    <div className="space-y-5 pb-16">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-100">CRM Lead Scraper</h2>
          <button onClick={refreshLeads} disabled={isRefreshing} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60">
            <RefreshCcw className="size-3.5" /> Refresh
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_180px_auto]">
          <label className="relative block">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City / Area" className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm text-zinc-100" />
          </label>
          <label className="relative block">
            <BriefcaseBusiness className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Business Type" className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm text-zinc-100" />
          </label>
          <label className="block rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
            <p className="text-[11px] text-zinc-400">Minimum Rating</p>
            <input type="number" min={0} max={5} step={0.1} value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="mt-1 w-full bg-transparent text-sm text-zinc-100 outline-none" />
          </label>
          <button onClick={handleScrape} disabled={isScraping} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 hover:bg-white disabled:opacity-70">
            {isScraping ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {isScraping ? "Scraping..." : "Run Scrape"}
          </button>
        </div>

        <label className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={includeNoWebsiteOnly} onChange={(e) => setIncludeNoWebsiteOnly(e.target.checked)} className="size-4 rounded border-zinc-600 bg-zinc-900" />
          Only include businesses with no website
        </label>

        {stats && <p className="mt-3 text-sm text-emerald-300">Fetched {stats.fetched} records, inserted {stats.inserted} new leads.</p>}
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-200">Latest Leads ({leads.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="pb-2">Business</th>
                <th className="pb-2">Phone</th>
                <th className="pb-2">Website</th>
                <th className="pb-2">Source Query</th>
                <th className="pb-2">AI Summary</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {latestLeads.map((lead) => (
                <tr key={lead.id} className="border-t border-zinc-800 align-top">
                  <td className="py-2 pr-3 text-zinc-100">{lead.businessName}</td>
                  <td className="py-2 pr-3 text-zinc-300">{lead.phone || "N/A"}</td>
                  <td className="py-2 pr-3 text-zinc-300">{lead.websiteUrl || lead.websiteStatus || "N/A"}</td>
                  <td className="py-2 pr-3 text-zinc-400">{lead.sourceQuery || "N/A"}</td>
                  <td className="py-2 pr-3 text-zinc-400">{lead.aiResearchSummary || "Not researched yet"}</td>
                  <td className="py-2">
                    <button
                      onClick={() => handleResearchLead(lead.id)}
                      disabled={isResearchingLeadId === lead.id}
                      className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                    >
                      {isResearchingLeadId === lead.id ? "Researching..." : "Deep Research"}
                    </button>
                  </td>
                </tr>
              ))}
              {!latestLeads.length && (
                <tr><td className="py-4 text-zinc-500" colSpan={6}>No leads yet. Run a scrape to load and insert leads.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
