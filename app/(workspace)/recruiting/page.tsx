"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Job = {
  id: string;
  title: string;
  description: string;
  department?: string | null;
  status: "open" | "closed";
  created_at: string;
};

type ApplicantStatus = "New" | "Reviewing" | "Interviewing" | "Hired" | "Rejected";

type Applicant = {
  id: string;
  job_id: string;
  name: string;
  email: string;
  phone?: string | null;
  resume_url?: string | null;
  linkedin_url?: string | null;
  status: ApplicantStatus;
  applied_at: string;
  jobTitle?: string;
};

type CountryInfo = {
  code: string;
  name: string;
  flag: string;
};

type InterviewEvent = {
  id: string;
  title: string;
  start: string;
  meetLink: string;
  attendees: string[];
};

const STATUSES: ApplicantStatus[] = ["New", "Reviewing", "Interviewing", "Hired", "Rejected"];

const ATS_SETUP_ERROR = "Recruiting tables are not installed in Supabase yet.";

const ATS_SETUP_SQL = `-- ATS schema for manager recruiting workflows.
create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null,
  title text not null,
  description text not null,
  department text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists jobs_manager_id_idx on public.jobs (manager_id);
create index if not exists jobs_status_idx on public.jobs (status);

create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  resume_url text,
  linkedin_url text,
  status text not null default 'New' check (status in ('New', 'Reviewing', 'Interviewing', 'Hired', 'Rejected')),
  applied_at timestamptz not null default now()
);

create index if not exists applicants_job_id_idx on public.applicants (job_id);
create index if not exists applicants_status_idx on public.applicants (status);
create index if not exists applicants_applied_at_idx on public.applicants (applied_at desc);`;

