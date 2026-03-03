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
      setMessage("Account created. Please confirm your email before signing in.");
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6">
      <form className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow" onSubmit={onSubmit}>
        <h1 className="mb-3 text-xl font-semibold text-slate-900">Create account</h1>
        <p className="mb-4 text-sm text-slate-600">Create a username and password to start using Felix CRM.</p>
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
          placeholder="Password (min 8 characters)"
          minLength={8}
          required
        />
        {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}
        <button className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white" disabled={loading} type="submit">
          {loading ? "Creating account..." : "Sign up"}
        </button>
        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account? <Link href="/login" className="font-medium text-slate-900 underline">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
