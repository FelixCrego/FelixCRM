"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("felix@felixcrego.com");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to send reset email.");
      setMessage("Reset email sent. Check your inbox and spam folder.");
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : "Unable to send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.22),transparent_42%),radial-gradient(circle_at_85%_80%,_rgba(99,102,241,0.22),transparent_48%)]" />
      <form className="relative w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900/80 p-7 shadow-2xl shadow-black/30 backdrop-blur" onSubmit={onSubmit}>
        <p className="mb-2 inline-flex rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">Account recovery</p>
        <h1 className="mb-2 text-2xl font-semibold text-white">Reset your password</h1>
        <p className="mb-6 text-sm text-zinc-300">We will email you a secure password-reset link.</p>

        <label className="mb-2 block text-sm font-medium text-zinc-200">Email</label>
        <input className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />

        {error ? <p className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
        {message ? <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}

        <button className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70" disabled={loading} type="submit">
          {loading ? "Sending reset email..." : "Send reset email"}
        </button>
        <Link href="/login" className="mt-4 block text-center text-sm text-cyan-300 hover:text-cyan-200">Back to sign in</Link>
      </form>
    </main>
  );
}
