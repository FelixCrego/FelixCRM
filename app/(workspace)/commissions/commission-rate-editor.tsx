"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type CommissionRateRow = {
  id: string;
  name: string;
  email: string | null;
  commissionRate: number | null;
};

export default function CommissionRateEditor({ initialUsers }: { initialUsers: CommissionRateRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(
    initialUsers.map((row) => ({
      ...row,
      draftRate: row.commissionRate === null ? "" : String(Math.round(row.commissionRate * 100)),
      saving: false,
      error: "",
    })),
  );
  const [isPending, startTransition] = useTransition();

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );

  const saveRow = async (userId: string) => {
    const target = rows.find((row) => row.id === userId);
    if (!target) return;

    const draft = target.draftRate.trim();
    const nextRate = draft === "" ? null : Number(draft) / 100;
    const parsedRate = nextRate ?? 0;
    if (draft !== "" && (!Number.isFinite(parsedRate) || parsedRate < 0)) {
      setRows((previous) => previous.map((row) => (row.id === userId ? { ...row, error: "Enter a valid percent." } : row)));
      return;
    }

    setRows((previous) => previous.map((row) => (row.id === userId ? { ...row, saving: true, error: "" } : row)));

    try {
      const response = await fetch("/api/commissions/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          commissionRate: nextRate,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to save commission rate.");
      }

      setRows((previous) =>
        previous.map((row) =>
          row.id === userId
            ? {
                ...row,
                commissionRate: nextRate,
                saving: false,
                error: "",
              }
            : row,
        ),
      );

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setRows((previous) =>
        previous.map((row) =>
          row.id === userId
            ? {
                ...row,
                saving: false,
                error: error instanceof Error ? error.message : "Failed to save commission rate.",
              }
            : row,
        ),
      );
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">Commission Rate Settings</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Superadmin only. Rates are stored per rep and applied to net revenue after the fee holdback.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950 text-zinc-400">
            <tr>
              <th className="px-4 py-3">Rep</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Commission %</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-200">
                <td className="px-4 py-3 font-medium text-white">{row.name}</td>
                <td className="px-4 py-3 text-zinc-400">{row.email ?? "No email on file"}</td>
                <td className="px-4 py-3">
                  <div className="flex max-w-[140px] items-center rounded-md border border-zinc-700 bg-zinc-950 px-2">
                    <input
                      value={row.draftRate}
                      onChange={(event) =>
                        setRows((previous) =>
                          previous.map((candidate) =>
                            candidate.id === row.id
                              ? { ...candidate, draftRate: event.target.value, error: "" }
                              : candidate,
                          ),
                        )
                      }
                      placeholder="10"
                      className="w-full bg-transparent py-2 text-sm text-zinc-100 outline-none"
                    />
                    <span className="text-zinc-500">%</span>
                  </div>
                  {row.error ? <p className="mt-1 text-xs text-rose-300">{row.error}</p> : null}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void saveRow(row.id)}
                    disabled={row.saving || isPending}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {row.saving ? "Saving..." : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
