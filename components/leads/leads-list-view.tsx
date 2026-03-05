"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import type { Lead } from "@/lib/types";
import { AddLeadModal } from "@/components/leads/add-lead-modal";

type LeadsListViewProps = {
  leads?: Lead[] | null;
  errorMessage?: string | null;
  viewMode?: "open" | "closed";
};

const statusLabelMap: Record<Lead["status"], string> = {
  NEW: "Not Contacted",
  CONTACTED: "Contacted",
  IN_PROGRESS: "In Progress",
  CLOSED: "Closed",
  DISQUALIFIED: "Disqualified",
};

type LeadSiteStatus = NonNullable<Lead["siteStatus"]>;

const vercelStatusMap: Record<LeadSiteStatus, string> = {
  UNBUILT: "Unbuilt",
  BUILDING: "Deploying",
  LIVE: "Live",
  FAILED: "Failed",
} as const;

const leadStatusPillMap: Record<Lead["status"], string> = {
  NEW: "border-zinc-700/90 bg-zinc-800/80 text-zinc-300",
  CONTACTED: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  IN_PROGRESS: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  CLOSED: "border-emerald-500/35 bg-emerald-500/15 text-emerald-300",
  DISQUALIFIED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

const vercelStatusPillMap: Record<LeadSiteStatus, string> = {
  UNBUILT: "border-zinc-700/90 bg-zinc-900 text-zinc-400",
  BUILDING: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  LIVE: "border-emerald-400/40 bg-emerald-400/20 text-emerald-200 shadow-[0_0_24px_rgba(52,211,153,0.2)]",
  FAILED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

const CLAIMED_LEADS_STORAGE_KEY = "claimedLeads";

function normalizeLead(raw: unknown): Lead | null {
  if (!raw || typeof raw !== "object") return null;

  const lead = raw as Partial<Lead> & Record<string, unknown>;
  if (typeof lead.id !== "string" || typeof lead.businessName !== "string") return null;

  const updatedAtSource = typeof lead.updatedAt === "string" ? lead.updatedAt : new Date().toISOString();
  const updatedAt = Number.isNaN(new Date(updatedAtSource).getTime()) ? new Date().toISOString() : updatedAtSource;
  const status =
    lead.status === "NEW" ||
    lead.status === "CONTACTED" ||
    lead.status === "IN_PROGRESS" ||
    lead.status === "CLOSED" ||
    lead.status === "DISQUALIFIED"
      ? lead.status
      : "NEW";

  const siteStatus =
    lead.siteStatus === "UNBUILT" || lead.siteStatus === "BUILDING" || lead.siteStatus === "LIVE" || lead.siteStatus === "FAILED"
      ? lead.siteStatus
      : "UNBUILT";

  return {
    id: lead.id,
    businessName: lead.businessName,
    city: typeof lead.city === "string" ? lead.city : "Unknown",
    businessType: typeof lead.businessType === "string" ? lead.businessType : "General",
    phone: typeof lead.phone === "string" ? lead.phone : null,
    email: typeof lead.email === "string" ? lead.email : null,
    websiteUrl: typeof lead.websiteUrl === "string" ? lead.websiteUrl : null,
    websiteStatus: typeof lead.websiteStatus === "string" ? lead.websiteStatus : null,
    socialLinks: Array.isArray(lead.socialLinks) ? (lead.socialLinks.filter((link) => typeof link === "string") as string[]) : [],
    aiResearchSummary: typeof lead.aiResearchSummary === "string" ? lead.aiResearchSummary : null,
    sourceQuery: typeof lead.sourceQuery === "string" ? lead.sourceQuery : null,
    status,
    deployedUrl: typeof lead.deployedUrl === "string" ? lead.deployedUrl : null,
    siteStatus,
    ownerId: typeof lead.ownerId === "string" ? lead.ownerId : null,
    closedDealValue: typeof lead.closedDealValue === "number" ? lead.closedDealValue : null,
    closedAt: typeof lead.closedAt === "string" ? lead.closedAt : null,
    stripeCheckoutLink: typeof lead.stripeCheckoutLink === "string" ? lead.stripeCheckoutLink : null,
    updatedAt,
  };
}

function safelyBucketLastContact(updatedAt?: string | null) {
  const parsed = new Date(updatedAt ?? "").getTime();
  if (Number.isNaN(parsed)) return "30d+" as const;

  const days = (Date.now() - parsed) / (1000 * 60 * 60 * 24);
  if (days <= 1) return "24h" as const;
  if (days <= 7) return "7d" as const;
  return "30d+" as const;
}

function isClosedWithinRange(closedAt: string | null | undefined, range: "ALL" | "7D" | "30D" | "90D" | "YTD") {
  if (range === "ALL") return true;

  const closedTime = new Date(closedAt ?? "").getTime();
  if (Number.isNaN(closedTime)) return false;

  const now = new Date();
  const diffDays = (Date.now() - closedTime) / (1000 * 60 * 60 * 24);

  if (range === "7D") return diffDays <= 7;
  if (range === "30D") return diffDays <= 30;
  if (range === "90D") return diffDays <= 90;

  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
  return closedTime >= startOfYear;
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value ?? 0);
}

export function LeadsListView({ leads, errorMessage, viewMode = "open" }: LeadsListViewProps) {
  const router = useRouter();
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newLead, setNewLead] = useState({ businessName: "", phone: "", website: "" });
  const [addLeadError, setAddLeadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | Lead["status"]>("ALL");
  const [lastContacted, setLastContacted] = useState<"ALL" | "24h" | "7d" | "30d+">("ALL");
  const [closedDateRange, setClosedDateRange] = useState<"ALL" | "7D" | "30D" | "90D" | "YTD">("ALL");
  const [storageLeads, setStorageLeads] = useState<Lead[]>([]);
  const [createdLeads, setCreatedLeads] = useState<Lead[]>([]);
  const [calculatorCallsPerDay, setCalculatorCallsPerDay] = useState(60);
  const [calculatorCallToDemoRate, setCalculatorCallToDemoRate] = useState(20);
  const [calculatorShowRate, setCalculatorShowRate] = useState(70);
  const [calculatorCloseRate, setCalculatorCloseRate] = useState(25);
  const [calculatorIncomeGoal, setCalculatorIncomeGoal] = useState(10000);
  const [calculatorCommissionRate, setCalculatorCommissionRate] = useState(10);

  const normalizedServerLeads = useMemo(() => ((leads || []).map(normalizeLead).filter((lead): lead is Lead => Boolean(lead))), [leads]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLAIMED_LEADS_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const normalized = parsed.map(normalizeLead).filter((lead): lead is Lead => Boolean(lead));
      setStorageLeads(normalized);
    } catch {
      setStorageLeads([]);
    }
  }, []);

  const displayLeads = useMemo(() => {
    const mergedLeads = createdLeads.length > 0 ? [...createdLeads, ...normalizedServerLeads] : normalizedServerLeads.length > 0 ? normalizedServerLeads : storageLeads;
    const shouldIncludeClosed = viewMode === "closed";

    return mergedLeads.filter((lead) => (shouldIncludeClosed ? lead.status === "CLOSED" : lead.status !== "CLOSED"));
  }, [createdLeads, normalizedServerLeads, storageLeads, viewMode]);

  async function handleAddLead() {
    setAddLeadError(null);
    if (!newLead.businessName.trim()) {
      setAddLeadError("Business name is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: newLead.businessName.trim(),
          phone: newLead.phone.trim() || null,
          websiteUrl: newLead.website.trim() || null,
        }),
      });

      const payload = (await response.json()) as { lead?: Lead; error?: string };

      if (!response.ok || !payload.lead) {
        throw new Error(payload.error || "Unable to add lead.");
      }

      setCreatedLeads((prev) => [payload.lead as Lead, ...prev.filter((lead) => lead.id !== payload.lead?.id)]);
      setNewLead({ businessName: "", phone: "", website: "" });
      setIsAddLeadOpen(false);
      router.refresh();
    } catch (error) {
      setAddLeadError(error instanceof Error ? error.message : "Unable to add lead.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const filteredLeads = useMemo(() => {
    return (displayLeads || []).filter((lead) => {
      const safeSearchBlob = [lead?.businessName ?? "", lead?.phone ?? "", lead?.email ?? ""].join(" ").toLowerCase();
      const matchesSearch = safeSearchBlob.includes(search.toLowerCase());
      const matchesStatus = status === "ALL" || lead?.status === status;
      const matchesLastContacted = lastContacted === "ALL" || safelyBucketLastContact(lead?.updatedAt) === lastContacted;
      const matchesClosedDate = viewMode === "closed" ? isClosedWithinRange(lead?.closedAt, closedDateRange) : true;
      return matchesSearch && matchesStatus && matchesLastContacted && matchesClosedDate;
    });
  }, [displayLeads, search, status, lastContacted, viewMode, closedDateRange]);

  const cumulativeClosedValue = useMemo(() => filteredLeads.reduce((sum, lead) => sum + (lead.closedDealValue ?? 0), 0), [filteredLeads]);
  const averageClosedDealValue = useMemo(
    () => (filteredLeads.length > 0 ? cumulativeClosedValue / filteredLeads.length : 0),
    [cumulativeClosedValue, filteredLeads.length],
  );
  const demosBookedPerDay = useMemo(() => calculatorCallsPerDay * (calculatorCallToDemoRate / 100), [calculatorCallToDemoRate, calculatorCallsPerDay]);
  const demosCompletedPerDay = useMemo(() => demosBookedPerDay * (calculatorShowRate / 100), [calculatorShowRate, demosBookedPerDay]);
  const closedDealsPerDay = useMemo(() => demosCompletedPerDay * (calculatorCloseRate / 100), [calculatorCloseRate, demosCompletedPerDay]);
  const projectedRevenuePerDay = useMemo(() => closedDealsPerDay * averageClosedDealValue, [averageClosedDealValue, closedDealsPerDay]);
  const projectedCommissionPerDay = useMemo(() => projectedRevenuePerDay * (calculatorCommissionRate / 100), [calculatorCommissionRate, projectedRevenuePerDay]);
  const incomeGoalPerDay = useMemo(() => calculatorIncomeGoal / 20, [calculatorIncomeGoal]);
  const revenueNeededPerDay = useMemo(
    () => (calculatorCommissionRate > 0 ? incomeGoalPerDay / (calculatorCommissionRate / 100) : 0),
    [calculatorCommissionRate, incomeGoalPerDay],
  );
  const closesNeededPerDay = useMemo(
    () => (averageClosedDealValue > 0 ? revenueNeededPerDay / averageClosedDealValue : 0),
    [averageClosedDealValue, revenueNeededPerDay],
  );

  let hypeMessage = "Keep dialing.";
  let hypeColor = "text-zinc-500";

  if (projectedCommissionPerDay >= 1000) {
    hypeMessage = "🔥 President's Club Pacing. Don't stop now.";
    hypeColor = "text-orange-400";
  } else if (projectedCommissionPerDay >= 500) {
    hypeMessage = "🥩 Steak dinner pacing. Lock it in.";
    hypeColor = "text-emerald-400";
  } else if (projectedCommissionPerDay >= 250) {
    hypeMessage = "🚀 Good baseline. Push for one more close.";
    hypeColor = "text-indigo-400";
  }

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">{viewMode === "closed" ? "Closed Deals" : "My Leads"}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {viewMode === "closed"
                ? "Recently won deals that were moved out of active outreach."
                : "Claimed territory ready for live outreach and rapid deployment closes."}
            </p>
          </div>
          {viewMode === "open" ? (
            <button
              type="button"
              onClick={() => {
                setAddLeadError(null);
                setIsAddLeadOpen(true);
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:border-zinc-500"
            >
              + Add Lead
            </button>
          ) : null}
        </div>
      </header>

      {viewMode === "closed" ? (
        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Cumulative Closed Value</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-200">{formatCurrency(cumulativeClosedValue)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Closed Deals Count</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-100">{filteredLeads.length}</p>
          </div>
        </section>
      ) : null}

      {viewMode === "closed" ? (
        <section className="mb-8">
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6 shadow-2xl mb-8 font-sans">
            <div className="mb-6 flex justify-between items-end border-b border-zinc-800 pb-4">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight uppercase">Your Daily Battle Plan</h2>
                <p className="text-sm text-zinc-500 mt-1 font-medium">Control your inputs. Dictate your income.</p>
              </div>
              <div className="hidden sm:block px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-widest rounded-full border border-emerald-500/20">
                Live Calculator
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 space-y-5">
                <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm bg-indigo-500"></span> The Grind (Inputs)
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="flex flex-col group">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5 group-focus-within:text-indigo-400 transition-colors">Calls / Day</label>
                    <input
                      type="number"
                      min={0}
                      value={calculatorCallsPerDay}
                      onChange={(event) => setCalculatorCallsPerDay(Math.max(0, Number(event.target.value) || 0))}
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-zinc-900 transition-all shadow-inner"
                    />
                  </div>

                  <div className="flex flex-col group">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5 group-focus-within:text-indigo-400 transition-colors">Booked %</label>
                    <input
                      type="number"
                      min={0}
                      value={calculatorCallToDemoRate}
                      onChange={(event) => setCalculatorCallToDemoRate(Math.max(0, Number(event.target.value) || 0))}
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-zinc-900 transition-all shadow-inner"
                    />
                  </div>

                  <div className="flex flex-col group">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5 group-focus-within:text-indigo-400 transition-colors">Show Rate %</label>
                    <input
                      type="number"
                      min={0}
                      value={calculatorShowRate}
                      onChange={(event) => setCalculatorShowRate(Math.max(0, Number(event.target.value) || 0))}
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-zinc-900 transition-all shadow-inner"
                    />
                  </div>

                  <div className="flex flex-col group">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5 group-focus-within:text-indigo-400 transition-colors">Close Rate %</label>
                    <input
                      type="number"
                      min={0}
                      value={calculatorCloseRate}
                      onChange={(event) => setCalculatorCloseRate(Math.max(0, Number(event.target.value) || 0))}
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-zinc-900 transition-all shadow-inner"
                    />
                  </div>

                  <div className="flex flex-col group">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5 group-focus-within:text-indigo-400 transition-colors">Monthly Goal ($)</label>
                    <input
                      type="number"
                      min={0}
                      value={calculatorIncomeGoal}
                      onChange={(event) => setCalculatorIncomeGoal(Math.max(0, Number(event.target.value) || 0))}
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-zinc-900 transition-all shadow-inner"
                    />
                  </div>

                  <div className="flex flex-col group">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5 group-focus-within:text-indigo-400 transition-colors">Comm %</label>
                    <input
                      type="number"
                      min={0}
                      value={calculatorCommissionRate}
                      onChange={(event) => setCalculatorCommissionRate(Math.max(0, Number(event.target.value) || 0))}
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-zinc-900 transition-all shadow-inner"
                    />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 relative overflow-hidden bg-gradient-to-br from-zinc-900 via-[#0a0a0a] to-black border border-zinc-800 rounded-xl p-6 shadow-2xl">
                <div className="absolute -top-10 -right-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-[50px] animate-pulse pointer-events-none"></div>

                <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-5">The Payoff (Pipeline)</h3>

                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-lg p-3 text-center">
                    <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Booked</p>
                    <p className="text-xl font-black text-zinc-200">{demosBookedPerDay.toFixed(1)}</p>
                  </div>
                  <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-lg p-3 text-center">
                    <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Shows</p>
                    <p className="text-xl font-black text-zinc-200">{demosCompletedPerDay.toFixed(1)}</p>
                  </div>
                  <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3 text-center shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                    <p className="text-[9px] uppercase tracking-widest text-indigo-400/80 font-bold mb-1">Closes</p>
                    <p className="text-xl font-black text-indigo-400">{closedDealsPerDay.toFixed(2)}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800/80 mt-auto">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Take-Home Pay</p>
                  <div className="flex flex-col">
                    <p className="text-5xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300 tracking-tighter drop-shadow-sm">
                      ${projectedCommissionPerDay.toFixed(2)}
                    </p>
                    <p className={`text-xs font-bold uppercase tracking-wider mt-2 ${hypeColor}`}>{hypeMessage}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <AddLeadModal
        isOpen={isAddLeadOpen}
        isSubmitting={isSubmitting}
        formData={newLead}
        errorMessage={addLeadError}
        onChange={(field, value) => setNewLead((prev) => ({ ...prev, [field]: value }))}
        onClose={() => {
          if (isSubmitting) return;
          setIsAddLeadOpen(false);
        }}
        onSubmit={handleAddLead}
      />


      {errorMessage && (
        <section className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {errorMessage}
        </section>
      )}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className={`grid gap-3 ${viewMode === "closed" ? "lg:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr]" : "lg:grid-cols-[minmax(220px,2fr)_1fr_1fr]"}`}>
          <label className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-zinc-400 focus-within:border-zinc-500">
            <Search className="h-4 w-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search business, phone, or email"
              className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300">
            <SlidersHorizontal className="h-4 w-4 text-zinc-500" />
            <select value={status} onChange={(event) => setStatus(event.target.value as "ALL" | Lead["status"])} className="w-full bg-transparent outline-none">
              <option value="ALL">Status: All</option>
              <option value="NEW">Not Contacted</option>
              <option value="CONTACTED">Contacted</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="CLOSED">Closed</option>
              <option value="DISQUALIFIED">Disqualified</option>
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300">
            <SlidersHorizontal className="h-4 w-4 text-zinc-500" />
            <select value={lastContacted} onChange={(event) => setLastContacted(event.target.value as "ALL" | "24h" | "7d" | "30d+")} className="w-full bg-transparent outline-none">
              <option value="ALL">Last Contacted: Any Time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d+">30+ days ago</option>
            </select>
          </label>

          {viewMode === "closed" ? (
            <label className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300">
              <SlidersHorizontal className="h-4 w-4 text-zinc-500" />
              <select value={closedDateRange} onChange={(event) => setClosedDateRange(event.target.value as "ALL" | "7D" | "30D" | "90D" | "YTD")} className="w-full bg-transparent outline-none">
                <option value="ALL">Closed Date: Any Time</option>
                <option value="7D">Last 7 days</option>
                <option value="30D">Last 30 days</option>
                <option value="90D">Last 90 days</option>
                <option value="YTD">Year to Date</option>
              </select>
            </label>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
        <table className="w-full text-left">
          <thead className="border-b border-zinc-800 bg-zinc-950/70 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <tr>
              <th className="px-4 py-3">Business Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Vercel Status</th>
              {viewMode === "closed" ? <th className="px-4 py-3">Deal Value</th> : null}
              {viewMode === "closed" ? <th className="px-4 py-3">Closed Date</th> : null}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(filteredLeads || []).map((lead) => (
              <tr
                key={lead?.id}
                onClick={() => router.push(`/leads/${lead?.id}`)}
                className="group cursor-pointer border-b border-zinc-800/80 text-sm text-zinc-200 transition hover:bg-zinc-900/50"
              >
                <td className="px-4 py-3 font-semibold text-white">{lead?.businessName ?? "Unknown business"}</td>
                <td className="px-4 py-3 text-zinc-400">{lead?.phone || "No phone"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${leadStatusPillMap[lead?.status ?? "NEW"]}`}
                  >
                    {statusLabelMap[lead?.status ?? "NEW"]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${vercelStatusPillMap[lead?.siteStatus ?? "UNBUILT"]}`}
                  >
                    {vercelStatusMap[lead?.siteStatus ?? "UNBUILT"]}
                  </span>
                </td>
                {viewMode === "closed" ? <td className="px-4 py-3 font-medium text-emerald-200">{formatCurrency(lead?.closedDealValue)}</td> : null}
                {viewMode === "closed" ? <td className="px-4 py-3 text-zinc-400">{lead?.closedAt ? new Date(lead.closedAt).toLocaleDateString() : "—"}</td> : null}
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700/60 bg-zinc-900/40 px-2.5 py-1.5 text-xs text-zinc-300 opacity-0 transition group-hover:opacity-100">
                    Open Workspace → <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(filteredLeads || []).length === 0 && (
          <div className="p-8 text-center text-sm text-zinc-500">No leads match your filters. Try broadening status or last-contacted constraints.</div>
        )}
      </section>
    </div>
  );
}
