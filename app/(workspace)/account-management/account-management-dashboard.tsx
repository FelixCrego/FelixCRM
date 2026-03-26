"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssignableUser } from "@/lib/store";
import type { Lead, LeadAccountManagementProfile, ManagedServiceLine, SeoTaskChecklistItem } from "@/lib/types";

type AccountManagementDashboardProps = {
  initialLeads: Lead[];
  owners: AssignableUser[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function accountStatusTone(status?: LeadAccountManagementProfile["serviceStatus"]) {
  if (status === "ACTIVE") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  if (status === "AT_RISK") return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  if (status === "PAUSED") return "border-zinc-600 bg-zinc-800/80 text-zinc-300";
  return "border-sky-400/30 bg-sky-500/10 text-sky-200";
}

function serviceAccent(label: string) {
  if (label === "SEO") return "border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 via-zinc-950/80 to-zinc-950";
  if (label === "Google PPC") return "border-blue-400/20 bg-gradient-to-br from-blue-500/10 via-zinc-950/80 to-zinc-950";
  return "border-pink-400/20 bg-gradient-to-br from-pink-500/10 via-zinc-950/80 to-zinc-950";
}

function createDefaultServiceLine(enabled = false): ManagedServiceLine {
  return {
    enabled,
    status: enabled ? "ON_TRACK" : "NOT_STARTED",
    cadence: "MONTHLY",
    deliverables: "",
    kpiSummary: "",
    nextReportDate: null,
    notes: "",
  };
}

function createDefaultSeoTasks(): SeoTaskChecklistItem[] {
  return [
    {
      id: "seo-foundations",
      title: "Fix Indexing and Technical Foundations",
      instruction: "Open Google Search Console, inspect the homepage and top service pages, submit sitemap.xml, resolve any noindex/canonical issues, and make sure key money pages are crawlable.",
      completed: false,
    },
    {
      id: "seo-service-pages",
      title: "Build Local Service Landing Pages",
      instruction: "Create or improve service and city pages targeting high-intent searches. Each page should have a unique H1, strong local proof, a clear CTA, internal links, and location modifiers tied to buyer intent.",
      completed: false,
    },
    {
      id: "seo-gbp",
      title: "Optimize Google Business Profile Signals",
      instruction: "Align the website with the Google Business Profile. Confirm NAP consistency, primary category relevance, service descriptions, review response coverage, and add site links supporting the GBP service focus.",
      completed: false,
    },
    {
      id: "seo-conversion",
      title: "Improve Conversion Paths on Organic Pages",
      instruction: "Review organic landing pages for phone CTA visibility, form friction, mobile speed, trust signals, and booking flow clarity. The ranking win should also convert into leads once traffic lands.",
      completed: false,
    },
    {
      id: "seo-links",
      title: "Earn Local Authority Links and Citations",
      instruction: "Create a monthly outreach list for local directories, chambers, sponsorships, partners, and niche listings. Prioritize links that reinforce geography, services, and brand legitimacy.",
      completed: false,
    },
    {
      id: "seo-reporting",
      title: "Review Queries and Publish Next Actions",
      instruction: "Use GSC and GA4 to identify pages with impressions but weak CTR, pages with clicks but low lead conversion, and pages with rising queries. Turn those findings into the next content and optimization sprint.",
      completed: false,
    },
  ];
}

function createDefaultAccountProfile(lead: Lead): LeadAccountManagementProfile {
  return {
    serviceStatus: "ONBOARDING",
    primaryOwnerId: lead.soldByUserId ?? lead.ownerId ?? null,
    primaryOwnerName: lead.soldByName ?? null,
    startDate: lead.billingProfile?.billingStartDate ?? lead.closedAt?.slice(0, 10) ?? null,
    renewalDate: null,
    seo: createDefaultServiceLine(true),
    seoTasks: createDefaultSeoTasks(),
    ppc: createDefaultServiceLine(false),
    social: createDefaultServiceLine(false),
    analyticsConnections: {
      gscConnected: false,
      gscPropertyUrl: "",
      ga4Connected: false,
      ga4PropertyId: "",
      lastAiReviewAt: null,
      aiSuggestions: "",
    },
    clientHealth: {
      lastTouchAt: null,
      nextMeetingAt: null,
      satisfaction: "STABLE",
      blockers: "",
      expansionOpportunity: "",
    },
  };
}

function normalizeProfile(lead: Lead): LeadAccountManagementProfile {
  const base = createDefaultAccountProfile(lead);
  const current = lead.accountManagement ?? null;
  return {
    ...base,
    ...current,
    seo: { ...base.seo, ...(current?.seo ?? {}) },
    seoTasks: current?.seoTasks?.length ? current.seoTasks : base.seoTasks,
    ppc: { ...base.ppc, ...(current?.ppc ?? {}) },
    social: { ...base.social, ...(current?.social ?? {}) },
    analyticsConnections: { ...base.analyticsConnections, ...(current?.analyticsConnections ?? {}) },
    clientHealth: { ...base.clientHealth, ...(current?.clientHealth ?? {}) },
  };
}

function ServiceLineEditor({
  label,
  line,
  onChange,
}: {
  label: string;
  line: ManagedServiceLine;
  onChange: (patch: Partial<ManagedServiceLine>) => void;
}) {
  return (
    <article className={`rounded-xl border p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)] ${serviceAccent(label)}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">{label}</p>
          <p className="mt-1 text-xs text-zinc-500">Delivery cadence, KPI snapshot, and next actions.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={Boolean(line.enabled)}
            onChange={(event) =>
              onChange({
                enabled: event.target.checked,
                status: event.target.checked ? (line.status === "NOT_STARTED" ? "ON_TRACK" : line.status) : "NOT_STARTED",
              })
            }
          />
          Enabled
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-xs text-zinc-400">
          <span className="block">Status</span>
          <select
            value={line.status ?? "NOT_STARTED"}
            onChange={(event) => onChange({ status: event.target.value as ManagedServiceLine["status"] })}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
          >
            <option value="NOT_STARTED">Not Started</option>
            <option value="ON_TRACK">On Track</option>
            <option value="NEEDS_ATTENTION">Needs Attention</option>
            <option value="PAUSED">Paused</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          <span className="block">Cadence</span>
          <select
            value={line.cadence ?? "MONTHLY"}
            onChange={(event) => onChange({ cadence: event.target.value as ManagedServiceLine["cadence"] })}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
          >
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Biweekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          <span className="block">Next Report</span>
          <input
            type="date"
            value={line.nextReportDate ?? ""}
            onChange={(event) => onChange({ nextReportDate: event.target.value || null })}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3">
        <label className="space-y-1 text-xs text-zinc-400">
          <span className="block">Deliverables</span>
          <textarea
            value={line.deliverables ?? ""}
            onChange={(event) => onChange({ deliverables: event.target.value })}
            rows={3}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          <span className="block">KPI Summary</span>
          <textarea
            value={line.kpiSummary ?? ""}
            onChange={(event) => onChange({ kpiSummary: event.target.value })}
            rows={3}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          <span className="block">Notes</span>
          <textarea
            value={line.notes ?? ""}
            onChange={(event) => onChange({ notes: event.target.value })}
            rows={3}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
          />
        </label>
      </div>
    </article>
  );
}

export default function AccountManagementDashboard({ initialLeads, owners }: AccountManagementDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saveMessage, setSaveMessage] = useState("");
  const [leads, setLeads] = useState(
    initialLeads
      .filter(
        (lead) =>
          lead.status === "CLOSED" &&
          lead.billingProfile?.billingType === "RECURRING" &&
          lead.billingProfile?.billingStatus !== "CANCELLED" &&
          (lead.billingProfile?.recurringAmount ?? 0) > 0,
      )
      .map((lead) => ({
        ...lead,
        accountManagement: normalizeProfile(lead),
      })),
  );

  const summary = useMemo(() => {
    const activeAccounts = leads.filter((lead) => lead.accountManagement?.serviceStatus === "ACTIVE").length;
    const onboardingAccounts = leads.filter((lead) => lead.accountManagement?.serviceStatus === "ONBOARDING").length;
    const atRiskAccounts = leads.filter((lead) => lead.accountManagement?.serviceStatus === "AT_RISK").length;
    const monthlyRevenue = leads.reduce((sum, lead) => sum + (lead.billingProfile?.recurringAmount ?? 0), 0);
    return { activeAccounts, onboardingAccounts, atRiskAccounts, monthlyRevenue };
  }, [leads]);

  const updateLead = (leadId: string, patch: Partial<LeadAccountManagementProfile>) => {
    setLeads((previous) =>
      previous.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              accountManagement: {
                ...normalizeProfile(lead),
                ...patch,
              },
            }
          : lead,
      ),
    );
  };

  const updateServiceLine = (leadId: string, key: "seo" | "ppc" | "social", patch: Partial<ManagedServiceLine>) => {
    setLeads((previous) =>
      previous.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              accountManagement: {
                ...normalizeProfile(lead),
                [key]: {
                  ...normalizeProfile(lead)[key],
                  ...patch,
                },
              },
            }
          : lead,
      ),
    );
  };

  const updateSeoTask = (leadId: string, taskId: string, patch: Partial<SeoTaskChecklistItem>) => {
    setLeads((previous) =>
      previous.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              accountManagement: {
                ...normalizeProfile(lead),
                seoTasks: (normalizeProfile(lead).seoTasks ?? []).map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
              },
            }
          : lead,
      ),
    );
  };

  const saveLead = (leadId: string) => {
    const lead = leads.find((candidate) => candidate.id === leadId);
    if (!lead?.accountManagement) return;

    setSaveMessage("");
    startTransition(() => {
      void fetch("/api/account-management/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          accountManagement: lead.accountManagement,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) throw new Error(payload?.error || "Failed to save account profile.");
          setSaveMessage(`Saved account management profile for ${lead.businessName}.`);
          router.refresh();
        })
        .catch((error) => {
          setSaveMessage(error instanceof Error ? error.message : "Failed to save account profile.");
        });
    });
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-cyan-500/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(74,222,128,0.1),transparent_24%),linear-gradient(135deg,rgba(24,24,27,1),rgba(9,9,11,1))] p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Recurring Services</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">Account Management Center</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Run SEO, Google PPC, and social media delivery from one workspace for every closed-won recurring account.
        </p>
        {saveMessage ? <p className="mt-4 text-sm text-emerald-300">{saveMessage}</p> : null}
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-zinc-900/90 to-zinc-950 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Managed Accounts</p>
          <p className="mt-2 text-3xl font-semibold text-white">{leads.length}</p>
        </article>
        <article className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 via-zinc-900/90 to-zinc-950 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Active</p>
          <p className="mt-2 text-3xl font-semibold text-white">{summary.activeAccounts}</p>
        </article>
        <article className="rounded-2xl border border-sky-400/20 bg-gradient-to-br from-sky-500/10 via-zinc-900/90 to-zinc-950 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Onboarding</p>
          <p className="mt-2 text-3xl font-semibold text-white">{summary.onboardingAccounts}</p>
        </article>
        <article className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 via-zinc-900/90 to-zinc-950 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Managed MRR</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(summary.monthlyRevenue)}</p>
        </article>
      </section>

      {leads.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-sm text-zinc-400">
          No closed-won recurring accounts are available yet.
        </div>
      ) : null}

      {leads.map((lead) => {
        const account = lead.accountManagement ?? normalizeProfile(lead);
        return (
          <section key={lead.id} className="space-y-4 rounded-2xl border border-zinc-800 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(9,9,11,0.96))] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Client Account</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{lead.businessName}</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {lead.city} • {formatCurrency(lead.billingProfile?.recurringAmount ?? 0)} / month
                </p>
                <div className="mt-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${accountStatusTone(account.serviceStatus)}`}>
                    {account.serviceStatus ?? "ONBOARDING"}
                  </span>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:w-[460px]">
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Account Status</span>
                  <select
                    value={account.serviceStatus ?? "ONBOARDING"}
                    onChange={(event) => updateLead(lead.id, { serviceStatus: event.target.value as LeadAccountManagementProfile["serviceStatus"] })}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value="ONBOARDING">Onboarding</option>
                    <option value="ACTIVE">Active</option>
                    <option value="AT_RISK">At Risk</option>
                    <option value="PAUSED">Paused</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Primary Owner</span>
                  <select
                    value={account.primaryOwnerId ?? ""}
                    onChange={(event) => {
                      const owner = owners.find((candidate) => candidate.id === event.target.value) ?? null;
                      updateLead(lead.id, {
                        primaryOwnerId: owner?.id ?? null,
                        primaryOwnerName: owner?.name ?? null,
                      });
                    }}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value="">Unassigned</option>
                    {owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}{owner.email ? ` (${owner.email})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Start Date</span>
                  <input
                    type="date"
                    value={account.startDate ?? ""}
                    onChange={(event) => updateLead(lead.id, { startDate: event.target.value || null })}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Renewal Date</span>
                  <input
                    type="date"
                    value={account.renewalDate ?? ""}
                    onChange={(event) => updateLead(lead.id, { renewalDate: event.target.value || null })}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
              </div>
            </div>

            <section className="grid gap-4 xl:grid-cols-3">
              <ServiceLineEditor label="SEO" line={account.seo ?? createDefaultServiceLine(true)} onChange={(patch) => updateServiceLine(lead.id, "seo", patch)} />
              <ServiceLineEditor label="Google PPC" line={account.ppc ?? createDefaultServiceLine(false)} onChange={(patch) => updateServiceLine(lead.id, "ppc", patch)} />
              <ServiceLineEditor label="Social Media Ads" line={account.social ?? createDefaultServiceLine(false)} onChange={(patch) => updateServiceLine(lead.id, "social", patch)} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <article className="rounded-xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 via-zinc-950/80 to-zinc-950 p-4">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-zinc-100">SEO Ranking and Lead Gen Checklist</p>
                  <p className="mt-1 text-xs text-zinc-500">Preloaded execution items focused on local rankings, CTR, and conversion lift.</p>
                </div>
                <div className="space-y-3">
                  {(account.seoTasks ?? createDefaultSeoTasks()).map((task) => (
                    <div key={task.id} className="rounded-lg border border-emerald-400/10 bg-zinc-900/75 p-3">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={Boolean(task.completed)}
                          onChange={(event) => updateSeoTask(lead.id, task.id, { completed: event.target.checked })}
                          className="mt-1"
                        />
                        <div>
                          <p className="text-sm font-medium text-zinc-100">{task.title}</p>
                          <p className="mt-1 text-xs text-zinc-400">{task.instruction}</p>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-xl border border-blue-400/20 bg-gradient-to-br from-blue-500/10 via-zinc-950/80 to-zinc-950 p-4">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-zinc-100">GSC, GA4, and AI Review</p>
                  <p className="mt-1 text-xs text-zinc-500">Store connection details now so AI review can work from verified analytics sources.</p>
                </div>
                <div className="grid gap-3">
                  <label className="space-y-1 text-xs text-zinc-400">
                    <span className="block">Google Search Console Property</span>
                    <input
                      value={account.analyticsConnections?.gscPropertyUrl ?? ""}
                      onChange={(event) =>
                        updateLead(lead.id, {
                          analyticsConnections: {
                            ...(account.analyticsConnections ?? {}),
                            gscPropertyUrl: event.target.value,
                          },
                        })
                      }
                      placeholder="https://example.com/ or sc-domain:example.com"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={Boolean(account.analyticsConnections?.gscConnected)}
                      onChange={(event) =>
                        updateLead(lead.id, {
                          analyticsConnections: {
                            ...(account.analyticsConnections ?? {}),
                            gscConnected: event.target.checked,
                          },
                        })
                      }
                    />
                    GSC connected and verified
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400">
                    <span className="block">GA4 Property ID</span>
                    <input
                      value={account.analyticsConnections?.ga4PropertyId ?? ""}
                      onChange={(event) =>
                        updateLead(lead.id, {
                          analyticsConnections: {
                            ...(account.analyticsConnections ?? {}),
                            ga4PropertyId: event.target.value,
                          },
                        })
                      }
                      placeholder="123456789"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={Boolean(account.analyticsConnections?.ga4Connected)}
                      onChange={(event) =>
                        updateLead(lead.id, {
                          analyticsConnections: {
                            ...(account.analyticsConnections ?? {}),
                            ga4Connected: event.target.checked,
                          },
                        })
                      }
                    />
                    GA4 connected and verified
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400">
                    <span className="block">Last AI Review</span>
                    <input
                      type="date"
                      value={account.analyticsConnections?.lastAiReviewAt ?? ""}
                      onChange={(event) =>
                        updateLead(lead.id, {
                          analyticsConnections: {
                            ...(account.analyticsConnections ?? {}),
                            lastAiReviewAt: event.target.value || null,
                          },
                        })
                      }
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-400">
                    <span className="block">AI SEO Suggestions</span>
                    <textarea
                      value={account.analyticsConnections?.aiSuggestions ?? ""}
                      onChange={(event) =>
                        updateLead(lead.id, {
                          analyticsConnections: {
                            ...(account.analyticsConnections ?? {}),
                            aiSuggestions: event.target.value,
                          },
                        })
                      }
                      rows={8}
                      placeholder="Use this area for AI-backed recommendations after reviewing GSC queries, CTR drops, landing pages, and GA4 engagement/conversion patterns."
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                    />
                  </label>
                </div>
              </article>
            </section>

            <section className="rounded-xl border border-fuchsia-400/15 bg-gradient-to-br from-fuchsia-500/8 via-zinc-950/80 to-zinc-950 p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-zinc-100">Client Health</p>
                <p className="mt-1 text-xs text-zinc-500">Track communication rhythm, client sentiment, blockers, and expansion paths.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Last Touch</span>
                  <input
                    type="date"
                    value={account.clientHealth?.lastTouchAt ?? ""}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        clientHealth: {
                          ...(account.clientHealth ?? {}),
                          lastTouchAt: event.target.value || null,
                        },
                      })
                    }
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Next Meeting</span>
                  <input
                    type="date"
                    value={account.clientHealth?.nextMeetingAt ?? ""}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        clientHealth: {
                          ...(account.clientHealth ?? {}),
                          nextMeetingAt: event.target.value || null,
                        },
                      })
                    }
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Client Sentiment</span>
                  <select
                    value={account.clientHealth?.satisfaction ?? "STABLE"}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        clientHealth: {
                          ...(account.clientHealth ?? {}),
                          satisfaction: event.target.value as NonNullable<LeadAccountManagementProfile["clientHealth"]>["satisfaction"],
                        },
                      })
                    }
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value="STRONG">Strong</option>
                    <option value="STABLE">Stable</option>
                    <option value="WATCH">Watch</option>
                    <option value="AT_RISK">At Risk</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Current Blockers</span>
                  <textarea
                    value={account.clientHealth?.blockers ?? ""}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        clientHealth: {
                          ...(account.clientHealth ?? {}),
                          blockers: event.target.value,
                        },
                      })
                    }
                    rows={3}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Expansion Opportunity</span>
                  <textarea
                    value={account.clientHealth?.expansionOpportunity ?? ""}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        clientHealth: {
                          ...(account.clientHealth ?? {}),
                          expansionOpportunity: event.target.value,
                        },
                      })
                    }
                    rows={3}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
              </div>
            </section>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">
                Saved per lead so the delivery team keeps one live operating record for each recurring client.
              </p>
              <button
                type="button"
                onClick={() => saveLead(lead.id)}
                disabled={isPending}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 disabled:opacity-60"
              >
                Save Account Profile
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
