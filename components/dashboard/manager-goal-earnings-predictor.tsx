"use client";

import { useEffect, useMemo, useState } from "react";

type PredictorInputs = {
  averageDealValue: number;
  repCommissionRate: number;
  personalWeeklyCalls: number;
  personalContactRate: number;
  personalDemoBookedRate: number;
  personalShowRate: number;
  personalCloseRate: number;
  teamActiveReps: number;
  teamAvgCallsPerRep: number;
  teamCloseRate: number;
  teamTargetNewHiresMonthly: number;
};

type ProjectionRow = {
  label: string;
  multiplier: number;
};

type ManagerPlan = {
  id: string;
  manager_id: string;
  week_start_date: string;
  locked_metrics_json: {
    inputs: PredictorInputs;
    projections: Array<{ label: string; personal: number; override: number; total: number }>;
  };
  projected_income: number;
  created_at: string;
};

const MANAGER_BASE_COMMISSION = 0.5;

const projectionRows: ProjectionRow[] = [
  { label: "Next Week", multiplier: 1 },
  { label: "1 Month", multiplier: 4 },
  { label: "1 Quarter", multiplier: 13 },
  { label: "6 Months", multiplier: 26 },
  { label: "1 Year", multiplier: 52 },
];

const defaultInputs: PredictorInputs = {
  averageDealValue: 3500,
  repCommissionRate: 0.2,
  personalWeeklyCalls: 60,
  personalContactRate: 0.25,
  personalDemoBookedRate: 0.4,
  personalShowRate: 0.7,
  personalCloseRate: 0.25,
  teamActiveReps: 10,
  teamAvgCallsPerRep: 45,
  teamCloseRate: 0.18,
  teamTargetNewHiresMonthly: 12,
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

const LOCAL_PLAN_STORAGE_KEY = "manager-goal-plan-local";

type ManagerPlanApiPayload = {
  plan?: ManagerPlan | null;
  error?: string;
  warning?: string;
  tableMissing?: boolean;
  code?: string;
  setupSqlText?: string;
};

function saveLocalLockedPlan(plan: ManagerPlan) {
  try {
    localStorage.setItem(LOCAL_PLAN_STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // Ignore local storage failures.
  }
}

function readLocalLockedPlan() {
  try {
    const raw = localStorage.getItem(LOCAL_PLAN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ManagerPlan;
  } catch {
    return null;
  }
}

function roundCurrency(value: number) {
  return Math.max(0, Math.round(value));
}

function getWeekStartDate(date = new Date()) {
  const day = date.getDay();
  const distanceFromMonday = (day + 6) % 7;
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - distanceFromMonday);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart.toISOString().slice(0, 10);
}

function toPercentInput(value: number) {
  return Math.round(value * 100);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ManagerGoalEarningsPredictor() {
  const [inputs, setInputs] = useState<PredictorInputs>(defaultInputs);
  const [lockedPlan, setLockedPlan] = useState<ManagerPlan | null>(null);
  const [loadingLockedPlan, setLoadingLockedPlan] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [setupSqlText, setSetupSqlText] = useState<string>("");

  const personalWeeklyClosedDeals = useMemo(() => {
    return (
      inputs.personalWeeklyCalls *
      inputs.personalContactRate *
      inputs.personalDemoBookedRate *
      inputs.personalShowRate *
      inputs.personalCloseRate
    );
  }, [inputs]);

  const teamWeeklyClosedDeals = useMemo(() => {
    return inputs.teamActiveReps * inputs.teamAvgCallsPerRep * inputs.personalContactRate * inputs.teamCloseRate;
  }, [inputs]);

  const weeklyPersonalEarnings = useMemo(() => {
    return roundCurrency(personalWeeklyClosedDeals * inputs.averageDealValue * MANAGER_BASE_COMMISSION);
  }, [personalWeeklyClosedDeals, inputs.averageDealValue]);

  const weeklyOverrideEarnings = useMemo(() => {
    const overrideRate = Math.max(MANAGER_BASE_COMMISSION - inputs.repCommissionRate, 0);
    return roundCurrency(teamWeeklyClosedDeals * inputs.averageDealValue * overrideRate);
  }, [teamWeeklyClosedDeals, inputs.averageDealValue, inputs.repCommissionRate]);

  const projections = useMemo(() => {
    return projectionRows.map((row) => {
      const personal = roundCurrency(weeklyPersonalEarnings * row.multiplier);
      const override = roundCurrency(weeklyOverrideEarnings * row.multiplier);
      const total = personal + override;
      return { label: row.label, personal, override, total };
    });
  }, [weeklyPersonalEarnings, weeklyOverrideEarnings]);

  const actionPriority = useMemo(() => {
    if (inputs.teamCloseRate < 0.15) {
      return "Priority: Ride-alongs and sales coaching.";
    }

    if (inputs.teamActiveReps < inputs.teamTargetNewHiresMonthly) {
      return "Priority: Dedicate 3 hours/day to Recruiting.";
    }

    if (personalWeeklyClosedDeals < 0.3) {
      return "Priority: Lead Generation & Personal Selling.";
    }

    return "Priority: Maintain coaching rhythm and protect recruiting blocks while scaling team production.";
  }, [inputs.teamCloseRate, inputs.teamActiveReps, inputs.teamTargetNewHiresMonthly, personalWeeklyClosedDeals]);

  useEffect(() => {
    let active = true;

    async function loadLockedPlan() {
      setLoadingLockedPlan(true);
      const response = await fetch("/api/manager-plans", { cache: "no-store" }).catch(() => null);
      const payload = (await response?.json().catch(() => null)) as ManagerPlanApiPayload | null;

      if (!active) return;

      if (response?.ok && payload?.plan) {
        setLockedPlan(payload.plan);
      } else if (payload?.tableMissing) {
        const localPlan = readLocalLockedPlan();
        if (localPlan) {
          setLockedPlan(localPlan);
        }
        setSaveState("idle");
        setSaveMessage(payload.warning ?? "Supabase manager_plans table is missing. Showing locally saved plan if available.");
        setSetupSqlText(payload.setupSqlText ?? "");
      }

      setLoadingLockedPlan(false);
    }

    void loadLockedPlan();

    return () => {
      active = false;
    };
  }, []);

  function setInput<K extends keyof PredictorInputs>(key: K, value: number) {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setSaveState("idle");
    setSaveMessage("");
    setSetupSqlText("");
  }

  async function handleLockPlan() {
    setSaveState("saving");
    setSaveMessage("");
    setSetupSqlText("");

    const response = await fetch("/api/manager-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekStartDate: getWeekStartDate(),
        projectedIncome: projections.find((item) => item.label === "1 Year")?.total ?? 0,
        lockedMetricsJson: {
          inputs,
          projections,
        },
      }),
    }).catch(() => null);

    const payload = (await response?.json().catch(() => null)) as ManagerPlanApiPayload | null;

    if (!response?.ok || !payload?.plan) {
      if (payload?.code === "MANAGER_PLANS_TABLE_MISSING") {
        const localFallbackPlan: ManagerPlan = {
          id: `local-${Date.now()}`,
          manager_id: "local-manager",
          week_start_date: getWeekStartDate(),
          locked_metrics_json: {
            inputs,
            projections,
          },
          projected_income: projections.find((item) => item.label === "1 Year")?.total ?? 0,
          created_at: new Date().toISOString(),
        };

        saveLocalLockedPlan(localFallbackPlan);
        setLockedPlan(localFallbackPlan);
        setSaveState("saved");
        setSaveMessage("Supabase table is missing, so this plan was locked locally in your browser for this week.");
        setSetupSqlText(payload.setupSqlText ?? "");
        return;
      }

      setSaveState("error");
      setSaveMessage(payload?.error ?? "Unable to lock plan. Confirm Supabase table exists and try again.");
      setSetupSqlText(payload?.setupSqlText ?? "");
      return;
    }

    setLockedPlan(payload.plan);
    saveLocalLockedPlan(payload.plan);
    setSaveState("saved");
    setSaveMessage("Weekly plan locked in successfully.");
    setSetupSqlText("");
  }

  function handleExportPlan() {
    const rows: string[][] = [
      ["Metric", "Value"],
      ["Average Deal Value", `${inputs.averageDealValue}`],
      ["Rep Commission Rate", `${toPercentInput(inputs.repCommissionRate)}%`],
      ["Personal Weekly Calls", `${inputs.personalWeeklyCalls}`],
      ["Personal Contact Rate", `${toPercentInput(inputs.personalContactRate)}%`],
      ["Personal Demos Booked Rate", `${toPercentInput(inputs.personalDemoBookedRate)}%`],
      ["Personal Show Rate", `${toPercentInput(inputs.personalShowRate)}%`],
      ["Personal Close Rate", `${toPercentInput(inputs.personalCloseRate)}%`],
      ["Team Active Reps", `${inputs.teamActiveReps}`],
      ["Team Avg Calls / Rep", `${inputs.teamAvgCallsPerRep}`],
      ["Team Close Rate", `${toPercentInput(inputs.teamCloseRate)}%`],
      ["Target New Hires / Month", `${inputs.teamTargetNewHiresMonthly}`],
      [],
      ["Projection Horizon", "Personal Earnings", "Team Override Earnings", "Total Income"],
      ...projections.map((projection) => [projection.label, `${projection.personal}`, `${projection.override}`, `${projection.total}`]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `manager-goal-plan-${getWeekStartDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Manager Goal & Earnings Predictor</p>
          <h3 className="mt-1 text-xl font-semibold text-white">Sandbox + projection engine + accountability tracker</h3>
        </div>
        <p className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
          Manager Base Commission: {percentFormatter.format(MANAGER_BASE_COMMISSION)}
        </p>
      </header>

      <article className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
        <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">Locked Weekly Plan</h4>
        {loadingLockedPlan ? (
          <p className="mt-2 text-sm text-zinc-400">Loading locked plan…</p>
        ) : lockedPlan ? (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Week Start</p>
              <p className="text-lg font-semibold text-white">{lockedPlan.week_start_date}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Projected Income</p>
              <p className="text-lg font-semibold text-emerald-300">{currencyFormatter.format(lockedPlan.projected_income)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Last Locked</p>
              <p className="text-lg font-semibold text-white">{new Date(lockedPlan.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">No locked plan yet for accountability. Lock your weekly plan below.</p>
        )}
      </article>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">1) Funnel Inputs</h4>

          <div className="grid gap-3 sm:grid-cols-2">
            <InputNumber label="Average Deal Value ($)" value={inputs.averageDealValue} step={100} min={500} onChange={(v) => setInput("averageDealValue", clamp(v, 500, 200000))} />
            <InputRangePercent label="Rep Commission Rate" value={inputs.repCommissionRate} min={10} max={40} onChange={(v) => setInput("repCommissionRate", v)} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <fieldset className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Personal Funnel</legend>
              <InputNumber label="Weekly Calls" value={inputs.personalWeeklyCalls} min={0} max={500} onChange={(v) => setInput("personalWeeklyCalls", clamp(v, 0, 500))} />
              <InputRangePercent label="Contact Rate" value={inputs.personalContactRate} onChange={(v) => setInput("personalContactRate", v)} />
              <InputRangePercent label="Demos Booked" value={inputs.personalDemoBookedRate} onChange={(v) => setInput("personalDemoBookedRate", v)} />
              <InputRangePercent label="Show Rate" value={inputs.personalShowRate} onChange={(v) => setInput("personalShowRate", v)} />
              <InputRangePercent label="Close Rate" value={inputs.personalCloseRate} onChange={(v) => setInput("personalCloseRate", v)} />
            </fieldset>

            <fieldset className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Team & Recruiting Funnel</legend>
              <InputNumber label="Active Reps" value={inputs.teamActiveReps} min={0} max={100} onChange={(v) => setInput("teamActiveReps", clamp(v, 0, 100))} />
              <InputNumber label="Avg Calls per Rep" value={inputs.teamAvgCallsPerRep} min={0} max={500} onChange={(v) => setInput("teamAvgCallsPerRep", clamp(v, 0, 500))} />
              <InputRangePercent label="Team Close Rate" value={inputs.teamCloseRate} onChange={(v) => setInput("teamCloseRate", v)} />
              <InputNumber label="Target New Hires / month" value={inputs.teamTargetNewHiresMonthly} min={0} max={100} onChange={(v) => setInput("teamTargetNewHiresMonthly", clamp(v, 0, 100))} />
            </fieldset>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">2) Time Horizon Output</h4>
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Horizon</th>
                  <th className="px-3 py-2">Personal Earnings</th>
                  <th className="px-3 py-2">Team Override</th>
                  <th className="px-3 py-2">Total Income</th>
                </tr>
              </thead>
              <tbody>
                {projections.map((projection) => (
                  <tr key={projection.label} className="border-t border-zinc-800 text-zinc-200">
                    <td className="px-3 py-2 font-medium">{projection.label}</td>
                    <td className="px-3 py-2">{currencyFormatter.format(projection.personal)}</td>
                    <td className="px-3 py-2">{currencyFormatter.format(projection.override)}</td>
                    <td className="px-3 py-2 text-emerald-300">{currencyFormatter.format(projection.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
            <p>Personal Closed Deals / Week: <span className="font-semibold text-white">{personalWeeklyClosedDeals.toFixed(2)}</span></p>
            <p>Team Closed Deals / Week: <span className="font-semibold text-white">{teamWeeklyClosedDeals.toFixed(2)}</span></p>
          </div>
        </section>
      </div>

      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">3) Action Engine</h4>
        <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-100">{actionPriority}</p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleLockPlan}
            disabled={saveState === "saving"}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveState === "saving" ? "Locking…" : "Lock In Weekly Plan"}
          </button>
          <button
            type="button"
            onClick={handleExportPlan}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-600"
          >
            Export Plan
          </button>
        </div>

        {saveMessage ? (
          <p className={`text-sm ${saveState === "error" ? "text-rose-300" : "text-emerald-300"}`}>{saveMessage}</p>
        ) : null}

        {setupSqlText ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Supabase SQL to run</p>
            <pre className="overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-200">
              <code>{setupSqlText}</code>
            </pre>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function InputNumber({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block text-xs text-zinc-300">
      <span className="mb-1 block uppercase tracking-[0.12em] text-zinc-500">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-white outline-none ring-blue-500/40 transition focus:ring"
      />
    </label>
  );
}

function InputRangePercent({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block text-xs text-zinc-300">
      <div className="mb-1 flex items-center justify-between">
        <span className="uppercase tracking-[0.12em] text-zinc-500">{label}</span>
        <span className="font-semibold text-zinc-200">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        value={Math.round(value * 100)}
        min={min}
        max={max}
        onChange={(event) => onChange(clamp(Number(event.target.value) / 100, min / 100, max / 100))}
        className="w-full accent-blue-500"
      />
    </label>
  );
}
