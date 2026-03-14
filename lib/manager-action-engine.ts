export type PredictorInputs = {
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

export type ActionTask = {
  id: string;
  title: string;
  play: string;
  target: string;
  minutes: number;
  priority: "critical" | "high" | "medium";
};

export type ActionEngineResult = {
  headline: string;
  tasks: ActionTask[];
  weeklyProjection: {
    personalClosedDeals: number;
    teamClosedDeals: number;
    totalIncome: number;
  };
  lockedGapSummary: string | null;
};

const MANAGER_BASE_COMMISSION = 0.5;

function roundCurrency(value: number) {
  return Math.max(0, Math.round(value));
}

function scorePriority(priority: ActionTask["priority"]) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  return 2;
}

export function calculateWeeklySnapshot(inputs: PredictorInputs) {
  const personalClosedDeals =
    inputs.personalWeeklyCalls *
    inputs.personalContactRate *
    inputs.personalDemoBookedRate *
    inputs.personalShowRate *
    inputs.personalCloseRate;

  const teamClosedDeals = inputs.teamActiveReps * inputs.teamAvgCallsPerRep * inputs.personalContactRate * inputs.teamCloseRate;
  const personalIncome = personalClosedDeals * inputs.averageDealValue * MANAGER_BASE_COMMISSION;
  const overrideRate = Math.max(MANAGER_BASE_COMMISSION - inputs.repCommissionRate, 0);
  const teamOverrideIncome = teamClosedDeals * inputs.averageDealValue * overrideRate;

  return {
    personalClosedDeals,
    teamClosedDeals,
    totalIncome: roundCurrency(personalIncome + teamOverrideIncome),
  };
}

export function buildManagerActionPlan(current: PredictorInputs, locked?: PredictorInputs | null): ActionEngineResult {
  const snapshot = calculateWeeklySnapshot(current);
  const lockedSnapshot = locked ? calculateWeeklySnapshot(locked) : null;
  const tasks: ActionTask[] = [];

  if (current.teamCloseRate < 0.15) {
    tasks.push({
      id: "team-coaching",
      title: "Run ride-alongs + close coaching blocks",
      play: "Review 3 recorded demos and run 1 objection-handling drill with each rep who missed quota yesterday.",
      target: `Raise team close rate from ${(current.teamCloseRate * 100).toFixed(0)}% to 18%+ this week.`,
      minutes: 120,
      priority: "critical",
    });
  }

  if (current.teamActiveReps < current.teamTargetNewHiresMonthly) {
    const hiringGap = Math.max(current.teamTargetNewHiresMonthly - current.teamActiveReps, 0);
    tasks.push({
      id: "recruiting-focus",
      title: "Protect dedicated recruiting time",
      play: "Block 3 recruiting hours: sourcing outreach, interview screeners, and same-day follow-ups.",
      target: `Close hiring gap of ${hiringGap} reps (active ${current.teamActiveReps} vs target ${current.teamTargetNewHiresMonthly}).`,
      minutes: 180,
      priority: "critical",
    });
  }

  if (current.personalWeeklyCalls < 75) {
    tasks.push({
      id: "personal-calls",
      title: "Rebuild personal top-of-funnel",
      play: "Complete two power-hours of outbound blocks and update script notes after each block.",
      target: `Hit ${(current.personalWeeklyCalls / 5).toFixed(0)}+ calls/day to support personal production.`,
      minutes: 120,
      priority: "high",
    });
  }

  if (current.personalShowRate < 0.65) {
    tasks.push({
      id: "demo-show-rate",
      title: "Increase demo show rate",
      play: "Launch same-day reminder cadence (24h, 2h, 15m) and confirm agenda with prospects.",
      target: `Move show rate from ${(current.personalShowRate * 100).toFixed(0)}% to 70%+.`,
      minutes: 45,
      priority: "high",
    });
  }

  if (current.personalCloseRate < 0.2) {
    tasks.push({
      id: "personal-close-rate",
      title: "Tighten personal close process",
      play: "Roleplay top 5 objections and run a same-day follow-up sequence for every no-decision demo.",
      target: `Lift personal close rate from ${(current.personalCloseRate * 100).toFixed(0)}% to 25%+.`,
      minutes: 60,
      priority: "high",
    });
  }

  let lockedGapSummary: string | null = null;
  if (lockedSnapshot) {
    const delta = snapshot.totalIncome - lockedSnapshot.totalIncome;
    const pct = lockedSnapshot.totalIncome > 0 ? (delta / lockedSnapshot.totalIncome) * 100 : 0;
    const sign = delta >= 0 ? "+" : "";
    lockedGapSummary = `Projected vs locked plan: ${sign}$${delta.toLocaleString()} (${sign}${pct.toFixed(1)}%).`;

    if (snapshot.totalIncome < lockedSnapshot.totalIncome * 0.9) {
      tasks.push({
        id: "recover-plan-gap",
        title: "Recover locked-plan income gap",
        play: "Reallocate first 90 minutes daily to the biggest bottleneck (calls, coaching, or recruiting).",
        target: `Recover at least $${(lockedSnapshot.totalIncome - snapshot.totalIncome).toLocaleString()} of weekly projected income.`,
        minutes: 90,
        priority: "critical",
      });
    }
  }

  if (tasks.length === 0) {
    tasks.push({
      id: "execution-maintain",
      title: "Maintain execution rhythm",
      play: "Run daily KPI huddle, protect recruiting block, and inspect one rep pipeline before noon.",
      target: "Stay on pace with locked weekly plan and keep conversion rates stable.",
      minutes: 45,
      priority: "medium",
    });
  }

  tasks.sort((a, b) => scorePriority(a.priority) - scorePriority(b.priority));
  const headline = tasks[0]?.title ?? "Maintain execution rhythm";

  return {
    headline: `Priority: ${headline}.`,
    tasks: tasks.slice(0, 5),
    weeklyProjection: snapshot,
    lockedGapSummary,
  };
}
