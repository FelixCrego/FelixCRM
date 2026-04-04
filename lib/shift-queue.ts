import type { Lead } from "@/lib/types";
import { resolveLeadWorkspaceStatus, type LeadWorkspaceStatus } from "@/lib/lead-workspace-status";

export type ShiftQueueLane = "FRESH" | "FOLLOW_UP" | "MONEY" | "DEMO";
export type ShiftQueueMix = Record<ShiftQueueLane, number>;
export type ShiftQueueSettings = {
  minCallsPerShift: number;
  mix: ShiftQueueMix;
  industry?: string | null;
  presetId?: string | null;
  updatedAt?: string | null;
  updatedByUserId?: string | null;
};
export type ShiftQueuePreset = {
  id: string;
  label: string;
  description: string;
  minCallsPerShift: number;
  mix: ShiftQueueMix;
};
export type ShiftQueuePlanProgress = {
  settings: ShiftQueueSettings;
  completedCount: number;
  completedCountsByLane: ShiftQueueMix;
  queuedCountsByLane: ShiftQueueMix;
  targetCountsByLane: ShiftQueueMix;
  remainingCountsByLane: ShiftQueueMix;
  remainingCalls: number;
  targetProgressPercent: number;
  focusLane: ShiftQueueLane | null;
};

export const SHIFT_QUEUE_LANES: ShiftQueueLane[] = ["FRESH", "FOLLOW_UP", "MONEY", "DEMO"];
const DEFAULT_SHIFT_QUEUE_MIN_CALLS = 60;
const DEFAULT_SHIFT_QUEUE_MIX: ShiftQueueMix = {
  FRESH: 55,
  FOLLOW_UP: 25,
  MONEY: 15,
  DEMO: 5,
};

export const SHIFT_QUEUE_PRESETS: ShiftQueuePreset[] = [
  {
    id: "cold-push",
    label: "Cold Push",
    description: "Heavy first-touch volume with a small follow-up pocket to keep the pipeline fed.",
    minCallsPerShift: 60,
    mix: {
      FRESH: 80,
      FOLLOW_UP: 20,
      MONEY: 0,
      DEMO: 0,
    },
  },
  {
    id: "balanced-pipeline",
    label: "Balanced Pipeline",
    description: "Keep new business flowing while still working warm follow-ups and close-ready money calls.",
    minCallsPerShift: 60,
    mix: DEFAULT_SHIFT_QUEUE_MIX,
  },
  {
    id: "cash-recovery",
    label: "Cash Recovery",
    description: "Lean into money moves and warm follow-ups when approvals and payments need the most pressure.",
    minCallsPerShift: 50,
    mix: {
      FRESH: 25,
      FOLLOW_UP: 30,
      MONEY: 35,
      DEMO: 10,
    },
  },
  {
    id: "show-rate",
    label: "Show-Rate Saver",
    description: "Protect upcoming demos while keeping enough fresh and follow-up volume moving through the shift.",
    minCallsPerShift: 45,
    mix: {
      FRESH: 35,
      FOLLOW_UP: 25,
      MONEY: 10,
      DEMO: 30,
    },
  },
];

