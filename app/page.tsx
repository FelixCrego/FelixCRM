"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lead, Script, ToneOfVoice } from "@/lib/types";
import {
  ArrowRight,
  Bot,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Command,
  Flame,
  Globe,
  LayoutDashboard,
  Loader2,
  Mail,
  Phone,
  Search,
  Sparkles,
  Target,
  ThumbsUp,
  Trophy,
  Zap,
} from "lucide-react";

type Profile = { niche: string; toneOfVoice: ToneOfVoice; calendarLink: string; onboardingCompleted: boolean };
type PlaybookTab = "SCRIPTS" | "OBJECTIONS" | "TIPS";

const TOUR_STEPS = [
  "Scrape high-fit accounts by city and niche.",
  "Ship a live preview site before the first pitch.",
  "Use the AI playbook to close objections with confidence.",
];

const STATUS_LABELS: Record<Lead["status"], string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  IN_PROGRESS: "In Progress",
  CLOSED: "Closed Won",
  DISQUALIFIED: "Disqualified",
};

function cn(...classes: Array<string | boolean | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getPriorityScore(lead: Lead) {
  const siteScore = lead.siteStatus === "LIVE" ? 40 : lead.siteStatus === "BUILDING" ? 20 : 10;
  const contactScore = lead.phone ? 20 : 8;
  const freshnessScore = Math.max(0, 20 - Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / (1000 * 60 * 60 * 24)));
  const statusScore = lead.status === "NEW" ? 15 : lead.status === "CONTACTED" ? 10 : 4;
  return siteScore + contactScore + freshnessScore + statusScore;
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

  const sortedLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
  }, [filteredLeads]);

  const topFocusLeads = useMemo(() => sortedLeads.slice(0, 3), [sortedLeads]);

  const metrics = useMemo(() => {
    const liveSites = filteredLeads.filter((lead) => lead.siteStatus === "LIVE").length;
    const contacted = filteredLeads.filter((lead) => lead.status === "CONTACTED" || lead.status === "IN_PROGRESS" || lead.status === "CLOSED").length;
    const wins = filteredLeads.filter((lead) => lead.status === "CLOSED").length;
    const hotLeads = filteredLeads.filter((lead) => getPriorityScore(lead) >= 70).length;
    return {
      total: filteredLeads.length,
      liveSites,
      contacted,
      wins,
      winRate: filteredLeads.length ? Math.round((wins / filteredLeads.length) * 100) : 0,
      hotLeads,
    };
  }, [filteredLeads]);

  const pipeline = useMemo(() => {
    return {
      NEW: filteredLeads.filter((lead) => lead.status === "NEW"),
      CONTACTED: filteredLeads.filter((lead) => lead.status === "CONTACTED"),
      IN_PROGRESS: filteredLeads.filter((lead) => lead.status === "IN_PROGRESS"),
      CLOSED: filteredLeads.filter((lead) => lead.status === "CLOSED"),
    };
  }, [filteredLeads]);

  useEffect(() => {
    if (!selectedLeadId && sortedLeads.length > 0) {
      setSelectedLeadId(sortedLeads[0].id);
    }
  }, [sortedLeads, selectedLeadId]);

  const selectedLead = sortedLeads.find((lead) => lead.id === selectedLeadId) ?? sortedLeads[0] ?? null;

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
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Configure your rep profile to unlock the high-performance sales workspace.</p>
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
            <ol className="mt-5 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              {TOUR_STEPS.map((step, index) => (
                <li key={step} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/40">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs text-white dark:bg-slate-100 dark:text-slate-900">{index + 1}</span>
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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
              <LayoutDashboard className="h-5 w-5 text-blue-500" /> Felix Revenue Command Center
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">A high-conviction workspace for reps who ship value before they pitch.</p>
          </div>
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center md:justify-end">
            <label className="group flex w-full max-w-xl items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              <Command className="h-4 w-4 text-slate-500" />
              <input value={magic} onChange={(e) => setMagic(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Magic Bar: prioritize plumbers in Austin with no live site" />
            </label>
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700" onClick={() => setDark((d) => !d)}>
              {dark ? "Light" : "Dark"}
            </button>
          </div>
        </div>
      </header>

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm dark:border-blue-900/60 dark:from-blue-950/50 dark:to-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">Pipeline coverage</p>
          <p className="mt-2 text-2xl font-bold">{metrics.total}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">qualified accounts in active queue</p>
        </article>
        <article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm dark:border-emerald-900/60 dark:from-emerald-950/50 dark:to-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Proof assets shipped</p>
          <p className="mt-2 text-2xl font-bold">{metrics.liveSites}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">live preview sites sent to prospects</p>
        </article>
        <article className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm dark:border-violet-900/60 dark:from-violet-950/50 dark:to-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">Outreach momentum</p>
          <p className="mt-2 text-2xl font-bold">{metrics.contacted}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">accounts actively in conversation</p>
        </article>
        <article className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm dark:border-amber-900/60 dark:from-amber-950/50 dark:to-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">Hot opportunities</p>
          <p className="mt-2 text-2xl font-bold">{metrics.hotLeads}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">priority score 70+ leads</p>
        </article>
        <article className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4 shadow-sm dark:border-rose-900/60 dark:from-rose-950/50 dark:to-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">Close rate</p>
          <p className="mt-2 text-2xl font-bold">{metrics.winRate}%</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">wins from visible pipeline</p>
        </article>
      </section>

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
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} {loading ? "Finding leads..." : "Find High-Fit Leads"}
          </button>
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pipeline by stage</h2>
          <Target className="h-4 w-4 text-blue-500" />
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          {(["NEW", "CONTACTED", "IN_PROGRESS", "CLOSED"] as const).map((stage) => (
            <article key={stage} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{STATUS_LABELS[stage]}</p>
              <p className="mt-1 text-xl font-bold">{pipeline[stage].length}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{pipeline[stage].slice(0, 2).map((lead) => lead.businessName).join(" • ") || "No accounts yet"}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lead queue</h2>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{sortedLeads.length} leads</span>
            </div>
            <div className="grid gap-2">
              {sortedLeads.map((lead) => (
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
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">Score {getPriorityScore(lead)}</span>
                  </div>

                  <div className="mt-3 grid gap-1 text-xs text-slate-600 dark:text-slate-300">
                    <p className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {lead.status in STATUS_LABELS ? STATUS_LABELS[lead.status] : lead.status}</p>
                    <p className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {lead.phone || "No phone"}</p>
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
              {!sortedLeads.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">No leads yet. Run Find High-Fit Leads to populate the queue.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Focus list</h2>
              <Flame className="h-4 w-4 text-amber-500" />
            </div>
            <div className="space-y-2">
              {topFocusLeads.map((lead, idx) => (
                <article key={lead.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-500 dark:text-slate-400">#{idx + 1} next best account</p>
                  <p className="mt-1 font-semibold">{lead.businessName}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Deploy proof site, then send {profile.toneOfVoice.toLowerCase()} outreach with one-click CTA to your calendar.</p>
                </article>
              ))}
              {!topFocusLeads.length && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">Add leads to generate your daily focus queue.</p>}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                    <p className="mt-1 text-slate-500 dark:text-slate-300">Counter: frame the live preview as proof of ROI, then ask for a 10-minute walkthrough.</p>
                  </div>
                ))}
              </div>
            )}

            {playbookTab === "TIPS" && (
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <li className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">Lead with outcomes: calls booked, trust signals, and faster load times.</li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">Use social proof from similar businesses in {profile.niche || "your target market"}.</li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">Always close with one CTA: book a time on your calendar.</li>
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-slate-100 shadow-sm dark:border-slate-700">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200">
              <Trophy className="h-3.5 w-3.5 text-amber-300" /> Rep momentum
            </p>
            <h3 className="mt-3 text-lg font-semibold">Today&apos;s win plan</h3>
            <ul className="mt-3 space-y-2 text-xs text-slate-200">
              <li className="flex items-start gap-2"><Zap className="mt-0.5 h-3.5 w-3.5 text-emerald-300" /> Launch 3 preview sites before noon.</li>
              <li className="flex items-start gap-2"><Mail className="mt-0.5 h-3.5 w-3.5 text-blue-300" /> Send personalized follow-up to each newly deployed account.</li>
              <li className="flex items-start gap-2"><CalendarCheck2 className="mt-0.5 h-3.5 w-3.5 text-violet-300" /> End every message with {profile.calendarLink || "your booking link"}.</li>
            </ul>
            <p className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
              Stay relentless. Stack proof. Close faster. <ArrowRight className="h-3.5 w-3.5" />
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
