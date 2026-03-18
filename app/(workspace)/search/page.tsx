"use client";

import Link from "next/link";
import { Search, FileText, CalendarDays, Building2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type LeadResult = {
  id: string;
  businessName: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  type: "lead";
};

type NoteResult = {
  id: string;
  leadId: string;
  leadName: string;
  snippet: string;
  type: "note";
};

type DemoResult = {
  id: string;
  leadId: string;
  leadName: string;
  scheduledFor: string;
  type: "demo";
};

type SearchPayload = {
  leads?: LeadResult[];
  notes?: NoteResult[];
  demos?: DemoResult[];
  error?: string;
};

function SectionCard({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-zinc-300">{icon}</div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
            <p className="text-xs text-zinc-500">{count} result{count === 1 ? "" : "s"}</p>
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function GlobalSearchPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<{ leads: LeadResult[]; notes: NoteResult[]; demos: DemoResult[] }>({
    leads: [],
    notes: [],
    demos: [],
  });

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults({ leads: [], notes: [], demos: [] });
      setError("");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/global?q=${encodeURIComponent(normalized)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as SearchPayload | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Search failed.");
        }

        setResults({
          leads: Array.isArray(payload?.leads) ? payload!.leads! : [],
          notes: Array.isArray(payload?.notes) ? payload!.notes! : [],
          demos: Array.isArray(payload?.demos) ? payload!.demos! : [],
        });
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") return;
        setResults({ leads: [], notes: [], demos: [] });
        setError(fetchError instanceof Error ? fetchError.message : "Search failed.");
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  const totalResults = useMemo(
    () => results.leads.length + results.notes.length + results.demos.length,
    [results],
  );

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold text-zinc-100">Global Search</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Search across the CRM for leads, matching note content, and booked demos.
          </p>
        </div>

        <label className="mt-4 flex items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-zinc-400 focus-within:border-zinc-500">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search business name, phone, email, city, note text, or demo lead name"
            className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span>Minimum 2 characters</span>
          {loading ? <span>Searching...</span> : null}
          {!loading && query.trim().length >= 2 ? <span>{totalResults} total results</span> : null}
          {error ? <span className="text-rose-300">{error}</span> : null}
        </div>
      </header>

      {query.trim().length < 2 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-500">
          Start typing to search the CRM.
        </div>
      ) : null}

      {query.trim().length >= 2 && !loading && !error && totalResults === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-500">
          No results found for this search.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Leads" count={results.leads.length} icon={<Building2 className="h-4 w-4" />}>
          <div className="space-y-3">
            {results.leads.map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="block rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 transition hover:border-zinc-600"
              >
                <p className="font-medium text-zinc-100">{lead.businessName}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {[lead.city, lead.phone, lead.email].filter(Boolean).join(" • ") || "Open lead workspace"}
                </p>
              </Link>
            ))}
            {results.leads.length === 0 ? <p className="text-sm text-zinc-500">No lead matches.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Notes" count={results.notes.length} icon={<FileText className="h-4 w-4" />}>
          <div className="space-y-3">
            {results.notes.map((note) => (
              <Link
                key={note.id}
                href={`/leads/${note.leadId}`}
                className="block rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 transition hover:border-zinc-600"
              >
                <p className="font-medium text-zinc-100">{note.leadName}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{note.snippet}</p>
              </Link>
            ))}
            {results.notes.length === 0 ? <p className="text-sm text-zinc-500">No note matches.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Demos" count={results.demos.length} icon={<CalendarDays className="h-4 w-4" />}>
          <div className="space-y-3">
            {results.demos.map((demo) => (
              <Link
                key={demo.id}
                href={`/leads/${demo.leadId}`}
                className="block rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 transition hover:border-zinc-600"
              >
                <p className="font-medium text-zinc-100">{demo.leadName}</p>
                <p className="mt-1 text-xs text-zinc-500">{demo.scheduledFor}</p>
              </Link>
            ))}
            {results.demos.length === 0 ? <p className="text-sm text-zinc-500">No demo matches.</p> : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
