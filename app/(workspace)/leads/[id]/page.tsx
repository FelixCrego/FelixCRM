"use client";

import { useEffect, useMemo, useState } from "react";

type LeadExecutionPageProps = {
  params: {
    id?: string;
  };
};

type WorkspaceLead = {
  id: string;
  businessName: string;
  phone: string;
  website: string;
};

const CLAIMED_LEADS_STORAGE_KEY = "claimedLeads";

const FALLBACK_LEAD: WorkspaceLead = {
  id: "1",
  businessName: "Eustis Garage Door Repair",
  phone: "(352) 845-1524",
  website: "MISSING",
};

function normalizeLead(raw: unknown): WorkspaceLead | null {
  if (!raw || typeof raw !== "object") return null;

  const lead = raw as Record<string, unknown>;
  const id = typeof lead.id === "string" && lead.id.trim() ? lead.id : null;
  const businessName =
    typeof lead.businessName === "string" && lead.businessName.trim() ? lead.businessName : null;

  if (!id || !businessName) return null;

  const phone = typeof lead.phone === "string" && lead.phone.trim() ? lead.phone : FALLBACK_LEAD.phone;
  const websiteUrl =
    typeof lead.websiteUrl === "string" && lead.websiteUrl.trim()
      ? lead.websiteUrl
      : typeof lead.website === "string" && lead.website.trim()
        ? lead.website
        : FALLBACK_LEAD.website;

  return {
    id,
    businessName,
    phone,
    website: websiteUrl,
  };
}

export default function LeadExecutionPage({ params }: LeadExecutionPageProps) {
  const [lead, setLead] = useState<WorkspaceLead>(FALLBACK_LEAD);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchResult, setResearchResult] = useState<string | null>(null);
  const [activeChannelTab, setActiveChannelTab] = useState<"Notes" | "SMS" | "Email">("Notes");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [activePlaybookTab, setActivePlaybookTab] = useState<"Scripts" | "Objections">("Scripts");

  const leadId = useMemo(() => params?.id?.trim() ?? "", [params?.id]);

  useEffect(() => {
    const hydrateLead = () => {
      const fallbackForRoute = leadId ? { ...FALLBACK_LEAD, id: leadId } : FALLBACK_LEAD;

      try {
        const raw = window.localStorage.getItem(CLAIMED_LEADS_STORAGE_KEY);
        if (!raw) {
          setLead(fallbackForRoute);
          return;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          setLead(fallbackForRoute);
          return;
        }

        const found = parsed.map(normalizeLead).find((item): item is WorkspaceLead => Boolean(item) && item.id === leadId);
        setLead(found ?? fallbackForRoute);
      } catch {
        setLead(fallbackForRoute);
      }
    };

    hydrateLead();
  }, [leadId]);

  const runResearch = () => {
    setResearchLoading(true);
    setResearchResult(null);

    window.setTimeout(() => {
      setResearchLoading(false);
      setResearchResult(
        "Analyzed 14 Google Reviews. Weakness: No mobile booking. Competitors rank higher for 'emergency repair'.",
      );
    }, 2000);
  };

  const bookMeeting = () => {
    setBookingLoading(true);
    setMeetLink(null);

    window.setTimeout(() => {
      setBookingLoading(false);
      setMeetLink("meet.google.com/abc-defg-hij");
    }, 1800);
  };

  return (
    <main className="min-h-screen w-full bg-zinc-950 px-6 py-6 text-zinc-100">
      <div className="grid w-full grid-cols-12 gap-6">
        <section className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-xl lg:col-span-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Intelligence</p>
            <h1 className="mt-2 text-xl font-semibold">{lead.businessName}</h1>
            <p className="mt-3 text-sm text-zinc-300">Phone: {lead.phone}</p>
            <p className="text-sm text-zinc-300">Website: {lead.website}</p>
          </div>

          <button
            type="button"
            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-4 text-base font-semibold text-zinc-950 shadow-lg shadow-emerald-600/25 transition hover:brightness-110"
          >
            Deploy Vercel Site
          </button>

          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold text-zinc-100">AI Deep Research</h2>
            <p className="mt-1 text-xs text-zinc-400">Run a full local intelligence sweep and surface ranking gaps.</p>
            <button
              type="button"
              onClick={runResearch}
              disabled={researchLoading}
              className="mt-4 inline-flex items-center rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-60"
            >
              {researchLoading ? (
                <>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-transparent" />
                  Running...
                </>
              ) : (
                "Run Analysis"
              )}
            </button>
            {researchResult ? <p className="mt-4 text-sm text-zinc-200">{researchResult}</p> : null}
          </div>
        </section>

        <section className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-xl lg:col-span-5">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Dialer</h2>
              <span className="text-xs text-zinc-400">Amazon Connect Softphone</span>
            </div>
            <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-300">Call Target: {lead.phone}</p>
              <p className="mt-2 font-mono text-lg text-zinc-100">00:01:24</p>
              <button type="button" className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950">
                Call
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
            <div className="mb-4 flex gap-2">
              {(["Notes", "SMS", "Email"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveChannelTab(tab)}
                  className={`rounded-md px-3 py-2 text-sm ${
                    activeChannelTab === tab ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-300">
              {activeChannelTab === "Notes" && "Discovery notes: customer response times are praised; conversion flow is weak on mobile."}
              {activeChannelTab === "SMS" && "SMS Draft: Hi! I can launch a faster booking-ready site for your team in 24 hours."}
              {activeChannelTab === "Email" && "Email Draft: Subject: Quick win for your mobile bookings this week."}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold">Calendar Booking</h2>
            <p className="mt-1 text-xs text-zinc-400">Generate a meeting and instant video link for close call follow-up.</p>
            <button
              type="button"
              onClick={bookMeeting}
              disabled={bookingLoading}
              className="mt-4 rounded-lg bg-indigo-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-60"
            >
              {bookingLoading ? "Generating..." : "Book & Generate Meet Link"}
            </button>
            {meetLink ? <p className="mt-3 text-sm text-emerald-300">{meetLink}</p> : null}
          </div>
        </section>

        <section className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-xl lg:col-span-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">AI Playbook</h2>

          <div className="flex gap-2">
            {(["Scripts", "Objections"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActivePlaybookTab(tab)}
                className={`rounded-md px-3 py-2 text-sm ${
                  activePlaybookTab === tab ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activePlaybookTab === "Scripts" ? (
            <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-sm text-zinc-200">
              <p>
                Hey {lead.businessName}, I noticed your customers love your speed, but your site makes it hard to
                book on mobile. I built a faster site for you here: [Vercel Link].
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-sm text-zinc-200">
              <p className="font-medium">Objection: “We already have a website.”</p>
              <p className="mt-2 text-zinc-300">
                Totally fair—this is specifically about conversion speed on mobile. Your current flow leaks emergency
                intent traffic. We can fix that with one optimized booking page.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
