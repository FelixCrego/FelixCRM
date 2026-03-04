"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Copy, Globe, Link2, Phone, RotateCcw } from "lucide-react";
import { useAmazonConnect } from "@/components/amazon-connect-provider";

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
type ExecutionLeadStatus = "New" | "Pitched" | "Awaiting Approval" | "Payment Pending" | "Closed Won";

const FALLBACK_LEAD: LeadRecord = {
  id: "fallback-lead",
  business_name: "Demo Business",
  status: "New",
  phone: "No phone on file",
  website: "No website on file",
  city: "Unknown location",
  email: "No email on file",
  deployed_url: "",
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

export default function LeadExecutionPage() {
  const params = useParams<{ id?: string | string[] }>();
  const leadId = useMemo(() => {
    const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
    return typeof rawId === "string" ? rawId.trim() : "";
  }, [params]);

  const [status, setStatus] = useState<FetchStatus>("loading");
  const [lead, setLead] = useState<LeadRecord | null>(null);

  const [researchLoading, setResearchLoading] = useState(false);
  const [researchInsight, setResearchInsight] = useState<string>("");

  const [omniTab, setOmniTab] = useState<OmniTab>("Notes");
  const [scriptTab, setScriptTab] = useState<ScriptTab>("Scripts");

  const { callActive, callSeconds, ccpReady, connectionStatus, callStatus, endActiveCall } = useAmazonConnect();
  const [dialNumber, setDialNumber] = useState("");

  const [selectedMeetingDay, setSelectedMeetingDay] = useState("");
  const [selectedMeetingTime, setSelectedMeetingTime] = useState("");
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingLink, setMeetingLink] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);

  const [leadExecutionStatus, setLeadExecutionStatus] = useState<ExecutionLeadStatus>("New");
  const [checkoutAmount, setCheckoutAmount] = useState(500);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutLink, setCheckoutLink] = useState("");
  const [checkoutLinkCopied, setCheckoutLinkCopied] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);


  useEffect(() => {
    let alive = true;

    async function loadLead() {
      setStatus("loading");

      try {
        if (!leadId) {
          setLead(FALLBACK_LEAD);
          setLeadExecutionStatus("New");
          setStatus("ready");
          return;
        }

        const supabase = createClientComponentClient();
        const { data } = await supabase.from("leads").select("*").eq("id", leadId).single();

        if (!alive) return;

        if (data) {
          setLead(data);
          const resolvedStatus = data.status as ExecutionLeadStatus | undefined;
          if (
            resolvedStatus === "New" ||
            resolvedStatus === "Pitched" ||
            resolvedStatus === "Awaiting Approval" ||
            resolvedStatus === "Payment Pending" ||
            resolvedStatus === "Closed Won"
          ) {
            setLeadExecutionStatus(resolvedStatus);
          }

          setStatus("ready");
          return;
        }
      } catch {
        // Fall back silently for any fetch error.
      }

      if (!alive) return;

      setLead(FALLBACK_LEAD);
      setLeadExecutionStatus("New");
      setStatus("ready");
    }

    loadLead();

    return () => {
      alive = false;
    };
  }, [leadId]);

  const leadName = lead?.business_name || lead?.businessName || "Unknown Business";
  const leadPhone = lead?.phone || "No phone on file";

  useEffect(() => {
    setDialNumber(lead?.phone || "");
  }, [lead?.phone]);
  const leadWebsite = lead?.website || lead?.website_url || lead?.websiteUrl || "No website on file";
  const deployedUrl = lead?.deployed_url || lead?.deployedUrl || "";

  async function runResearch() {
    setResearchLoading(true);
    setResearchInsight("");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setResearchInsight("Analyzed 14 Google Reviews. Weakness: No mobile booking.");
    setResearchLoading(false);
  }

  async function generateMeetingLink() {
    setMeetingLoading(true);
    setInviteCopied(false);
    setMeetingLink("");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setMeetingLink("meet.google.com/abc-defg-hij");
    setMeetingLoading(false);
  }

  async function copyInviteText() {
    if (!meetingLink) return;
    const dayLabel = leadDayOptions.find((day) => day.value === selectedMeetingDay)?.label || selectedMeetingDay;
    const inviteText = `Demo booked for ${leadName} on ${dayLabel} at ${selectedMeetingTime} (${leadTimeZone}). Join here: ${meetingLink}`;

    try {
      await navigator.clipboard.writeText(inviteText);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setInviteCopied(false);
    }
  }

  async function handleCheckoutAction() {
    setCheckoutLoading(true);
    setCheckoutLinkCopied(false);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (checkoutAmount >= 500) {
      setApprovalPending(false);
      setCheckoutLink("buy.stripe.com/test_123");
      setLeadExecutionStatus("Payment Pending");
      setCheckoutLoading(false);
      return;
    }

    setCheckoutLink("");
    setApprovalPending(true);
    setLeadExecutionStatus("Awaiting Approval");
    setCheckoutLoading(false);
  }

  async function copyCheckoutLink() {
    if (!checkoutLink) return;

    try {
      await navigator.clipboard.writeText(checkoutLink);
      setCheckoutLinkCopied(true);
      window.setTimeout(() => setCheckoutLinkCopied(false), 1400);
    } catch {
      setCheckoutLinkCopied(false);
    }
  }

  const formattedTimer = `${String(Math.floor(callSeconds / 60)).padStart(2, "0")}:${String(callSeconds % 60).padStart(2, "0")}`;

  const handleCall = () => {
    if (typeof window === "undefined" || !("connect" in window) || !window.connect) return;

    const sourceNumber = dialNumber || leadPhone;
    const digitsOnly = sourceNumber.replace(/\D/g, "");
    if (!digitsOnly) return;

    const formattedNumber = digitsOnly.startsWith("1") ? `+${digitsOnly}` : `+1${digitsOnly}`;

    window.connect.agent(function (agent) {
      const endpoint = window.connect.Endpoint.byPhoneNumber(formattedNumber);
      agent.connect(endpoint, {
        success: function () {
          console.log("Call initiated successfully to", formattedNumber);
        },
        failure: function (err: unknown) {
          console.error("Call failed to initiate:", err);
        },
      });
    });
  };

  const softphoneStatusLabel =
    connectionStatus === "loading"
      ? "Loading AWS Streams…"
      : connectionStatus === "initializing"
        ? "Initializing CCP…"
        : connectionStatus === "error"
          ? "CCP initialization failed"
          : callStatus === "connecting"
            ? "Connecting call…"
            : callStatus === "connected"
              ? `Live ${formattedTimer}`
              : "Softphone ready";

  const softphoneStatusTone =
    connectionStatus === "error"
      ? "text-rose-300"
      : connectionStatus === "ready"
        ? "text-emerald-300"
        : "text-amber-300";

  const canStartCall = ccpReady && connectionStatus === "ready" && callStatus !== "connecting";

  const leadTimeZone = "America/Los_Angeles";
  const repTimeZone = "America/New_York";

  const leadDayOptions = useMemo(() => {
    const now = new Date();

    return [0, 1, 2, 3].map((offset) => {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);

      const shortLabel = date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      const fullLabel =
        offset === 0 ? `Today, ${shortLabel}` : offset === 1 ? `Tomorrow, ${shortLabel}` : shortLabel;

      return {
        value: date.toISOString().slice(0, 10),
        label: fullLabel,
      };
    });
  }, []);

  const leadTimeSlots = ["09:00 AM", "11:30 AM", "02:00 PM", "03:30 PM", "05:00 PM", "06:30 PM"];

  const leadLocalTimeText = useMemo(
    () =>
      new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: leadTimeZone,
        timeZoneName: "short",
      }),
    [],
  );

  const repLocalTimeText = useMemo(
    () =>
      new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: repTimeZone,
        timeZoneName: "short",
      }),
    [],
  );

  if (status === "loading") return <LeadWorkspaceSkeleton />;

  if (!lead) return <LeadWorkspaceSkeleton />;

  const leadEmail = lead?.email || "No email on file";
  const leadLocation = lead?.city || "Unknown location";

  return (
    <div className="min-h-screen bg-zinc-950 p-4 text-zinc-100 lg:p-6">
      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Lead Context</p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight text-zinc-100">{leadName}</h1>
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-zinc-500">Execution target: {leadWebsite}</p>
            <span className="mt-3 inline-flex rounded-full border border-indigo-400/30 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-200">
              {leadExecutionStatus}
            </span>
          </div>

          <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-zinc-400">📞</span>
              <span>{leadPhone}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-zinc-400">✉️</span>
              <span>{leadEmail}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-zinc-400">📍</span>
              <span>{leadLocation}</span>
            </div>
          </div>

          <a
            href={deployedUrl}
            target="_blank"
            rel="noreferrer"
            className="group block rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 p-4 shadow-lg shadow-indigo-900/40 transition hover:scale-[1.01]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Deploy Vercel Site</p>
                <p className="mt-1 text-xs text-indigo-100/90">Push this lead from conversation to live site with one click.</p>
              </div>
              <span className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-sm text-white">🚀</span>
            </div>
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
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Amazon Connect • Softphone</h2>
              <span className={`text-xs ${softphoneStatusTone}`}>{softphoneStatusLabel}</span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-950 p-3">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <span>{ccpReady ? "Softphone connected •" : "Softphone offline •"}</span>
                <input
                  type="tel"
                  value={dialNumber}
                  onChange={(event) => setDialNumber(event.target.value)}
                  className="w-32 border-b border-dashed border-zinc-600 bg-transparent px-1 text-zinc-100 focus:border-indigo-500 focus:outline-none"
                  placeholder={leadPhone}
                />
                <button
                  onClick={() => setDialNumber(lead?.phone || "")}
                  className="rounded-md border border-zinc-700 p-1 text-zinc-400 transition hover:text-zinc-200"
                  aria-label="Reset dial number"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
              {callActive ? (
                <button
                  onClick={endActiveCall}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-rose-950 hover:bg-rose-400"
                >
                  <Phone className="h-4 w-4" /> End Call
                </button>
              ) : (
                <button
                  onClick={handleCall}
                  disabled={!canStartCall}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
                >
                  <Phone className="h-4 w-4" /> {callStatus === "connecting" ? "Connecting…" : "Call"}
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-300">
                <p className="text-zinc-500">Queue</p>
                <p className="mt-1 font-semibold text-zinc-100">{callStatus === "connecting" ? "Dialing…" : "—"}</p>
              </div>
              <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-300">
                <p className="text-zinc-500">Call Timer</p>
                <p className="mt-1 font-semibold text-zinc-100">{callActive ? formattedTimer : "00:00"}</p>
              </div>
              <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-300">
                <p className="text-zinc-500">Rep</p>
                <p className={`mt-1 font-semibold ${ccpReady ? "text-emerald-300" : "text-zinc-400"}`}>{ccpReady ? "Online" : "Offline"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <div className="mb-3 flex gap-4 border-b border-zinc-800 pb-2">
              {(["Notes", "SMS", "Email"] as OmniTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setOmniTab(tab)}
                  className={`relative px-1 pb-1 text-xs font-medium transition ${omniTab === tab ? "text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  {tab}
                  {omniTab === tab ? <span className="absolute inset-x-0 -bottom-[9px] h-0.5 rounded bg-blue-500" /> : null}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Today • 09:41</p>
                <p className="mt-1">Owner asked to prioritize speed and mobile booking flow before launch.</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Today • 10:12</p>
                <p className="mt-1">Confirmed follow-up after previewing the live Vercel draft.</p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 p-2">
              <button className="rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">AI draft</button>
              <input
                className="h-9 flex-1 bg-transparent px-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder={`Draft ${omniTab} content for ${leadName}...`}
              />
              <button className="rounded-md bg-indigo-500 px-4 py-2 text-xs font-semibold text-white">Send</button>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold">Smart Scheduling Hub</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-300">
              <Globe className="h-3.5 w-3.5 text-zinc-500" />
              <span>Lead Local Time: {leadLocalTimeText} • Los Angeles, CA</span>
              <span className="text-zinc-500">(Your Time: {repLocalTimeText})</span>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Select Day</p>
              <div className="flex flex-wrap gap-2">
                {leadDayOptions.map((day) => {
                  const isActive = selectedMeetingDay === day.value;

                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => {
                        setSelectedMeetingDay(day.value);
                        setMeetingLink("");
                      }}
                      className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                        isActive
                          ? "border-zinc-600 bg-zinc-700 text-white"
                          : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Available Times ({leadTimeZone})</p>
              <div className="grid grid-cols-3 gap-2">
                {leadTimeSlots.map((slot) => {
                  const isActive = selectedMeetingTime === slot;

                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => {
                        setSelectedMeetingTime(slot);
                        setMeetingLink("");
                      }}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                        isActive
                          ? "border-indigo-500 bg-indigo-600/20 text-indigo-400"
                          : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={generateMeetingLink}
              disabled={meetingLoading || !selectedMeetingDay || !selectedMeetingTime}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                meetingLink ? "bg-emerald-600 text-white" : "bg-indigo-500 text-white"
              }`}
            >
              {meetingLoading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                  Booking...
                </>
              ) : meetingLink ? (
                `Demo Booked! • ${meetingLink}`
              ) : (
                "Book & Generate Meet Link"
              )}
            </button>
            {meetingLink ? (
              <div className="mt-3">
                <button
                  onClick={copyInviteText}
                  className="rounded-lg border border-zinc-700 bg-transparent px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                >
                  {inviteCopied ? "Invite Copied" : "Copy Invite Text"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold">Checkout &amp; Payments</h2>
            <p className="mt-1 text-xs text-zinc-500">Generate a Stripe checkout link instantly, or route sub-$500 deals for manager approval.</p>

            <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950 p-3">
              <label className="text-xs uppercase tracking-wide text-zinc-500">Deal Price</label>
              <div className="mt-2 flex items-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 focus-within:border-zinc-500">
                <span className="text-sm text-zinc-400">$</span>
                <input
                  type="number"
                  min={0}
                  disabled={approvalPending}
                  value={checkoutAmount}
                  onChange={(event) => {
                    const amount = Number(event.target.value);
                    setCheckoutAmount(Number.isFinite(amount) ? amount : 0);
                    setCheckoutLink("");
                    setApprovalPending(false);
                  }}
                  className="h-10 w-full bg-transparent px-2 text-sm text-zinc-100 outline-none disabled:cursor-not-allowed disabled:text-zinc-500"
                  placeholder="500"
                />
              </div>
            </div>

            <button
              onClick={handleCheckoutAction}
              disabled={checkoutLoading || approvalPending}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60 ${
                checkoutAmount >= 500 ? "bg-indigo-600 hover:bg-indigo-500" : "bg-amber-600 hover:bg-amber-500"
              }`}
            >
              {checkoutLoading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                  Processing...
                </>
              ) : checkoutAmount >= 500 ? (
                "Generate Stripe Link"
              ) : (
                "Request Manager Approval"
              )}
            </button>

            {checkoutLink ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                <div className="flex items-center gap-2 truncate">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{checkoutLink}</span>
                </div>
                <button
                  onClick={copyCheckoutLink}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300/30 px-2 py-1 text-[11px] font-semibold hover:bg-emerald-500/20"
                >
                  {checkoutLinkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {checkoutLinkCopied ? "Copied" : "Copy Link"}
                </button>
              </div>
            ) : null}

            {approvalPending ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200">
                <Link2 className="h-3.5 w-3.5" />
                Approval pending from Manager...
              </div>
            ) : null}
          </div>
        </section>

        <section className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-4">
          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
                <span>🧠</span>
                Dynamic AI Playbook
              </h2>
              <div className="flex gap-2">
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
            </div>

            {scriptTab === "Scripts" ? (
              <div className="space-y-3 text-sm text-zinc-200">
                <h3 className="text-sm font-semibold text-zinc-100">Context-Aware Script</h3>
                <p className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                  Hey {leadName}, I noticed your site makes it hard to book on mobile. I built a faster site for you here: {deployedUrl}.
                </p>
                <p className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                  We can launch this today and route calls directly into your booking flow.
                </p>
                <span className="inline-flex rounded-md border border-zinc-600 px-2 py-1 text-[11px] text-zinc-300">
                  Injected data: Google Reviews + Vercel Link + mobile booking gap
                </span>
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
