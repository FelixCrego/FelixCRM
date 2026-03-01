"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lead, Script, ToneOfVoice, UserRole } from "@/lib/types";
import {
  Bot,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronRight,
  Command,
  Flame,
  Globe,
  LayoutDashboard,
  Loader2,
  Moon,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  ThumbsUp,
  Users,
  Zap,
} from "lucide-react";

type Profile = { niche: string; toneOfVoice: ToneOfVoice; calendarLink: string; onboardingCompleted: boolean; role: UserRole };
type PlaybookTab = "SCRIPTS" | "OBJECTIONS" | "TIPS";
type LoginForm = { name: string; email: string; role: UserRole };

const TOUR_STEPS = [
  "Scrape high-fit accounts by city and niche.",
  "Ship a live preview site before the first pitch.",
  "Use the AI playbook to close objections with confidence.",
];

const ROLE_LABELS: Record<UserRole, string> = {
  REP: "Rep",
  TEAM_LEAD: "Team Lead",
  MANAGER: "Manager",
  SUPER_ADMIN: "Super Admin",
};

const STATUS_LABELS: Record<Lead["status"], string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  IN_PROGRESS: "In Progress",
  CLOSED: "Closed Won",
  DISQUALIFIED: "Disqualified",
};

const ROLE_EXPERIENCE: Record<UserRole, { headline: string; subtitle: string; accent: string; icon: typeof Briefcase }> = {
  REP: {
    headline: "Execution cockpit",
    subtitle: "Daily outreach queue, scripts, and close-plan momentum.",
    accent: "text-blue-600 dark:text-blue-300",
    icon: Briefcase,
  },
  TEAM_LEAD: {
    headline: "Coaching command",
    subtitle: "Team pipeline control plus rep-level quality coaching.",
    accent: "text-violet-600 dark:text-violet-300",
    icon: Users,
  },
  MANAGER: {
    headline: "Operations center",
    subtitle: "Funnel velocity, forecasting confidence, and execution health.",
    accent: "text-emerald-600 dark:text-emerald-300",
    icon: Building2,
  },
  SUPER_ADMIN: {
    headline: "Governance suite",
    subtitle: "System-wide permissions, integrations, and compliance controls.",
    accent: "text-rose-600 dark:text-rose-300",
    icon: ShieldCheck,
  },
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

function timeLeftInPool(updatedAt: string) {
  const dueAt = new Date(updatedAt).getTime() + 1000 * 60 * 60 * 48;
  const diff = dueAt - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h`;
}

export default function HomePage() {
  const [dark, setDark] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [query, setQuery] = useState({ city: "", businessType: "" });
  const [magic, setMagic] = useState("");
  const [playbookTab, setPlaybookTab] = useState<PlaybookTab>("SCRIPTS");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>({ niche: "", toneOfVoice: "CONSULTATIVE", calendarLink: "", onboardingCompleted: false, role: "REP" });
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginForm, setLoginForm] = useState<LoginForm>({ name: "", email: "", role: "REP" });

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

  async function signIn() {
    setProfile((prev) => ({ ...prev, role: loginForm.role }));
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profile, role: loginForm.role }),
    });
    setLoggedIn(true);
    await hydrate();
  }

  const showOnboarding = !profile.onboardingCompleted;
  const canManageLeads = profile.role === "TEAM_LEAD" || profile.role === "MANAGER" || profile.role === "SUPER_ADMIN";
  const roleExperience = ROLE_EXPERIENCE[profile.role];
  const RoleIcon = roleExperience.icon;

  if (!loggedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
        <div className="w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl md:p-8">
          <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-200">
            <ShieldCheck className="h-3.5 w-3.5" /> Role-aware access
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Sign in to Felix CRM</h1>
          <p className="mt-2 text-sm text-slate-300">Pick your role to unlock a fully customized workspace for that job.</p>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Name
                <input className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" placeholder="Alex Rivera" value={loginForm.name} onChange={(e) => setLoginForm((prev) => ({ ...prev, name: e.target.value }))} />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Work email
                <input className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" placeholder="alex@felixcrm.ai" value={loginForm.email} onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))} />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Role
                <select className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={loginForm.role} onChange={(e) => setLoginForm((prev) => ({ ...prev, role: e.target.value as UserRole }))}>
                  {(["REP", "TEAM_LEAD", "MANAGER", "SUPER_ADMIN"] as UserRole[]).map((role) => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </select>
              </label>
              <button className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500" onClick={signIn}>
                Continue to role workspace <ChevronRight className="h-4 w-4" />
              </button>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Role preview</h2>
              <div className="mt-4 grid gap-2">
                {(["REP", "TEAM_LEAD", "MANAGER", "SUPER_ADMIN"] as UserRole[]).map((role) => (
                  <article key={role} className={cn("rounded-xl border p-3", loginForm.role === role ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-900") }>
                    <p className="text-sm font-semibold">{ROLE_LABELS[role]}</p>
                    <p className="mt-1 text-xs text-slate-300">{ROLE_EXPERIENCE[role].subtitle}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
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
            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Select role
              <select
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                value={profile.role}
                onChange={(e) => setProfile((prev) => ({ ...prev, role: e.target.value as UserRole }))}
              >
                {(["REP", "TEAM_LEAD", "MANAGER", "SUPER_ADMIN"] as UserRole[]).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>
            <button className="mt-5 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500" onClick={submitProfile}>
              Enter dashboard <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-40 w-72 border-r border-zinc-800 bg-zinc-950 px-5 py-6 text-zinc-100">
          <div className="flex h-full flex-col">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Felix CRM</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Revenue OS</h1>
              <span className="mt-4 inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-200">
                {ROLE_LABELS[profile.role]}
              </span>
              <p className="mt-4 text-xs text-zinc-400">{roleExperience.headline}</p>
            </div>

            <nav className="mt-8 space-y-1">
              {[
                { label: "Dashboard", icon: LayoutDashboard },
                { label: "Scrape Leads", icon: Search },
                { label: "Pipeline", icon: Flame },
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <button key={item.label} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm", index === 0 ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200")}>
                    <Icon className="h-4 w-4" /> {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Workspace</p>
              <p className="mt-1 text-sm text-zinc-300">{roleExperience.subtitle}</p>
            </div>
          </div>
        </aside>

        <section className="flex-1 pl-72">
          <div className="mx-auto max-w-[1600px] space-y-6 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <label className="group flex min-w-[320px] flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <Command className="h-4 w-4 text-zinc-400" />
                <input value={magic} onChange={(e) => setMagic(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search by business, city, or niche" />
              </label>
              <button className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900" onClick={() => setDark((d) => !d)}>
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {dark ? "Light" : "Dark"}
              </button>
              <button className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900" onClick={() => setDrawerOpen((v) => !v)}>
                <Bot className="h-4 w-4" /> AI Playbook
              </button>
            </div>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {[
                { label: "Pipeline coverage", value: metrics.total, delta: "+12%" },
                { label: "Proof assets shipped", value: metrics.liveSites, delta: "+8%" },
                { label: "Outreach momentum", value: metrics.contacted, delta: "+5%" },
                { label: "Hot opportunities", value: metrics.hotLeads, delta: "+18%" },
                { label: "Close rate", value: `${metrics.winRate}%`, delta: "+3%" },
              ].map((metric) => (
                <article key={metric.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{metric.label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{metric.value}</p>
                  <span className="mt-3 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">{metric.delta}</span>
                </article>
              ))}
            </section>

            {canManageLeads && (
              <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    City
                    <input className="mt-1 block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" placeholder="Austin" value={query.city} onChange={(e) => setQuery((prev) => ({ ...prev, city: e.target.value }))} />
                  </label>
                  <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Business type
                    <input className="mt-1 block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" placeholder="Roofing" value={query.businessType} onChange={(e) => setQuery((prev) => ({ ...prev, businessType: e.target.value }))} />
                  </label>
                  <button className="inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300" onClick={scrape} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find High-Fit Leads
                  </button>
                </div>
              </section>
            )}

            <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                  <thead className="bg-zinc-50 dark:bg-zinc-950/70">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Lead</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contact Info</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Time Left in Pool</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Status</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {sortedLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className={cn("cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-800/40", selectedLead?.id === lead.id && "bg-zinc-100 dark:bg-zinc-800/60")}
                        onClick={() => {
                          setSelectedLeadId(lead.id);
                          setDrawerOpen(true);
                        }}
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold">{lead.businessName}</p>
                          <p className="text-xs text-zinc-500">{lead.businessType} · {lead.city}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300">
                          <p className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {lead.phone || "No phone"}</p>
                          <p className="mt-1">{lead.email || "No email"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">{timeLeftInPool(lead.updatedAt)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{STATUS_LABELS[lead.status] || lead.status}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
                            onClick={(event) => {
                              event.stopPropagation();
                              deploy(lead.id);
                            }}
                            disabled={deploying === lead.id}
                          >
                            {deploying === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                            {deploying === lead.id ? "Deploying..." : "Create Instant Site"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!sortedLeads.length && <p className="p-6 text-center text-sm text-zinc-500">No leads yet. Run Find High-Fit Leads to populate the queue.</p>}
            </section>
          </div>
        </section>

        <div className={cn("fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-zinc-200 bg-white p-5 shadow-2xl transition-transform duration-300 dark:border-zinc-800 dark:bg-zinc-900", drawerOpen ? "translate-x-0" : "translate-x-full")}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">AI playbook</h2>
            <button className="rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700" onClick={() => setDrawerOpen(false)}>Close</button>
          </div>

          {selectedLead && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500">Selected lead</p>
              <p className="text-sm font-semibold">{selectedLead.businessName}</p>
              <p className="text-xs text-zinc-500">{selectedLead.businessType} · {selectedLead.city}</p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            {(["SCRIPTS", "OBJECTIONS", "TIPS"] as PlaybookTab[]).map((tab) => (
              <button key={tab} className={cn("rounded-md px-2 py-1 text-xs font-medium", playbookTab === tab ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-300")} onClick={() => setPlaybookTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          <div className="mt-4 max-h-[calc(100vh-13rem)] space-y-3 overflow-y-auto pr-1">
            {playbookTab === "SCRIPTS" && (
              <>
                {scripts.map((script) => (
                  <article key={script.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{script.type}</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{script.content}</p>
                    <div className="mt-2 flex gap-2">
                      <button className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] dark:border-zinc-700" onClick={() => upvote(script.id)}>
                        <ThumbsUp className="h-3 w-3" /> {script.upvoteCount}
                      </button>
                      {selectedLead && <button className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] dark:border-zinc-700" onClick={() => generateScript(selectedLead.id, "EMAIL")}>Regenerate</button>}
                    </div>
                  </article>
                ))}
                {!scripts.length && <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-xs text-zinc-500 dark:border-zinc-700">Select a lead row and generate a script from the drawer.</p>}
              </>
            )}

            {playbookTab === "OBJECTIONS" && (
              <>
                {["I already have a website.", "I don't have budget right now.", "Send me an email and I'll think about it."].map((item) => (
                  <div key={item} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-800/50">
                    <p className="font-medium">{item}</p>
                    <p className="mt-1 text-zinc-500 dark:text-zinc-300">Counter with ROI proof from the instant demo and offer a 10-minute walkthrough.</p>
                  </div>
                ))}
              </>
            )}

            {playbookTab === "TIPS" && (
              <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                <li className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">Open with business outcomes: booked calls, trust signals, faster response.</li>
                <li className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">Mention proof from a similar business in {profile.niche || "their vertical"}.</li>
                <li className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">Use one CTA only: book time at {profile.calendarLink || "your link"}.</li>
              </ul>
            )}

            <div className="rounded-xl border border-zinc-200 bg-zinc-100 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-800/70">
              <p className="inline-flex items-center gap-1 font-semibold"><Zap className="h-3.5 w-3.5 text-emerald-500" /> Momentum cue</p>
              <p className="mt-1 text-zinc-600 dark:text-zinc-300">Build proof, personalize copy, and close with calendar-first CTA.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