export type ShiftQueueEntry = {
  lead: Lead;
  lane: ShiftQueueLane;
  priority: number;
  reason: string;
  status: LeadWorkspaceStatus;
  suggestedNextStep: string;
  touchedToday: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function emptyLaneMix(): ShiftQueueMix {
  return {
    FRESH: 0,
    FOLLOW_UP: 0,
    MONEY: 0,
    DEMO: 0,
  };
}

function getPresetById(presetId?: string | null) {
  return SHIFT_QUEUE_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function normalizeShiftQueueIndustry(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.toUpperCase() === "ALL") return null;
  return normalized;
}

export function getShiftQueueIndustryOptions(leads: Lead[]) {
  const uniqueIndustries = new Set(
    leads
      .map((lead) => (typeof lead.businessType === "string" ? lead.businessType.trim() : ""))
      .filter(Boolean),
  );
  return Array.from(uniqueIndustries).sort((left, right) => left.localeCompare(right));
}

function normalizeMixTotals(input: ShiftQueueMix) {
  const total = SHIFT_QUEUE_LANES.reduce((sum, lane) => sum + input[lane], 0);
  if (total <= 0) return { ...DEFAULT_SHIFT_QUEUE_MIX };

  const scaled = SHIFT_QUEUE_LANES.map((lane) => ({
    lane,
    exact: (input[lane] / total) * 100,
  }));
  const rounded = Object.fromEntries(
    scaled.map(({ lane, exact }) => [lane, Math.floor(exact)]),
  ) as ShiftQueueMix;

  let remainder = 100 - SHIFT_QUEUE_LANES.reduce((sum, lane) => sum + rounded[lane], 0);
  if (remainder > 0) {
    const byFraction = [...scaled].sort((left, right) => {
      const fractionDiff = right.exact - Math.floor(right.exact) - (left.exact - Math.floor(left.exact));
      if (fractionDiff !== 0) return fractionDiff;
      return input[right.lane] - input[left.lane];
    });

    for (const item of byFraction) {
      if (remainder <= 0) break;
      rounded[item.lane] += 1;
      remainder -= 1;
    }
  }

  return rounded;
}

export function normalizeShiftQueueMix(value: unknown): ShiftQueueMix {
  const presetMix = getPresetById(
    value && typeof value === "object" && !Array.isArray(value) && "presetId" in value
      ? String((value as Record<string, unknown>).presetId ?? "")
      : "",
  )?.mix;
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Partial<Record<ShiftQueueLane, unknown>>)
    : {};

  const normalized = SHIFT_QUEUE_LANES.reduce<ShiftQueueMix>((acc, lane) => {
    const raw = input[lane];
    const numeric = typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw)
        : NaN;
    acc[lane] = Number.isFinite(numeric) ? clamp(Math.round(numeric), 0, 100) : presetMix?.[lane] ?? DEFAULT_SHIFT_QUEUE_MIX[lane];
    return acc;
  }, emptyLaneMix());

  return normalizeMixTotals(normalized);
}

export function normalizeShiftQueueSettings(value: unknown): ShiftQueueSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const preset = getPresetById(typeof input.presetId === "string" ? input.presetId : null);
  const minCallsRaw =
    typeof input.minCallsPerShift === "number"
      ? input.minCallsPerShift
      : typeof input.minCallsPerShift === "string" && input.minCallsPerShift.trim()
        ? Number(input.minCallsPerShift)
        : preset?.minCallsPerShift ?? DEFAULT_SHIFT_QUEUE_MIN_CALLS;

  return {
    minCallsPerShift: Number.isFinite(minCallsRaw) ? clamp(Math.round(minCallsRaw), 10, 250) : DEFAULT_SHIFT_QUEUE_MIN_CALLS,
    mix: normalizeShiftQueueMix(input.mix ?? preset?.mix ?? DEFAULT_SHIFT_QUEUE_MIX),
    industry: normalizeShiftQueueIndustry(input.industry),
    presetId: typeof input.presetId === "string" && input.presetId.trim() ? input.presetId.trim() : preset?.id ?? null,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
    updatedByUserId: typeof input.updatedByUserId === "string" ? input.updatedByUserId : null,
  };
}

