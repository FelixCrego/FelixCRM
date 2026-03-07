"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PipelineStage = "New" | "Pitched" | "Awaiting Approval" | "Payment Pending" | "Closed Won" | "No Show";

type Demo = {
  id: string;
  lead_id?: string | null;
  lead_name: string;
  selected_date: string;
  selected_time: string;
  meet_link: string;
};

type LeadApiRecord = {
  id: string;
  businessName?: string | null;
  business_name?: string | null;
  status?: string | null;
  sourcePayload?: Record<string, unknown> | null;
  source_payload?: Record<string, unknown> | null;
};

type PersistedBookedDemo = {
  date?: string;
  time?: string;
  meetLink?: string;
};

const DEMO_CACHE_KEY = "felix:pending-upcoming-demos";
const DEMO_PIPELINE_STATUS_CACHE_KEY = "felix:demo-pipeline-stage-overrides";
const LEAD_ID_FOR_NAME_PREFIX = "lead-for-name:";
const pipelineStageOptions: PipelineStage[] = ["New", "Pitched", "Awaiting Approval", "Payment Pending", "Closed Won", "No Show"];

function isPipelineStage(value: string): value is PipelineStage {
  return pipelineStageOptions.includes(value as PipelineStage);
}

function parseDemoDateTime(date: string, time: string) {
  const normalized = time.trim().match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i);
  if (!normalized) {
    return new Date(`${date}T00:00:00`);
  }

  const rawHour = Number(normalized[1]);
  const minutes = Number(normalized[2]);
  const period = normalized[3].toUpperCase();
  const hours24 = rawHour % 12 + (period === "PM" ? 12 : 0);

  const dateTime = new Date(`${date}T00:00:00`);
  dateTime.setHours(hours24, minutes, 0, 0);
  return dateTime;
}

function formatDateTimeLabel(date: string, time: string) {
  const localDate = new Date(`${date}T00:00:00`);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const isToday = localDate.toDateString() === today.toDateString();
  const isTomorrow = localDate.toDateString() === tomorrow.toDateString();

  const dayLabel = isToday
    ? "Today"
    : isTomorrow
      ? "Tomorrow"
      : localDate.toLocaleDateString("en-US", { weekday: "long" });

  return {
    dateTimeLabel: `${dayLabel}, ${time}`,
    isToday,
  };
}

function isValidDateString(input: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(input);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDemo(value: unknown): Demo | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const selectedDate = typeof raw.selected_date === "string" ? raw.selected_date.trim() : "";
  const selectedTime = typeof raw.selected_time === "string" ? raw.selected_time.trim() : "";
  const meetLink = typeof raw.meet_link === "string" ? raw.meet_link.trim() : "";
  const leadName = typeof raw.lead_name === "string" && raw.lead_name.trim() ? raw.lead_name.trim() : "Unknown Lead";

  if (!selectedDate || !selectedTime || !meetLink || !isValidDateString(selectedDate)) return null;
  if (selectedDate < getTodayKey()) return null;

  const rawLeadId = typeof raw.lead_id === "string" ? raw.lead_id.trim() : "";
  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id
        : `cached-${rawLeadId || leadName}-${selectedDate}-${selectedTime}`,
    lead_id: rawLeadId || null,
    lead_name: leadName,
    selected_date: selectedDate,
    selected_time: selectedTime,
    meet_link: meetLink,
  };
}

function getDemoDedupeKey(demo: Demo) {
  return `${demo.lead_id || demo.lead_name}::${demo.selected_date}::${demo.selected_time}`;
}

function resolveBookedDemoFromLead(lead: LeadApiRecord): Demo | null {
  if ((lead.status || "").toUpperCase() === "CLOSED") return null;

  const sourcePayload = (lead.sourcePayload ?? lead.source_payload ?? {}) as Record<string, unknown>;
  const demoBooking = (sourcePayload.demoBooking ?? sourcePayload.demo_booking ?? null) as PersistedBookedDemo | null;

  if (!demoBooking) return null;

  const date = typeof demoBooking.date === "string" ? demoBooking.date.trim() : "";
  const time = typeof demoBooking.time === "string" ? demoBooking.time.trim() : "";
  const meetLink = typeof demoBooking.meetLink === "string" ? demoBooking.meetLink.trim() : "";

  if (!date || !time || !meetLink || !isValidDateString(date)) return null;
  if (date < getTodayKey()) return null;

  const leadName =
    (typeof lead.businessName === "string" && lead.businessName.trim()) ||
    (typeof lead.business_name === "string" && lead.business_name.trim()) ||
    "Unknown Lead";

  return {
    id: `lead-booking-${lead.id}-${date}-${time}`,
    lead_id: lead.id,
    lead_name: leadName,
    selected_date: date,
    selected_time: time,
    meet_link: meetLink,
  };
}

