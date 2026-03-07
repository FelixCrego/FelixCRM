"use client";

import Link from "next/link";
import { Mail, Phone, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Lead } from "@/lib/types";

type Stage = "New" | "Pitched" | "Awaiting Approval" | "Payment Pending" | "Closed Won" | "No Show";
type VercelStatus = "Live" | "Deploying" | "Unbuilt";
type PlaybookTab = "Scripts" | "Objections" | "Tips";

type Deal = {
  id: string;
  leadId?: string;
  businessName: string;
  contactName: string;
  rep: string;
  value: number;
  stage: Stage;
  vercelStatus: VercelStatus;
  phone: string;
  email: string;
  lastAction: string;
  leadSource: string;
  websiteGoal: string;
  history: string[];
};

const stages: Stage[] = ["New", "Pitched", "Awaiting Approval", "Payment Pending", "Closed Won", "No Show"];
const DEMO_PIPELINE_STATUS_CACHE_KEY = "felix:demo-pipeline-stage-overrides";
const LEAD_ID_FOR_NAME_PREFIX = "lead-for-name:";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function getLeadWorkspaceHref(deal: Deal): string | null {
  if (deal.leadId) return `/leads/${deal.leadId}`;
  if (!deal.id.startsWith("demo-")) return `/leads/${deal.id}`;
  return null;
}

function toPipelineStage(lead: Lead): Stage {
  const rawStatus = String(lead.status ?? "").trim().toUpperCase();

  if (rawStatus === "CLOSED" || rawStatus === "CLOSED WON") return "Closed Won";
  if (rawStatus === "DISQUALIFIED" || rawStatus === "NO SHOW") return "No Show";
  if (lead.stripeCheckoutLink || rawStatus === "PAYMENT PENDING") return "Payment Pending";
  if (rawStatus === "AWAITING APPROVAL" || rawStatus === "AWAITING_APPROVAL") return "Awaiting Approval";
  if (rawStatus === "CONTACTED" || rawStatus === "PITCHED") return "Pitched";
  return "New";
}

function toVercelStatus(lead: Lead): VercelStatus {
  if (lead.siteStatus === "LIVE") return "Live";
  if (lead.siteStatus === "BUILDING") return "Deploying";
  return "Unbuilt";
}

function leadToDeal(lead: Lead): Deal {
  const normalizedName = lead.businessName.trim().toLowerCase();
  const primaryContact = lead.contacts?.find((contact) => contact.name.trim())?.name;

  return {
    id: lead.id,
    leadId: lead.id,
    businessName: lead.businessName,
    contactName: primaryContact || "Primary Contact",
    rep: "—",
    value: lead.closedDealValue ?? 0,
    stage: toPipelineStage(lead),
    vercelStatus: toVercelStatus(lead),
    phone: lead.phone || "",
    email: lead.email || "",
    lastAction: `Last updated ${new Date(lead.updatedAt).toLocaleString()}`,
    leadSource: lead.sourceQuery || "Lead List",
    websiteGoal: lead.enrichment?.structured.heroCopy || "",
    history: [`Lead synced from CRM (${normalizedName}).`],
  };
}

