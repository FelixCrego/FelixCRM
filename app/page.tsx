"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lead, Script, ToneOfVoice } from "@/lib/types";
import { Bot, Globe, Search, ThumbsUp } from "lucide-react";

type Profile = { niche: string; toneOfVoice: ToneOfVoice; calendarLink: string; onboardingCompleted: boolean };

export default function HomePage() {
  const [dark, setDark] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [query, setQuery] = useState({ city: "", businessType: "" });
  const [magic, setMagic] = useState("");
  const [profile, setProfile] = useState<Profile>({ niche: "", toneOfVoice: "CONSULTATIVE", calendarLink: "", onboardingCompleted: false });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  async function hydrate() {
    const [leadRes, scriptRes, profileRes] = await Promise.all([fetch("/api/leads"), fetch("/api/scripts"), fetch("/api/profile")]);
    const leadJson = await leadRes.json();
    const scriptJson = await scriptRes.json();
    setLeads(leadJson.leads ?? []);
    setScripts(scriptJson.scripts ?? []);
    setProfile(await profileRes.json());
  }

  useEffect(() => {
    hydrate();
  }, []);

  const filteredLeads = useMemo(() => {
    if (!magic) return leads;
    const input = magic.toLowerCase();
    return leads.filter((lead) => `${lead.businessName} ${lead.city} ${lead.businessType}`.toLowerCase().includes(input));
  }, [leads, magic]);

  async function scrape() {
    setLoading(true);
    await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) });
    await hydrate();
    setLoading(false);
  }

  async function deploy(leadId: string) {
    setDeploying(leadId);
    await fetch("/api/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId }) });
    await hydrate();
    setDeploying(null);
  }

  async function generateScript(leadId: string, type: "EMAIL" | "SMS") {
    await fetch("/api/scripts/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, type }) });
    await hydrate();
  }

  async function upvote(scriptId: string) {
    await fetch("/api/scripts/upvote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scriptId }) });
    await hydrate();
  }

  async function submitProfile() {
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profile, onboardingCompleted: true }),
    });
    await hydrate();
  }

  const showOnboarding = !profile.onboardingCompleted;

  return (
    <main className="min-h-screen p-4 md:p-8">
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-xl bg-bg p-6 shadow-xl">
            <h2 className="text-xl font-semibold">Welcome to Felix CRM</h2>
            <p className="mt-1 text-sm text-slate-500">Complete profile setup + quick tutorial.</p>
            <div className="mt-4 grid gap-3">
              <input className="rounded border p-2 bg-transparent" placeholder="Niche/Target Market" value={profile.niche} onChange={(e) => setProfile((p) => ({ ...p, niche: e.target.value }))} />
              <select className="rounded border p-2 bg-transparent" value={profile.toneOfVoice} onChange={(e) => setProfile((p) => ({ ...p, toneOfVoice: e.target.value as ToneOfVoice }))}>
                <option value="PROFESSIONAL">Professional</option><option value="AGGRESSIVE">Aggressive</option><option value="CONSULTATIVE">Consultative</option><option value="FRIENDLY">Friendly</option>
              </select>
              <input className="rounded border p-2 bg-transparent" placeholder="Calendar Link" value={profile.calendarLink} onChange={(e) => setProfile((p) => ({ ...p, calendarLink: e.target.value }))} />
            </div>
            <ol className="mt-4 list-decimal pl-5 text-sm text-slate-500 space-y-1">
              <li>Use <b>Scrape</b> tab to source new leads by city + niche.</li>
              <li>Click <b>Create Site</b> to instantly deploy a demo page.</li>
              <li>Use <b>AI Script Engine</b> to draft email/SMS outreach.</li>
              <li>Upvote winning scripts to improve team playbooks.</li>
            </ol>
            <button className="mt-5 rounded bg-blue-600 px-4 py-2 text-white" onClick={submitProfile}>Enter Dashboard</button>
          </div>
        </div>
      )}

      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold">Felix CRM</h1>
        <div className="flex gap-2">
          <input value={magic} onChange={(e) => setMagic(e.target.value)} className="w-80 rounded border bg-transparent px-3 py-2" placeholder="Magic Bar (Cmd+K style): e.g. Draft follow-up for Joe's Plumbing" />
          <button className="rounded border px-3 py-2" onClick={() => setDark((d) => !d)}>{dark ? "Light" : "Dark"}</button>
        </div>
      </header>

      <section className="mb-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="text-xs">City</label><input className="block rounded border bg-transparent p-2" value={query.city} onChange={(e) => setQuery((q) => ({ ...q, city: e.target.value }))} /></div>
          <div><label className="text-xs">Business Type</label><input className="block rounded border bg-transparent p-2" value={query.businessType} onChange={(e) => setQuery((q) => ({ ...q, businessType: e.target.value }))} /></div>
          <button className="rounded bg-emerald-600 px-3 py-2 text-white" onClick={scrape} disabled={loading}><Search className="mr-1 inline h-4 w-4" /> {loading ? "Scraping..." : "Scrape Leads"}</button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border p-3 lg:col-span-2">
          <h2 className="mb-2 font-semibold">Lead Engine</h2>
          <div className="grid gap-2">
            {filteredLeads.map((lead) => (
              <div key={lead.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{lead.businessName}</p>
                    <p className="text-xs text-slate-500">{lead.city} · {lead.businessType} · {lead.phone || "No Phone"}</p>
                  </div>
                  <span className={`h-3 w-3 rounded-full ${lead.siteStatus === "LIVE" ? "bg-green-500" : "bg-gray-400"}`} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="rounded bg-blue-600 px-2 py-1 text-white" onClick={() => deploy(lead.id)} disabled={deploying === lead.id}><Globe className="mr-1 inline h-4 w-4" />{deploying === lead.id ? "Deploying..." : "Create Site"}</button>
                  <button className="rounded border px-2 py-1" onClick={() => generateScript(lead.id, "EMAIL")}><Bot className="mr-1 inline h-4 w-4" />Draft Email</button>
                  <button className="rounded border px-2 py-1" onClick={() => generateScript(lead.id, "SMS")}>Draft SMS</button>
                  {lead.deployedUrl && <a href={lead.deployedUrl} target="_blank" className="rounded border border-green-500 px-2 py-1 text-green-600">Live Site</a>}
                </div>
              </div>
            ))}
            {!filteredLeads.length && <p className="text-sm text-slate-500">No leads yet. Run scrape.</p>}
          </div>
        </div>

        <div className="rounded-xl border p-3">
          <h2 className="mb-2 font-semibold">AI Sales Playbook</h2>
          <div className="space-y-2">
            {scripts.map((script) => (
              <div key={script.id} className="rounded-lg border p-2 text-sm">
                <p className="mb-1 text-xs font-semibold text-slate-500">{script.type}</p>
                <p className="whitespace-pre-wrap">{script.content}</p>
                <button className="mt-2 rounded border px-2 py-1 text-xs" onClick={() => upvote(script.id)}><ThumbsUp className="mr-1 inline h-3 w-3" /> {script.upvoteCount}</button>
              </div>
            ))}
            {!scripts.length && <p className="text-sm text-slate-500">Generate scripts from any lead.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
