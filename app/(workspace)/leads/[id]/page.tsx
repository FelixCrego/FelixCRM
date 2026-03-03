"use client";

import { useEffect, useMemo, useState } from "react";

type LeadExecutionPageProps = {
  params: {
    id?: string;
  };
};

type LeadRecord = {
  id: string;
  business_name?: string | null;
  businessName?: string | null;
  status?: string | null;
  phone?: string | null;
  website?: string | null;
  website_url?: string | null;
  websiteUrl?: string | null;
  city?: string | null;
  business_type?: string | null;
  businessType?: string | null;
  email?: string | null;
  deployed_url?: string | null;
  deployedUrl?: string | null;
};

type SupabaseResult<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

type FetchStatus = "loading" | "ready" | "error";
type OmniTab = "Notes" | "SMS" | "Email";
type ScriptTab = "Scripts" | "Objections";

const FALLBACK_LEAD: LeadRecord = {
  id: "1",
  businessName: "Eustis Garage Door Repair",
  phone: "(352) 845-1524",
  website: "MISSING",
  status: "In Progress",
};

function createClientComponentClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async single(): Promise<SupabaseResult<LeadRecord>> {
                  if (!url || !key) {
                    return {
                      data: null,
                      error: { message: "Missing Supabase environment variables.", code: "ENV_MISSING" },
                    };
                  }

                  const query = new URL(`${url}/rest/v1/${table}`);
                  query.searchParams.set(column, `eq.${value}`);
                  query.searchParams.set("select", "*");
                  query.searchParams.set("limit", "1");

                  try {
                    const response = await fetch(query.toString(), {
                      headers: {
                        apikey: key,
                        Authorization: `Bearer ${key}`,
                        Accept: "application/json",
                      },
                    });

                    const payload = await response.json().catch(() => null);

                    if (!response.ok) {
                      const message =
                        (payload && typeof payload.message === "string" && payload.message) ||
                        (payload && typeof payload.error === "string" && payload.error) ||
                        `Supabase request failed (${response.status}).`;

                      return {
                        data: null,
                        error: {
                          message,
                          code: payload && typeof payload.code === "string" ? payload.code : `${response.status}`,
                        },
                      };
                    }

                    if (!Array.isArray(payload) || payload.length === 0) {
                      return {
                        data: null,
                        error: { message: "No lead found for this ID.", code: "PGRST116" },
                      };
                    }

                    return {
                      data: payload[0] as LeadRecord,
                      error: null,
                    };
                  } catch {
                    return {
                      data: null,
                      error: { message: "Network error while contacting Supabase.", code: "NETWORK_ERROR" },
                    };
                  }
                },
              };
            },
          };
        },
      };
    },
  };
}

function LeadWorkspaceSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="grid grid-cols-12 gap-4 animate-pulse">
        <div className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-3">
          <div className="h-7 w-3/4 rounded bg-zinc-800" />
          <div className="h-4 w-2/3 rounded bg-zinc-800" />
          <div className="h-4 w-4/5 rounded bg-zinc-800" />
          <div className="h-14 w-full rounded-xl bg-zinc-800" />
          <div className="h-44 w-full rounded-xl bg-zinc-800" />
        </div>
        <div className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-5">
          <div className="h-40 w-full rounded-xl bg-zinc-800" />
          <div className="h-12 w-full rounded-xl bg-zinc-800" />
          <div className="h-48 w-full rounded-xl bg-zinc-800" />
        </div>
        <div className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-4">
          <div className="h-12 w-full rounded-xl bg-zinc-800" />
          <div className="h-56 w-full rounded-xl bg-zinc-800" />
          <div className="h-36 w-full rounded-xl bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