function saveCachedDemos(demos: Demo[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_CACHE_KEY, JSON.stringify(demos));
}

export default function DemosPage() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [persistedLeadDemos, setPersistedLeadDemos] = useState<Demo[]>([]);
  const [cachedPendingDemos, setCachedPendingDemos] = useState<Demo[]>([]);
  const [pendingDemoFromQuery, setPendingDemoFromQuery] = useState<Demo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pipelineStatusOverrides, setPipelineStatusOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;

    const rawOverrides = window.localStorage.getItem(DEMO_PIPELINE_STATUS_CACHE_KEY);
    if (!rawOverrides) return;

    try {
      const parsed = JSON.parse(rawOverrides) as Record<string, unknown>;
      const normalized = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      );
      setPipelineStatusOverrides(normalized);
    } catch {
      window.localStorage.removeItem(DEMO_PIPELINE_STATUS_CACHE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const rawCached = window.localStorage.getItem(DEMO_CACHE_KEY);
    if (!rawCached) {
      setCachedPendingDemos([]);
      return;
    }

    try {
      const parsed = JSON.parse(rawCached) as unknown;
      const normalized = Array.isArray(parsed) ? parsed.map(normalizeDemo).filter((demo): demo is Demo => Boolean(demo)) : [];
      setCachedPendingDemos(normalized);
      saveCachedDemos(normalized);
    } catch {
      setCachedPendingDemos([]);
      window.localStorage.removeItem(DEMO_CACHE_KEY);
    }
  }, []);

  useEffect(() => {
    async function loadDemos() {
      setLoading(true);
      setError("");
      try {
        const [demosResponse, leadsResponse] = await Promise.all([
          fetch("/api/demos", { cache: "no-store" }),
          fetch("/api/leads", { cache: "no-store" }),
        ]);

        const demosPayload = (await demosResponse.json().catch(() => null)) as { demos?: Demo[]; error?: string } | null;
        const leadsPayload = (await leadsResponse.json().catch(() => null)) as { leads?: LeadApiRecord[]; error?: string } | null;

        if (!demosResponse.ok) {
          throw new Error(demosPayload?.error || "Failed to load upcoming demos.");
        }

        if (!leadsResponse.ok) {
          throw new Error(leadsPayload?.error || "Failed to load leads for booked demo tracking.");
        }

        const allLeads = leadsPayload?.leads ?? [];
        const closedLeadIds = new Set(allLeads.filter((lead) => (lead.status || "").toUpperCase() === "CLOSED").map((lead) => lead.id));

        setDemos(demosPayload?.demos ?? []);
        setPersistedLeadDemos(allLeads.map(resolveBookedDemoFromLead).filter((demo): demo is Demo => Boolean(demo)));
        setCachedPendingDemos((previous) => {
          const nextCached = previous.filter((demo) => {
            if (demo.selected_date < getTodayKey()) return false;
            if (demo.lead_id && closedLeadIds.has(demo.lead_id)) return false;
            return true;
          });
          saveCachedDemos(nextCached);
          return nextCached;
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load upcoming demos.");
        setDemos([]);
        setPersistedLeadDemos([]);
      } finally {
        setLoading(false);
      }
    }

    loadDemos().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const date = params.get("date")?.trim() || "";
    const time = params.get("time")?.trim() || "";
    const meetLink = params.get("meetLink")?.trim() || "";

    if (!date || !time || !meetLink || !isValidDateString(date) || date < getTodayKey()) {
      setPendingDemoFromQuery(null);
      return;
    }

    const nextPending: Demo = {
      id: `pending-${params.get("leadId") || "demo"}-${date}-${time}`,
      lead_id: params.get("leadId") || null,
      lead_name: params.get("leadName")?.trim() || "Unknown Lead",
      selected_date: date,
      selected_time: time,
      meet_link: meetLink,
    };

    setPendingDemoFromQuery(nextPending);
    setCachedPendingDemos((previous) => {
      const map = new Map<string, Demo>();
      for (const demo of previous) {
        map.set(getDemoDedupeKey(demo), demo);
      }
      map.set(getDemoDedupeKey(nextPending), nextPending);
      const nextCached = [...map.values()];
      saveCachedDemos(nextCached);
      return nextCached;
    });
  }, []);

  const demosWithMeta = useMemo(() => {
    const combined = [...cachedPendingDemos, ...(pendingDemoFromQuery ? [pendingDemoFromQuery] : []), ...demos, ...persistedLeadDemos];

    const dedupedBySlot = new Map<string, Demo>();
    for (const demo of combined) {
      if (demo.selected_date < getTodayKey()) continue;
      const dedupeKey = getDemoDedupeKey(demo);
      dedupedBySlot.set(dedupeKey, demo);
    }

    return [...dedupedBySlot.values()]
      .map((demo) => {
        const scheduledAt = parseDemoDateTime(demo.selected_date, demo.selected_time);
        return {
          ...demo,
          scheduledAt,
          ...formatDateTimeLabel(demo.selected_date, demo.selected_time),
        };
      })
      .sort((firstDemo, secondDemo) => firstDemo.scheduledAt.getTime() - secondDemo.scheduledAt.getTime());
  }, [cachedPendingDemos, demos, pendingDemoFromQuery, persistedLeadDemos]);


  const getSelectedPipelineStage = (demo: Demo) => {
    const byLeadId = demo.lead_id ? pipelineStatusOverrides[demo.lead_id] : undefined;
    const byName = pipelineStatusOverrides[`name:${demo.lead_name.trim().toLowerCase()}`];
    if (byLeadId && isPipelineStage(byLeadId)) return byLeadId;
    if (byName && isPipelineStage(byName)) return byName;
    return "New";
  };

  const setLeadPipelineStatus = (leadId: string | null | undefined, leadName: string, stage: PipelineStage) => {
    const next = {
      ...pipelineStatusOverrides,
      ...(leadId ? { [leadId]: stage } : {}),
      [`name:${leadName.trim().toLowerCase()}`]: stage,
      ...(leadId ? { [`${LEAD_ID_FOR_NAME_PREFIX}${leadName.trim().toLowerCase()}`]: leadId } : {}),
    };
    setPipelineStatusOverrides(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEMO_PIPELINE_STATUS_CACHE_KEY, JSON.stringify(next));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Agenda Hub</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-50">Upcoming Demos</h1>
          <p className="mt-2 text-sm text-zinc-400">Manage your scheduled Vercel deployments and sales presentations.</p>
        </header>

        {loading ? <p className="text-sm text-zinc-400">Loading upcoming demos...</p> : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <section className="space-y-3">
          {!loading && !error && demosWithMeta.length === 0 ? (
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
              No upcoming demos found for your account.
            </article>
          ) : null}

          {demosWithMeta.map((demo) => (
            <article
              key={demo.id}
              className={`rounded-2xl border bg-zinc-900/60 p-4 shadow-[0_8px_35px_rgba(0,0,0,0.25)] backdrop-blur ${
                demo.isToday ? "border-emerald-500/60" : "border-zinc-800"
              }`}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px_320px] lg:items-center">
                <div className="flex items-start gap-4">
                  <div className="min-w-36 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">{demo.dateTimeLabel}</div>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-100">{demo.lead_name}</h2>
                    {demo.isToday ? (
                      <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                        Happening today
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-zinc-900 to-zinc-950 p-3 shadow-[0_10px_25px_rgba(79,70,229,0.15)]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300">Pipeline sync</p>
                  <label className="mt-2 block text-left text-xs text-zinc-300">
                    Demo Status
                    <select
                      value={getSelectedPipelineStage(demo)}
                      onChange={(event) => setLeadPipelineStatus(demo.lead_id, demo.lead_name, event.target.value as PipelineStage)}
                      className="mt-1.5 w-full rounded-lg border border-indigo-400/40 bg-zinc-950/90 px-3 py-2 text-sm font-medium text-zinc-100 outline-none ring-indigo-400/40 transition focus:ring-2"
                    >
                      {pipelineStageOptions.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex w-full flex-col items-end gap-2 self-end lg:w-auto lg:self-auto">
                  {demo.lead_id ? (
                    <Link
                      href={`/leads/${demo.lead_id}`}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-5 py-2.5 text-center text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
                    >
                      Open Lead
                    </Link>
                  ) : null}
                  <a
                    href={demo.meet_link.startsWith("http") ? demo.meet_link : `https://${demo.meet_link}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full rounded-lg bg-indigo-600 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-indigo-700"
                  >
                    Launch Workspace &amp; Meet
                  </a>
                  <p className="text-xs text-zinc-400">Opens the Google Meet link for this scheduled demo.</p>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