export function getShiftQueueTargetCounts(minCallsPerShift: number, mix: ShiftQueueMix) {
  const normalizedMix = normalizeShiftQueueMix(mix);
  const totalCalls = clamp(Math.round(minCallsPerShift), 0, 250);
  const exactAllocations = SHIFT_QUEUE_LANES.map((lane) => ({
    lane,
    exact: (totalCalls * normalizedMix[lane]) / 100,
  }));
  const base = Object.fromEntries(
    exactAllocations.map(({ lane, exact }) => [lane, Math.floor(exact)]),
  ) as ShiftQueueMix;

  let remainder = totalCalls - SHIFT_QUEUE_LANES.reduce((sum, lane) => sum + base[lane], 0);
  if (remainder > 0) {
    const byFraction = [...exactAllocations].sort((left, right) => {
      const fractionDiff = right.exact - Math.floor(right.exact) - (left.exact - Math.floor(left.exact));
      if (fractionDiff !== 0) return fractionDiff;
      return normalizedMix[right.lane] - normalizedMix[left.lane];
    });

    for (const item of byFraction) {
      if (remainder <= 0) break;
      base[item.lane] += 1;
      remainder -= 1;
    }
  }

  return base;
}

export function countShiftQueueEntriesByLane(entries: ShiftQueueEntry[]) {
  return entries.reduce<ShiftQueueMix>((acc, entry) => {
    acc[entry.lane] += 1;
    return acc;
  }, emptyLaneMix());
}

export function buildShiftQueuePlanProgress(
  settings: ShiftQueueSettings,
  completedTodayEntries: ShiftQueueEntry[],
  queueEntries: ShiftQueueEntry[],
): ShiftQueuePlanProgress {
  const completedCountsByLane = countShiftQueueEntriesByLane(completedTodayEntries);
  const queuedCountsByLane = countShiftQueueEntriesByLane(queueEntries);
  const targetCountsByLane = getShiftQueueTargetCounts(settings.minCallsPerShift, settings.mix);
  const remainingCountsByLane = SHIFT_QUEUE_LANES.reduce<ShiftQueueMix>((acc, lane) => {
    acc[lane] = Math.max(targetCountsByLane[lane] - completedCountsByLane[lane], 0);
    return acc;
  }, emptyLaneMix());
  const completedCount = completedTodayEntries.length;
  const remainingCalls = Math.max(settings.minCallsPerShift - completedCount, 0);
  const targetProgressPercent =
    settings.minCallsPerShift > 0 ? Math.min(Math.round((completedCount / settings.minCallsPerShift) * 100), 100) : 100;

  const focusLane =
    [...SHIFT_QUEUE_LANES]
      .sort((left, right) => {
        const deficitDiff = remainingCountsByLane[right] - remainingCountsByLane[left];
        if (deficitDiff !== 0) return deficitDiff;
        const mixDiff = settings.mix[right] - settings.mix[left];
        if (mixDiff !== 0) return mixDiff;
        return queuedCountsByLane[right] - queuedCountsByLane[left];
      })
      .find((lane) => remainingCountsByLane[lane] > 0 && queuedCountsByLane[lane] > 0) ?? null;

  return {
    settings,
    completedCount,
    completedCountsByLane,
    queuedCountsByLane,
    targetCountsByLane,
    remainingCountsByLane,
    remainingCalls,
    targetProgressPercent,
    focusLane,
  };
}

function getShiftQueueLanePriorityBoost(entry: ShiftQueueEntry, progress: ShiftQueuePlanProgress | null) {
  if (!progress) return 0;
  const deficit = progress.remainingCountsByLane[entry.lane];
  if (deficit <= 0) return 0;

  let bonus = 220 + deficit * 16 + progress.settings.mix[entry.lane] * 2;
  if (progress.focusLane === entry.lane) {
    bonus += 80;
  }
  return bonus;
}

export function prioritizeShiftQueueEntries(entries: ShiftQueueEntry[], progress: ShiftQueuePlanProgress | null) {
  if (!progress) return entries;

  return [...entries].sort((left, right) => {
    const priorityDiff =
      right.priority + getShiftQueueLanePriorityBoost(right, progress) -
      (left.priority + getShiftQueueLanePriorityBoost(left, progress));
    if (priorityDiff !== 0) return priorityDiff;
    return left.lead.businessName.localeCompare(right.lead.businessName);
  });
}

