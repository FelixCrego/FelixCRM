"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(payload.error ?? "Unable to sign up.");
      setLoading(false);
      return;
    }

    if (payload.requiresEmailConfirmation) {
      setMessage("Account created. Check your inbox to confirm your email, then sign in.");
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),transparent_45%),radial-gradient(circle_at_80%_80%,_rgba(147,51,234,0.2),transparent_45%)]" />

      <form
        className="relative w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900/80 p-7 shadow-2xl shadow-black/30 backdrop-blur"
        onSubmit={onSubmit}
      >
        <p className="mb-2 inline-flex rounded-full border border-blue-400/40 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
          Welcome to Felix CRM
        </p>
        <h1 className="mb-2 text-2xl font-semibold text-white">Create account</h1>
        <p className="mb-6 text-sm text-zinc-300">Create a username and password to start managing leads faster.</p>

        <label className="mb-2 block text-sm font-medium text-zinc-200">Email</label>
        <input
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="you@company.com"
          autoComplete="username"
          required
        />

        <label className="mb-2 block text-sm font-medium text-zinc-200">Password</label>
        <input
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
        />

        {error ? <p className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
        {message ? (
          <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</p>
        ) : null}

        <button
          className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:from-blue-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={loading}
          type="submit"
        >
          {loading ? "Creating account..." : "Sign up"}
        </button>

        <p className="mt-5 text-center text-sm text-zinc-300">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-white underline decoration-blue-400/70 underline-offset-2">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
