"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, Loader2, MapPin, RefreshCcw, Search, Sparkles, Upload } from "lucide-react";
import { AddLeadModal } from "@/components/leads/add-lead-modal";

type ApiPayload = Record<string, unknown>;

async function readJsonResponse(response: Response): Promise<{ payload: ApiPayload; rawText: string }> {
  const rawText = await response.text();
  if (!rawText) return { payload: {}, rawText };

  try {
    return { payload: JSON.parse(rawText) as ApiPayload, rawText };
  } catch {
    return { payload: {}, rawText };
  }
}

type Lead = {
  id: string;
  businessName: string;
  phone?: string | null;
  websiteUrl?: string | null;
  websiteStatus?: string | null;
  sourceQuery?: string | null;
  aiResearchSummary?: string | null;
  ownerId?: string | null;
  transferRequests?: { requesterId: string; requestedAt: string; status: "PENDING" | "APPROVED" | "REJECTED" }[];
};

type ParsedCsvLead = {
  businessName: string;
  phone?: string;
  websiteUrl?: string;
  aiResearchSummary?: string;
  sourceQuery?: string;
};

function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const nextChar = raw[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      currentRow.push(currentCell.trim());
      if (currentRow.some((value) => value.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((value) => value.length > 0)) rows.push(currentRow);
  }

  return rows;
}

