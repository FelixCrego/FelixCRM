"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssignableUser } from "@/lib/store";
import type { Lead, LeadAccountManagementProfile, ManagedServiceLine, SeoTaskChecklistItem } from "@/lib/types";
import { resolveLeadWorkspaceStatus } from "@/lib/lead-workspace-status";

type AccountManagementDashboardProps = {
  initialLeads: Lead[];
  owners: AssignableUser[];
};

type LeadTaskRecord = {
  id: string;
  leadId: string;
  title: string;
  type: "CALLBACK" | "FOLLOW_UP" | "CHECK_IN" | "CUSTOM";
  reminderAt: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string | null;
};

type LeadTaskDraft = {
  title: string;
  type: LeadTaskRecord["type"];
  reminderAt: string;
};

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function createDefaultTaskDraft(): LeadTaskDraft {
  const reminder = new Date();
  reminder.setHours(9, 0, 0, 0);
  if (reminder.getTime() <= Date.now()) {
    reminder.setDate(reminder.getDate() + 1);
  }

  return {
    title: "",
    type: "FOLLOW_UP",
    reminderAt: toDateTimeLocalValue(reminder.toISOString()),
  };
}

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
    syncEnabled: isRecurringBilledLead(lead),
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
    successPlan: {
      primaryClientEmail: lead.email ?? null,
      ccEmails: [],
      sendWeeklyReport: true,
      weeklyReportDay: "MONDAY",
      weeklyReportTime: "09:00",
      timeZone: "America/New_York",
      communicationSummary: "",
      currentFocus: "",
      recentWins: "",
      currentRisks: "",
      nextSteps: "",
      lastWeeklyReportSentAt: null,
      nextWeeklyReportDueAt: null,
    },
  };
}

function isClosedWonLead(lead: Lead) {
  if (resolveLeadWorkspaceStatus(lead) === "CLOSED") return true;
  if (typeof lead.closedAt === "string" && lead.closedAt.trim()) return true;
  return typeof lead.closedDealValue === "number" && lead.closedDealValue > 0;
}

function isRecurringBilledLead(lead: Lead) {
  return (
    lead.billingProfile?.billingType === "RECURRING" &&
    lead.billingProfile?.billingStatus !== "CANCELLED" &&
    (lead.billingProfile?.recurringAmount ?? 0) > 0
  );
}

function isAccountCandidateLead(lead: Lead) {
  return isClosedWonLead(lead) || isRecurringBilledLead(lead) || Boolean(lead.accountManagement?.syncEnabled);
}

function isLegacyManagedLead(lead: Lead) {
  return isRecurringBilledLead(lead);
}

function isManagedLead(lead: Lead) {
  return Boolean(lead.accountManagement?.syncEnabled) || isLegacyManagedLead(lead);
}

function normalizeProfile(lead: Lead): LeadAccountManagementProfile {
  const base = createDefaultAccountProfile(lead);
  const current = lead.accountManagement ?? null;
  return {
    ...base,
    ...current,
    syncEnabled: current?.syncEnabled ?? base.syncEnabled ?? false,
    seo: { ...base.seo, ...(current?.seo ?? {}) },
    seoTasks: current?.seoTasks?.length ? current.seoTasks : base.seoTasks,
    ppc: { ...base.ppc, ...(current?.ppc ?? {}) },
    social: { ...base.social, ...(current?.social ?? {}) },
    analyticsConnections: { ...base.analyticsConnections, ...(current?.analyticsConnections ?? {}) },
    clientHealth: { ...base.clientHealth, ...(current?.clientHealth ?? {}) },
    successPlan: { ...base.successPlan, ...(current?.successPlan ?? {}) },
  };
}

