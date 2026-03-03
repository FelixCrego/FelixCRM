"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Unable to sign in.");
      setLoading(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const nextPath = params.get("next") || "/dashboard";
    window.location.href = nextPath;
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.22),transparent_42%),radial-gradient(circle_at_85%_80%,_rgba(99,102,241,0.22),transparent_48%)]" />

      <form
        className="relative w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900/80 p-7 shadow-2xl shadow-black/30 backdrop-blur"
        onSubmit={onSubmit}
      >
        <p className="mb-2 inline-flex rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">
          Secure login
        </p>
        <h1 className="mb-2 text-2xl font-semibold text-white">Sign in</h1>
        <p className="mb-6 text-sm text-zinc-300">Use your username and password to access your Felix CRM workspace.</p>

        <label className="mb-2 block text-sm font-medium text-zinc-200">Email</label>
        <input
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="you@company.com"
          autoComplete="username"
          required
        />

        <label className="mb-2 block text-sm font-medium text-zinc-200">Password</label>
        <input
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          minLength={8}
          required
        />

        {error ? <p className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

        <button
          className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-900/40 transition hover:from-cyan-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={loading}
          type="submit"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="mt-5 text-center text-sm text-zinc-300">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-white underline decoration-cyan-400/70 underline-offset-2">
            Sign up
          </Link>
        </p>
      </form>
    </main>
  );
}