export default function PipelinePage() {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [activeTab, setActiveTab] = useState<PlaybookTab>("Scripts");
  const [liveDeals, setLiveDeals] = useState<Deal[]>([]);
  const [demoStageOverrides, setDemoStageOverrides] = useState<Record<string, Stage>>({});
  const [leadIdByNormalizedName, setLeadIdByNormalizedName] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;

    const rawOverrides = window.localStorage.getItem(DEMO_PIPELINE_STATUS_CACHE_KEY);
    if (!rawOverrides) return;

    try {
      const parsed = JSON.parse(rawOverrides) as Record<string, unknown>;
      const normalized = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, Stage] => stages.includes(entry[1] as Stage)),
      );
      const leadLookup = Object.fromEntries(
        Object.entries(parsed)
          .filter((entry): entry is [string, string] => entry[0].startsWith(LEAD_ID_FOR_NAME_PREFIX) && typeof entry[1] === "string")
          .map(([key, leadId]) => [key.slice(LEAD_ID_FOR_NAME_PREFIX.length), leadId]),
      );
      setDemoStageOverrides(normalized);
      setLeadIdByNormalizedName(leadLookup);
    } catch {
      window.localStorage.removeItem(DEMO_PIPELINE_STATUS_CACHE_KEY);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadLeads = async () => {
      try {
        const response = await fetch("/api/leads", { cache: "no-store" });
        const payload = (await response.json()) as { leads?: Lead[] };
        if (!response.ok || !Array.isArray(payload.leads)) {
          if (isMounted) setLiveDeals([]);
          return;
        }

        if (isMounted) {
          setLiveDeals(
            payload.leads
              .filter((lead) => String(lead.status ?? "").trim().toUpperCase() !== "IN_PROGRESS")
              .map(leadToDeal),
          );
        }
      } catch {
        if (isMounted) setLiveDeals([]);
      }
    };

    void loadLeads();

    return () => {
      isMounted = false;
    };
  }, []);


  const dealsWithDemoOverrides = useMemo(
    () =>
      liveDeals.map((deal) => {
        const normalizedName = deal.businessName.trim().toLowerCase();
        const byId = demoStageOverrides[deal.id];
        const byName = demoStageOverrides[`name:${normalizedName}`];

        return {
          ...deal,
          leadId: deal.leadId ?? leadIdByNormalizedName[normalizedName],
          stage: byId ?? byName ?? deal.stage,
        };
      }),
    [demoStageOverrides, leadIdByNormalizedName, liveDeals],
  );

  const injectedDemoDeals = useMemo(() => {
    const existingNames = new Set(liveDeals.map((deal) => deal.businessName.trim().toLowerCase()));

    return Object.entries(demoStageOverrides)
      .filter(([key]) => key.startsWith("name:"))
      .map(([key, stage]) => ({ key, stage: stage as Stage, normalizedName: key.slice(5).trim() }))
      .filter(({ normalizedName }) => normalizedName && !existingNames.has(normalizedName))
      .map(({ key, stage, normalizedName }) => ({
        id: `demo-${key}`,
        leadId: leadIdByNormalizedName[normalizedName],
        businessName: normalizedName
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
        contactName: "Upcoming Demo",
        rep: "—",
        value: 0,
        stage,
        vercelStatus: "Unbuilt" as const,
        phone: "",
        email: "",
        lastAction: "Status synced from Upcoming Demos",
        leadSource: "Upcoming Demos",
        websiteGoal: "",
        history: ["Created from upcoming demo status selector."],
      }));
  }, [demoStageOverrides, leadIdByNormalizedName, liveDeals]);

  const displayDeals = useMemo(() => [...dealsWithDemoOverrides, ...injectedDemoDeals], [dealsWithDemoOverrides, injectedDemoDeals]);

  const byStage = useMemo(
    () => Object.fromEntries(stages.map((stage) => [stage, displayDeals.filter((deal) => deal.stage === stage)])),
    [displayDeals],
  );

  const activeDealWorkspaceHref = activeDeal ? getLeadWorkspaceHref(activeDeal) : null;

  const playbookContent: Record<PlaybookTab, string[]> = {
    Scripts: [
      "30-second opener focused on ROI and speed-to-launch.",
      "Objection interrupt script for budget hesitation.",
      "Follow-up voicemail script with CTA to book demo.",
    ],
    Objections: [
      '"We already have a site." → Position as a conversion upgrade, not a redesign.',
      '"Need to think about it." → Offer phased launch with immediate lead capture.',
      '"Too expensive." → Tie monthly spend to one additional closed customer.',
    ],
    Tips: [
      "Mention competitor velocity: reps win when they show launch dates, not mockups.",
      "Always confirm primary conversion event before demo begins.",
      "Send live preview within 60 minutes after call to maintain momentum.",
    ],
  };

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-6">
        {stages.map((stage) => {
          const stageDeals = byStage[stage] as Deal[];
          const stageValue = stageDeals.reduce((total, deal) => total + deal.value, 0);

          return (
            <section key={stage} className="min-h-[560px] rounded-2xl border border-zinc-800 bg-zinc-900/30 p-3">
              <header className="mb-3 border-b border-zinc-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-100">{stage}</h2>
                  <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">{stageDeals.length}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{formatCurrency(stageValue)} pipeline value</p>
              </header>

              <div className="space-y-3">
                {stageDeals.map((deal) => {
                  const leadWorkspaceHref = getLeadWorkspaceHref(deal);

                  return (
                  <article
                    key={deal.id}
                    onClick={() => setActiveDeal(deal)}
                    className="cursor-pointer rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 transition hover:border-zinc-600"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-zinc-100">{deal.businessName}</h3>
                        <p className="text-xs text-zinc-500">{deal.contactName}</p>
                      </div>
                      <p className="text-sm font-semibold text-zinc-100">{formatCurrency(deal.value)}</p>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {deal.phone ? (
                          <a
                            href={`tel:${deal.phone}`}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                            aria-label={`Call ${deal.businessName}`}
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                        ) : null}
                        {deal.email ? (
                          <a
                            href={`mailto:${deal.email}`}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                            aria-label={`Email ${deal.businessName}`}
                          >
                            <Mail className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>

                      {deal.vercelStatus === "Live" ? (
                        <button
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-md bg-emerald-500/20 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/30"
                        >
                          Live Preview
                        </button>
                      ) : deal.vercelStatus === "Deploying" ? (
                        <button
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-200"
                        >
                          <span className="h-3 w-3 animate-spin rounded-full border border-amber-200 border-t-transparent" />
                          Building
                        </button>
                      ) : (
                        <button
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-md bg-blue-500/20 px-2.5 py-1.5 text-xs font-medium text-blue-200 transition hover:bg-blue-500/35"
                        >
                          Deploy Site
                        </button>
                      )}
                    </div>

                    {leadWorkspaceHref ? (
                      <Link
                        href={leadWorkspaceHref}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-3 block rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-center text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
                      >
                        Open Lead Workspace
                      </Link>
                    ) : null}

                    <footer className="mt-3 text-[11px] text-zinc-500">{deal.lastAction}</footer>
                  </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${activeDeal ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setActiveDeal(null)}
      />

      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-xl border-l border-zinc-800 bg-zinc-950 p-5 shadow-2xl transition-transform duration-300 ${
          activeDeal ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {activeDeal && (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Deal Hub</p>
                <h3 className="mt-1 text-xl font-semibold text-zinc-100">{activeDeal.businessName}</h3>
                <p className="mt-1 text-sm text-zinc-400">{formatCurrency(activeDeal.value)} • {activeDeal.stage}</p>
                {activeDealWorkspaceHref ? (
                  <Link
                    href={activeDealWorkspaceHref}
                    className="mt-3 inline-flex rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
                  >
                    Open Lead Workspace
                  </Link>
                ) : null}
              </div>
              <button onClick={() => setActiveDeal(null)} className="rounded-lg border border-zinc-700 p-2 text-zinc-400 hover:text-zinc-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              {(Object.keys(playbookContent) as PlaybookTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    activeTab === tab ? "bg-zinc-100 text-zinc-950" : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">AI Playbook</h4>
              <ul className="mt-3 space-y-2 text-sm text-zinc-200">
                {playbookContent[activeTab].map((item) => (
                  <li key={item} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Lead Details</h4>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-zinc-500">Primary Contact</dt>
                    <dd className="text-zinc-200">{activeDeal.contactName}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Source</dt>
                    <dd className="text-zinc-200">{activeDeal.leadSource}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Goal</dt>
                    <dd className="text-zinc-200">{activeDeal.websiteGoal}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Communication History</h4>
                <ul className="mt-3 space-y-2 text-sm text-zinc-200">
                  {activeDeal.history.map((event) => (
                    <li key={event} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                      {event}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </>
        )}
      </aside>
    </>
  );
}