export default function RecruitingPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [canViewShared, setCanViewShared] = useState(false);
  const [includeShared, setIncludeShared] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [creatingJob, setCreatingJob] = useState(false);
  const [updatingApplicantId, setUpdatingApplicantId] = useState<string | null>(null);
  const [interviewApplicantId, setInterviewApplicantId] = useState<string | null>(null);
  const [schedulingInterview, setSchedulingInterview] = useState(false);
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("10:00");
  const [interviewTimeZone, setInterviewTimeZone] = useState("America/New_York");
  const [interviewResult, setInterviewResult] = useState("");
  const [scheduledInterviews, setScheduledInterviews] = useState<InterviewEvent[]>([]);
  const [form, setForm] = useState({ title: "", description: "", department: "" });
  const needsAtsSetup = error.includes(ATS_SETUP_ERROR);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const querySuffix = includeShared ? "?includeShared=1" : "";
      const [jobsRes, applicantsRes] = await Promise.all([
        fetch(`/api/jobs${querySuffix}`, { cache: "no-store" }),
        fetch(`/api/applicants${querySuffix}`, { cache: "no-store" }),
      ]);

      const jobsPayload = (await jobsRes.json().catch(() => null)) as { jobs?: Job[]; canViewShared?: boolean; includeShared?: boolean; error?: string } | null;
      const applicantsPayload = (await applicantsRes.json().catch(() => null)) as { applicants?: Applicant[]; canViewShared?: boolean; includeShared?: boolean; error?: string } | null;

      if (!jobsRes.ok) throw new Error(jobsPayload?.error || "Unable to load jobs.");
      if (!applicantsRes.ok) throw new Error(applicantsPayload?.error || "Unable to load applicants.");

      setJobs(Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : []);
      setApplicants(Array.isArray(applicantsPayload?.applicants) ? applicantsPayload.applicants : []);
      setCanViewShared(Boolean(jobsPayload?.canViewShared || applicantsPayload?.canViewShared));
      if (!(jobsPayload?.canViewShared || applicantsPayload?.canViewShared)) {
        setIncludeShared(false);
      }

      const interviewsRes = await fetch("/api/calendar/interview", { cache: "no-store" });
      const interviewsPayload = (await interviewsRes.json().catch(() => null)) as { interviews?: InterviewEvent[]; error?: string } | null;
      if (interviewsRes.ok) {
        setScheduledInterviews(Array.isArray(interviewsPayload?.interviews) ? interviewsPayload.interviews : []);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load recruiting data.");
    } finally {
      setLoading(false);
    }
  }, [includeShared]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCreateJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingJob(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = (await response.json().catch(() => null)) as { job?: Job; error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to create job.");
      }

      if (payload?.job) {
        setJobs((prev) => [payload.job as Job, ...prev]);
      } else {
        await loadData();
      }

      setForm({ title: "", description: "", department: "" });
      setMessage("Job created successfully.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create job.");
    } finally {
      setCreatingJob(false);
    }
  }

  async function updateApplicantStatus(applicantId: string, status: ApplicantStatus) {
    setUpdatingApplicantId(applicantId);
    setError("");

    try {
      const querySuffix = includeShared ? "?includeShared=1" : "";
      const response = await fetch(`/api/applicants/${applicantId}${querySuffix}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Unable to update applicant status.");

      setApplicants((prev) => prev.map((applicant) => (applicant.id === applicantId ? { ...applicant, status } : applicant)));
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to update applicant status.");
    } finally {
      setUpdatingApplicantId(null);
    }
  }

  const groupedApplicants = useMemo(
    () =>
      STATUSES.reduce<Record<ApplicantStatus, Applicant[]>>((acc, status) => {
        acc[status] = applicants.filter((applicant) => applicant.status === status);
        return acc;
      }, { New: [], Reviewing: [], Interviewing: [], Hired: [], Rejected: [] }),
    [applicants],
  );

  async function copyApplicationLink(jobId: string) {
    const link = `${window.location.origin}/apply/${jobId}`;
    await navigator.clipboard.writeText(link);
    setMessage("Application link copied to clipboard.");
  }

  async function copySetupSql() {
    await navigator.clipboard.writeText(ATS_SETUP_SQL);
    setMessage("ATS setup SQL copied. Run it in Supabase SQL Editor, then reload this page.");
  }

  function normalizePhone(phone: string | null | undefined) {
    return (phone || "").replace(/[^\d+]/g, "");
  }

  function countryFlagFromCode(code: string) {
    return code
      .toUpperCase()
      .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
  }

  function inferCountryFromApplicant(applicant: Applicant): CountryInfo | null {
    const phone = normalizePhone(applicant.phone);
    const resumeHint = `${applicant.resume_url || ""} ${applicant.linkedin_url || ""}`.toLowerCase();

    const knownCountries: Array<{ code: string; name: string; matcher: RegExp }> = [
      { code: "NG", name: "Nigeria", matcher: /\bnigeria|lagos|abuja|port-harcourt|ibadan\b/ },
      { code: "PH", name: "Philippines", matcher: /\bphilippines|manila|cebu|davao\b/ },
      { code: "US", name: "United States", matcher: /\bunited-states|usa|us\b/ },
      { code: "GB", name: "United Kingdom", matcher: /\buk|united-kingdom|england|london\b/ },
      { code: "CA", name: "Canada", matcher: /\bcanada|ontario|toronto\b/ },
      { code: "IN", name: "India", matcher: /\bindia|mumbai|delhi|bangalore\b/ },
    ];

    if (phone.startsWith("+234")) {
      return { code: "NG", name: "Nigeria", flag: countryFlagFromCode("NG") };
    }
    if (phone.startsWith("+63")) {
      return { code: "PH", name: "Philippines", flag: countryFlagFromCode("PH") };
    }
    if (phone.startsWith("+1")) {
      return { code: "US", name: "United States", flag: countryFlagFromCode("US") };
    }
    if (phone.startsWith("+44")) {
      return { code: "GB", name: "United Kingdom", flag: countryFlagFromCode("GB") };
    }
    if (phone.startsWith("+91")) {
      return { code: "IN", name: "India", flag: countryFlagFromCode("IN") };
    }

    if (/^(070|071|080|081|090|091)\d{8}$/.test(phone)) {
      return { code: "NG", name: "Nigeria", flag: countryFlagFromCode("NG") };
    }
    if (/^09\d{9}$/.test(phone)) {
      return { code: "PH", name: "Philippines", flag: countryFlagFromCode("PH") };
    }

    const matchedCountry = knownCountries.find((country) => country.matcher.test(resumeHint));
    if (matchedCountry) {
      return {
        code: matchedCountry.code,
        name: matchedCountry.name,
        flag: countryFlagFromCode(matchedCountry.code),
      };
    }

    return null;
  }

  function formatInterviewStart(value: string) {
    if (!value) return "Date unavailable";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function whatsappHref(phone: string | null | undefined, applicantName: string) {
    const normalized = normalizePhone(phone).replace(/^\+/, "");
    if (!normalized) return "";
    return `https://wa.me/${normalized}?text=${encodeURIComponent(`Hi ${applicantName}, this is Felix CRM recruiting following up about your application.`)}`;
  }

  function smsHref(phone: string | null | undefined) {
    const normalized = normalizePhone(phone);
    if (!normalized) return "";
    return `sms:${normalized}`;
  }

  function toTwelveHourTime(value: string) {
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) return "10:00 AM";
    const hours = Number(match[1]);
    const minutes = match[2];
    const period = hours >= 12 ? "PM" : "AM";
    const twelveHour = hours % 12 || 12;
    return `${twelveHour}:${minutes} ${period}`;
  }

  async function scheduleInterview(applicant: Applicant) {
    if (!interviewDate) {
      setError("Choose an interview date first.");
      return;
    }

    setSchedulingInterview(true);
    setError("");
    setInterviewResult("");

    try {
      const response = await fetch("/api/calendar/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: interviewDate,
          time: toTwelveHourTime(interviewTime),
          timeZone: interviewTimeZone,
          applicantName: applicant.name,
          applicantEmail: applicant.email,
          jobTitle: applicant.jobTitle || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { meetLink?: string; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Unable to schedule interview.");

      setInterviewResult(payload?.meetLink ? `Interview scheduled. Meet link: ${payload.meetLink}` : "Interview scheduled.");
      setMessage(`Interview scheduled for ${applicant.name}.`);
      setInterviewApplicantId(null);
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "Unable to schedule interview.");
    } finally {
      setSchedulingInterview(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Manager Recruiting ATS</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Recruiting Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">Create jobs, publish unique application links to external boards, and manage applicants through the hiring pipeline.</p>
        {canViewShared ? (
          <label className="mt-4 inline-flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={includeShared}
              onChange={(event) => setIncludeShared(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-blue-500"
            />
            <span>Show Eliot&apos;s recruiting plus Felix&apos;s posted jobs and applicants</span>
          </label>
        ) : null}
      </section>

      {needsAtsSetup ? (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
          <h2 className="text-lg font-semibold text-amber-100">One-time ATS Setup Required</h2>
          <p className="mt-1 text-sm text-amber-200/90">Run the ATS table SQL in your Supabase project, then refresh this page.</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-amber-100/90">
            <li>Open Supabase → SQL Editor for this project.</li>
            <li>Paste and run the SQL below (or <code>supabase/ats_tables.sql</code>).</li>
            <li>Refresh PostgREST schema cache (or wait ~30s), then click Reload Data.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copySetupSql()}
              className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-300/20"
            >
              Copy ATS SQL
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500"
            >
              Reload Data
            </button>
          </div>
          <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-amber-500/30 bg-zinc-950 p-3 text-xs text-zinc-200">
            {ATS_SETUP_SQL}
          </pre>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold text-white">Create New Job</h2>
          <form onSubmit={handleCreateJob} className="mt-3 grid gap-3">
            <input
              required
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Job title"
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <input
              value={form.department}
              onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))}
              placeholder="Department (optional)"
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <textarea
              required
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={5}
              placeholder="Job description"
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={creatingJob || needsAtsSetup}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingJob ? "Creating..." : "Create Job"}
            </button>
          </form>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold text-white">Open Jobs</h2>
          <div className="mt-3 space-y-2">
            {jobs.length === 0 ? <p className="text-sm text-zinc-400">No jobs yet.</p> : null}
            {jobs.map((job) => (
              <div key={job.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-sm font-semibold text-white">{job.title}</p>
                <p className="text-xs text-zinc-400">{job.department || "General"} • {job.status}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyApplicationLink(job.id)}
                    disabled={job.status !== "open"}
                    className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-200 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Copy Application Link
                  </button>
                  <a href={`/apply/${job.id}`} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-600">
                    View Public Post
                  </a>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {message ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</p> : null}
      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
      {interviewResult ? <p className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">{interviewResult}</p> : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Scheduled Interviews</h2>
            <p className="mt-1 text-sm text-zinc-400">All upcoming interview meetings in one place.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500"
          >
            Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scheduledInterviews.length === 0 ? <p className="text-sm text-zinc-400">No upcoming interviews scheduled yet.</p> : null}
          {scheduledInterviews.map((interview) => (
            <article key={interview.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-sm font-semibold text-white">{interview.title}</p>
              <p className="mt-1 text-xs text-zinc-400">{formatInterviewStart(interview.start)}</p>
              {interview.attendees[0] ? <p className="mt-1 text-xs text-blue-200">{interview.attendees[0]}</p> : null}
              {interview.meetLink ? (
                <a
                  href={interview.meetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-200 transition hover:bg-blue-500/20"
                >
                  Open Meet Link
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-lg font-semibold text-white">Candidate Pipeline</h2>
        {loading ? <p className="mt-2 text-sm text-zinc-400">Loading applicants...</p> : null}

        <div className="mt-4 grid gap-3 xl:grid-cols-5">
          {STATUSES.map((status) => (
            <div key={status} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">{status}</h3>
                <span className="text-xs text-zinc-400">{groupedApplicants[status].length}</span>
              </div>

              <div className="space-y-2">
                {groupedApplicants[status].map((applicant) => {
                  const country = inferCountryFromApplicant(applicant);

                  return (
                  <article key={applicant.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-100">{applicant.name}</p>
                      {country ? (
                        <span
                          title={country.name}
                          aria-label={country.name}
                          className="relative inline-flex min-w-[2.6rem] items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-[10px] font-bold tracking-[0.14em] text-white shadow-[0_0_12px_rgba(59,130,246,0.12)]"
                        >
                          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-lg opacity-35">
                            {country.flag}
                          </span>
                          <span className="relative z-10">{country.code}</span>
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-zinc-400">{applicant.email}</p>
                    {applicant.phone ? <p className="mt-1 text-xs text-zinc-500">{applicant.phone}</p> : null}
                    <p className="mt-1 text-xs text-blue-200">{applicant.jobTitle || "Unknown role"}</p>

                    <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      <a href={`mailto:${encodeURIComponent(applicant.email)}`} className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                        Email
                      </a>
                      {applicant.phone ? (
                        <a href={smsHref(applicant.phone)} className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-200">
                          Text
                        </a>
                      ) : null}
                      {applicant.phone ? (
                        <a href={whatsappHref(applicant.phone, applicant.name)} target="_blank" rel="noreferrer" className="rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] text-green-200">
                          WhatsApp
                        </a>
                      ) : null}
                      {applicant.resume_url ? (
                        <a href={applicant.resume_url} target="_blank" rel="noreferrer" className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
                          Resume
                        </a>
                      ) : null}
                      {applicant.linkedin_url ? (
                        <a href={applicant.linkedin_url} target="_blank" rel="noreferrer" className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
                          LinkedIn
                        </a>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setInterviewApplicantId((current) => (current === applicant.id ? null : applicant.id));
                        setInterviewResult("");
                      }}
                      className="mt-2 w-full rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-200 transition hover:bg-blue-500/20"
                    >
                      Schedule Interview
                    </button>

                    {interviewApplicantId === applicant.id ? (
                      <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-950 p-2">
                        <div className="grid gap-2">
                          <input
                            type="date"
                            value={interviewDate}
                            onChange={(event) => setInterviewDate(event.target.value)}
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none"
                          />
                          <input
                            type="time"
                            value={interviewTime}
                            onChange={(event) => setInterviewTime(event.target.value)}
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none"
                          />
                          <select
                            value={interviewTimeZone}
                            onChange={(event) => setInterviewTimeZone(event.target.value)}
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none"
                          >
                            <option value="America/New_York">Eastern</option>
                            <option value="America/Chicago">Central</option>
                            <option value="America/Denver">Mountain</option>
                            <option value="America/Los_Angeles">Pacific</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => void scheduleInterview(applicant)}
                            disabled={schedulingInterview}
                            className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {schedulingInterview ? "Scheduling..." : "Create Google Meet Interview"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <select
                      value={applicant.status}
                      onChange={(event) => void updateApplicantStatus(applicant.id, event.target.value as ApplicantStatus)}
                      disabled={updatingApplicantId === applicant.id}
                      className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none"
                    >
                      {STATUSES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </article>
                  );
                })}

                {groupedApplicants[status].length === 0 ? <p className="text-xs text-zinc-500">No candidates</p> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