export function getSuggestedNextStep(status: LeadWorkspaceStatus) {
  if (status === "UNSET" || status === "NEW") return "Make first outreach";
  if (status === "ATTEMPTED") return "Try a second touch";
  if (status === "CONTACTED") return "Push for the demo";
  if (status === "DEMO_BOOKED") return "Prep and confirm show";
  if (status === "AWAITING_APPROVAL") return "Follow up on decision";
  if (status === "PAYMENT_PENDING") return "Collect payment";
  if (status === "DISQUALIFIED") return "No action needed";
  return "Closed won";
}

export function isLeadTouchedToday(updatedAt?: string | null, now = new Date()) {
  const parsed = new Date(updatedAt ?? "");
  if (Number.isNaN(parsed.getTime())) return false;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return parsed.getTime() >= startOfToday.getTime();
}

export function getShiftQueueLaneLabel(lane: ShiftQueueLane) {
  if (lane === "MONEY") return "Money Move";
  if (lane === "FOLLOW_UP") return "Follow Up";
  if (lane === "DEMO") return "Demo Prep";
  return "Fresh Start";
}

export function getShiftQueueEntry(lead: Lead): ShiftQueueEntry | null {
  if (!lead.phone?.trim()) return null;

  const status = resolveLeadWorkspaceStatus(lead);
  if (status === "CLOSED" || status === "DISQUALIFIED") {
    return null;
  }

  const touchedToday = isLeadTouchedToday(lead.updatedAt);
  let lane: ShiftQueueLane = "FRESH";
  let reason = touchedToday ? "Already worked today" : "Fresh lead needs first call";
  let priority = 70;

  if (status === "PAYMENT_PENDING") {
    lane = "MONEY";
    priority += 130;
    reason = touchedToday ? "Payment follow-up already touched today" : "Pending payment follow-up";
  } else if (status === "AWAITING_APPROVAL") {
    lane = "MONEY";
    priority += 118;
    reason = touchedToday ? "Decision follow-up already touched today" : "Awaiting decision follow-up";
  } else if (status === "CONTACTED") {
    lane = "FOLLOW_UP";
    priority += 98;
    reason = touchedToday ? "Warm conversation already worked today" : "Warm follow-up due today";
  } else if (status === "ATTEMPTED") {
    lane = "FOLLOW_UP";
    priority += 86;
    reason = touchedToday ? "Attempted today" : "Second touch due";
  } else if (status === "DEMO_BOOKED") {
    lane = "DEMO";
    priority += 62;
    reason = touchedToday ? "Demo prep already handled today" : "Demo confirmation or prep due";
  } else {
    lane = "FRESH";
    priority += 76;
  }

  const updatedAtMs = new Date(lead.updatedAt ?? "").getTime();
  if (!Number.isNaN(updatedAtMs)) {
    const ageInDays = Math.floor((Date.now() - updatedAtMs) / (1000 * 60 * 60 * 24));
    priority += Math.min(Math.max(ageInDays, 0), 14);
  }

  if (touchedToday) {
    priority = Math.max(priority - 1000, 0);
  }

  return {
    lead,
    lane,
    priority,
    reason,
    status,
    suggestedNextStep: getSuggestedNextStep(status),
    touchedToday,
  };
}

export function buildShiftQueueEntries(
  leads: Lead[],
  options?: {
    includeTouchedToday?: boolean;
    limit?: number;
  },
) {
  const includeTouchedToday = Boolean(options?.includeTouchedToday);
  const entries = leads
    .map(getShiftQueueEntry)
    .filter((entry): entry is ShiftQueueEntry => Boolean(entry))
    .filter((entry) => (includeTouchedToday ? true : !entry.touchedToday))
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }
      return left.lead.businessName.localeCompare(right.lead.businessName);
    });

  if (typeof options?.limit === "number") {
    return entries.slice(0, Math.max(options.limit, 0));
  }

  return entries;
}
