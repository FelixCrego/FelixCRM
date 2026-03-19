"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lead } from "@/lib/types";
import type { FinanceExpense, FinanceSettings } from "@/lib/store";

type BillingDashboardProps = {
  initialLeads: Lead[];
  initialSettings: FinanceSettings;
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

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getCommissionRateForLead(lead: Lead) {
  if (lead.soldByEmail?.toLowerCase() === "eliot30523@gmail.com") return 0.5;
  return 0.1;
}

function getEffectiveBillingAmount(lead: Lead) {
  if (lead.billingProfile?.billingType === "RECURRING") {
    return lead.billingProfile?.recurringAmount ?? lead.closedDealValue ?? 0;
  }
  return lead.billingProfile?.oneTimeAmount ?? lead.closedDealValue ?? 0;
}

export default function BillingDashboard({ initialLeads, initialSettings }: BillingDashboardProps) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [settings, setSettings] = useState(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [saveMessage, setSaveMessage] = useState("");

  const closedLeads = useMemo(
    () => leads.filter((lead) => lead.status === "CLOSED" && ((lead.closedDealValue ?? 0) > 0 || lead.billingProfile)),
    [leads],
  );

  const activeRecurringLeads = useMemo(
    () =>
      closedLeads.filter(
        (lead) =>
          lead.billingProfile?.billingType === "RECURRING" &&
          lead.billingProfile?.billingStatus !== "CANCELLED" &&
          (lead.billingProfile?.recurringAmount ?? 0) > 0,
      ),
    [closedLeads],
  );

  const currentMonth = useMemo(() => new Date(), []);
  const monthlyRecurringRevenue = activeRecurringLeads.reduce((sum, lead) => sum + (lead.billingProfile?.recurringAmount ?? 0), 0);
  const thisMonthOneTimeRevenue = closedLeads.reduce((sum, lead) => {
    if ((lead.billingProfile?.billingType ?? "ONE_TIME") !== "ONE_TIME") return sum;
    if (!lead.closedAt || monthKey(new Date(lead.closedAt)) !== monthKey(currentMonth)) return sum;
    return sum + getEffectiveBillingAmount(lead);
  }, 0);

  const monthlyExpenses = settings.expenses
    .filter((expense) => expense.cadence === "MONTHLY")
    .reduce((sum, expense) => sum + expense.amount, 0);

  const forecastRows = useMemo(
    () =>
      [0, 1, 2].map((monthOffset) => {
        const date = addMonths(currentMonth, monthOffset);
        const key = monthKey(date);
        const recurringRevenue = activeRecurringLeads.reduce((sum, lead) => {
          const startDate = lead.billingProfile?.billingStartDate ? new Date(lead.billingProfile.billingStartDate) : null;
          if (startDate && monthKey(startDate) > key) return sum;
          return sum + (lead.billingProfile?.recurringAmount ?? 0);
        }, 0);
        const oneTimeRevenue = closedLeads.reduce((sum, lead) => {
          if ((lead.billingProfile?.billingType ?? "ONE_TIME") !== "ONE_TIME") return sum;
          if (!lead.closedAt || monthKey(new Date(lead.closedAt)) !== key) return sum;
          return sum + getEffectiveBillingAmount(lead);
        }, 0);
        const grossRevenue = recurringRevenue + oneTimeRevenue;
        const feeHoldback = grossRevenue * settings.feeHoldbackRate;
        const netRevenue = grossRevenue - feeHoldback;
        const commissionDue = closedLeads.reduce((sum, lead) => {
          const startMonthSource = lead.billingProfile?.billingStartDate ?? lead.closedAt;
          if (!startMonthSource || monthKey(new Date(startMonthSource)) !== key) return sum;
          const initialAmount = getEffectiveBillingAmount(lead);
          const initialNet = initialAmount * (1 - settings.feeHoldbackRate);
          return sum + initialNet * getCommissionRateForLead(lead);
        }, 0);

        return {
          label: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
          grossRevenue,
          feeHoldback,
          netRevenue,
          expenses: settings.expenses.reduce((sum, expense) => {
            if (expense.cadence === "MONTHLY") return sum + expense.amount;
            return expense.effectiveDate && monthKey(new Date(expense.effectiveDate)) === key ? sum + expense.amount : sum;
          }, 0),
          commissionDue,
        };
      }),
    [activeRecurringLeads, closedLeads, currentMonth, settings.expenses, settings.feeHoldbackRate],
  );

  const saveLeadBilling = async (leadId: string, billingProfile: NonNullable<Lead["billingProfile"]>) => {
    const response = await fetch("/api/billing/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, billingProfile }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || "Failed to save billing profile.");
  };

  const saveFinanceSettings = async (nextSettings: FinanceSettings) => {
    const response = await fetch("/api/finance/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextSettings),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || "Failed to save finance settings.");
  };

  const updateLeadProfile = (leadId: string, patch: Partial<NonNullable<Lead["billingProfile"]>>) => {
    setLeads((previous) =>
      previous.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              billingProfile: {
                billingType: "ONE_TIME",
                autoRenew: false,
                billingStatus: "ACTIVE",
                ...lead.billingProfile,
                ...patch,
              },
            }
          : lead,
      ),
    );
  };

  const persistLead = (leadId: string) => {
    const target = leads.find((lead) => lead.id === leadId);
    if (!target?.billingProfile) return;
    const billingProfile = target.billingProfile;

    setSaveMessage("");
    startTransition(() => {
      void saveLeadBilling(leadId, billingProfile)
        .then(() => {
          setSaveMessage(`Saved billing profile for ${target.businessName}.`);
          router.refresh();
        })
        .catch((error) => {
          setSaveMessage(error instanceof Error ? error.message : "Failed to save billing profile.");
        });
    });
  };

  const persistSettings = () => {
    setSaveMessage("");
    startTransition(() => {
      void saveFinanceSettings(settings)
        .then(() => {
          setSaveMessage("Saved finance settings.");
          router.refresh();
        })
        .catch((error) => {
          setSaveMessage(error instanceof Error ? error.message : "Failed to save finance settings.");
        });
    });
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Billing and Revenue</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">Finance Command Center</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Track recurring clients, one-time deals, expenses, and forecasted cash flow. Commission is paid only in the client&apos;s start month.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setSaveMessage("");
              startTransition(() => {
                void fetch("/api/stripe/sync", { method: "POST" })
                  .then(async (response) => {
                    const payload = (await response.json().catch(() => null)) as { syncedLeadIds?: string[]; error?: string } | null;
                    if (!response.ok) {
                      throw new Error(payload?.error || "Failed to sync Stripe.");
                    }
                    setSaveMessage(`Stripe sync complete. Updated ${payload?.syncedLeadIds?.length ?? 0} leads.`);
                    router.refresh();
                  })
                  .catch((error) => {
                    setSaveMessage(error instanceof Error ? error.message : "Failed to sync Stripe.");
                  });
              });
            }}
            disabled={isPending}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200"
          >
            Sync Stripe Now
          </button>
          <button
            type="button"
            onClick={persistSettings}
            disabled={isPending}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200"
          >
            Save Finance Settings
          </button>
        </div>
        {saveMessage ? <p className="mt-3 text-sm text-emerald-300">{saveMessage}</p> : null}
      </header>

      <section className="grid gap-4 xl:grid-cols-4">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Active MRR</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(monthlyRecurringRevenue)}</p>
          <p className="mt-2 text-sm text-zinc-400">{activeRecurringLeads.length} recurring accounts on the books</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">One-Time This Month</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(thisMonthOneTimeRevenue)}</p>
          <p className="mt-2 text-sm text-zinc-400">Collected from one-time closes in the current month</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Monthly Expenses</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(monthlyExpenses)}</p>
          <p className="mt-2 text-sm text-zinc-400">Fixed expense load before one-time costs</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Fee Holdback</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={String(Math.round(settings.feeHoldbackRate * 100))}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  feeHoldbackRate: Math.max(0, Number(event.target.value || 0)) / 100,
                }))
              }
              className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none"
            />
            <span className="text-zinc-400">%</span>
            <span className="text-xs text-zinc-500">Used across forecast and commissions.</span>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Revenue Forecast</h2>
            <p className="mt-1 text-sm text-zinc-400">3-month projection with recurring revenue, expenses, and month-1-only commissions.</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Gross Revenue</th>
                <th className="px-4 py-3">Fee Holdback</th>
                <th className="px-4 py-3">Net Revenue</th>
                <th className="px-4 py-3">Expenses</th>
                <th className="px-4 py-3">Month 1 Commissions</th>
                <th className="px-4 py-3">Projected Margin</th>
              </tr>
            </thead>
            <tbody>
              {forecastRows.map((row) => (
                <tr key={row.label} className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-200">
                  <td className="px-4 py-3 font-medium text-white">{row.label}</td>
                  <td className="px-4 py-3">{formatCurrency(row.grossRevenue)}</td>
                  <td className="px-4 py-3 text-amber-300">-{formatCurrency(row.feeHoldback)}</td>
                  <td className="px-4 py-3">{formatCurrency(row.netRevenue)}</td>
                  <td className="px-4 py-3 text-rose-300">-{formatCurrency(row.expenses)}</td>
                  <td className="px-4 py-3 text-blue-300">-{formatCurrency(row.commissionDue)}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-300">{formatCurrency(row.netRevenue - row.expenses - row.commissionDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Expenses</h2>
            <p className="mt-1 text-sm text-zinc-400">Add monthly overhead and one-time expenses into the forecast.</p>
          </div>
          <button
            type="button"
            onClick={() =>
              setSettings((previous) => ({
                ...previous,
                expenses: [
                  ...previous.expenses,
                  { id: crypto.randomUUID(), label: "New Expense", amount: 0, cadence: "MONTHLY", effectiveDate: null, notes: null },
                ],
              }))
            }
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200"
          >
            Add Expense
          </button>
        </div>
        <div className="space-y-3">
          {settings.expenses.map((expense) => (
            <div key={expense.id} className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 lg:grid-cols-[2fr_1fr_1fr_auto]">
              <input
                value={expense.label}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    expenses: previous.expenses.map((item) => (item.id === expense.id ? { ...item, label: event.target.value } : item)),
                  }))
                }
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
              />
              <input
                type="number"
                value={expense.amount}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    expenses: previous.expenses.map((item) => (item.id === expense.id ? { ...item, amount: Number(event.target.value || 0) } : item)),
                  }))
                }
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
              />
              <select
                value={expense.cadence}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    expenses: previous.expenses.map((item) =>
                      item.id === expense.id ? { ...item, cadence: event.target.value as FinanceExpense["cadence"] } : item,
                    ),
                  }))
                }
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="ONE_TIME">One Time</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setSettings((previous) => ({
                    ...previous,
                    expenses: previous.expenses.filter((item) => item.id !== expense.id),
                  }))
                }
                className="rounded-md border border-rose-500/30 px-3 py-2 text-xs font-medium text-rose-200"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={persistSettings}
            disabled={isPending}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200"
          >
            Save Expenses
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Client Billing Profiles</h2>
          <p className="mt-1 text-sm text-zinc-400">Mark each closed client as one-time or recurring, and track lifecycle billing on the lead.</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Billing Type</th>
                <th className="px-4 py-3">One-Time</th>
                <th className="px-4 py-3">Recurring</th>
                <th className="px-4 py-3">Auto Renew</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Start Date</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {closedLeads.map((lead) => (
                <tr key={lead.id} className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-200">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-white">{lead.businessName}</span>
                      <span className="text-xs text-zinc-500">{lead.soldByName ?? lead.soldByEmail ?? "No seller tagged"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.billingProfile?.billingType ?? "ONE_TIME"}
                      onChange={(event) => updateLeadProfile(lead.id, { billingType: event.target.value as "ONE_TIME" | "RECURRING" })}
                      className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-white outline-none"
                    >
                      <option value="ONE_TIME">One Time</option>
                      <option value="RECURRING">Recurring</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={lead.billingProfile?.oneTimeAmount ?? lead.closedDealValue ?? 0}
                      onChange={(event) => updateLeadProfile(lead.id, { oneTimeAmount: Number(event.target.value || 0) })}
                      className="w-28 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-white outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={lead.billingProfile?.recurringAmount ?? 0}
                      onChange={(event) => updateLeadProfile(lead.id, { recurringAmount: Number(event.target.value || 0) })}
                      className="w-28 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-white outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(lead.billingProfile?.autoRenew)}
                      onChange={(event) => updateLeadProfile(lead.id, { autoRenew: event.target.checked })}
                      className="size-4"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.billingProfile?.billingStatus ?? "ACTIVE"}
                      onChange={(event) =>
                        updateLeadProfile(lead.id, {
                          billingStatus: event.target.value as "ACTIVE" | "PAUSED" | "CANCELLED" | "PAID",
                        })
                      }
                      className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-white outline-none"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="PAUSED">Paused</option>
                      <option value="CANCELLED">Cancelled</option>
                      <option value="PAID">Paid</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="date"
                      value={lead.billingProfile?.billingStartDate ?? lead.closedAt?.slice(0, 10) ?? ""}
                      onChange={(event) => updateLeadProfile(lead.id, { billingStartDate: event.target.value })}
                      className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-white outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => persistLead(lead.id)}
                      disabled={isPending}
                      className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