export default function LeadExecutionPage({ params }: LeadExecutionPageProps) {
  const leadId = useMemo(() => params?.id?.trim() ?? "", [params?.id]);

  const [status, setStatus] = useState<FetchStatus>("loading");
  const [lead, setLead] = useState<LeadRecord | null>(null);

  const [researchLoading, setResearchLoading] = useState(false);
  const [researchInsight, setResearchInsight] = useState<string>("");

  const [omniTab, setOmniTab] = useState<OmniTab>("Notes");
  const [scriptTab, setScriptTab] = useState<ScriptTab>("Scripts");

  const [callActive, setCallActive] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingLink, setMeetingLink] = useState("");

  useEffect(() => {
    if (!callActive) return;

    const id = window.setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(id);
  }, [callActive]);

  useEffect(() => {
    let alive = true;

    async function loadLead() {
      if (!leadId) {
        setLead(FALLBACK_LEAD);
        setStatus("ready");
        return;
      }

      setStatus("loading");
      const supabase = createClientComponentClient();
      const { data } = await supabase.from("leads").select("*").eq("id", leadId).single();

      if (!alive) return;

      if (data) {
        setLead(data);
        setStatus("ready");
        return;
      }

      setLead(FALLBACK_LEAD);
      setStatus("ready");
    }

    loadLead();

    return () => {
      alive = false;
    };
  }, [leadId]);

  const leadName = lead?.business_name || lead?.businessName || "Unknown Business";
  const leadPhone = lead?.phone || "No phone on file";
  const leadWebsite = lead?.website || lead?.website_url || lead?.websiteUrl || "No website on file";
  const deployedUrl = lead?.deployed_url || lead?.deployedUrl || "https://vercel.com/new";

  async function runResearch() {
    setResearchLoading(true);
    setResearchInsight("");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setResearchInsight("Analyzed 14 Google Reviews. Weakness: No mobile booking.");
    setResearchLoading(false);
  }

  async function generateMeetingLink() {
    setMeetingLoading(true);
    setMeetingLink("");
    await new Promise((resolve) => setTimeout(resolve, 1400));
    setMeetingLink("https://meet.google.com/abc-defg");
    setMeetingLoading(false);
  }

  const formattedTimer = `${String(Math.floor(callSeconds / 60)).padStart(2, "0")}:${String(callSeconds % 60).padStart(2, "0")}`;

  if (status === "loading") return <LeadWorkspaceSkeleton />;

  if (!lead) return <LeadWorkspaceSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 p-4 text-zinc-100 lg:p-6">
      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Intelligence</p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight">{leadName}</h1>
            <p className="mt-3 text-sm text-zinc-300">{leadPhone}</p>
            <p className="text-sm text-zinc-400">{leadWebsite}</p>
          </div>

          <a
            href={deployedUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-16 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 text-base font-bold text-zinc-950 shadow-lg shadow-cyan-500/30 transition hover:scale-[1.01]"
          >
            Deploy Vercel Site
          </a>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">AI Deep Research</h2>
              <button
                onClick={runResearch}
                disabled={researchLoading}
                className="rounded-lg border border-zinc-600 px-3 py-1 text-xs transition hover:border-zinc-300 disabled:opacity-50"
              >
                {researchLoading ? "Running..." : "Run Analysis"}
              </button>
            </div>
            <p className="mt-4 min-h-14 text-sm text-zinc-300">
              {researchInsight || "Run analysis to generate localized insights and conversion weaknesses."}
            </p>
          </div>
        </section>

        <section className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-5">
          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Amazon Connect Dialer</h2>
              <span className="text-xs text-zinc-400">{callActive ? `Live ${formattedTimer}` : "Ready"}</span>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-950 p-3">
              <p className="text-sm text-zinc-300">Softphone connected • {leadPhone}</p>
              <button
                onClick={() => {
                  if (!callActive) {
                    setCallSeconds(0);
                    setCallActive(true);
                    return;
                  }
                  setCallActive(false);
                }}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                {callActive ? "End" : "Call"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <div className="mb-3 flex gap-2">
              {(["Notes", "SMS", "Email"] as OmniTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setOmniTab(tab)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium ${omniTab === tab ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <textarea
              className="h-28 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm outline-none focus:border-zinc-400"
              placeholder={`Draft ${omniTab} content for ${leadName}...`}
            />
          </div>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold">Calendar Booking Widget</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <input
                type="date"
                value={meetingDate}
                onChange={(event) => setMeetingDate(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
              <input
                type="time"
                value={meetingTime}
                onChange={(event) => setMeetingTime(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
            </div>
            <button
              onClick={generateMeetingLink}
              disabled={meetingLoading || !meetingDate || !meetingTime}
              className="mt-4 w-full rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {meetingLoading ? "Generating..." : "Book & Generate Meet Link"}
            </button>
            {meetingLink ? <p className="mt-3 text-sm text-emerald-300">{meetingLink}</p> : null}
          </div>
        </section>

        <section className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-4">
          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <div className="mb-4 flex gap-2">
              {(["Scripts", "Objections"] as ScriptTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setScriptTab(tab)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${scriptTab === tab ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {scriptTab === "Scripts" ? (
              <div className="space-y-3 text-sm text-zinc-200">
                <p className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                  Hey {leadName}, I noticed your site makes it hard to book on mobile. I built a faster site for you here: {deployedUrl}.
                </p>
                <p className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                  We can launch this today and route calls directly into your booking flow.
                </p>
              </div>
            ) : (
              <ul className="space-y-3 text-sm text-zinc-300">
                <li className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">“I already have a website.” → Totally fair. This version is tuned for speed-to-booking and mobile conversions.</li>
                <li className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">“Send me details.” → Perfect. I’ll text a preview and hold your deployment slot for 24 hours.</li>
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
