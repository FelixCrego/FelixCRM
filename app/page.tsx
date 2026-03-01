"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lead, Script, ToneOfVoice } from "@/lib/types";
import {
  Bot,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Command,
  Globe,
  LayoutDashboard,
  Loader2,
  Search,
  Sparkles,
  ThumbsUp,
} from "lucide-react";

type Profile = { niche: string; toneOfVoice: ToneOfVoice; calendarLink: string; onboardingCompleted: boolean };
type PlaybookTab = "SCRIPTS" | "OBJECTIONS" | "TIPS";

const TOUR_STEPS = [
  "Scrape leads by city and business type.",
  "Generate and deploy an instant preview site.",
  "Use AI playbook to craft pitch scripts and rebuttals.",
];

function cn(...classes: Array<string | boolean | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function HomePage() {
  const [dark, setDark] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [query, setQuery] = useState({ city: "", businessType: "" });
  const [magic, setMagic] = useState("");
  const [playbookTab, setPlaybookTab] = useState<PlaybookTab>("SCRIPTS");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!selectedLeadId && filteredLeads.length > 0) {
      setSelectedLeadId(filteredLeads[0].id);
    }
  }, [filteredLeads, selectedLeadId]);

  const selectedLead = filteredLeads.find((lead) => lead.id === selectedLeadId) ?? filteredLeads[0] ?? null;

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
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:p-6">
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" /> First-time setup
            </p>
            <h2 className="text-2xl font-bold tracking-tight">Welcome to Felix CRM</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Set your rep profile, then preview the 3-step winning workflow.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <input className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Niche (Roofers, Plumbers...)" value={profile.niche} onChange={(e) => setProfile((p) => ({ ...p, niche: e.target.value }))} />
              <select className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" value={profile.toneOfVoice} onChange={(e) => setProfile((p) => ({ ...p, toneOfVoice: e.target.value as ToneOfVoice }))}>
                <option value="PROFESSIONAL">Professional</option>
                <option value="AGGRESSIVE">Aggressive</option>
                <option value="CONSULTATIVE">Consultative</option>
                <option value="FRIENDLY">Friendly</option>
              </select>
              <input className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Calendar link" value={profile.calendarLink} onChange={(e) => setProfile((p) => ({ ...p, calendarLink: e.target.value }))} />
            </div>
            <ol className="mt-5 grid gap-2 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-3">
              {TOUR_STEPS.map((step, index) => (
                <li key={step} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                  <span className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs text-white dark:bg-slate-100 dark:text-slate-900">{index + 1}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
            <button className="mt-5 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500" onClick={submitProfile}>
              Enter dashboard <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <header className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
              <LayoutDashboard className="h-5 w-5 text-blue-500" /> Felix CRM
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Deploy-before-you-pitch sales workspace</p>
          </div>
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center md:justify-end">
            <label className="group flex w-full max-w-xl items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              <Command className="h-4 w-4 text-slate-500" />
              <input
                value={magic}
                onChange={(e) => setMagic(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="Magic Bar (Cmd+K): Draft email for Joe's Plumbing"
              />
            </label>
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700" onClick={() => setDark((d) => !d)}>
              {dark ? "Light" : "Dark"}
            </button>
          </div>
        </div>
      </header>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            City
            <input className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" value={query.city} onChange={(e) => setQuery((q) => ({ ...q, city: e.target.value }))} />
          </label>
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Business type
            <input className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" value={query.businessType} onChange={(e) => setQuery((q) => ({ ...q, businessType: e.target.value }))} />
          </label>
          <button className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50" onClick={scrape} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} {loading ? "Finding leads..." : "Find Leads"}
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lead queue</h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{filteredLeads.length} leads</span>
          </div>
          <div className="grid gap-2">
            {filteredLeads.map((lead) => (
              <article
                key={lead.id}
                className={cn(
                  "rounded-xl border p-3 transition",
                  "border-slate-200 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950/40",
                  selectedLead?.id === lead.id && "border-blue-400 ring-1 ring-blue-400/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <button className="text-left" onClick={() => setSelectedLeadId(lead.id)}>
                    <p className="font-semibold leading-tight">{lead.businessName}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{lead.city} · {lead.businessType}</p>
                  </button>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", lead.siteStatus === "LIVE" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>
                    {lead.siteStatus === "LIVE" ? "Live" : "Not deployed"}
                  </span>
                </div>

                <div className="mt-3 grid gap-1 text-xs text-slate-600 dark:text-slate-300">
                  <p className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {lead.phone || "No phone"}</p>
                  <p className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Last touch: {new Date(lead.updatedAt).toLocaleDateString()}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60" onClick={() => deploy(lead.id)} disabled={deploying === lead.id}>
                    {deploying === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                    {deploying === lead.id ? "Deploying" : "Create Site"}
                  </button>
                  <button className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700" onClick={() => generateScript(lead.id, "EMAIL")}>Draft Email</button>
                  <button className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700" onClick={() => generateScript(lead.id, "SMS")}>Draft SMS</button>
                  {lead.deployedUrl && (
                    <a href={lead.deployedUrl} target="_blank" className="inline-flex items-center gap-1 rounded-md border border-green-500 px-2.5 py-1.5 text-xs text-green-700 dark:text-green-300" rel="noreferrer">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Visit Site
                    </a>
                  )}
                </div>
              </article>
            ))}
            {!filteredLeads.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">No leads yet. Run Find Leads to populate the queue.</p>}
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">AI playbook</h2>
            <Bot className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mb-3 grid grid-cols-3 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(["SCRIPTS", "OBJECTIONS", "TIPS"] as PlaybookTab[]).map((tab) => (
              <button key={tab} className={cn("rounded-md px-2 py-1 text-xs font-medium", playbookTab === tab ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100" : "text-slate-600 dark:text-slate-300")} onClick={() => setPlaybookTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          {playbookTab === "SCRIPTS" && (
            <div className="space-y-2">
              {scripts.map((script) => (
                <article key={script.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{script.type}</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed">{script.content}</p>
                  <button className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700" onClick={() => upvote(script.id)}>
                    <ThumbsUp className="h-3 w-3" /> {script.upvoteCount}
                  </button>
                </article>
              ))}
              {!scripts.length && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">Generate a draft from any lead card to populate scripts.</p>}
            </div>
          )}

          {playbookTab === "OBJECTIONS" && (
            <div className="space-y-2 text-xs">
              {["I already have a website.", "I don't have budget right now.", "Send me an email and I'll think about it."].map((item) => (
                <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="font-medium">{item}</p>
                  <p className="mt-1 text-slate-500 dark:text-slate-300">Counter: Position the live preview as risk-free proof and offer a 10-minute walkthrough using the calendar link.</p>
                </div>
              ))}
            </div>
          )}

          {playbookTab === "TIPS" && (
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <li className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">Lead with outcomes: calls booked, trust signals, speed improvements.</li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">Use social proof from similar niches in {profile.niche || "your target market"}.</li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">Always end with one clear CTA: schedule call via your calendar link.</li>
            </ul>
          )}
        </aside>
      </section>
    </main>
  );
}
