"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Demo = {
  id: string;
  lead_id?: string | null;
  lead_name: string;
  selected_date: string;
  selected_time: string;
  meet_link: string;
};

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

export default function DemosPage() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDemos() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/demos", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { demos?: Demo[]; error?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load upcoming demos.");
        }

        setDemos(payload?.demos ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load upcoming demos.");
        setDemos([]);
      } finally {
        setLoading(false);
      }
    }

    loadDemos().catch(() => undefined);
  }, []);

  const demosWithMeta = useMemo(
    () =>
      demos
        .map((demo) => {
          const scheduledAt = parseDemoDateTime(demo.selected_date, demo.selected_time);
          return {
            ...demo,
            scheduledAt,
            ...formatDateTimeLabel(demo.selected_date, demo.selected_time),
          };
        })
        .sort((firstDemo, secondDemo) => firstDemo.scheduledAt.getTime() - secondDemo.scheduledAt.getTime()),
    [demos],
  );

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
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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

                <div className="flex w-full max-w-sm flex-col items-end gap-2 self-end lg:w-auto lg:self-auto">
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