function parseLeadsFromCsv(raw: string): ParsedCsvLead[] {
  const rows = parseCsvRows(raw);
  if (!rows.length) return [];

  const [headerRow, ...dataRows] = rows;
  const normalizedHeaders = headerRow.map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));

  const businessNameIndex = normalizedHeaders.findIndex((header) => ["businessname", "name", "company", "business"].includes(header));
  const phoneIndex = normalizedHeaders.findIndex((header) => ["phone", "phonenumber", "telephone"].includes(header));
  const websiteIndex = normalizedHeaders.findIndex((header) => ["website", "websiteurl", "url", "domain"].includes(header));
  const aiResearchSummaryIndex = normalizedHeaders.findIndex((header) => ["airesearchsummary", "deepaianalysis", "aianalysis", "analysis", "summary", "researchsummary"].includes(header));
  const sourceQueryIndex = normalizedHeaders.findIndex((header) => ["sourcequery", "source", "query", "searchquery", "sourceprompt"].includes(header));

  if (businessNameIndex < 0) {
    throw new Error("CSV must include a business name column (businessName, name, company, or business). Optional columns: phone, website, Deep AI analysis, and source query.");
  }

  return dataRows
    .map((row) => ({
      businessName: row[businessNameIndex]?.trim() || "",
      phone: phoneIndex >= 0 ? row[phoneIndex]?.trim() || "" : "",
      websiteUrl: websiteIndex >= 0 ? row[websiteIndex]?.trim() || "" : "",
      aiResearchSummary: aiResearchSummaryIndex >= 0 ? row[aiResearchSummaryIndex]?.trim() || "" : "",
      sourceQuery: sourceQueryIndex >= 0 ? row[sourceQueryIndex]?.trim() || "" : "",
    }))
    .filter((lead) => lead.businessName.length > 0);
}

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
  const leadsPerPage = 30;
  const [city, setCity] = useState("");
  const [niche, setNiche] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [includeNoWebsiteOnly, setIncludeNoWebsiteOnly] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResearchingLeadId, setIsResearchingLeadId] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimSuccessMessage, setClaimSuccessMessage] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<{ fetched: number; inserted: number } | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [newLeadForm, setNewLeadForm] = useState({ businessName: "", phone: "", website: "" });
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  async function refreshLeads() {
    setIsRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/leads?scope=all", { cache: "no-store" });
      const { payload, rawText } = await readJsonResponse(response);
      if (!response.ok) {
        const message = typeof payload.error === "string" ? payload.error : rawText || "Failed to load leads.";
        throw new Error(message);
      }
      setLeads(Array.isArray(payload.leads) ? (payload.leads as Lead[]) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads.");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void refreshLeads();
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (mounted && typeof data.userId === "string") setCurrentUserId(data.userId);
      } catch {
        // noop
      }
    }

    void loadCurrentUser();
    return () => {
      mounted = false;
    };
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

      const { payload, rawText } = await readJsonResponse(response);

      if (!response.ok) {
        const fallback = rawText || `Scrape failed with status ${response.status}.`;
        const errorMessage = typeof payload.error === "string" ? payload.error : fallback;
        throw new Error(errorMessage);
      }

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
      const claimed = Number(payload.claimed ?? 0);
      const claimedByOthers = Number(payload.claimedByOthers ?? 0);
      const alreadyOwnedByYou = Number(payload.alreadyOwnedByYou ?? 0);
      const fragments = [`Successfully claimed ${claimed} lead${claimed === 1 ? "" : "s"}.`];
      if (alreadyOwnedByYou > 0) fragments.push(`${alreadyOwnedByYou} already belonged to you.`);
      if (claimedByOthers > 0) fragments.push(`${claimedByOthers} are already claimed by another user.`);
      setClaimSuccessMessage(fragments.join(" "));
      await refreshLeads();
      if (claimed > 0) router.push("/leads");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed.");
    } finally {
      setIsClaiming(false);
    }
  }


  async function handleDeleteLeads(leadIds: string[]) {
    if (!leadIds.length) return;
    setIsDeleting(true);
    setError(null);
    setClaimSuccessMessage(null);

    try {
      const response = await fetch("/api/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Delete failed.");

      const deleted = Number(payload.deleted ?? 0);
      const forbidden = Number(payload.forbidden ?? 0);
      const missing = Number(payload.missing ?? 0);
      const fragments = [`Deleted ${deleted} lead${deleted === 1 ? "" : "s"}.`];
      if (forbidden > 0) fragments.push(`${forbidden} could not be deleted because they are owned by another user.`);
      if (missing > 0) fragments.push(`${missing} could not be found.`);
      setClaimSuccessMessage(fragments.join(" "));
      setSelectedLeadIds((prev) => prev.filter((id) => !leadIds.includes(id)));
      await refreshLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRequestTransfer(leadId: string) {
    setError(null);
    try {
      const response = await fetch("/api/leads/transfer-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Transfer request failed.");
      setClaimSuccessMessage(payload.requested ? "Ownership transfer requested." : "You already requested transfer for this lead.");
      await refreshLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer request failed.");
    }
  }

  async function handleAddLead() {
    if (!newLeadForm.businessName.trim()) return;
    setIsAddingLead(true);
    setError(null);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: newLeadForm.businessName,
          phone: newLeadForm.phone,
          websiteUrl: newLeadForm.website,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to add lead.");

      setIsAddLeadOpen(false);
      setNewLeadForm({ businessName: "", phone: "", website: "" });
      setClaimSuccessMessage("Lead added successfully.");
      await refreshLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add lead.");
    } finally {
      setIsAddingLead(false);
    }
  }

  async function handleCsvFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImportingCsv(true);
    setError(null);
    setClaimSuccessMessage(null);
    try {
      const csvText = await file.text();
      const leadsToImport = parseLeadsFromCsv(csvText);
      if (!leadsToImport.length) throw new Error("No valid leads found in CSV.\nRequired column: business name. Optional columns: phone, website, Deep AI analysis, and source query.");

      const response = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: leadsToImport }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409 && payload.requiresMergeConfirmation) {
          const shouldMerge = window.confirm(typeof payload.error === "string" ? payload.error : "Duplicate leads found. Merge duplicates and continue import?");
          if (shouldMerge) {
            await importCsvLeads(leadsToImport, true);
          }
          return;
        }
        throw new Error(payload.error ?? "Failed to import CSV leads.");
      }

      const createdCount = Number(payload.createdCount ?? 0);
      const mergedCount = Number(payload.mergedCount ?? 0);
      const skippedCount = Number(payload.skippedCount ?? 0);
      setClaimSuccessMessage(`Imported ${createdCount} lead${createdCount === 1 ? "" : "s"}.${mergedCount > 0 ? ` Merged ${mergedCount} duplicate${mergedCount === 1 ? "" : "s"}.` : ""}${skippedCount > 0 ? ` Skipped ${skippedCount} invalid row${skippedCount === 1 ? "" : "s"}.` : ""}`);
      await refreshLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import CSV leads.");
    } finally {
      setIsImportingCsv(false);
    }
  }

  async function importCsvLeads(leadsToImport: ParsedCsvLead[], mergeDuplicates: boolean) {
    const response = await fetch("/api/leads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads: leadsToImport, mergeDuplicates }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Failed to import CSV leads.");

    const createdCount = Number(payload.createdCount ?? 0);
    const mergedCount = Number(payload.mergedCount ?? 0);
    const skippedCount = Number(payload.skippedCount ?? 0);
    setClaimSuccessMessage(`Imported ${createdCount} lead${createdCount === 1 ? "" : "s"}.${mergedCount > 0 ? ` Merged ${mergedCount} duplicate${mergedCount === 1 ? "" : "s"}.` : ""}${skippedCount > 0 ? ` Skipped ${skippedCount} invalid row${skippedCount === 1 ? "" : "s"}.` : ""}`);
    await refreshLeads();
  }

  const totalPages = Math.max(1, Math.ceil(leads.length / leadsPerPage));
  const paginatedLeads = useMemo(() => {
    const startIndex = (currentPage - 1) * leadsPerPage;
    return leads.slice(startIndex, startIndex + leadsPerPage);
  }, [currentPage, leads]);

  useEffect(() => {
    setCurrentPage((previousPage) => Math.min(previousPage, totalPages));
  }, [totalPages]);

  const pageLeadIds = useMemo(() => paginatedLeads.map((lead) => lead.id), [paginatedLeads]);
  const pageClaimableLeadIds = useMemo(
    () => paginatedLeads.filter((lead) => !lead.ownerId || lead.ownerId === currentUserId).map((lead) => lead.id),
    [currentUserId, paginatedLeads],
  );
  const selectedOnPageCount = selectedLeadIds.filter((leadId) => pageLeadIds.includes(leadId)).length;
  const allPageClaimableSelected = pageClaimableLeadIds.length > 0 && pageClaimableLeadIds.every((leadId) => selectedLeadIds.includes(leadId));

  const selectedCount = selectedLeadIds.length;
  const claimableCount = pageClaimableLeadIds.length;

  return (
    <div className="space-y-5 pb-24">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-100">CRM Lead Scraper</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setIsAddLeadOpen(true);
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-100 transition hover:border-zinc-500"
            >
              + Add Lead
            </button>
            <button
              type="button"
              onClick={() => csvFileInputRef.current?.click()}
              disabled={isImportingCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 transition hover:bg-zinc-900 disabled:opacity-60"
            >
              {isImportingCsv ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {isImportingCsv ? "Importing..." : "Import CSV"}
            </button>
            <input ref={csvFileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFileUpload} />
            <button onClick={refreshLeads} disabled={isRefreshing} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60">
              <RefreshCcw className="size-3.5" /> Refresh
            </button>
          </div>
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
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-200">Scraped Leads ({leads.length})</h3>
          <button
            onClick={() => handleClaimLeads(pageClaimableLeadIds)}
            disabled={isClaiming || claimableCount === 0}
            className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {isClaiming ? "Claiming..." : `Claim This Page (${claimableCount})`}
          </button>
        </div>
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-zinc-400">
          <p>
            {leads.length > 0
              ? `Showing ${(currentPage - 1) * leadsPerPage + 1}-${Math.min(currentPage * leadsPerPage, leads.length)} of ${leads.length} leads`
              : "Showing 0-0 of 0 leads"}
            {selectedOnPageCount > 0 ? ` • ${selectedOnPageCount} selected on this page` : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((previousPage) => Math.max(1, previousPage - 1))}
              disabled={currentPage === 1}
              className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-zinc-300">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage((previousPage) => Math.min(totalPages, previousPage + 1))}
              disabled={currentPage === totalPages}
              className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="pb-2">
                  <input
                    type="checkbox"
                    checked={allPageClaimableSelected}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedLeadIds((previousLeadIds) => Array.from(new Set([...previousLeadIds, ...pageClaimableLeadIds])));
                        return;
                      }
                      setSelectedLeadIds((previousLeadIds) => previousLeadIds.filter((leadId) => !pageLeadIds.includes(leadId)));
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
              {paginatedLeads.map((lead) => {
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
                        disabled={Boolean(lead.ownerId && currentUserId && lead.ownerId !== currentUserId)}
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
                      {lead.ownerId && currentUserId && lead.ownerId !== currentUserId ? (
                        <>
                          <span className="rounded-md border border-amber-700/60 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300">Claimed by another user</span>
                          <button
                            onClick={() => handleRequestTransfer(lead.id)}
                            className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900"
                          >
                            Request Transfer
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleClaimLeads([lead.id])}
                            disabled={isClaiming || Boolean(lead.ownerId && currentUserId && lead.ownerId !== currentUserId)}
                            className="rounded-md bg-indigo-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
                          >
                            {isClaiming ? "Claiming..." : "Claim Lead"}
                          </button>
                          <button
                            onClick={() => handleDeleteLeads([lead.id])}
                            disabled={isDeleting}
                            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
                          >
                            {isDeleting ? "Deleting..." : "Delete Lead"}
                          </button>
                        </>
                      )}
                      {lead.ownerId === currentUserId ? (
                        <Link href={`/leads/${lead.id}`} className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900">
                          Open Workspace
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!paginatedLeads.length && (
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDeleteLeads(selectedLeadIds)}
                disabled={isDeleting}
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete Selected Leads"}
              </button>
              <button
                onClick={() => handleClaimLeads(selectedLeadIds)}
                disabled={isClaiming}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {isClaiming ? "Claiming..." : "Claim Selected Leads"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AddLeadModal
        isOpen={isAddLeadOpen}
        isSubmitting={isAddingLead}
        formData={newLeadForm}
        errorMessage={null}
        onChange={(field, value) => {
          if (field === "website") {
            setNewLeadForm((prev) => ({ ...prev, website: value }));
            return;
          }
          if (field === "phone") {
            setNewLeadForm((prev) => ({ ...prev, phone: value }));
            return;
          }
          setNewLeadForm((prev) => ({ ...prev, businessName: value }));
        }}
        onClose={() => {
          if (isAddingLead) return;
          setIsAddLeadOpen(false);
        }}
        onSubmit={handleAddLead}
      />
    </div>
  );
}
