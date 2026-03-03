"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import type { Lead } from "@/lib/types";

type LeadsListViewProps = {
  leads: Lead[];
};

const statusLabelMap: Record<Lead["status"], string> = {
  NEW: "Not Contacted",
  CONTACTED: "Contacted",
  IN_PROGRESS: "In Progress",
  CLOSED: "Closed",
  DISQUALIFIED: "Disqualified",
};

const vercelStatusMap = {
  UNBUILT: "Unbuilt",
  BUILDING: "Deploying",
  LIVE: "Live",
  FAILED: "Failed",
} as const;

function lastContactBucket(updatedAt: string) {
  const ageInMs = Date.now() - new Date(updatedAt).getTime();
  const days = ageInMs / (1000 * 60 * 60 * 24);

  if (days <= 1) return "24h";
  if (days <= 7) return "7d";
  return "30d+";
}

export function LeadsListView({ leads }: LeadsListViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | Lead["status"]>("ALL");
  const [lastContacted, setLastContacted] = useState<"ALL" | "24h" | "7d" | "30d+">("ALL");

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch = [lead.businessName, lead.phone ?? "", lead.email ?? ""].join(" ").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = status === "ALL" || lead.status === status;
      const matchesLastContacted = lastContacted === "ALL" || lastContactBucket(lead.updatedAt) === lastContacted;
      return matchesSearch && matchesStatus && matchesLastContacted;
    });
  }, [leads, search, status, lastContacted]);

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
            {filteredLeads.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => router.push(`/leads/${lead.id}`)}
                className="cursor-pointer border-b border-zinc-800/80 text-sm text-zinc-200 transition hover:bg-zinc-800/60"
              >
                <td className="px-4 py-3 font-medium">{lead.businessName}</td>
                <td className="px-4 py-3 text-zinc-400">{lead.phone || "No phone"}</td>
                <td className="px-4 py-3 text-zinc-300">{statusLabelMap[lead.status]}</td>
                <td className="px-4 py-3 text-zinc-300">{vercelStatusMap[lead.siteStatus ?? "UNBUILT"]}</td>
                <td className="px-4 py-3 text-zinc-500">
                  <ChevronRight className="h-4 w-4" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredLeads.length === 0 && (
          <div className="p-8 text-center text-sm text-zinc-500">No leads match your filters. Try broadening status or last-contacted constraints.</div>
        )}
      </section>
    </div>
  );
}
