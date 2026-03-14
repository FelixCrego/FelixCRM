"use client";

import { FormEvent, useEffect, useState } from "react";

type Job = {
  id: string;
  title: string;
  description: string;
  department?: string | null;
  status: "open" | "closed";
};

export default function PublicApplyPage({ params }: { params: { job_id: string } }) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    resumeUrl: "",
    linkedinUrl: "",
  });

  useEffect(() => {
    let isActive = true;

    async function loadJob() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/public/jobs/${params.job_id}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { job?: Job; error?: string } | null;

        if (!isActive) return;

        if (!response.ok || !payload?.job) {
          setError(payload?.error || "Job not found.");
          setJob(null);
          return;
        }

        setJob(payload.job);
      } catch {
        if (!isActive) return;
        setError("Unable to load this job posting right now.");
      } finally {
        if (isActive) setLoading(false);
      }
    }

    void loadJob();

    return () => {
      isActive = false;
    };
  }, [params.job_id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/public/jobs/${params.job_id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error || "Unable to submit application.");
        return;
      }

      setSuccess("Application submitted successfully. We will be in touch soon.");
      setForm({ name: "", email: "", phone: "", resumeUrl: "", linkedinUrl: "" });
    } catch {
      setError("Unable to submit application right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 text-zinc-100">
      {loading ? <p className="text-zinc-400">Loading job...</p> : null}
      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}

      {job ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Public Application</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{job.title}</h1>
            {job.department ? <p className="mt-1 text-sm text-zinc-400">Department: {job.department}</p> : null}
            <p className="mt-4 whitespace-pre-wrap text-zinc-200">{job.description}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.14em] text-zinc-500">Status: {job.status}</p>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-xl font-semibold text-white">Apply for this role</h2>
            <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Full Name"
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
                required
              />
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Email Address"
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
                required
              />
              <input
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="Phone Number"
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <input
                value={form.resumeUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, resumeUrl: event.target.value }))}
                placeholder="Resume URL"
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <input
                value={form.linkedinUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, linkedinUrl: event.target.value }))}
                placeholder="LinkedIn URL"
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={submitting || job.status !== "open"}
                className="mt-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting..." : job.status === "open" ? "Submit Application" : "Applications Closed"}
              </button>
            </form>
            {success ? <p className="mt-3 text-sm text-emerald-300">{success}</p> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
