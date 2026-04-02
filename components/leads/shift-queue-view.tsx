"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Phone,
  PhoneOff,
  Sparkles,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useAmazonConnect } from "@/components/amazon-connect-provider";
import { buildFallbackPlaybook, type AIDynamicPlaybook } from "@/lib/ai-playbook";
import type { Lead } from "@/lib/types";
import type { LeadWorkspaceStatus } from "@/lib/lead-workspace-status";
import {
  buildShiftQueueEntries,
  buildShiftQueuePlanProgress,
  getShiftQueueLaneLabel,
  prioritizeShiftQueueEntries,
  SHIFT_QUEUE_LANES,
  type ShiftQueueEntry,
  type ShiftQueueLane,
  type ShiftQueuePlanProgress,
  type ShiftQueueSettings,
} from "@/lib/shift-queue";

type ShiftQueueViewProps = {
  leads?: Lead[] | null;
  errorMessage?: string | null;
  currentUserId?: string | null;
  queueOwnerId?: string | null;
  queueOwnerName?: string | null;
  queueSettings?: ShiftQueueSettings | null;
  canManageQueues?: boolean;
  selectableQueueOwners?: QueueOwnerOption[];
};

type QueueFilter = "ALL" | ShiftQueueLane;
type ScriptTab = "Scripts" | "Objections" | "Signals";
type QueueOwnerOption = {
  id: string;
  name: string;
  email?: string | null;
  role?: string;
};
type LeadWorkspaceSeed = {
  leadId: string;
  lead: Lead;
  orderedLeadIds: string[];
};

type PendingCallLink = {
  leadId: string;
  leadOwnerId: string | null;
  source: "shift-queue";
};

const LEAD_WORKSPACE_SEED_KEY = "felix.leadWorkspaceSeed";

const queueFilterOptions: Array<{ value: QueueFilter; label: string }> = [
  { value: "ALL", label: "All Ready" },
  { value: "MONEY", label: "Money Moves" },
  { value: "FOLLOW_UP", label: "Follow Ups" },
  { value: "FRESH", label: "Fresh Starts" },
  { value: "DEMO", label: "Demo Prep" },
];

const statusLabelMap: Record<LeadWorkspaceStatus, string> = {
  UNSET: "No Status",
  NEW: "Not Contacted",
  ATTEMPTED: "Attempted Contact",
  CONTACTED: "Contacted",
  DEMO_BOOKED: "Demo Booked",
  AWAITING_APPROVAL: "Awaiting Approval",
  PAYMENT_PENDING: "Payment Pending",
  CLOSED: "Closed Won",
  DISQUALIFIED: "Disqualified",
};

