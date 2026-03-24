"use client";

import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),transparent_45%),radial-gradient(circle_at_80%_80%,_rgba(147,51,234,0.2),transparent_45%)]" />

      <section className="relative w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900/80 p-7 shadow-2xl shadow-black/30 backdrop-blur">
        <p className="mb-2 inline-flex rounded-full border border-blue-400/40 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
          Approval Required
        </p>
        <h1 className="mb-2 text-2xl font-semibold text-white">New accounts are invite only</h1>
        <p className="mb-6 text-sm text-zinc-300">
          Access to Felix CRM must be approved by Felix before an account is created. If you need access, contact Felix and ask to be invited.
        </p>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Public self-signup is disabled.
        </div>

        <p className="mt-5 text-center text-sm text-zinc-300">
          Already approved?{" "}
          <Link href="/login" className="font-semibold text-white underline decoration-blue-400/70 underline-offset-2">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
