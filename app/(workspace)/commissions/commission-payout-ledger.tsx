"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type CommissionLedgerRow = {
  leadId: string;
  businessName: string;
  closedAt: string;
  grossRevenue: number;
  feeHoldback: number;
  netRevenue: number;
  commissionRate: number;
  commissionEarned: number;
  soldByName: string;
  soldByEmail: string | null;
  payoutStatus: "PAID" | "UNPAID";
  payoutPaidAt: string | null;
  payoutPaidAmount: number | null;
  payoutPaidByName: string | null;
  payoutNote: string | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function CommissionPayoutLedger({
  rows,
  isSuperAdmin,
}: {
  rows: CommissionLedgerRow[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (row.payoutStatus === "PAID") {
          acc.paid += row.payoutPaidAmount ?? row.commissionEarned;
        } else {
          acc.unpaid += row.commissionEarned;
        }
        return acc;
      },
      { paid: 0, unpaid: 0 },
    );
  }, [rows]);

  async function updatePayout(row: CommissionLedgerRow, status: "PAID" | "UNPAID") {
    setError("");
    setPendingLeadId(row.leadId);

    const note =
      status === "PAID"
        ? window.prompt("Optional payout note", row.payoutNote ?? "") ?? row.payoutNote ?? ""
        : row.payoutNote ?? "";

    startTransition(() => {
      void fetch("/api/commissions/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: row.leadId,
          status,
          paidAmount: status === "PAID" ? row.commissionEarned : null,
          note,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            throw new Error(payload?.error || "Failed to update payout.");
          }
          router.refresh();
        })
        .catch((requestError) => {
          setError(requestError instanceof Error ? requestError.message : "Failed to update payout.");
        })
        .finally(() => {
          setPendingLeadId(null);
        });
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Closed Deal Ledger</h2>
          <p className="mt-1 text-sm text-zinc-400">Track earned commission and whether each deal has already been paid out.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Paid Out</p>
            <p className="mt-1 text-lg font-semibold text-emerald-300">{formatCurrency(totals.paid)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Still Owed</p>
            <p className="mt-1 text-lg font-semibold text-amber-300">{formatCurrency(totals.unpaid)}</p>
          </div>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div> : null}

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950 text-zinc-400">
            <tr>
              <th className="px-4 py-3">Deal</th>
              <th className="px-4 py-3">Closed</th>
              <th className="px-4 py-3">Sold By</th>
              <th className="px-4 py-3">Gross</th>
              <th className="px-4 py-3">Fee Holdback</th>
              <th className="px-4 py-3">Net</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Commission</th>
              <th className="px-4 py-3">Payout</th>
              {isSuperAdmin ? <th className="px-4 py-3">Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-400">
                <td className="px-4 py-3" colSpan={isSuperAdmin ? 10 : 9}>
                  No real closed deals available for commission calculation yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isRowPending = pendingLeadId === row.leadId && isPending;
                return (
                  <tr key={row.leadId} className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-200">
                    <td className="px-4 py-3 font-medium text-white">{row.businessName}</td>
                    <td className="px-4 py-3 text-zinc-400">{new Date(row.closedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span>{row.soldByName}</span>
                        <span className="text-xs text-zinc-500">{row.soldByEmail ?? "No email on file"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(row.grossRevenue)}</td>
                    <td className="px-4 py-3 tabular-nums text-amber-300">-{formatCurrency(row.feeHoldback)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(row.netRevenue)}</td>
                    <td className="px-4 py-3">{formatPercent(row.commissionRate)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-300 tabular-nums">{formatCurrency(row.commissionEarned)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className={row.payoutStatus === "PAID" ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>
                          {row.payoutStatus === "PAID" ? "Paid" : "Unpaid"}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {row.payoutStatus === "PAID" && row.payoutPaidAt
                            ? `${new Date(row.payoutPaidAt).toLocaleDateString()}${row.payoutPaidByName ? ` by ${row.payoutPaidByName}` : ""}`
                            : "Not marked as paid"}
                        </span>
                      </div>
                    </td>
                    {isSuperAdmin ? (
                      <td className="px-4 py-3">
                        {row.payoutStatus === "PAID" ? (
                          <button
                            type="button"
                            disabled={isRowPending}
                            onClick={() => updatePayout(row, "UNPAID")}
                            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 disabled:opacity-60"
                          >
                            {isRowPending ? "Updating..." : "Mark Unpaid"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isRowPending}
                            onClick={() => updatePayout(row, "PAID")}
                            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 disabled:opacity-60"
                          >
                            {isRowPending ? "Updating..." : "Mark Paid"}
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
