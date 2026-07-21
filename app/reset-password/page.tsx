"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("access_token") || "";
    const type = hash.get("type") || "";
    if (token && type === "recovery") {
      setAccessToken(token);
      return;
    }
    setError("This reset link is missing or expired. Request a new one from the login page.");
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!accessToken) {
      setError("This reset link is invalid or expired.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      setError("Password reset is not configured.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.msg || payload?.error_description || payload?.error || "Unable to update password.");
      }
      setMessage("Password updated. Redirecting you to sign in...");
      window.history.replaceState(null, "", "/reset-password");
      window.setTimeout(() => router.push("/login"), 1200);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.22),transparent_42%),radial-gradient(circle_at_85%_80%,_rgba(99,102,241,0.22),transparent_48%)]" />
      <form className="relative w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900/80 p-7 shadow-2xl shadow-black/30 backdrop-blur" onSubmit={onSubmit}>
        <p className="mb-2 inline-flex rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">Secure recovery</p>
        <h1 className="mb-2 text-2xl font-semibold text-white">Set a new password</h1>
        <p className="mb-6 text-sm text-zinc-300">Choose a password with at least 8 characters.</p>

        <label className="mb-2 block text-sm font-medium text-zinc-200">New password</label>
        <input className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30" value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required />

        <label className="mb-2 block text-sm font-medium text-zinc-200">Confirm password</label>
        <input className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={8} required />

        {error ? <p className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
        {message ? <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}

        <button className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70" disabled={loading || !accessToken} type="submit">
          {loading ? "Updating password..." : "Update password"}
        </button>
      </form>
    </main>
  );
}