function createDashboardLeadState(initialLeads: Lead[]) {
  const accountCandidates = initialLeads.filter((lead) => isAccountCandidateLead(lead));
  const leadsToDisplay =
    accountCandidates.length > 0
      ? accountCandidates
      : initialLeads.filter((lead) => resolveLeadWorkspaceStatus(lead) !== "DISQUALIFIED");

  return leadsToDisplay.map((lead) => ({
    ...lead,
    accountManagement: normalizeProfile(lead),
  }));
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
  const [leads, setLeads] = useState(() => createDashboardLeadState(initialLeads));
  const [tasksByLeadId, setTasksByLeadId] = useState<Record<string, LeadTaskRecord[]>>({});
  const [taskDraftByLeadId, setTaskDraftByLeadId] = useState<Record<string, LeadTaskDraft>>({});
  const [taskLoadByLeadId, setTaskLoadByLeadId] = useState<Record<string, boolean>>({});
  const [taskErrorByLeadId, setTaskErrorByLeadId] = useState<Record<string, string>>({});

  useEffect(() => {
    setLeads(createDashboardLeadState(initialLeads));
  }, [initialLeads]);

  const managedLeads = useMemo(() => leads.filter((lead) => isManagedLead(lead)), [leads]);
  const promotionCandidates = useMemo(() => leads.filter((lead) => !isManagedLead(lead)), [leads]);

  const summary = useMemo(() => {
    const activeAccounts = managedLeads.filter((lead) => lead.accountManagement?.serviceStatus === "ACTIVE").length;
    const onboardingAccounts = managedLeads.filter((lead) => lead.accountManagement?.serviceStatus === "ONBOARDING").length;
    const atRiskAccounts = managedLeads.filter((lead) => lead.accountManagement?.serviceStatus === "AT_RISK").length;
    const monthlyRevenue = managedLeads.reduce((sum, lead) => sum + (lead.billingProfile?.recurringAmount ?? 0), 0);
    return { activeAccounts, onboardingAccounts, atRiskAccounts, monthlyRevenue };
  }, [managedLeads]);

  const reminderSummary = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    let open = 0;
    let overdue = 0;
    let dueToday = 0;

    for (const tasks of Object.values(tasksByLeadId)) {
      for (const task of tasks) {
        if (task.completed) continue;
        open += 1;

        const reminderAt = new Date(task.reminderAt).getTime();
        if (Number.isNaN(reminderAt)) continue;
        if (reminderAt < now) overdue += 1;
        if (reminderAt >= startOfToday.getTime() && reminderAt < endOfToday.getTime()) dueToday += 1;
      }
    }

    return { open, overdue, dueToday };
  }, [tasksByLeadId]);

  const ensureTaskDraft = useCallback((leadId: string) => {
    setTaskDraftByLeadId((previous) => ({
      ...previous,
      [leadId]: previous[leadId] ?? createDefaultTaskDraft(),
    }));
  }, []);

  const loadLeadTasks = useCallback(async (leadId: string) => {
    setTaskLoadByLeadId((previous) => ({ ...previous, [leadId]: true }));
    setTaskErrorByLeadId((previous) => ({ ...previous, [leadId]: "" }));

    const response = await fetch(`/api/lead-tasks?leadId=${encodeURIComponent(leadId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as { tasks?: LeadTaskRecord[]; error?: string } | null;

    if (!response.ok) {
      setTaskLoadByLeadId((previous) => ({ ...previous, [leadId]: false }));
      setTaskErrorByLeadId((previous) => ({ ...previous, [leadId]: payload?.error || "Unable to load reminders." }));
      return;
    }

    setTasksByLeadId((previous) => ({
      ...previous,
      [leadId]: Array.isArray(payload?.tasks) ? payload.tasks : [],
    }));
    setTaskLoadByLeadId((previous) => ({ ...previous, [leadId]: false }));
    ensureTaskDraft(leadId);
  }, [ensureTaskDraft]);

  useEffect(() => {
    for (const lead of managedLeads) {
      if (tasksByLeadId[lead.id]) continue;
      void loadLeadTasks(lead.id);
    }
  }, [managedLeads, tasksByLeadId, loadLeadTasks]);

  const updateTaskDraft = (leadId: string, patch: Partial<LeadTaskDraft>) => {
    setTaskDraftByLeadId((previous) => ({
      ...previous,
      [leadId]: {
        ...(previous[leadId] ?? createDefaultTaskDraft()),
        ...patch,
      },
    }));
  };

  const addTaskReminder = (leadId: string) => {
    const draft = taskDraftByLeadId[leadId] ?? createDefaultTaskDraft();
    const title = draft.title.trim();
    const reminderAt = draft.reminderAt.trim();
    if (!title || !reminderAt) {
      setTaskErrorByLeadId((previous) => ({ ...previous, [leadId]: "Task title and reminder date/time are required." }));
      return;
    }

    const reminderDate = new Date(reminderAt);
    if (Number.isNaN(reminderDate.getTime())) {
      setTaskErrorByLeadId((previous) => ({ ...previous, [leadId]: "Reminder date/time is invalid." }));
      return;
    }

    const reminderIso = reminderDate.toISOString();
    setTaskLoadByLeadId((previous) => ({ ...previous, [leadId]: true }));
    setTaskErrorByLeadId((previous) => ({ ...previous, [leadId]: "" }));

    startTransition(() => {
      void fetch("/api/lead-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          title,
          type: draft.type,
          reminderAt: reminderIso,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { task?: LeadTaskRecord; error?: string } | null;
          if (!response.ok || !payload?.task) throw new Error(payload?.error || "Unable to add reminder.");

          setTasksByLeadId((previous) => ({
            ...previous,
            [leadId]: [payload.task as LeadTaskRecord, ...(previous[leadId] ?? [])],
          }));
          setTaskDraftByLeadId((previous) => ({
            ...previous,
            [leadId]: {
              ...createDefaultTaskDraft(),
              type: draft.type,
            },
          }));
          setTaskLoadByLeadId((previous) => ({ ...previous, [leadId]: false }));
        })
        .catch((error) => {
          setTaskLoadByLeadId((previous) => ({ ...previous, [leadId]: false }));
          setTaskErrorByLeadId((previous) => ({
            ...previous,
            [leadId]: error instanceof Error ? error.message : "Unable to add reminder.",
          }));
        });
    });
  };

  const toggleTaskReminder = (leadId: string, task: LeadTaskRecord) => {
    setTaskLoadByLeadId((previous) => ({ ...previous, [leadId]: true }));
    setTaskErrorByLeadId((previous) => ({ ...previous, [leadId]: "" }));

    startTransition(() => {
      void fetch("/api/lead-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          taskId: task.id,
          completed: !task.completed,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { task?: LeadTaskRecord; error?: string } | null;
          if (!response.ok || !payload?.task) throw new Error(payload?.error || "Unable to update reminder.");

          setTasksByLeadId((previous) => ({
            ...previous,
            [leadId]: (previous[leadId] ?? []).map((candidate) => (candidate.id === task.id ? (payload.task as LeadTaskRecord) : candidate)),
          }));
          setTaskLoadByLeadId((previous) => ({ ...previous, [leadId]: false }));
        })
        .catch((error) => {
          setTaskLoadByLeadId((previous) => ({ ...previous, [leadId]: false }));
          setTaskErrorByLeadId((previous) => ({
            ...previous,
            [leadId]: error instanceof Error ? error.message : "Unable to update reminder.",
          }));
        });
    });
  };

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

  const promoteLead = (leadId: string) => {
    const lead = leads.find((candidate) => candidate.id === leadId);
    if (!lead) return;

    const recurringAmount =
      lead.billingProfile?.recurringAmount && lead.billingProfile.recurringAmount > 0
        ? lead.billingProfile.recurringAmount
        : lead.closedDealValue && lead.closedDealValue > 0
          ? lead.closedDealValue
          : 1500;
    const primaryClientEmail = lead.accountManagement?.successPlan?.primaryClientEmail ?? lead.email ?? "";

    setSaveMessage("");
    startTransition(() => {
      void fetch("/api/account-management/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          recurringAmount,
          primaryClientEmail,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) throw new Error(payload?.error || "Failed to promote account.");
          setLeads((previous) =>
            previous.map((candidate) => {
              if (candidate.id !== leadId) return candidate;
              const normalized = normalizeProfile(candidate);
              return {
                ...candidate,
                billingProfile: {
                  billingType: "RECURRING",
                  recurringAmount,
                  oneTimeAmount: candidate.billingProfile?.oneTimeAmount ?? null,
                  autoRenew: candidate.billingProfile?.autoRenew ?? true,
                  billingStatus:
                    candidate.billingProfile?.billingStatus === "PAUSED" || candidate.billingProfile?.billingStatus === "PAID"
                      ? candidate.billingProfile.billingStatus
                      : "ACTIVE",
                  billingStartDate: candidate.billingProfile?.billingStartDate ?? candidate.closedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
                  stripeCustomerId: candidate.billingProfile?.stripeCustomerId ?? null,
                  stripeSubscriptionId: candidate.billingProfile?.stripeSubscriptionId ?? null,
                  stripeCheckoutSessionId: candidate.billingProfile?.stripeCheckoutSessionId ?? null,
                  notes: candidate.billingProfile?.notes ?? null,
                },
                accountManagement: {
                  ...normalized,
                  syncEnabled: true,
                  successPlan: {
                    ...(normalized.successPlan ?? {}),
                    primaryClientEmail: primaryClientEmail || normalized.successPlan?.primaryClientEmail || candidate.email || null,
                  },
                },
              };
            }),
          );
          setSaveMessage(`Promoted ${lead.businessName} into managed account sync.`);
          router.refresh();
        })
        .catch((error) => {
          setSaveMessage(error instanceof Error ? error.message : "Failed to promote account.");
        });
    });
  };

  const sendWeeklyReportNow = (leadId: string) => {
    const lead = leads.find((candidate) => candidate.id === leadId);
    if (!lead) return;

    setSaveMessage("");
    startTransition(() => {
      void fetch("/api/account-management/reports/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, force: true }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { error?: string; sent?: number } | null;
          if (!response.ok) throw new Error(payload?.error || "Failed to send weekly report.");
          setSaveMessage(
            payload?.sent
              ? `Weekly report sent for ${lead.businessName}.`
              : `Weekly report run completed for ${lead.businessName}. No email sent.`,
          );
          router.refresh();
        })
        .catch((error) => {
          setSaveMessage(error instanceof Error ? error.message : "Failed to send weekly report.");
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

      <section className="grid gap-4 md:grid-cols-6">
        <article className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-zinc-900/90 to-zinc-950 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Managed Accounts</p>
          <p className="mt-2 text-3xl font-semibold text-white">{managedLeads.length}</p>
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
        <article className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-zinc-900/90 to-zinc-950 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Open Reminders</p>
          <p className="mt-2 text-3xl font-semibold text-white">{reminderSummary.open}</p>
        </article>
        <article className="rounded-2xl border border-rose-400/20 bg-gradient-to-br from-rose-500/10 via-zinc-900/90 to-zinc-950 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Overdue</p>
          <p className="mt-2 text-3xl font-semibold text-white">{reminderSummary.overdue}</p>
          <p className="mt-1 text-xs text-zinc-500">Due today: {reminderSummary.dueToday}</p>
        </article>
      </section>

      {managedLeads.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-sm text-zinc-400">
          No closed-won recurring accounts are available yet.
        </div>
      ) : null}

      {promotionCandidates.length ? (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-amber-300/80">Promotion Queue</p>
              <h2 className="mt-1 text-xl font-semibold text-amber-100">Move closed deals into managed accounts</h2>
              <p className="mt-1 text-sm text-amber-200/80">
                These closed deals are not yet promoted for Marketing Hub sync. Promote them to enable managed-account sync and reporting.
              </p>
            </div>
            <span className="rounded-full border border-amber-400/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-200">
              {promotionCandidates.length} pending
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-zinc-200">
              <thead className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Closed Value</th>
                  <th className="px-3 py-2">Recurring Target</th>
                  <th className="px-3 py-2">Client Email</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {promotionCandidates.map((lead) => (
                  <tr key={lead.id} className="border-t border-zinc-800/80">
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-100">{lead.businessName}</div>
                      <div className="text-xs text-zinc-500">{lead.city}</div>
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{formatCurrency(lead.closedDealValue ?? 0)}</td>
                    <td className="px-3 py-2 text-zinc-300">
                      {formatCurrency(lead.billingProfile?.recurringAmount ?? lead.closedDealValue ?? 1500)}
                    </td>
                    <td className="px-3 py-2 text-zinc-300">
                      {lead.accountManagement?.successPlan?.primaryClientEmail || lead.email || "Missing email"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => promoteLead(lead.id)}
                        disabled={isPending}
                        className="rounded-md border border-amber-300/50 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-60"
                      >
                        Promote to Managed
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {managedLeads.map((lead) => {
        const account = lead.accountManagement ?? normalizeProfile(lead);
        const leadTasks = tasksByLeadId[lead.id] ?? [];
        const taskDraft = taskDraftByLeadId[lead.id] ?? createDefaultTaskDraft();
        const openTaskCount = leadTasks.filter((task) => !task.completed).length;
        const overdueTaskCount = leadTasks.filter((task) => !task.completed && new Date(task.reminderAt).getTime() < Date.now()).length;
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
                <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
                  <span className="block">Client Report Email</span>
                  <input
                    type="email"
                    value={account.successPlan?.primaryClientEmail ?? ""}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        successPlan: {
                          ...(account.successPlan ?? {}),
                          primaryClientEmail: event.target.value,
                        },
                      })
                    }
                    placeholder="client@business.com"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Weekly Report Day</span>
                  <select
                    value={account.successPlan?.weeklyReportDay ?? "MONDAY"}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        successPlan: {
                          ...(account.successPlan ?? {}),
                          weeklyReportDay: event.target.value as NonNullable<LeadAccountManagementProfile["successPlan"]>["weeklyReportDay"],
                        },
                      })
                    }
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value="MONDAY">Monday</option>
                    <option value="TUESDAY">Tuesday</option>
                    <option value="WEDNESDAY">Wednesday</option>
                    <option value="THURSDAY">Thursday</option>
                    <option value="FRIDAY">Friday</option>
                    <option value="SATURDAY">Saturday</option>
                    <option value="SUNDAY">Sunday</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Weekly Report Time (Local)</span>
                  <input
                    type="time"
                    value={account.successPlan?.weeklyReportTime ?? "09:00"}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        successPlan: {
                          ...(account.successPlan ?? {}),
                          weeklyReportTime: event.target.value,
                        },
                      })
                    }
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-400 sm:col-span-2">
                  <span className="block">CC Emails (comma-separated)</span>
                  <input
                    type="text"
                    value={(account.successPlan?.ccEmails ?? []).join(", ")}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        successPlan: {
                          ...(account.successPlan ?? {}),
                          ccEmails: event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                    placeholder="ops@client.com, owner@client.com"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <div className="space-y-2 text-xs text-zinc-400">
                  <span className="block">Sync and Reporting</span>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={Boolean(account.syncEnabled)}
                      onChange={(event) => updateLead(lead.id, { syncEnabled: event.target.checked })}
                    />
                    Include in Marketing Hub sync
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={Boolean(account.successPlan?.sendWeeklyReport ?? true)}
                      onChange={(event) =>
                        updateLead(lead.id, {
                          successPlan: {
                            ...(account.successPlan ?? {}),
                            sendWeeklyReport: event.target.checked,
                          },
                        })
                      }
                    />
                    Send weekly report automatically
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Last sent: {account.successPlan?.lastWeeklyReportSentAt ? new Date(account.successPlan.lastWeeklyReportSentAt).toLocaleString() : "Never"}
                  </p>
                  <button
                    type="button"
                    onClick={() => sendWeeklyReportNow(lead.id)}
                    disabled={isPending}
                    className="rounded-md border border-blue-400/40 bg-blue-500/10 px-3 py-2 text-[11px] font-semibold text-blue-200 disabled:opacity-60"
                  >
                    Send Weekly Report Now
                  </button>
                </div>
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

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Communication Summary</span>
                  <textarea
                    value={account.successPlan?.communicationSummary ?? ""}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        successPlan: {
                          ...(account.successPlan ?? {}),
                          communicationSummary: event.target.value,
                        },
                      })
                    }
                    rows={3}
                    placeholder="What the client should hear this week in plain language."
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Current Focus</span>
                  <textarea
                    value={account.successPlan?.currentFocus ?? ""}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        successPlan: {
                          ...(account.successPlan ?? {}),
                          currentFocus: event.target.value,
                        },
                      })
                    }
                    rows={3}
                    placeholder="Active workstreams and priorities."
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Recent Wins</span>
                  <textarea
                    value={account.successPlan?.recentWins ?? ""}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        successPlan: {
                          ...(account.successPlan ?? {}),
                          recentWins: event.target.value,
                        },
                      })
                    }
                    rows={3}
                    placeholder="Performance highlights and completed deliverables."
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Current Risks</span>
                  <textarea
                    value={account.successPlan?.currentRisks ?? ""}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        successPlan: {
                          ...(account.successPlan ?? {}),
                          currentRisks: event.target.value,
                        },
                      })
                    }
                    rows={3}
                    placeholder="Items that could delay outcomes or impact performance."
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-400 md:col-span-2">
                  <span className="block">Next Steps</span>
                  <textarea
                    value={account.successPlan?.nextSteps ?? ""}
                    onChange={(event) =>
                      updateLead(lead.id, {
                        successPlan: {
                          ...(account.successPlan ?? {}),
                          nextSteps: event.target.value,
                        },
                      })
                    }
                    rows={3}
                    placeholder="What is happening next and what client input is needed."
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-zinc-950/80 to-zinc-950 p-4">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">Account Task Workspace</p>
                  <p className="mt-1 text-xs text-zinc-500">Set reminders for onboarding, delivery, reporting, and retention actions per client.</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">Open: {openTaskCount}</span>
                  <span className={`rounded-full border px-2 py-1 ${overdueTaskCount ? "border-rose-500/40 text-rose-200" : "border-zinc-700 text-zinc-300"}`}>
                    Overdue: {overdueTaskCount}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_170px_210px_auto]">
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Task</span>
                  <input
                    value={taskDraft.title}
                    onChange={(event) => updateTaskDraft(lead.id, { title: event.target.value })}
                    placeholder="Publish month-one SEO pages, deliver PPC call analysis, schedule review call..."
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Type</span>
                  <select
                    value={taskDraft.type}
                    onChange={(event) => updateTaskDraft(lead.id, { type: event.target.value as LeadTaskRecord["type"] })}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value="FOLLOW_UP">Follow Up</option>
                    <option value="CHECK_IN">Check In</option>
                    <option value="CALLBACK">Callback</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  <span className="block">Reminder At</span>
                  <input
                    type="datetime-local"
                    value={taskDraft.reminderAt}
                    onChange={(event) => updateTaskDraft(lead.id, { reminderAt: event.target.value })}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
                  />
                </label>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => addTaskReminder(lead.id)}
                    disabled={Boolean(taskLoadByLeadId[lead.id])}
                    className="rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-60"
                  >
                    Add Reminder
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      ensureTaskDraft(lead.id);
                      void loadLeadTasks(lead.id);
                    }}
                    disabled={Boolean(taskLoadByLeadId[lead.id])}
                    className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {taskErrorByLeadId[lead.id] ? <p className="mt-3 text-xs text-rose-300">{taskErrorByLeadId[lead.id]}</p> : null}

              <div className="mt-4 space-y-2">
                {leadTasks.length === 0 ? (
                  <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-500">
                    No reminders yet for this account.
                  </p>
                ) : (
                  leadTasks.map((task) => {
                    const reminderDate = new Date(task.reminderAt);
                    const isOverdue = !task.completed && !Number.isNaN(reminderDate.getTime()) && reminderDate.getTime() < Date.now();
                    return (
                      <div key={task.id} className={`rounded-lg border px-3 py-2 ${task.completed ? "border-emerald-500/30 bg-emerald-500/8" : isOverdue ? "border-rose-500/35 bg-rose-500/8" : "border-zinc-800 bg-zinc-900/65"}`}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className={`text-sm font-medium ${task.completed ? "text-emerald-200" : "text-zinc-100"}`}>{task.title}</p>
                            <p className="mt-1 text-xs text-zinc-400">
                              {task.type.replace("_", " ")} | {Number.isNaN(reminderDate.getTime()) ? "Invalid reminder time" : reminderDate.toLocaleString()}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleTaskReminder(lead.id, task)}
                            disabled={Boolean(taskLoadByLeadId[lead.id])}
                            className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${task.completed ? "border-zinc-700 text-zinc-300" : "border-emerald-400/40 text-emerald-200"}`}
                          >
                            {task.completed ? "Mark Open" : "Mark Complete"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
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