const statusPillMap: Record<LeadWorkspaceStatus, string> = {
  UNSET: "border-zinc-700/80 bg-zinc-900/70 text-zinc-200",
  NEW: "border-zinc-700/80 bg-zinc-900/70 text-zinc-200",
  ATTEMPTED: "border-amber-400/35 bg-amber-400/15 text-amber-100",
  CONTACTED: "border-sky-400/35 bg-sky-400/15 text-sky-100",
  DEMO_BOOKED: "border-fuchsia-400/35 bg-fuchsia-400/15 text-fuchsia-100",
  AWAITING_APPROVAL: "border-violet-400/35 bg-violet-400/15 text-violet-100",
  PAYMENT_PENDING: "border-emerald-400/35 bg-emerald-400/15 text-emerald-100",
  CLOSED: "border-emerald-400/35 bg-emerald-400/15 text-emerald-100",
  DISQUALIFIED: "border-rose-400/35 bg-rose-400/15 text-rose-100",
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getLaneSurface(entryOrLane: ShiftQueueEntry | ShiftQueueLane) {
  const lane = typeof entryOrLane === "string" ? entryOrLane : entryOrLane.lane;

  if (lane === "MONEY") {
    return {
      badge: "border-emerald-300/40 bg-emerald-300/15 text-emerald-50",
      card: "border-emerald-400/25 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_58%),linear-gradient(135deg,rgba(7,24,18,0.98),rgba(7,18,22,0.96))]",
      line: "from-emerald-300 via-lime-300 to-amber-200",
    };
  }

  if (lane === "FOLLOW_UP") {
    return {
      badge: "border-sky-300/40 bg-sky-300/15 text-sky-50",
      card: "border-sky-400/25 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_58%),linear-gradient(135deg,rgba(7,18,28,0.98),rgba(8,16,30,0.96))]",
      line: "from-sky-300 via-cyan-300 to-blue-200",
    };
  }

  if (lane === "DEMO") {
    return {
      badge: "border-fuchsia-300/40 bg-fuchsia-300/15 text-fuchsia-50",
      card: "border-fuchsia-400/25 bg-[radial-gradient(circle_at_top,rgba(217,70,239,0.18),transparent_58%),linear-gradient(135deg,rgba(28,10,32,0.98),rgba(18,8,28,0.96))]",
      line: "from-fuchsia-300 via-violet-300 to-pink-200",
    };
  }

  return {
    badge: "border-amber-300/40 bg-amber-300/15 text-amber-50",
    card: "border-amber-400/25 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),transparent_58%),linear-gradient(135deg,rgba(30,20,10,0.98),rgba(25,14,8,0.96))]",
    line: "from-amber-300 via-orange-300 to-yellow-200",
  };
}

function formatLastTouched(updatedAt?: string | null) {
  const parsed = new Date(updatedAt ?? "");
  if (Number.isNaN(parsed.getTime())) return "No touch logged";

  const diffMs = Date.now() - parsed.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Touched just now";
  if (diffHours < 24) return `Touched ${diffHours}h ago`;
  if (diffDays < 7) return `Touched ${diffDays}d ago`;
  return `Touched ${parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function formatWorkedAt(updatedAt?: string | null) {
  const parsed = new Date(updatedAt ?? "");
  if (Number.isNaN(parsed.getTime())) return "Worked today";
  return `Worked ${parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function formatDemoSlot(lead: Lead) {
  if (!lead.demoBooking?.date) return "No demo scheduled";
  return `${lead.demoBooking.date}${lead.demoBooking.time ? ` at ${lead.demoBooking.time}` : ""}`;
}

function normalizeOutboundPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return value.trim();
}

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildQueueSmartScript(entry: ShiftQueueEntry): AIDynamicPlaybook {
  const laneSignal =
    entry.lane === "MONEY"
      ? "This is a high-intent approval or payment conversation. Be direct, tighten the timeline, and ask for a concrete yes-or-no next step."
      : entry.lane === "FOLLOW_UP"
        ? "This is a warm follow-up. Reference the prior conversation quickly, then push toward the demo or decision instead of restarting cold."
        : entry.lane === "DEMO"
          ? "This is a demo prep touch. Confirm attendance, reset the value of the walkthrough, and reduce no-show risk."
          : "This is a first-touch cold call. Use the pattern interrupt, keep it low pressure, and move fast to later-today or tomorrow.";

  const leadContext = entry.lead.aiResearchSummary?.trim()
    ? entry.lead.aiResearchSummary.trim()
    : `${entry.lead.businessType || "Local service"} lead in ${entry.lead.city || "their market"}. Suggested move: ${entry.suggestedNextStep}.`;

  return buildFallbackPlaybook({
    leadName: entry.lead.businessName,
    city: entry.lead.city,
    researchContext: leadContext,
    hasSocialPresence: /(instagram|facebook|tiktok|youtube|linkedin|social)/i.test(leadContext),
    learnedData: [
      `Suggested move: ${entry.suggestedNextStep}`,
      laneSignal,
      "Winning team pattern: pattern interrupt, website already built, and offer later today or tomorrow instead of an open-ended follow-up.",
      "Winning team pattern: keep the walkthrough live. Do not dump the preview cold into email unless the call is already earned.",
    ],
    transcriptSignals: [
      laneSignal,
      "Working for the team: low-pressure opener, real preview angle, and tight next-step framing.",
      "Working for the team: ask later today or tomorrow instead of 'when are you free?'",
      "Working for the team: bridge objections back to a 15-minute walkthrough instead of debating on the call.",
    ],
    refreshSummary: `Smart queue script tuned for ${entry.suggestedNextStep.toLowerCase()} using the fallback playbook and the team's strongest current call patterns.`,
  });
}

function getLanePoints(lane: ShiftQueueLane) {
  if (lane === "MONEY") return 30;
  if (lane === "FOLLOW_UP") return 24;
  if (lane === "DEMO") return 18;
  return 16;
}

function getMomentumTier(completedCount: number) {
  if (completedCount >= 18) {
    return {
      label: "On Fire",
      copy: "Heavy touch volume. Keep the queue moving while the energy is high.",
      nextTarget: null,
    };
  }

  if (completedCount >= 10) {
    return {
      label: "Locked In",
      copy: "Good pace. A few more quality touches turns this into a strong shift.",
      nextTarget: 18,
    };
  }

  if (completedCount >= 5) {
    return {
      label: "Warmed Up",
      copy: "The board is moving. Stay on the high-intent leads before momentum cools off.",
      nextTarget: 10,
    };
  }

  return {
    label: "Start Strong",
    copy: "Clear the first few calls fast to get the shift rolling.",
    nextTarget: 5,
  };
}

export function ShiftQueueView({
  leads,
  errorMessage,
  currentUserId = null,
  queueOwnerId = null,
  queueOwnerName = null,
  queueSettings = null,
  canManageQueues = false,
  selectableQueueOwners = [],
}: ShiftQueueViewProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    activeContactId,
    agentReadyForOutbound,
    agentStateLabel,
    callError,
    callSeconds,
    callStatus,
    ccpReady,
    completeAfterCallWork,
    endActiveCall,
    retrySecondsRemaining,
    startOutboundCall,
  } = useAmazonConnect();
  const [selectedFilter, setSelectedFilter] = useState<QueueFilter>("ALL");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [dialingLeadId, setDialingLeadId] = useState<string | null>(null);
  const [activeQueueLeadId, setActiveQueueLeadId] = useState<string | null>(null);
  const [currentContactId, setCurrentContactId] = useState<string | null>(null);
  const [isCompletingAcw, setIsCompletingAcw] = useState(false);
  const [showDisposition, setShowDisposition] = useState(false);
  const [selectedDisposition, setSelectedDisposition] = useState("");
  const [dispositionSummary, setDispositionSummary] = useState("");
  const [savingDisposition, setSavingDisposition] = useState(false);
  const [dispositionError, setDispositionError] = useState<string | null>(null);
  const [dispositionLeadId, setDispositionLeadId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [scriptTab, setScriptTab] = useState<ScriptTab>("Scripts");

  const pendingCallLinkRef = useRef<PendingCallLink | null>(null);
  const linkedContactIdRef = useRef<string | null>(null);
  const promptedDispositionContactIdRef = useRef<string | null>(null);
  const previousCallStatusRef = useRef<"idle" | "connecting" | "connected" | "acw">("idle");

  const viewingManagedQueue = Boolean(queueOwnerId && currentUserId && queueOwnerId !== currentUserId);
  const canDialQueue = !viewingManagedQueue;
  const queueViewLabel = queueOwnerName?.trim() || (viewingManagedQueue ? "Selected rep" : "Your queue");
  const leadWorkspaceHref = viewingManagedQueue ? "/leads" : "/my-leads";
  const leadWorkspaceLabel = viewingManagedQueue ? "Lead Directory" : "My Leads";
  const storageKey = useMemo(() => `felix.shiftQueue.${queueOwnerId ?? currentUserId ?? "default"}`, [currentUserId, queueOwnerId]);

  const baseQueueEntries = useMemo(() => buildShiftQueueEntries(leads ?? []), [leads]);
  const allTrackableEntries = useMemo(() => buildShiftQueueEntries(leads ?? [], { includeTouchedToday: true }), [leads]);

  const completedTodayEntries = useMemo(
    () =>
      allTrackableEntries
        .filter((entry) => entry.touchedToday)
        .sort((left, right) => new Date(right.lead.updatedAt ?? "").getTime() - new Date(left.lead.updatedAt ?? "").getTime()),
    [allTrackableEntries],
  );
  const queuePlanProgress = useMemo<ShiftQueuePlanProgress | null>(
    () => (queueSettings ? buildShiftQueuePlanProgress(queueSettings, completedTodayEntries, baseQueueEntries) : null),
    [baseQueueEntries, completedTodayEntries, queueSettings],
  );
  const queueEntries = useMemo(
    () => prioritizeShiftQueueEntries(baseQueueEntries, queuePlanProgress),
    [baseQueueEntries, queuePlanProgress],
  );

  const visibleQueueEntries = useMemo(() => {
    if (selectedFilter === "ALL") return queueEntries;
    return queueEntries.filter((entry) => entry.lane === selectedFilter);
  }, [queueEntries, selectedFilter]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as { filter?: QueueFilter; selectedLeadId?: string | null } | null;
      if (parsed?.filter && queueFilterOptions.some((option) => option.value === parsed.filter)) {
        setSelectedFilter(parsed.filter);
      }
      if (typeof parsed?.selectedLeadId === "string") {
        setSelectedLeadId(parsed.selectedLeadId);
      }
    } catch {
      // Ignore malformed queue preferences.
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ filter: selectedFilter, selectedLeadId }));
    } catch {
      // Ignore storage failures.
    }
  }, [selectedFilter, selectedLeadId, storageKey]);

  useEffect(() => {
    if (visibleQueueEntries.length === 0) {
      setSelectedLeadId(null);
      return;
    }

    if (!selectedLeadId || !visibleQueueEntries.some((entry) => entry.lead.id === selectedLeadId)) {
      setSelectedLeadId(visibleQueueEntries[0]?.lead.id ?? null);
    }
  }, [selectedLeadId, visibleQueueEntries]);

  useEffect(() => {
    if (!dialingLeadId) return;
    if (callStatus === "connecting" || callStatus === "connected" || callStatus === "acw") {
      setDialingLeadId(null);
    }
  }, [callStatus, dialingLeadId]);

  useEffect(() => {
    if (activeContactId && activeContactId !== currentContactId) {
      setCurrentContactId(activeContactId);
    }
  }, [activeContactId, currentContactId]);

  useEffect(() => {
    const previousCallStatus = previousCallStatusRef.current;
    const dispositionContactId = activeContactId ?? currentContactId;
    const shouldPromptDisposition =
      canDialQueue &&
      Boolean(dispositionContactId) &&
      !showDisposition &&
      promptedDispositionContactIdRef.current !== dispositionContactId &&
      (callStatus === "acw" || (callStatus === "idle" && previousCallStatus !== "idle"));

    if (shouldPromptDisposition) {
      promptedDispositionContactIdRef.current = dispositionContactId;
      setDispositionLeadId(activeQueueLeadId ?? selectedLeadId ?? null);
      setDispositionError(null);
      setShowDisposition(true);
    }

    if (callStatus !== previousCallStatus && (callStatus === "connected" || callStatus === "connecting")) {
      setShowDisposition(false);
      setDispositionError(null);
    }

    previousCallStatusRef.current = callStatus;
  }, [activeContactId, activeQueueLeadId, callStatus, canDialQueue, currentContactId, selectedLeadId, showDisposition]);

  useEffect(() => {
    if (!callError) return;
    setDialingLeadId(null);
  }, [callError]);

  useEffect(() => {
    if (callStatus !== "idle") return;
    pendingCallLinkRef.current = null;
    linkedContactIdRef.current = null;
  }, [callStatus]);

  useEffect(() => {
    if (!activeContactId || !pendingCallLinkRef.current || linkedContactIdRef.current === activeContactId) {
      return;
    }

    let cancelled = false;
    const pendingLink = pendingCallLinkRef.current;

    const linkCallToLead = async () => {
      const response = await fetch("/api/call-analytics/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: pendingLink.leadId,
          contactId: activeContactId,
          source: pendingLink.source,
          repId: currentUserId ?? undefined,
          leadOwnerId: pendingLink.leadOwnerId ?? undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Unable to link call to lead.");
      }

      if (!cancelled) {
        linkedContactIdRef.current = activeContactId;
        pendingCallLinkRef.current = null;
        setLinkError(null);
      }
    };

    linkCallToLead().catch((error) => {
      if (!cancelled) {
        setLinkError(error instanceof Error ? error.message : "Unable to link call to lead.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeContactId, currentUserId]);

  const selectedIndex = useMemo(
    () => visibleQueueEntries.findIndex((entry) => entry.lead.id === selectedLeadId),
    [selectedLeadId, visibleQueueEntries],
  );
  const focusedEntry = selectedIndex >= 0 ? visibleQueueEntries[selectedIndex] : visibleQueueEntries[0] ?? null;
  const activeQueueEntry = useMemo(
    () => (activeQueueLeadId ? queueEntries.find((entry) => entry.lead.id === activeQueueLeadId) ?? null : null),
    [activeQueueLeadId, queueEntries],
  );
  const displayEntry = activeQueueEntry ?? focusedEntry;
  const displayLeadId = displayEntry?.lead.id ?? null;
  const displayIndex = useMemo(
    () => (displayLeadId ? visibleQueueEntries.findIndex((entry) => entry.lead.id === displayLeadId) : -1),
    [displayLeadId, visibleQueueEntries],
  );
  const dispositionEntry = useMemo(
    () => (dispositionLeadId ? allTrackableEntries.find((entry) => entry.lead.id === dispositionLeadId) ?? null : null),
    [allTrackableEntries, dispositionLeadId],
  );
  const scriptEntry = activeQueueEntry ?? focusedEntry;
  const smartPlaybook = useMemo(() => (scriptEntry ? buildQueueSmartScript(scriptEntry) : null), [scriptEntry]);
  const focusSurface = displayEntry ? getLaneSurface(displayEntry) : getLaneSurface("FRESH");

  const queueCountsByFilter = useMemo(
    () => ({
      ALL: queueEntries.length,
      MONEY: queueEntries.filter((entry) => entry.lane === "MONEY").length,
      FOLLOW_UP: queueEntries.filter((entry) => entry.lane === "FOLLOW_UP").length,
      FRESH: queueEntries.filter((entry) => entry.lane === "FRESH").length,
      DEMO: queueEntries.filter((entry) => entry.lane === "DEMO").length,
    }),
    [queueEntries],
  );

  const totalWorkload = queueEntries.length + completedTodayEntries.length;
  const completedTodayCount = completedTodayEntries.length;
  const queueClearPercent = totalWorkload > 0 ? Math.round((completedTodayCount / totalWorkload) * 100) : 100;
  const momentumPoints = completedTodayEntries.reduce((sum, entry) => sum + getLanePoints(entry.lane), 0);
  const momentumTier = getMomentumTier(completedTodayCount);
  const nextTargetDistance = momentumTier.nextTarget ? Math.max(momentumTier.nextTarget - completedTodayCount, 0) : 0;
  const queueFocusLane = queuePlanProgress?.focusLane ?? null;
  const queueFocusLaneLabel = queueFocusLane ? getShiftQueueLaneLabel(queueFocusLane) : null;
  const queueFocusRemaining = queueFocusLane ? queuePlanProgress?.remainingCountsByLane[queueFocusLane] ?? 0 : 0;
  const queueCallsRemaining = queuePlanProgress?.remainingCalls ?? 0;
  const queueCoachSummary = queuePlanProgress
    ? queueFocusLane && queueFocusRemaining > 0
      ? `${queueFocusRemaining} more ${queueFocusLaneLabel?.toLowerCase()} call${queueFocusRemaining === 1 ? "" : "s"} to stay on the manager-set mix.`
      : queueCallsRemaining > 0
        ? `${queueCallsRemaining} more worked lead${queueCallsRemaining === 1 ? "" : "s"} to hit the shift minimum.`
        : "Shift minimum hit. Keep clearing high-intent leads if the board still has room."
    : null;
  const isInAfterCallWork = callStatus === "acw";
  const isCallInProgress = callStatus === "connecting" || callStatus === "connected";
  const isDialing = callStatus === "connecting";
  const isLiveCall = callStatus === "connected";
  const showLiveCallCard = canDialQueue && (isCallInProgress || isInAfterCallWork);
  const callStatusLabel = isDialing ? "Dialing" : isLiveCall ? "Connected" : isInAfterCallWork ? "After Call Work" : "Idle";
  const dialDisabledReason = !canDialQueue
    ? "Switch back to your own queue to place calls or disposition leads from this board."
    : isInAfterCallWork
    ? "Complete after-call work before starting the next call."
    : isCallInProgress
    ? "Finish the current live call before starting another one."
    : !ccpReady
    ? "Amazon Connect is still loading in this tab."
    : !agentReadyForOutbound
      ? agentStateLabel
        ? `Amazon Connect is currently ${agentStateLabel}.`
        : "Amazon Connect is not ready for outbound dialing."
      : retrySecondsRemaining > 0
        ? `Amazon Connect is throttled for ${retrySecondsRemaining}s.`
        : null;

  function openRelativeLead(offset: -1 | 1) {
    if (visibleQueueEntries.length === 0) return;
    const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= visibleQueueEntries.length) return;
    setSelectedLeadId(visibleQueueEntries[nextIndex]?.lead.id ?? null);
  }

  function handleDialLead(entry: ShiftQueueEntry) {
    if (!canDialQueue) return;
    const formattedNumber = normalizeOutboundPhone(entry.lead.phone || "");
    if (!formattedNumber) return;

    setSelectedLeadId(entry.lead.id);
    setActiveQueueLeadId(entry.lead.id);
    setCurrentContactId(null);
    promptedDispositionContactIdRef.current = null;
    linkedContactIdRef.current = null;
    pendingCallLinkRef.current = {
      leadId: String(entry.lead.id ?? ""),
      leadOwnerId: typeof entry.lead.ownerId === "string" && entry.lead.ownerId ? entry.lead.ownerId : null,
      source: "shift-queue",
    };
    setLinkError(null);
    setDialingLeadId(entry.lead.id);
    startOutboundCall(formattedNumber);
  }

  async function handleCompleteAcw() {
    if (isCompletingAcw) return;
    setIsCompletingAcw(true);
    try {
      await completeAfterCallWork();
    } finally {
      setIsCompletingAcw(false);
    }
  }

  async function handleSubmitDisposition() {
    const dispositionContactId = activeContactId ?? currentContactId;
    if (!canDialQueue || !selectedDisposition || !dispositionEntry?.lead.id || !dispositionContactId) return;

    setSavingDisposition(true);
    setDispositionError(null);

    try {
      const summary = dispositionSummary.trim();
      const content = summary || `Disposition recorded: ${selectedDisposition}`;
      const response = await fetch("/api/lead-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: dispositionEntry.lead.id,
          content,
          channel: `disposition:${selectedDisposition.toLowerCase().replace(/\s+/g, "_")}`,
          contactId: dispositionContactId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save disposition.");
      }

      const clearedAfterCallWork = await completeAfterCallWork();
      if (!clearedAfterCallWork) {
        setDispositionError("Disposition was saved, but Amazon Connect is still holding the contact in ACW.");
        return;
      }

      setShowDisposition(false);
      setSelectedDisposition("");
      setDispositionSummary("");
      setDispositionLeadId(null);
      setDispositionError(null);
      setCurrentContactId(null);
      setActiveQueueLeadId(null);
      promptedDispositionContactIdRef.current = null;
    } catch (error) {
      setDispositionError(error instanceof Error ? error.message : "Unable to save disposition.");
    } finally {
      setSavingDisposition(false);
    }
  }

  function openWorkspace(entry: ShiftQueueEntry) {
    try {
      const seed: LeadWorkspaceSeed = {
        leadId: String(entry.lead.id ?? ""),
        lead: entry.lead,
        orderedLeadIds: visibleQueueEntries.map((candidate) => String(candidate.lead.id ?? "")).filter(Boolean),
      };
      window.sessionStorage.setItem(LEAD_WORKSPACE_SEED_KEY, JSON.stringify(seed));
    } catch {
      // Ignore session storage failures and still navigate.
    }

    router.push(`/leads/${String(entry.lead.id ?? "")}`);
  }

  function handleQueueOwnerChange(nextQueueOwnerId: string) {
    if (!canManageQueues || !pathname || typeof window === "undefined") return;

    const normalizedNextQueueOwnerId = nextQueueOwnerId.trim();
    if (!normalizedNextQueueOwnerId) return;

    const currentQueueOwnerId = queueOwnerId ?? currentUserId ?? "";
    if (normalizedNextQueueOwnerId === currentQueueOwnerId) return;

    const params = new URLSearchParams(window.location.search);
    if (currentUserId && normalizedNextQueueOwnerId === currentUserId) {
      params.delete("rep");
    } else {
      params.set("rep", normalizedNextQueueOwnerId);
    }

    const nextHref = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextHref);
  }

  return (
    <div className="space-y-5">
      {showDisposition && dispositionEntry ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-zinc-950/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-300">After Call Work Required</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-100">Log the call outcome before moving on</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Save the disposition for {dispositionEntry.lead.businessName}, then Amazon Connect will clear ACW from the queue.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {["Interested", "Not Interested", "No Answer", "Call Back", "Wrong Number", "Booked Demo"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelectedDisposition(option)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition",
                    selectedDisposition === option
                      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                      : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            <textarea
              value={dispositionSummary}
              onChange={(event) => setDispositionSummary(event.target.value)}
              className="mt-4 h-24 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
              placeholder="Summarize what happened on the call..."
            />

            <button
              type="button"
              onClick={() => {
                void handleSubmitDisposition();
              }}
              disabled={savingDisposition || !selectedDisposition}
              className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
            >
              {savingDisposition ? "Saving disposition..." : "Complete ACW"}
            </button>
            {dispositionError ? <p className="mt-3 text-sm text-rose-300">{dispositionError}</p> : null}
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[28px] border border-amber-300/20 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.16),transparent_38%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_34%),linear-gradient(145deg,rgba(14,14,19,0.98),rgba(8,12,24,0.96))] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.35)] md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">
              <Sparkles className="h-3.5 w-3.5" />
              Shift Queue
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">Dial through the shift with less clutter.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-[15px]">
              This board only shows leads that still need a same-day touch. Once a lead is called and dispositioned, it drops out of this queue and
              stays in{" "}
              <Link href={leadWorkspaceHref} className="font-semibold text-amber-100 underline decoration-amber-300/40 underline-offset-4">
                {leadWorkspaceLabel}
              </Link>
              .
            </p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
              <Users className="h-3.5 w-3.5 text-sky-200" />
              Viewing {queueViewLabel}
            </p>
            {viewingManagedQueue ? (
              <p className="mt-3 max-w-2xl text-xs leading-5 text-sky-100/80">
                Manager view is read-only here so supervisors can inspect a rep&apos;s live board without logging calls or dispositions under the wrong user.
              </p>
            ) : null}
          </div>

          <div className="flex min-w-[280px] flex-col gap-3">
            {canManageQueues && selectableQueueOwners.length > 0 ? (
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4 backdrop-blur">
                <label className="block">
                  <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                    <Users className="h-4 w-4" />
                    Rep / Queue Owner
                  </span>
                  <select
                    value={queueOwnerId ?? currentUserId ?? ""}
                    onChange={(event) => handleQueueOwnerChange(event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                  >
                    {selectableQueueOwners.map((queueOwner) => (
                      <option key={queueOwner.id} value={queueOwner.id}>
                        {queueOwner.email ? `${queueOwner.name} (${queueOwner.email})` : queueOwner.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-3 text-xs leading-5 text-zinc-400">Managers and super admins can switch queues here to inspect a rep&apos;s live shift board.</p>
              </div>
            ) : null}

            <div className="rounded-3xl border border-white/10 bg-black/20 p-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Momentum Tier</p>
                  <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-white">
                    <Flame className="h-5 w-5 text-orange-300" />
                    {momentumTier.label}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Points</p>
                  <p className="mt-1 text-xl font-semibold text-amber-100">{momentumPoints}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-zinc-300">{momentumTier.copy}</p>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-zinc-500">
                  <span>Queue Clear</span>
                  <span>{queueClearPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-300 to-sky-300" style={{ width: `${queueClearPercent}%` }} />
                </div>
                {momentumTier.nextTarget ? (
                  <p className="text-xs text-zinc-400">{nextTargetDistance} more worked leads to reach the next tier.</p>
                ) : (
                  <p className="text-xs text-zinc-400">Top pacing tier for today.</p>
                )}
              </div>
              {queuePlanProgress ? (
                <div className="mt-4 rounded-2xl border border-sky-300/15 bg-sky-300/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-sky-100/75">Coach Mode</p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {completedTodayCount} / {queuePlanProgress.settings.minCallsPerShift} worked this shift
                  </p>
                  <p className="mt-2 text-xs leading-5 text-sky-50/80">{queueCoachSummary}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className={cn("mt-5 grid gap-3 md:grid-cols-2", queuePlanProgress ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
          {queuePlanProgress ? (
            <div className="rounded-3xl border border-white/15 bg-white/8 p-4 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-200/75">Shift Blueprint</p>
              <p className="mt-2 text-3xl font-semibold text-white">{queuePlanProgress.settings.minCallsPerShift}</p>
              <p className="mt-1 text-sm text-zinc-200/75">Minimum worked leads before the shift is counted clear.</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-300 via-emerald-300 to-amber-300"
                  style={{ width: `${queuePlanProgress.targetProgressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-zinc-300/80">
                {queueCallsRemaining > 0 ? `${queueCallsRemaining} more to hit the minimum.` : "Minimum hit for this shift."}
              </p>
            </div>
          ) : null}
          <div className="rounded-3xl border border-amber-300/25 bg-amber-300/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-100/80">Ready Right Now</p>
            <p className="mt-2 text-3xl font-semibold text-white">{queueEntries.length}</p>
            <p className="mt-1 text-sm text-amber-50/80">Only leads that still need today&apos;s touch.</p>
          </div>
          <div className="rounded-3xl border border-sky-300/25 bg-sky-300/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-sky-100/80">Worked Today</p>
            <p className="mt-2 text-3xl font-semibold text-white">{completedTodayCount}</p>
            <p className="mt-1 text-sm text-sky-50/80">Completed leads already moved out of the queue.</p>
          </div>
          <div className="rounded-3xl border border-emerald-300/25 bg-emerald-300/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-100/80">Money Moves</p>
            <p className="mt-2 text-3xl font-semibold text-white">{queueCountsByFilter.MONEY}</p>
            <p className="mt-1 text-sm text-emerald-50/80">Approval and payment follow-ups at the top of the board.</p>
          </div>
          <div className="rounded-3xl border border-fuchsia-300/25 bg-fuchsia-300/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-fuchsia-100/80">Fresh Starts</p>
            <p className="mt-2 text-3xl font-semibold text-white">{queueCountsByFilter.FRESH}</p>
            <p className="mt-1 text-sm text-fuchsia-50/80">Untouched leads ready for first outreach.</p>
          </div>
        </div>
      </section>

      {errorMessage ? <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</p> : null}

      {queueEntries.length === 0 ? (
        <section className="rounded-[28px] border border-emerald-300/20 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.18),transparent_42%),linear-gradient(145deg,rgba(9,20,16,0.98),rgba(8,16,20,0.96))] p-8 text-center">
          <div className="mx-auto max-w-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-emerald-100">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-white">Queue is clear.</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              There are no callable leads left that still need a same-day touch. Use{" "}
              <Link href={leadWorkspaceHref} className="font-semibold text-emerald-100 underline decoration-emerald-300/40 underline-offset-4">
                {leadWorkspaceLabel}
              </Link>{" "}
              to review the rest of the book or come back when new assignments or due follow-ups land.
            </p>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-zinc-800 bg-zinc-900/75 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Queue View</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Up Next</h2>
              </div>
              <span className="rounded-full border border-zinc-700 bg-zinc-950/70 px-3 py-1 text-xs font-semibold text-zinc-300">
                {visibleQueueEntries.length} showing
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {queueFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedFilter(option.value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    selectedFilter === option.value
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                  )}
                >
                  {option.label}
                  <span className="ml-2 text-zinc-500">{queueCountsByFilter[option.value]}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              {visibleQueueEntries.map((entry, index) => {
                const laneSurface = getLaneSurface(entry);
                const isSelected = displayLeadId === entry.lead.id;

                return (
                  <button
                    key={entry.lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(entry.lead.id)}
                    className={cn(
                      "w-full rounded-3xl border px-4 py-3 text-left transition",
                      isSelected ? laneSurface.card : "border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 hover:bg-zinc-950",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]", laneSurface.badge)}>
                            {getShiftQueueLaneLabel(entry.lane)}
                          </span>
                          {queueFocusLane === entry.lane && queueFocusRemaining > 0 ? (
                            <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100">
                              Coach Focus
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm font-semibold text-white">{entry.lead.businessName}</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          {entry.lead.businessType || "Unknown industry"} - {entry.lead.city || "Unknown city"}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-zinc-500">P{entry.priority}</span>
                    </div>
                    <p className="mt-3 text-xs text-zinc-300">{entry.reason}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {entry.lead.phone || "No phone"} - {formatLastTouched(entry.lead.updatedAt)}
                    </p>
                  </button>
                );
              })}
              {visibleQueueEntries.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/50 px-4 py-5 text-sm text-zinc-500">
                  No leads are sitting in this lane right now. Switch filters or keep clearing the board.
                </div>
              ) : null}
            </div>
          </aside>

          <div className="space-y-4">
            {displayEntry ? (
              <section className={cn("overflow-hidden rounded-[30px] border p-5 shadow-[0_25px_80px_rgba(0,0,0,0.35)] md:p-6", focusSurface.card)}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]", focusSurface.badge)}>
                        {getShiftQueueLaneLabel(displayEntry.lane)}
                      </span>
                      <span className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]", statusPillMap[displayEntry.status])}>
                        {statusLabelMap[displayEntry.status]}
                      </span>
                      {queueFocusLane === displayEntry.lane && queueFocusRemaining > 0 ? (
                        <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-50">
                          Coach Focus
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">{displayEntry.lead.businessName}</h2>
                    <p className="mt-2 text-sm text-zinc-300">
                      {displayEntry.lead.businessType || "Unknown industry"} - {displayEntry.lead.city || "Unknown city"}
                    </p>
                    <p className="mt-4 max-w-2xl text-[15px] leading-7 text-zinc-100">{displayEntry.reason}</p>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-black/20 p-4 text-right backdrop-blur">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{activeQueueEntry ? "Active Call" : "Queue Position"}</p>
                    {activeQueueEntry && displayIndex < 0 ? (
                      <>
                        <p className="mt-2 text-3xl font-semibold text-white">Pinned</p>
                        <p className="mt-2 text-xs text-zinc-400">Current call lead stays pinned here until the call flow is finished.</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-3xl font-semibold text-white">
                          {Math.max(displayIndex, 0) + 1}
                          <span className="text-base font-medium text-zinc-400"> / {visibleQueueEntries.length}</span>
                        </p>
                        <p className="mt-2 text-xs text-zinc-400">Priority score {displayEntry.priority}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-5 h-px overflow-hidden rounded-full bg-white/10">
                  <div className={cn("h-full bg-gradient-to-r", focusSurface.line)} />
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {showLiveCallCard ? (
                    <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 backdrop-blur">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-100/70">Phone</p>
                          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                            <Phone className="h-4 w-4 text-emerald-100" />
                            {activeQueueEntry?.lead.phone || displayEntry.lead.phone || "No phone"}
                          </p>
                        </div>
                        <span className="rounded-full border border-emerald-300/25 bg-emerald-300/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-50">
                          {callStatusLabel}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-emerald-50/80">
                        {activeQueueEntry?.lead.id && activeQueueEntry.lead.id !== displayEntry.lead.id
                          ? `Live call is linked to ${activeQueueEntry.lead.businessName}.`
                          : isDialing
                            ? "Amazon Connect is placing the outbound call now."
                            : isLiveCall
                              ? `Connected ${formatTimer(callSeconds)}.`
                              : "The contact has moved into after-call work."}
                      </p>
                        {callStatus !== "acw" ? (
                          <button
                            type="button"
                            onClick={endActiveCall}
                            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-rose-950 transition hover:bg-rose-400"
                        >
                            <PhoneOff className="h-4 w-4" />
                            {isDialing ? "Cancel Call" : "End Call"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              void handleCompleteAcw();
                            }}
                            disabled={isCompletingAcw}
                            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {isCompletingAcw ? "Clearing ACW..." : "Complete ACW"}
                          </button>
                        )}
                    </div>
                  ) : !canDialQueue ? (
                    <div className="rounded-3xl border border-sky-300/20 bg-sky-300/10 p-4 backdrop-blur">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-sky-100/75">Viewing Only</p>
                      <p className="mt-2 text-sm font-semibold text-white">This is {queueViewLabel}&apos;s live queue.</p>
                      <p className="mt-2 text-xs leading-5 text-sky-50/80">
                        Managers and super admins can inspect the board here, then switch back to their own queue before placing calls or finishing ACW.
                      </p>
                    </div>
                  ) : (
                      <button
                        type="button"
                        onClick={() => handleDialLead(displayEntry)}
                        disabled={Boolean(dialDisabledReason) || dialingLeadId === displayEntry.lead.id || !displayEntry.lead.phone}
                        className="rounded-3xl border border-emerald-300/35 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.24),transparent_58%),linear-gradient(145deg,rgba(8,34,24,0.98),rgba(6,24,22,0.96))] p-4 text-left shadow-[0_18px_40px_rgba(16,185,129,0.16)] backdrop-blur transition hover:border-emerald-200/50 hover:bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.28),transparent_58%),linear-gradient(145deg,rgba(8,40,28,0.98),rgba(6,26,24,0.96))] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-100/75">Call</p>
                        <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-300/20 text-emerald-50 animate-pulse">
                            <Phone className="h-4 w-4" />
                          </span>
                          {displayEntry.lead.phone || "No phone"}
                        </p>
                        <p className="mt-2 text-xs text-emerald-50/85">
                          {dialingLeadId === displayEntry.lead.id ? "Dialing..." : "Call this lead directly from the queue."}
                        </p>
                        <p className="mt-3 inline-flex items-center rounded-full border border-emerald-200/30 bg-emerald-200/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-50">
                          Call Now
                        </p>
                      </button>
                    )}
                  <div className="rounded-3xl border border-white/10 bg-black/20 p-4 backdrop-blur">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Suggested Move</p>
                    <p className="mt-2 text-sm font-semibold text-white">{displayEntry.suggestedNextStep}</p>
                    <p className="mt-2 text-xs text-zinc-400">Disposition this lead and it will fall out of the live queue.</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-black/20 p-4 backdrop-blur">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Last Touch</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <Clock3 className="h-4 w-4 text-zinc-400" />
                      {formatLastTouched(displayEntry.lead.updatedAt)}
                    </p>
                    <p className="mt-2 text-xs text-zinc-400">Untouched today leads stay here until the rep works them.</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-black/20 p-4 backdrop-blur">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Demo Slot</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <CalendarDays className="h-4 w-4 text-zinc-400" />
                      {formatDemoSlot(displayEntry.lead)}
                    </p>
                    <p className="mt-2 text-xs text-zinc-400">Demo-booked leads stay visible here until prep or confirmation is done today.</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScriptModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-sky-300/25 bg-sky-300/10 px-4 py-2.5 text-sm font-semibold text-sky-50 transition hover:bg-sky-300/15"
                  >
                    <Bot className="h-4 w-4" />
                    Smart Script
                  </button>
                  <button
                    type="button"
                    onClick={() => openWorkspace(displayEntry)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    Open Workspace
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openRelativeLead(-1)}
                    disabled={selectedIndex <= 0}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-black/35 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => openRelativeLead(1)}
                    disabled={selectedIndex === -1 || selectedIndex >= visibleQueueEntries.length - 1}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-black/35 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                {!showLiveCallCard && dialDisabledReason ? <p className="mt-3 text-xs text-amber-100/80">{dialDisabledReason}</p> : null}
                {callError ? <p className="mt-3 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{callError}</p> : null}
                {linkError ? <p className="mt-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">{linkError}</p> : null}
              </section>
            ) : null}

            {queuePlanProgress ? (
              <section className="rounded-[28px] border border-sky-300/20 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_38%),linear-gradient(145deg,rgba(11,18,30,0.98),rgba(8,13,24,0.96))] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-sky-200/70">Manager Blueprint</p>
                    <h3 className="mt-1 text-lg font-semibold text-white">What the queue is pushing next</h3>
                    <p className="mt-2 max-w-2xl text-sm text-zinc-300">
                      This queue is being steered toward a {queuePlanProgress.settings.minCallsPerShift}-call shift with the mix below.
                      Under-target lanes float to the top automatically so reps spend less time deciding what to dial next.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Next Push</p>
                    <p className="mt-1 text-base font-semibold text-white">{queueFocusLaneLabel ?? "Any lane"}</p>
                    <p className="mt-1 text-xs text-zinc-400">{queueCoachSummary}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {SHIFT_QUEUE_LANES.map((lane) => {
                    const targetCount = queuePlanProgress.targetCountsByLane[lane];
                    const completedCount = queuePlanProgress.completedCountsByLane[lane];
                    const remainingCount = queuePlanProgress.remainingCountsByLane[lane];
                    const queuedCount = queuePlanProgress.queuedCountsByLane[lane];
                    const lanePercent = queuePlanProgress.settings.mix[lane];
                    const laneProgress = targetCount > 0 ? Math.min(Math.round((completedCount / targetCount) * 100), 100) : 100;

                    return (
                      <div key={lane} className="rounded-3xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{getShiftQueueLaneLabel(lane)}</p>
                            <p className="mt-2 text-xl font-semibold text-white">{lanePercent}%</p>
                          </div>
                          {queueFocusLane === lane && remainingCount > 0 ? (
                            <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100">
                              Focus
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm text-zinc-200">
                          {completedCount} / {targetCount} worked
                        </p>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-300 via-emerald-300 to-amber-300"
                            style={{ width: `${laneProgress}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-zinc-400">
                          {remainingCount > 0
                            ? `${remainingCount} still needed. ${queuedCount} sitting in queue now.`
                            : `Target hit. ${queuedCount} still callable in this lane.`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="rounded-[28px] border border-zinc-800 bg-zinc-900/75 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Why This Queue Works</p>
                    <h3 className="mt-1 text-lg font-semibold text-white">The board stays small on purpose.</h3>
                  </div>
                  <span className="rounded-full border border-zinc-700 bg-zinc-950/70 px-3 py-1 text-xs font-semibold text-zinc-300">
                    Same-day touch removes the lead
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-4">
                    <Target className="h-5 w-5 text-amber-300" />
                    <p className="mt-3 text-sm font-semibold text-white">One lead at a time</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">Pick the current focus lead, work it, disposition it, then come back for the next one.</p>
                  </div>
                  <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-4">
                    <Zap className="h-5 w-5 text-sky-300" />
                    <p className="mt-3 text-sm font-semibold text-white">High-intent first</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">Approval, payment, and warm follow-up leads stay ahead of cold first-touch work.</p>
                  </div>
                  <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-4">
                    <Trophy className="h-5 w-5 text-emerald-300" />
                    <p className="mt-3 text-sm font-semibold text-white">Momentum stays visible</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">Reps can see the queue clearing in real time instead of digging through the full book of business.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-zinc-800 bg-zinc-900/75 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Worked Today</p>
                    <h3 className="mt-1 text-lg font-semibold text-white">Recent clears</h3>
                  </div>
                  <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-100">
                    {completedTodayCount}
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  {completedTodayEntries.slice(0, 5).map((entry) => (
                    <div key={entry.lead.id} className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{entry.lead.businessName}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {entry.lead.businessType || "Unknown industry"} - {entry.lead.city || "Unknown city"}
                          </p>
                        </div>
                        <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                          {getShiftQueueLaneLabel(entry.lane)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-zinc-400">{formatWorkedAt(entry.lead.updatedAt)}</p>
                    </div>
                  ))}
                  {completedTodayEntries.length === 0 ? (
                    <p className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/50 px-4 py-5 text-sm text-zinc-500">
                      No leads have been worked yet today. Start with the first card above and this column will fill in as the queue clears.
                    </p>
                  ) : null}
                </div>

                <Link
                  href={leadWorkspaceHref}
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-600 hover:bg-zinc-950"
                >
                  Open {leadWorkspaceLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </section>
          </div>
        </section>
      )}

      {scriptModalOpen && smartPlaybook && scriptEntry ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[30px] border border-sky-300/20 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_40%),linear-gradient(145deg,rgba(13,17,28,0.98),rgba(9,11,19,0.98))] shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 md:px-6">
              <div className="max-w-3xl">
                <p className="text-[11px] uppercase tracking-[0.18em] text-sky-200/75">Smart Call Script</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{scriptEntry.lead.businessName}</h2>
                <p className="mt-2 text-sm text-zinc-300">
                  Suggested move: <span className="font-semibold text-white">{scriptEntry.suggestedNextStep}</span>
                </p>
                <p className="mt-2 text-sm text-zinc-400">{smartPlaybook.refreshSummary}</p>
              </div>
              <button
                type="button"
                onClick={() => setScriptModalOpen(false)}
                className="rounded-2xl border border-white/10 bg-white/5 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Close smart script"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-5 py-3 md:px-6">
              {(["Scripts", "Objections", "Signals"] as ScriptTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setScriptTab(tab)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    scriptTab === tab ? "bg-white text-zinc-950" : "bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="max-h-[calc(88vh-10rem)] overflow-y-auto px-5 py-5 md:px-6">
              {scriptTab === "Scripts" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    {smartPlaybook.timingWindows.map((window) => (
                      <div key={window.label} className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/80">{window.label}</p>
                        <p className="mt-2 text-sm leading-6 text-emerald-50">{window.prompt}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-3xl border border-sky-300/20 bg-sky-300/10 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/80">Live Call Angle</p>
                    <p className="mt-2 text-sm leading-6 text-sky-50">
                      {scriptEntry.reason}. Move the call toward <span className="font-semibold">{scriptEntry.suggestedNextStep.toLowerCase()}</span> and use the team
                      pattern of offering later today or tomorrow instead of leaving the next step vague.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {smartPlaybook.sections.map((section, index) => (
                      <div key={section.id} className="rounded-3xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Step {index + 1}</p>
                            <h3 className="mt-1 text-sm font-semibold text-white">{section.title}</h3>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                            Live Call
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-zinc-400">{section.goal}</p>
                        <div className="mt-3 space-y-2">
                          {section.lines.map((line, lineIndex) => (
                            <p key={`${section.id}-${lineIndex}`} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm leading-6 text-zinc-100">
                              {line}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-3xl border border-indigo-300/20 bg-indigo-300/10 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-100/80">Close Options</p>
                    <div className="mt-3 space-y-2">
                      {smartPlaybook.closingOptions.map((option, index) => (
                        <p key={`${option}-${index}`} className="rounded-2xl border border-indigo-300/20 bg-indigo-950/30 px-3 py-2 text-sm leading-6 text-indigo-50">
                          {option}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : scriptTab === "Objections" ? (
                <div className="space-y-3">
                  {smartPlaybook.objections.map((item) => (
                    <div key={item.objection} className="rounded-3xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Objection</p>
                      <p className="mt-2 text-sm font-semibold text-white">{item.objection}</p>
                      <div className="mt-3 space-y-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Counter</p>
                          <p className="mt-2 text-sm leading-6 text-zinc-100">{item.counter}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">Bridge Back To The Close</p>
                          <p className="mt-2 text-sm leading-6 text-amber-50">{item.bridge}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-sky-300/20 bg-sky-300/10 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/80">What Is Working For The Team</p>
                    <div className="mt-3 space-y-2">
                      {smartPlaybook.transcriptSignals.map((signal, index) => (
                        <p key={`${signal}-${index}`} className="rounded-2xl border border-sky-300/15 bg-sky-950/30 px-3 py-2 text-sm leading-6 text-sky-50">
                          {signal}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Injected Context</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {smartPlaybook.injectedData.map((item, index) => (
                        <span key={`${item}-${index}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
