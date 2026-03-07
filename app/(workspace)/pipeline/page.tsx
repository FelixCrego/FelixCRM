"use client";

import { Mail, Phone, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Stage = "New" | "Pitched" | "Awaiting Approval" | "Payment Pending" | "Closed Won" | "No Show";
type VercelStatus = "Live" | "Deploying" | "Unbuilt";
type PlaybookTab = "Scripts" | "Objections" | "Tips";

type Deal = {
  id: string;
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

const deals: Deal[] = [
  {
    id: "d1",
    businessName: "Aurora Dental",
    contactName: "Dr. Barnes",
    rep: "AM",
    value: 1200,
    stage: "New",
    vercelStatus: "Unbuilt",
    phone: "+1-415-555-0108",
    email: "hello@auroradental.com",
    lastAction: "Inbound lead added 12 mins ago",
    leadSource: "Referral",
    websiteGoal: "Launch modern patient booking funnel",
    history: ["Lead imported • 8:10 AM", "Initial note added • 8:14 AM"],
  },
  {
    id: "d2",
    businessName: "Pulse Fitness",
    contactName: "Jordan Snow",
    rep: "JS",
    value: 7800,
    stage: "Pitched",
    vercelStatus: "Deploying",
    phone: "+1-628-555-0172",
    email: "owner@pulsefitness.co",
    lastAction: "One-call pitch delivered 22 mins ago",
    leadSource: "Outbound SDR",
    websiteGoal: "Promote 12-week challenge landing page",
    history: ["Intro email sent • Yesterday", "Phone call connected • 4:38 PM", "Proposal viewed • 6:21 PM"],
  },
  {
    id: "d3",
    businessName: "Maple Med Spa",
    contactName: "Sienna Cole",
    rep: "SC",
    value: 425,
    stage: "Awaiting Approval",
    vercelStatus: "Deploying",
    phone: "+1-510-555-0150",
    email: "owner@maplemedspa.com",
    lastAction: "Manager approval requested 7 mins ago",
    leadSource: "Website form",
    websiteGoal: "Capture same-day consult bookings",
    history: ["One-call close attempt • 10:08 AM", "Approval routed to manager • 11:42 AM"],
  },
  {
    id: "d4",
    businessName: "Northline Roofing",
    contactName: "Tyler Reed",
    rep: "TR",
    value: 9200,
    stage: "Payment Pending",
    vercelStatus: "Live",
    phone: "+1-312-555-0123",
    email: "ops@northlineroof.com",
    lastAction: "Stripe link sent 5 mins ago",
    leadSource: "Partner",
    websiteGoal: "Generate storm season estimate requests",
    history: ["Checkout link generated • 9:22 AM", "Customer opened link • 1:00 PM"],
  },
  {
    id: "d5",
    businessName: "Bloom Pediatrics",
    contactName: "Kim Lee",
    rep: "KL",
    value: 5400,
    stage: "Closed Won",
    vercelStatus: "Live",
    phone: "+1-202-555-0189",
    email: "care@bloompediatrics.com",
    lastAction: "Paid via Stripe this morning",
    leadSource: "Inbound",
    websiteGoal: "Convert new parent consultation calls",
    history: ["Final call completed • 9:00 AM", "Deal marked Closed Won • 9:34 AM"],
  },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default function PipelinePage() {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [activeTab, setActiveTab] = useState<PlaybookTab>("Scripts");
  const [demoStageOverrides, setDemoStageOverrides] = useState<Record<string, Stage>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;

    const rawOverrides = window.localStorage.getItem(DEMO_PIPELINE_STATUS_CACHE_KEY);
    if (!rawOverrides) return;

    try {
      const parsed = JSON.parse(rawOverrides) as Record<string, unknown>;
      const normalized = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, Stage] => stages.includes(entry[1] as Stage)),
      );
      setDemoStageOverrides(normalized);
    } catch {
      window.localStorage.removeItem(DEMO_PIPELINE_STATUS_CACHE_KEY);
    }
  }, []);

  const dealsWithDemoOverrides = useMemo(
    () =>
      deals.map((deal) => {
        const byId = demoStageOverrides[deal.id];
        const byName = demoStageOverrides[`name:${deal.businessName.trim().toLowerCase()}`];
        return { ...deal, stage: byId ?? byName ?? deal.stage };
      }),
    [demoStageOverrides],
  );

  const injectedDemoDeals = useMemo(() => {
    const existingNames = new Set(deals.map((deal) => deal.businessName.trim().toLowerCase()));

    return Object.entries(demoStageOverrides)
      .filter(([key]) => key.startsWith("name:"))
      .map(([key, stage]) => ({ key, stage: stage as Stage, normalizedName: key.slice(5).trim() }))
      .filter(({ normalizedName }) => normalizedName && !existingNames.has(normalizedName))
      .map(({ key, stage, normalizedName }) => ({
        id: `demo-${key}`,
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
  }, [demoStageOverrides]);

  const displayDeals = useMemo(() => [...dealsWithDemoOverrides, ...injectedDemoDeals], [dealsWithDemoOverrides, injectedDemoDeals]);

  const byStage = useMemo(
    () => Object.fromEntries(stages.map((stage) => [stage, displayDeals.filter((deal) => deal.stage === stage)])),
    [displayDeals],
  );

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
                {stageDeals.map((deal) => (
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

                    <footer className="mt-3 text-[11px] text-zinc-500">{deal.lastAction}</footer>
                  </article>
                ))}
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
