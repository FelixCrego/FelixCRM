"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Loader2, MapPin, RefreshCcw, Search, Sparkles } from "lucide-react";

type Lead = {
  id: string;
  businessName: string;
  phone?: string | null;
  websiteUrl?: string | null;
  websiteStatus?: string | null;
  sourceQuery?: string | null;
  aiResearchSummary?: string | null;
  ownerId?: string | null;
};

function websitePill(lead: Lead) {
  const hasWebsite = Boolean(lead.websiteUrl);
  const label = hasWebsite ? lead.websiteUrl : lead.websiteStatus || "MISSING";

  return (
    <span
      title={label || undefined}
      className={`inline-flex max-w-[16rem] truncate rounded-full px-2.5 py-1 text-xs font-medium ${
        hasWebsite ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border border-red-500/30 bg-red-500/10 text-red-400"
      }`}
    >
      {label}
    </span>
  );
}

export default function ScrapePage() {
  const [city, setCity] = useState("");
  const [niche, setNiche] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [includeNoWebsiteOnly, setIncludeNoWebsiteOnly] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResearchingLeadId, setIsResearchingLeadId] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimSuccessMessage, setClaimSuccessMessage] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<{ fetched: number; inserted: number } | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const router = useRouter();

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

  async function handleClaimLeads(leadIds: string[]) {
    if (!leadIds.length) return;
    setIsClaiming(true);
    setError(null);
    setClaimSuccessMessage(null);

    try {
      const response = await fetch("/api/leads/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Claim failed.");
      setSelectedLeadIds([]);
      setClaimSuccessMessage(`Successfully claimed ${Number(payload.claimed ?? 0)} lead${Number(payload.claimed ?? 0) === 1 ? "" : "s"}.`);
      router.push("/leads");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed.");
    } finally {
      setIsClaiming(false);
    }
  }

  const latestLeads = useMemo(() => leads.slice(0, 30), [leads]);

  const selectedCount = selectedLeadIds.length;

  return (
    <div className="space-y-5 pb-24">
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
        {claimSuccessMessage && <p className="mt-3 text-sm text-emerald-300">{claimSuccessMessage}</p>}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-200">Latest Leads ({leads.length})</h3>
          <button
            onClick={() => handleClaimLeads(latestLeads.map((lead) => lead.id))}
            disabled={isClaiming || !latestLeads.length}
            className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {isClaiming ? "Claiming..." : `Claim All ${latestLeads.length} Leads`}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="pb-2">
                  <input
                    type="checkbox"
                    checked={latestLeads.length > 0 && selectedLeadIds.length === latestLeads.length}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedLeadIds(latestLeads.map((lead) => lead.id));
                        return;
                      }
                      setSelectedLeadIds([]);
                    }}
                    className="size-4 rounded border-zinc-700 bg-zinc-900"
                    aria-label="Select all leads"
                  />
                </th>
                <th className="pb-2">Business</th>
                <th className="pb-2">Phone</th>
                <th className="pb-2">Website</th>
                <th className="pb-2">Source Query</th>
                <th className="pb-2">AI Summary</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {latestLeads.map((lead) => {
                const checked = selectedLeadIds.includes(lead.id);
                return (
                  <tr key={lead.id} className="border-t border-zinc-800 align-top">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedLeadIds((prev) => [...prev, lead.id]);
                            return;
                          }
                          setSelectedLeadIds((prev) => prev.filter((id) => id !== lead.id));
                        }}
                        className="size-4 rounded border-zinc-700 bg-zinc-900"
                        aria-label={`Select ${lead.businessName}`}
                      />
                    </td>
                    <td className="py-2 pr-3 text-zinc-100">{lead.businessName}</td>
                    <td className="py-2 pr-3 text-zinc-300">{lead.phone || "N/A"}</td>
                    <td className="py-2 pr-3 text-zinc-300">{websitePill(lead)}</td>
                    <td className="py-2 pr-3 text-zinc-400">{lead.sourceQuery || "N/A"}</td>
                    <td className="py-2 pr-3 text-zinc-400">
                      {lead.aiResearchSummary ? (
                        <p className="line-clamp-2 text-zinc-300">{lead.aiResearchSummary}</p>
                      ) : (
                        <button
                          onClick={() => handleResearchLead(lead.id)}
                          disabled={isResearchingLeadId === lead.id}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-xs italic text-zinc-400 transition hover:text-zinc-200 disabled:opacity-60"
                        >
                          {isResearchingLeadId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Run AI Analysis
                        </button>
                      )}
                    </td>
                    <td className="space-x-2 py-2">
                      <button
                        onClick={() => handleClaimLeads([lead.id])}
                        disabled={isClaiming}
                        className="rounded-md bg-indigo-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
                      >
                        {isClaiming ? "Claiming..." : "Claim Lead"}
                      </button>
                      {lead.ownerId ? (
                        <Link href={`/leads/${lead.id}`} className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900">
                          Open Workspace
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!latestLeads.length && (
                <tr><td className="py-4 text-zinc-500" colSpan={7}>No leads yet. Run a scrape to load and insert leads.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedCount > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 w-[min(92vw,860px)] -translate-x-1/2 rounded-2xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-zinc-300">{selectedCount} lead{selectedCount > 1 ? "s" : ""} selected</p>
            <button
              onClick={() => handleClaimLeads(selectedLeadIds)}
              disabled={isClaiming}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
            >
              {isClaiming ? "Claiming..." : "Claim Selected Leads"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
