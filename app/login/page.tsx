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
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
      <form className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow" onSubmit={onSubmit}>
        <h1 className="mb-3 text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mb-4 text-sm text-slate-600">Use your username and password to access Felix CRM.</p>
        <input
          className="mb-3 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          required
        />
        <input
          className="mb-3 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          placeholder="Password"
          minLength={8}
          required
        />
        {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}
        <button className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white" disabled={loading} type="submit">
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="mt-4 text-center text-sm text-slate-600">
          Don&apos;t have an account? <Link href="/signup" className="font-medium text-slate-900 underline">Sign up</Link>
        </p>
      </form>
    </main>
  );
}
