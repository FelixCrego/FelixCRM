"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import type { Lead } from "@/lib/types";

type LeadsListViewProps = {
  leads?: Lead[] | null;
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

const MOCK_LEADS: Lead[] = [
  {
    id: "mock-lead-1",
    businessName: "Apex Roofing",
    city: "Austin",
    businessType: "Roofing",
    phone: "(512) 555-0191",
    email: "hello@apexroofing.example",
    websiteUrl: null,
    websiteStatus: "MISSING",
    status: "IN_PROGRESS",
    siteStatus: "UNBUILT",
    ownerId: "demo-user",
    updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-lead-2",
    businessName: "Texas Plumbing",
    city: "Dallas",
    businessType: "Plumbing",
    phone: "(214) 555-0114",
    email: "service@texasplumbing.example",
    websiteUrl: "https://texasplumbing.example",
    websiteStatus: "LIVE",
    status: "CONTACTED",
    siteStatus: "LIVE",
    ownerId: "demo-user",
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-lead-3",
    businessName: "Hill Country Garage Doors",
    city: "Round Rock",
    businessType: "Garage Door Repair",
    phone: null,
    email: "service@hcdoors.example",
    websiteUrl: null,
    websiteStatus: "MISSING",
    status: "NEW",
    siteStatus: "UNBUILT",
    ownerId: "demo-user",
    updatedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

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

export function LeadsListView({ leads }: LeadsListViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | Lead["status"]>("ALL");
  const [lastContacted, setLastContacted] = useState<"ALL" | "24h" | "7d" | "30d+">("ALL");
  const [storageLeads, setStorageLeads] = useState<Lead[]>([]);

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
    if (normalizedServerLeads.length > 0) return normalizedServerLeads;
    if (storageLeads.length > 0) return storageLeads;
    return MOCK_LEADS;
  }, [normalizedServerLeads, storageLeads]);

  const filteredLeads = useMemo(() => {
    return (displayLeads || []).filter((lead) => {
      const safeSearchBlob = [lead?.businessName ?? "", lead?.phone ?? "", lead?.email ?? ""].join(" ").toLowerCase();
      const matchesSearch = safeSearchBlob.includes(search.toLowerCase());
      const matchesStatus = status === "ALL" || lead?.status === status;
      const matchesLastContacted = lastContacted === "ALL" || safelyBucketLastContact(lead?.updatedAt) === lastContacted;
      return matchesSearch && matchesStatus && matchesLastContacted;
    });
  }, [displayLeads, search, status, lastContacted]);

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <h1 className="text-2xl font-semibold text-zinc-100">My Leads</h1>
        <p className="mt-1 text-sm text-zinc-400">Claimed territory ready for live outreach and rapid deployment closes.</p>
      </header>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,2fr)_1fr_1fr]">
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
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700/60 px-2.5 py-1.5 text-xs text-zinc-400 opacity-0 transition group-hover:opacity-100">
                    Open Workspace <ArrowRight className="h-3.5 w-3.5" />
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
