"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Copy, Globe, Link2, Phone, RotateCcw } from "lucide-react";
import { useAmazonConnect } from "@/components/amazon-connect-provider";
import { createClientComponentClient } from "@/lib/supabase-client";
import FollowUpEngine from "./FollowUpEngine";

type LeadRecord = {
  id: string;
  business_name?: string | null;
  businessName?: string | null;
  status?: string | null;
  phone?: string | null;
  website?: string | null;
  website_url?: string | null;
  websiteUrl?: string | null;
  city?: string | null;
  business_type?: string | null;
  businessType?: string | null;
  email?: string | null;
  deployed_url?: string | null;
  deployedUrl?: string | null;
  site_status?: "UNBUILT" | "BUILDING" | "LIVE" | "FAILED" | null;
  siteStatus?: "UNBUILT" | "BUILDING" | "LIVE" | "FAILED" | null;
  vercel_deployment_id?: string | null;
  vercelDeploymentId?: string | null;
  source_payload?: {
    aiResearchSummary?: string | null;
    contacts?: LeadContactRecord[];
    templateBranding?: {
      logoUrl?: string;
      heroImageUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
    };
    demoBooking?: {
      date?: string;
      time?: string;
      timeZone?: string;
      meetLink?: string;
      bookedAt?: string;
    };
  } | null;
  sourcePayload?: {
    aiResearchSummary?: string | null;
    contacts?: LeadContactRecord[];
    templateBranding?: {
      logoUrl?: string;
      heroImageUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
    };
    demoBooking?: {
      date?: string;
      time?: string;
      timeZone?: string;
      meetLink?: string;
      bookedAt?: string;
    };
  } | null;
  aiResearchSummary?: string | null;
  contacts?: LeadContactRecord[];
};

const LEAD_RESEARCH_CACHE_KEY = "leadResearchSummary";

type LeadContactRecord = {
  id: string;
  name: string;
  role?: string;
  phones: string[];
  emails: string[];
};

type LeadTaskRecord = {
  id: string;
  leadId: string;
  title: string;
  type: "CALLBACK" | "FOLLOW_UP" | "CHECK_IN" | "CUSTOM";
  reminderAt: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string | null;
};

type LeadNoteRecord = {
  id: string;
  leadId: string;
  lead_id?: string;
  aws_contact_id?: string | null;
  contactId?: string | null;
  contact_id?: string | null;
  content: string;
  channel: string;
  activity_type?: string;
  activityType?: string;
  createdAt: string;
  created_at?: string;
};

type CompletedFollowUpTask = {
  id: number;
  title: string;
  type: string;
  due_date: string;
  due_time: string;
};

type FetchStatus = "loading" | "ready" | "error";
type ActivityTab = "Notes" | "SMS" | "Email" | "Call Audio & AI";
type ScriptTab = "Scripts" | "Objections";
type ExecutionLeadStatus = "New" | "Pitched" | "Demo Booked" | "Awaiting Approval" | "Payment Pending" | "Closed Won";



type AwsActiveContact = {
  onConnected?: (callback: () => void) => void;
  onEnded?: (callback: () => void) => void;
  getContactId?: () => string;
  sendDigit?: (digit: string) => void;
};

type AIDynamicPlaybook = {
  scripts: string[];
  objections: Array<{ objection: string; counter: string }>;
  closing: string;
  roiSnapshot: string;
  injectedData: string[];
};

type CallIntelTranscriptLine = {
  time?: string;
  speaker?: string;
  sentiment?: string;
  text?: string;
};

type CallIntelRecord = {
  lead_id?: string;
  created_at?: string;
  duration_seconds?: number | string | null;
  overall_sentiment?: string | null;
  recording_url?: string | null;
  ai_summary?: string | null;
  agent_talk_time_pct?: number | string | null;
  customer_talk_time_pct?: number | string | null;
  interruptions?: number | string | null;
  transcript_json?: CallIntelTranscriptLine[] | null;
};

const PHONE_AREA_CODE_TIMEZONES: Record<string, { timeZone: string; location: string }> = {
  "206": { timeZone: "America/Los_Angeles", location: "Seattle, WA" },
  "213": { timeZone: "America/Los_Angeles", location: "Los Angeles, CA" },
  "305": { timeZone: "America/New_York", location: "Miami, FL" },
  "312": { timeZone: "America/Chicago", location: "Chicago, IL" },
  "323": { timeZone: "America/Los_Angeles", location: "Los Angeles, CA" },
  "347": { timeZone: "America/New_York", location: "New York, NY" },
  "404": { timeZone: "America/New_York", location: "Atlanta, GA" },
  "415": { timeZone: "America/Los_Angeles", location: "San Francisco, CA" },
  "469": { timeZone: "America/Chicago", location: "Dallas, TX" },
  "512": { timeZone: "America/Chicago", location: "Austin, TX" },
  "602": { timeZone: "America/Phoenix", location: "Phoenix, AZ" },
  "646": { timeZone: "America/New_York", location: "New York, NY" },
  "702": { timeZone: "America/Los_Angeles", location: "Las Vegas, NV" },
  "713": { timeZone: "America/Chicago", location: "Houston, TX" },
  "786": { timeZone: "America/New_York", location: "Miami, FL" },
  "818": { timeZone: "America/Los_Angeles", location: "Los Angeles, CA" },
  "917": { timeZone: "America/New_York", location: "New York, NY" },
};

const CITY_TIMEZONE_HINTS: Array<{ match: string; timeZone: string }> = [
  { match: "new york", timeZone: "America/New_York" },
  { match: "miami", timeZone: "America/New_York" },
  { match: "atlanta", timeZone: "America/New_York" },
  { match: "chicago", timeZone: "America/Chicago" },
  { match: "dallas", timeZone: "America/Chicago" },
  { match: "houston", timeZone: "America/Chicago" },
  { match: "denver", timeZone: "America/Denver" },
  { match: "phoenix", timeZone: "America/Phoenix" },
  { match: "los angeles", timeZone: "America/Los_Angeles" },
  { match: "san francisco", timeZone: "America/Los_Angeles" },
  { match: "seattle", timeZone: "America/Los_Angeles" },
];

function inferLeadTimeZone(lead: LeadRecord | null): { timeZone: string; location: string; source: string } {
  const phone = lead?.phone ?? "";
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const areaCode = normalized.length >= 10 ? normalized.slice(0, 3) : "";

  if (areaCode && PHONE_AREA_CODE_TIMEZONES[areaCode]) {
    const areaMatch = PHONE_AREA_CODE_TIMEZONES[areaCode];
    return { timeZone: areaMatch.timeZone, location: areaMatch.location, source: `phone area code (${areaCode})` };
  }

  const sourceWebsite = lead?.website || lead?.website_url || lead?.websiteUrl || "";
  const lowerWebsite = sourceWebsite.toLowerCase();
  if (lowerWebsite.endsWith(".co.uk") || lowerWebsite.includes(".co.uk/")) {
    return { timeZone: "Europe/London", location: "United Kingdom", source: "website scrape domain" };
  }

  const city = (lead?.city || "").toLowerCase();
  const cityMatch = CITY_TIMEZONE_HINTS.find((candidate) => city.includes(candidate.match));
  if (cityMatch) {
    return { timeZone: cityMatch.timeZone, location: lead?.city || "Lead city", source: "lead city" };
  }

  return { timeZone: "America/Los_Angeles", location: lead?.city || "Unknown location", source: "fallback" };
}

function toTwelveHourLabel(timeValue: string): string {
  const [hoursRaw, minutesRaw] = timeValue.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return timeValue;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const normalizedHour = hours % 12 || 12;
  return `${String(normalizedHour).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
}

const FALLBACK_LEAD: LeadRecord = {
  id: "fallback-lead",
  business_name: "Demo Business",
  status: "New",
  phone: "No phone on file",
  website: "No website on file",
  city: "Unknown location",
  email: "No email on file",
  deployed_url: "",
};

function normalizeLeadContacts(leadRecord: LeadRecord | null): LeadContactRecord[] {
  const payloadContacts = leadRecord?.source_payload?.contacts ?? leadRecord?.sourcePayload?.contacts ?? leadRecord?.contacts;

  if (Array.isArray(payloadContacts)) {
    const sanitized = payloadContacts
      .filter((contact) => contact && typeof contact === "object")
      .map((contact) => {
        const name = typeof contact.name === "string" ? contact.name.trim() : "";
        const role = typeof contact.role === "string" ? contact.role.trim() : "";
        const phones = Array.isArray(contact.phones)
          ? contact.phones.map((phone) => String(phone).trim()).filter(Boolean)
          : [];
        const emails = Array.isArray(contact.emails)
          ? contact.emails.map((email) => String(email).trim()).filter(Boolean)
          : [];

        return {
          id: typeof contact.id === "string" && contact.id ? contact.id : crypto.randomUUID(),
          name: name || "Primary Contact",
          role,
          phones,
          emails,
        };
      })
      .filter((contact) => contact.name || contact.phones.length || contact.emails.length);

    if (sanitized.length) return sanitized;
  }

  const fallbackPhones = leadRecord?.phone ? [leadRecord.phone] : [];
  const fallbackEmails = leadRecord?.email ? [leadRecord.email] : [];

  return [
    {
      id: "primary-contact",
      name: "Primary Contact",
      role: "",
      phones: fallbackPhones,
      emails: fallbackEmails,
    },
  ];
}

function hasBookedDemo(leadRecord: LeadRecord | null) {
  const demoBooking = leadRecord?.source_payload?.demoBooking ?? leadRecord?.sourcePayload?.demoBooking;
  return Boolean(demoBooking?.meetLink && demoBooking?.date && demoBooking?.time);
}

function LeadWorkspaceSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="grid grid-cols-12 gap-4 animate-pulse">
        <div className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-3">
          <div className="h-7 w-3/4 rounded bg-zinc-800" />
          <div className="h-4 w-2/3 rounded bg-zinc-800" />
          <div className="h-4 w-4/5 rounded bg-zinc-800" />
          <div className="h-14 w-full rounded-xl bg-zinc-800" />
          <div className="h-44 w-full rounded-xl bg-zinc-800" />
        </div>
        <div className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-5">
          <div className="h-40 w-full rounded-xl bg-zinc-800" />
          <div className="h-12 w-full rounded-xl bg-zinc-800" />
          <div className="h-48 w-full rounded-xl bg-zinc-800" />
        </div>
        <div className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-4">
          <div className="h-12 w-full rounded-xl bg-zinc-800" />
          <div className="h-56 w-full rounded-xl bg-zinc-800" />
          <div className="h-36 w-full rounded-xl bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

export default function LeadExecutionPage() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const leadId = useMemo(() => {
    const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
    return typeof rawId === "string" ? rawId.trim() : "";
  }, [params]);
  const researchStorageKey = leadId ? `${LEAD_RESEARCH_CACHE_KEY}:${leadId}` : "";

  const [status, setStatus] = useState<FetchStatus>("loading");
  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [orderedLeadIds, setOrderedLeadIds] = useState<string[]>([]);

  const [researchLoading, setResearchLoading] = useState(false);
  const [researchInsight, setResearchInsight] = useState<string>("");
  const [researchError, setResearchError] = useState<string>("");
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [deployProgress, setDeployProgress] = useState(0);
  const [deployStageLabel, setDeployStageLabel] = useState("");
  const [deployStartedAt, setDeployStartedAt] = useState<number | null>(null);
  const [brandingLogoUrl, setBrandingLogoUrl] = useState("");
  const [brandingHeroImageUrl, setBrandingHeroImageUrl] = useState("");
  const [brandingPrimaryColor, setBrandingPrimaryColor] = useState("#0f172a");
  const [brandingSecondaryColor, setBrandingSecondaryColor] = useState("#2563eb");
  const [selectedTemplateId, setSelectedTemplateId] = useState<"garage-door" | "new-template">("garage-door");

  const [activeTab, setActiveTab] = useState<ActivityTab>("Notes");
  const [callIntel, setCallIntel] = useState<CallIntelRecord | null>(null);
  const [isLoadingIntel, setIsLoadingIntel] = useState(false);
  const [scriptTab, setScriptTab] = useState<ScriptTab>("Scripts");
  const [showDisposition, setShowDisposition] = useState(false);
  const [ccpStatus, setCcpStatus] = useState<"READY" | "ACW">("READY");
  const [currentContactId, setCurrentContactId] = useState<string | null>(null);
  const activeContactRef = useRef<AwsActiveContact | null>(null);
  const [selectedDisposition, setSelectedDisposition] = useState("");
  const [dispositionSummary, setDispositionSummary] = useState("");
  const [savingDisposition, setSavingDisposition] = useState(false);

  const { callActive, callSeconds, ccpReady, connectionStatus, callStatus, endActiveCall, sendCallDigit } = useAmazonConnect();
  const [dialNumber, setDialNumber] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);
  const keypadDigits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

  useEffect(() => {
    if (!callActive) {
      setShowKeypad(false);
    }
  }, [callActive]);

  const [selectedMeetingDay, setSelectedMeetingDay] = useState("");
  const [selectedMeetingTime, setSelectedMeetingTime] = useState("");
  const [isCustomScheduling, setIsCustomScheduling] = useState(false);
  const [customDayInput, setCustomDayInput] = useState("");
  const [customTimeInput, setCustomTimeInput] = useState("");
  const [customMeetingDays, setCustomMeetingDays] = useState<Array<{ value: string; label: string }>>([]);
  const [customMeetingTimes, setCustomMeetingTimes] = useState<string[]>([]);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingLink, setMeetingLink] = useState("");
  const [meetingError, setMeetingError] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);

  const [leadExecutionStatus, setLeadExecutionStatus] = useState<ExecutionLeadStatus>("New");
  const [checkoutAmount, setCheckoutAmount] = useState(500);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutLink, setCheckoutLink] = useState("");
  const [checkoutLinkCopied, setCheckoutLinkCopied] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [closingDeal, setClosingDeal] = useState(false);
  const [closeDealError, setCloseDealError] = useState("");
  const [playbookLoading, setPlaybookLoading] = useState(false);
  const [playbookError, setPlaybookError] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [notes, setNotes] = useState<LeadNoteRecord[]>([]);
  const [tasks, setTasks] = useState<LeadTaskRecord[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState<LeadTaskRecord["type"]>("FOLLOW_UP");
  const [taskReminderAt, setTaskReminderAt] = useState("");
  const [leadContacts, setLeadContacts] = useState<LeadContactRecord[]>([]);
  const [newContactName, setNewContactName] = useState("");
  const [newContactRole, setNewContactRole] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [savingContacts, setSavingContacts] = useState(false);
  const [contactsError, setContactsError] = useState("");
  const supabase = useMemo(() => createClientComponentClient(), []);

  useEffect(() => {
    type ConnectWindow = Window & {
      connect?: {
        contact?: (callback: (contact: AwsActiveContact) => void) => void;
      };
    };

    const windowWithConnect = window as ConnectWindow;
    windowWithConnect.connect?.contact?.((contact) => {
      activeContactRef.current = contact;

      contact.onConnected?.(() => {
        activeContactRef.current = contact;
        const contactId = contact.getContactId?.() ?? null;
        console.log("AWS Call Connected. Contact ID:", contactId);
        setCurrentContactId(contactId);
      });

      contact.onEnded?.(() => {
        activeContactRef.current = null;
        setShowDisposition(true);
      });
    });
  }, []);


  useEffect(() => {
    let alive = true;

    async function loadLead() {
      setStatus("loading");

      try {
        if (!leadId) {
          setLead(FALLBACK_LEAD);
          setLeadExecutionStatus("New");
          setStatus("ready");
          return;
        }

        const response = await fetch("/api/leads", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => null)) as { leads?: LeadRecord[]; error?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load lead.");
        }

        const leadList = Array.isArray(payload?.leads) ? payload.leads : [];
        setOrderedLeadIds(leadList.map((candidate) => candidate.id).filter(Boolean));
        const data = leadList.find((candidate) => candidate?.id === leadId) ?? null;

        if (!alive) return;

        if (data) {
          setLead(data);
          setLeadContacts(normalizeLeadContacts(data));
          const existingResearch =
            data.source_payload?.aiResearchSummary ?? data.sourcePayload?.aiResearchSummary ?? data.aiResearchSummary ?? "";
          setResearchInsight(existingResearch);
          setResearchError("");
          const existingDemoBooking = data.source_payload?.demoBooking ?? data.sourcePayload?.demoBooking;
          if (existingDemoBooking?.date) setSelectedMeetingDay(existingDemoBooking.date);
          if (existingDemoBooking?.time) setSelectedMeetingTime(existingDemoBooking.time);
          if (existingDemoBooking?.meetLink) setMeetingLink(existingDemoBooking.meetLink);

          const resolvedStatus = data.status as ExecutionLeadStatus | undefined;
          if (
            resolvedStatus === "New" ||
            resolvedStatus === "Pitched" ||
            resolvedStatus === "Demo Booked" ||
            resolvedStatus === "Awaiting Approval" ||
            resolvedStatus === "Payment Pending" ||
            resolvedStatus === "Closed Won"
          ) {
            setLeadExecutionStatus(resolvedStatus);
          } else if (hasBookedDemo(data)) {
            setLeadExecutionStatus("Demo Booked");
          }

          setStatus("ready");
          return;
        }
      } catch {
        // Fall back silently for any fetch error.
      }

      if (!alive) return;

      setLead(FALLBACK_LEAD);
      setLeadContacts(normalizeLeadContacts(FALLBACK_LEAD));
      setLeadExecutionStatus("New");
      setStatus("ready");
    }

    loadLead();

    return () => {
      alive = false;
    };
  }, [leadId]);



  useEffect(() => {
    if (!leadId) return;
    const currentStatus = lead?.site_status || lead?.siteStatus;
    if (currentStatus !== "BUILDING") return;

    let active = true;
    const startedAt = deployStartedAt ?? Date.now();
    if (!deployStartedAt) setDeployStartedAt(startedAt);

    const maxPollingWindowMs = 10 * 60 * 1000;

    async function pollDeploymentStatus() {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }

      if (Date.now() - startedAt > maxPollingWindowMs) {
        if (!active) return;
        setDeployError("Deployment status polling timed out. Refresh to check the latest status.");
        setDeployStageLabel("Build status stale. Refresh to continue tracking.");
        return;
      }

      try {
        const response = await fetch(`/api/deploy/status?leadId=${encodeURIComponent(leadId)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { siteStatus?: string; deployedUrl?: string | null; readyState?: string; error?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Unable to fetch deployment status.");
        }

        const nextStatus = payload?.siteStatus;
        const nextUrl = payload?.deployedUrl || undefined;

        if (!active) return;

        if (nextStatus === "LIVE") {
          setDeployProgress(100);
          setDeployStageLabel("Build complete. Live site is ready.");
          setDeployStartedAt(null);
          setDeployError("");
          setLead((previous) =>
            previous
              ? {
                  ...previous,
                  site_status: "LIVE",
                  siteStatus: "LIVE",
                  deployed_url: nextUrl || previous.deployed_url || previous.deployedUrl || "",
                  deployedUrl: nextUrl || previous.deployedUrl || previous.deployed_url || "",
                }
              : previous,
          );
          return;
        }

        if (nextStatus === "FAILED") {
          setDeployProgress(100);
          setDeployStageLabel("Build failed.");
          setDeployStartedAt(null);
          setLead((previous) =>
            previous
              ? {
                  ...previous,
                  site_status: "FAILED",
                  siteStatus: "FAILED",
                }
              : previous,
          );
          setDeployError("Vercel reported a failed deployment. Please retry.");
          return;
        }

        const readyState = payload?.readyState || "BUILDING";
        const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);

        if (elapsedSeconds >= 180 && nextUrl) {
          setDeployProgress(100);
          setDeployStageLabel("Build window elapsed. Live link is ready to open.");
          setDeployStartedAt(null);
          setDeployError("");
          setLead((previous) =>
            previous
              ? {
                  ...previous,
                  site_status: "LIVE",
                  siteStatus: "LIVE",
                  deployed_url: nextUrl || previous.deployed_url || previous.deployedUrl || "",
                  deployedUrl: nextUrl || previous.deployedUrl || previous.deployed_url || "",
                }
              : previous,
          );
          return;
        }

        const estimatedByState: Record<string, number> = {
          QUEUED: 15,
          INITIALIZING: 28,
          BUILDING: 55,
          DEPLOYING: 78,
        };
        const elapsedProgress = Math.min(Math.floor((elapsedSeconds / 180) * 100), 90);
        const stateProgress = estimatedByState[readyState] ?? 45;
        setDeployProgress((previous) => Math.min(Math.max(previous, stateProgress, elapsedProgress), 95));
        setDeployStageLabel(readyState === "QUEUED" ? "Queued in build pipeline..." : `Building (${readyState})...`);
      } catch (error) {
        if (!active) return;
        setDeployError(error instanceof Error ? error.message : "Unable to fetch deployment status.");
      }
    }

    const interval = window.setInterval(() => {
      void pollDeploymentStatus();
    }, 15000);

    void pollDeploymentStatus();

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [deployStartedAt, lead?.site_status, lead?.siteStatus, leadId]);

  useEffect(() => {
    if (activeTab !== "Call Audio & AI" || !leadId) return;

    let mounted = true;

    const fetchCallIntel = async () => {
      setIsLoadingIntel(true);

      const { data, error } = await supabase
        .from("call_analytics")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!mounted) return;

      if (error) {
        if (error.code === "PGRST116") {
          setCallIntel(null);
          setIsLoadingIntel(false);
          return;
        }
        setCallIntel(null);
        setIsLoadingIntel(false);
        return;
      }

      setCallIntel(data as CallIntelRecord | null);
      setIsLoadingIntel(false);
    };

    fetchCallIntel();

    return () => {
      mounted = false;
    };
  }, [activeTab, leadId, supabase]);

  useEffect(() => {
    if (!researchStorageKey || typeof window === "undefined") return;

    const cachedResearch = window.localStorage.getItem(researchStorageKey);
    if (!cachedResearch) return;

    setResearchInsight((currentSummary) => (currentSummary.trim() ? currentSummary : cachedResearch));
  }, [researchStorageKey]);

  useEffect(() => {
    if (!researchStorageKey || typeof window === "undefined") return;
    if (!researchInsight.trim()) return;

    window.localStorage.setItem(researchStorageKey, researchInsight);
  }, [researchInsight, researchStorageKey]);

  useEffect(() => {
    let alive = true;

    async function loadTasks() {
      if (!leadId) {
        setTasks([]);
        return;
      }

      setTasksLoading(true);
      setTasksError("");

      const response = await fetch(`/api/lead-tasks?leadId=${encodeURIComponent(leadId)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { tasks?: LeadTaskRecord[]; error?: string } | null;

      if (!alive) return;

      if (!response.ok) {
        setTasks([]);
        setTasksError(payload?.error || "Unable to load tasks.");
        setTasksLoading(false);
        return;
      }

      setTasks(Array.isArray(payload?.tasks) ? payload.tasks : []);
      setTasksLoading(false);
    }

    loadTasks();
    return () => {
      alive = false;
    };
  }, [leadId]);

  useEffect(() => {
    let alive = true;

    async function loadNotes() {
      if (!leadId) {
        setNotes([]);
        return;
      }

      setNotesLoading(true);
      setNotesError("");
      const response = await fetch(`/api/lead-notes?leadId=${encodeURIComponent(leadId)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { notes?: LeadNoteRecord[]; error?: string } | null;

      if (!alive) return;

      if (!response.ok) {
        setNotes([]);
        setNotesError(payload?.error || "Unable to load notes.");
        setNotesLoading(false);
        return;
      }

      setNotes(Array.isArray(payload?.notes) ? payload.notes : []);
      setNotesLoading(false);
    }

    loadNotes();
    return () => {
      alive = false;
    };
  }, [leadId]);

  const leadName = lead?.business_name || lead?.businessName || "Unknown Business";
  const leadPhone = lead?.phone || "No phone on file";
  const leadDemoBooking = lead?.source_payload?.demoBooking ?? lead?.sourcePayload?.demoBooking;
  const isDemoBooked = hasBookedDemo(lead) || leadExecutionStatus === "Demo Booked";
  const leadWebsite = lead?.website || lead?.website_url || lead?.websiteUrl || "No website on file";
  const hasLeadWebsite = leadWebsite !== "No website on file";
  const leadWebsiteHref = leadWebsite.startsWith("http://") || leadWebsite.startsWith("https://") ? leadWebsite : `https://${leadWebsite}`;

  useEffect(() => {
    setDialNumber(lead?.phone || "");
  }, [lead?.phone]);
  const deployedUrl = lead?.deployed_url || lead?.deployedUrl || "";
  const siteStatus = lead?.site_status || lead?.siteStatus || "UNBUILT";
  const deployEtaLabel = useMemo(() => {
    if (siteStatus !== "BUILDING" || !deployStartedAt) return "";
    const elapsedSeconds = Math.floor((Date.now() - deployStartedAt) / 1000);
    const estimatedTotalSeconds = 180;
    const remaining = Math.max(estimatedTotalSeconds - elapsedSeconds, 0);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")} remaining (est.)`;
  }, [deployStartedAt, siteStatus]);
  const leadCity = lead?.city || "Unknown city";

  useEffect(() => {
    const sourcePayload = lead?.source_payload ?? lead?.sourcePayload;
    const branding = sourcePayload?.templateBranding;
    setBrandingLogoUrl(branding?.logoUrl || "");
    setBrandingHeroImageUrl(branding?.heroImageUrl || "");
    setBrandingPrimaryColor(branding?.primaryColor || "#0f172a");
    setBrandingSecondaryColor(branding?.secondaryColor || "#2563eb");
  }, [lead?.id, lead?.sourcePayload, lead?.source_payload]);

  const fallbackPlaybook = useMemo<AIDynamicPlaybook>(
    () => ({
      scripts: [
        `Hey ${leadName}, I noticed your current site creates friction on mobile when people are trying to book fast. I built a conversion-focused version for you here: ${deployedUrl || "your preview link"}.`,
        "We can launch this today with no downtime, route calls and form leads directly into your booking flow, and reduce drop-offs from high-intent visitors.",
        "If even a few missed calls per week convert, this upgrade can pay for itself quickly while adding predictable monthly revenue.",
      ],
      objections: [
        {
          objection: "I already have a website.",
          counter: "Totally fair. This offer is about conversion performance, not just design. The goal is more booked jobs from the same traffic.",
        },
        {
          objection: "I need to think about it.",
          counter: "Absolutely. Let’s do a quick 10-minute walkthrough and map expected lead lift so you can decide with numbers, not guesses.",
        },
        {
          objection: "Can you send details?",
          counter: "Yes — I’ll send the preview and ROI summary now, then hold your deployment slot for 24 hours so you can move when ready.",
        },
      ],
      closing: "Want me to lock this in and have it live today so your next inbound lead lands on the optimized version?",
      roiSnapshot: "Most local service sites lose high-intent mobile traffic; even 3-5 recovered bookings/month can mean thousands in missed revenue regained.",
      injectedData: ["AI deep research summary", "Mobile booking conversion gap", "Live preview + speed-to-launch angle"],
    }),
    [leadName, deployedUrl],
  );

  const [aiPlaybook, setAiPlaybook] = useState<AIDynamicPlaybook>(fallbackPlaybook);

  useEffect(() => {
    setAiPlaybook(fallbackPlaybook);
  }, [fallbackPlaybook]);

  async function persistContacts(nextContacts: LeadContactRecord[]) {
    if (!leadId) {
      setLeadContacts(nextContacts);
      return true;
    }

    setSavingContacts(true);
    setContactsError("");
    try {
      const response = await fetch("/api/leads/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, contacts: nextContacts }),
      });

      const payload = (await response.json().catch(() => null)) as { contacts?: LeadContactRecord[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Unable to save contact updates right now.");

      const savedContacts = Array.isArray(payload?.contacts) ? payload.contacts : nextContacts;
      setLeadContacts(savedContacts);
      setLead((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          source_payload: {
            ...(previous.source_payload ?? previous.sourcePayload ?? {}),
            contacts: savedContacts,
          },
          sourcePayload: {
            ...(previous.sourcePayload ?? previous.source_payload ?? {}),
            contacts: savedContacts,
          },
        };
      });
      return true;
    } catch (error) {
      setContactsError(error instanceof Error ? error.message : "Unable to save contact updates right now.");
      return false;
    } finally {
      setSavingContacts(false);
    }
  }

  const handleLeadContactAdd = async () => {
    const name = newContactName.trim();
    const role = newContactRole.trim();
    const phone = newContactPhone.trim();
    const email = newContactEmail.trim();

    if (!name && !phone && !email) {
      setContactsError("Add at least a name, phone, or email for the contact.");
      return;
    }

    const created: LeadContactRecord = {
      id: crypto.randomUUID(),
      name: name || "Untitled Contact",
      role,
      phones: phone ? [phone] : [],
      emails: email ? [email] : [],
    };

    const success = await persistContacts([...leadContacts, created]);
    if (!success) return;

    setNewContactName("");
    setNewContactRole("");
    setNewContactPhone("");
    setNewContactEmail("");
  };

  const handleLeadContactAddPhone = async (contactId: string, phone: string) => {
    const cleanPhone = phone.trim();
    if (!cleanPhone) return;

    const nextContacts = leadContacts.map((contact) =>
      contact.id === contactId ? { ...contact, phones: contact.phones.includes(cleanPhone) ? contact.phones : [...contact.phones, cleanPhone] } : contact,
    );

    await persistContacts(nextContacts);
  };

  const handleLeadContactAddEmail = async (contactId: string, email: string) => {
    const cleanEmail = email.trim();
    if (!cleanEmail) return;

    const nextContacts = leadContacts.map((contact) =>
      contact.id === contactId ? { ...contact, emails: contact.emails.includes(cleanEmail) ? contact.emails : [...contact.emails, cleanEmail] } : contact,
    );

    await persistContacts(nextContacts);
  };

  async function runResearch() {
    if (!leadId) {
      setResearchError("This lead is missing an id, so analysis cannot be run.");
      return;
    }

    setResearchLoading(true);
    setResearchError("");

    try {
      const response = await fetch("/api/leads/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });

      const payload = (await response.json().catch(() => null)) as { summary?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Research failed.");
      }

      const summary = (payload?.summary || "").trim();
      if (!summary) {
        throw new Error("Research ran but no summary was returned.");
      }

      setResearchInsight(summary);

      const { data: refreshedLead } = await supabase.from<LeadRecord>("leads").select("*").eq("id", leadId).single();
      if (refreshedLead) {
        setLead(refreshedLead);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to run AI analysis right now.";
      setResearchError(message);
    } finally {
      setResearchLoading(false);
    }
  }

  async function handleDeploySite() {
    if (!leadId) {
      setDeployError("This lead is missing an id, so deployment cannot be started.");
      return;
    }

    setDeployLoading(true);
    setDeployError("");
    setDeployStartedAt(Date.now());
    setDeployProgress(8);
    setDeployStageLabel("Starting deployment...");

    const templateConfigOverrides = {
      business: {
        name: leadName,
        city: leadCity,
      },
      geo: {
        primaryLocation: leadCity,
      },
      branding: {
        logoUrl: brandingLogoUrl.trim(),
        heroImageUrl: brandingHeroImageUrl.trim(),
        primaryColor: brandingPrimaryColor,
        secondaryColor: brandingSecondaryColor,
      },
      research: {
        summary: researchInsight.trim(),
      },
    };

    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          templateId: selectedTemplateId,
          researchOutput: researchInsight.trim() || undefined,
          templateConfigOverrides,
          env: {
            NEXT_PUBLIC_BUSINESS_NAME: leadName,
            NEXT_PUBLIC_PRIMARY_COLOR: brandingPrimaryColor,
            NEXT_PUBLIC_SECONDARY_COLOR: brandingSecondaryColor,
            NEXT_PUBLIC_LOGO_URL: brandingLogoUrl.trim(),
            NEXT_PUBLIC_HERO_URL: brandingHeroImageUrl.trim(),
            NEXT_PUBLIC_FEATURE_IMAGE_URL: brandingHeroImageUrl.trim(),
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as { url?: string; deployedUrl?: string; liveUrl?: string; project?: string; deploymentId?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Deployment failed.");
      }

      const fallbackProjectUrl = payload?.project ? `https://${payload.project}.vercel.app` : undefined;
      const returnedUrl = payload?.liveUrl || payload?.deployedUrl || payload?.url || fallbackProjectUrl;

      setDeployProgress(20);
      setDeployStageLabel("Deployment queued. Preparing your live site...");

      if (returnedUrl || payload?.deploymentId) {
        setLead((previous) =>
          previous
            ? {
                ...previous,
                deployed_url: returnedUrl || previous.deployed_url || previous.deployedUrl || "",
                deployedUrl: returnedUrl || previous.deployedUrl || previous.deployed_url || "",
                site_status: "BUILDING",
                siteStatus: "BUILDING",
                vercel_deployment_id: payload?.deploymentId || previous.vercel_deployment_id || previous.vercelDeploymentId || null,
                vercelDeploymentId: payload?.deploymentId || previous.vercelDeploymentId || previous.vercel_deployment_id || null,
                source_payload: {
                  ...(previous.source_payload ?? previous.sourcePayload ?? {}),
                  templateBranding: {
                    logoUrl: brandingLogoUrl.trim(),
                    heroImageUrl: brandingHeroImageUrl.trim(),
                    primaryColor: brandingPrimaryColor,
                    secondaryColor: brandingSecondaryColor,
                  },
                },
              }
            : previous,
        );
      }
    } catch (error) {
      setDeployProgress(100);
      setDeployStageLabel("Deployment failed.");
      setDeployStartedAt(null);
      setDeployError(error instanceof Error ? error.message : "Unable to deploy this lead right now.");
    } finally {
      setDeployLoading(false);
    }
  }

  async function handleBrandingFileUpload(file: File | undefined, target: "logo" | "hero") {
    if (!file) return;

    setDeployError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("leadId", leadId || "lead");
      formData.append("target", target);

      const response = await fetch("/api/storage/upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Unable to upload the image to storage.");
      }

      if (target === "logo") {
        setBrandingLogoUrl(payload.url);
      } else {
        setBrandingHeroImageUrl(payload.url);
      }
    } catch (error) {
      setDeployError(error instanceof Error ? error.message : "Unable to process the uploaded image.");
    }
  }

  async function generateMeetingLink() {
    setMeetingLoading(true);
    setInviteCopied(false);
    setMeetingError("");
    setMeetingLink("");

    try {
      const response = await fetch("/api/calendar/meet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: selectedMeetingDay,
          time: selectedMeetingTime,
          timeZone: leadTimeZone,
          leadId,
          leadName,
          leadEmail: lead?.email || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { meetLink?: string; error?: string } | null;

      if (!response.ok || !payload?.meetLink) {
        throw new Error(payload?.error || "Unable to generate a Google Meet link.");
      }

      setMeetingLink(payload.meetLink);
      setLeadExecutionStatus("Demo Booked");

      const existingSourcePayload = (lead?.source_payload ?? lead?.sourcePayload ?? {}) as Record<string, unknown>;
      const nextDemoBooking = {
        date: selectedMeetingDay,
        time: selectedMeetingTime,
        timeZone: leadTimeZone,
        meetLink: payload.meetLink,
        bookedAt: new Date().toISOString(),
      };

      const { error: persistDemoError } = await supabase
        .from("leads")
        .update({
          source_payload: {
            ...existingSourcePayload,
            demoBooking: nextDemoBooking,
          },
        })
        .eq("id", leadId);

      if (!persistDemoError) {
        setLead((previous) =>
          previous
            ? {
                ...previous,
                source_payload: {
                  ...(previous.source_payload ?? previous.sourcePayload ?? {}),
                  demoBooking: nextDemoBooking,
                },
              }
            : previous,
        );
      }
    } catch (error) {
      setMeetingError(error instanceof Error ? error.message : "Unable to generate a Google Meet link.");
    } finally {
      setMeetingLoading(false);
    }
  }

  function goToUpcomingDemos() {
    if (!meetingLink || !selectedMeetingDay || !selectedMeetingTime) {
      router.push("/demos");
      return;
    }

    const params = new URLSearchParams({
      leadId,
      leadName,
      date: selectedMeetingDay,
      time: selectedMeetingTime,
      meetLink: meetingLink,
    });

    router.push(`/demos?${params.toString()}`);
  }

  async function copyInviteText() {
    if (!meetingLink) return;
    const dayLabel =
      combinedDayOptions.find((day) => day.value === selectedMeetingDay)?.label ||
      new Date(`${selectedMeetingDay}T00:00:00`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    const inviteText = `Demo booked for ${leadName} on ${dayLabel} at ${selectedMeetingTime} (${leadTimeZone}). Join here: ${meetingLink}`;

    try {
      await navigator.clipboard.writeText(inviteText);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setInviteCopied(false);
    }
  }

  async function handleCheckoutAction() {
    setCheckoutLoading(true);
    setCheckoutLinkCopied(false);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (checkoutAmount >= 500) {
      setApprovalPending(false);
      setCheckoutLink(`buy.stripe.com/test_123?amount=${Math.round(checkoutAmount * 100)}`);
      setLeadExecutionStatus("Payment Pending");
      setCheckoutLoading(false);
      return;
    }

    setCheckoutLink("");
    setApprovalPending(true);
    setLeadExecutionStatus("Awaiting Approval");
    setCheckoutLoading(false);
  }

  function extractStripeValueFromLink(link: string) {
    try {
      const safeUrl = link.startsWith("http://") || link.startsWith("https://") ? link : `https://${link}`;
      const parsed = new URL(safeUrl);
      const amount = parsed.searchParams.get("amount");
      const amountTotal = parsed.searchParams.get("amount_total");
      const unitAmount = parsed.searchParams.get("unit_amount");
      const amountParam = amount ?? amountTotal ?? unitAmount;
      if (!amountParam) return null;

      const numericAmount = Number(amountParam);
      if (!Number.isFinite(numericAmount)) return null;

      const shouldTreatAsCents = amountTotal !== null || unitAmount !== null || amountParam.includes(".") === false;
      return shouldTreatAsCents ? numericAmount / 100 : numericAmount;
    } catch {
      return null;
    }
  }

  async function markLeadAsClosedDeal() {
    if (!leadId) return;

    setClosingDeal(true);
    setCloseDealError("");

    const inferredDealValue = extractStripeValueFromLink(checkoutLink) ?? checkoutAmount;

    try {
      const response = await fetch("/api/leads/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          closedDealValue: inferredDealValue,
          stripeCheckoutLink: checkoutLink || null,
        }),
      });

      const payload = (await response.json()) as {
        closed?: { closedAt: string; closedDealValue: number; stripeCheckoutLink: string | null };
        error?: string;
      };

      if (!response.ok || !payload.closed) {
        throw new Error(payload.error || "Unable to mark this lead as closed right now.");
      }

      setLeadExecutionStatus("Closed Won");
      setLead((previous) =>
        previous
          ? {
              ...previous,
              status: "CLOSED",
              source_payload: {
                ...(previous.source_payload ?? previous.sourcePayload ?? {}),
                closedDealValue: payload.closed?.closedDealValue ?? inferredDealValue,
                closedAt: payload.closed?.closedAt ?? new Date().toISOString(),
                stripeCheckoutLink: payload.closed?.stripeCheckoutLink ?? (checkoutLink || null),
              },
            }
          : previous,
      );

      router.push("/closed-deals");
      router.refresh();
    } catch (error) {
      setCloseDealError(error instanceof Error ? error.message : "Unable to mark this lead as closed right now.");
      setClosingDeal(false);
    }
  }

  async function copyCheckoutLink() {
    if (!checkoutLink) return;

    try {
      await navigator.clipboard.writeText(checkoutLink);
      setCheckoutLinkCopied(true);
      window.setTimeout(() => setCheckoutLinkCopied(false), 1400);
    } catch {
      setCheckoutLinkCopied(false);
    }
  }

  async function persistLeadContacts(nextContacts: LeadContactRecord[]) {
    if (!leadId) return;

    setSavingContacts(true);
    setContactsError("");

    const sourcePayload = lead?.source_payload ?? lead?.sourcePayload ?? {};
    const payload = {
      source_payload: {
        ...sourcePayload,
        contacts: nextContacts,
      },
    };

    const { error } = await supabase.from("leads").update(payload).eq("id", leadId);

    if (error) {
      setContactsError("Unable to save contact details right now.");
      setSavingContacts(false);
      return;
    }

    setLeadContacts(nextContacts);
    setLead((previous) =>
      previous
        ? {
            ...previous,
            source_payload: {
              ...(previous.source_payload ?? previous.sourcePayload ?? {}),
              contacts: nextContacts,
            },
          }
        : previous,
    );
    setSavingContacts(false);
  }

  async function addContact() {
    const name = newContactName.trim();
    if (!name) {
      setContactsError("Contact name is required.");
      return;
    }

    const nextContact: LeadContactRecord = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `contact-${Date.now()}`,
      name,
      role: newContactRole.trim() || "",
      phones: newContactPhone.trim() ? [newContactPhone.trim()] : [],
      emails: newContactEmail.trim() ? [newContactEmail.trim()] : [],
    };

    await persistLeadContacts([...leadContacts, nextContact]);
    setNewContactName("");
    setNewContactRole("");
    setNewContactPhone("");
    setNewContactEmail("");
  }

  async function addPhoneToContact(contactId: string, phone: string) {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) return;

    const nextContacts = leadContacts.map((contact) =>
      contact.id === contactId && !contact.phones.includes(trimmedPhone)
        ? { ...contact, phones: [...contact.phones, trimmedPhone] }
        : contact,
    );

    await persistLeadContacts(nextContacts);
  }

  async function addEmailToContact(contactId: string, email: string) {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    const nextContacts = leadContacts.map((contact) =>
      contact.id === contactId && !contact.emails.includes(trimmedEmail)
        ? { ...contact, emails: [...contact.emails, trimmedEmail] }
        : contact,
    );

    await persistLeadContacts(nextContacts);
  }

  async function saveOmniNote() {
    const content = notesDraft.trim();
    if (!content || !leadId) return;

    setNotesLoading(true);
    setNotesError("");
    const response = await fetch("/api/lead-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        content,
        channel: activeTab === "Notes" ? "notes" : activeTab === "Email" ? "email" : activeTab === "SMS" ? "sms" : "notes",
        contactId: currentContactId,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { note?: LeadNoteRecord; error?: string } | null;

    if (!response.ok || !payload?.note) {
      setNotesError(payload?.error || "Unable to save note.");
      setNotesLoading(false);
      return;
    }

    const inserted = payload.note;
    setNotesDraft("");
    setNotes((previous) => [
      {
        ...inserted,
        leadId: inserted.leadId || inserted.lead_id || leadId,
        createdAt: inserted.createdAt || inserted.created_at || new Date().toISOString(),
      },
      ...previous,
    ].slice(0, 20));
    setNotesLoading(false);
  }

  const handleAIDraft = async () => {
    setIsDrafting(true);
    setNotesDraft("Drafting with Gemini...");

    try {
      const response = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName,
          activeTab,
          researchContext: researchInsight || `Website: ${leadWebsite}`,
        }),
      });
      const data = (await response.json().catch(() => null)) as { draft?: string } | null;

      if (response.ok && data?.draft) {
        setNotesDraft(data.draft);
      } else {
        setNotesDraft("Error: Could not generate draft.");
      }
    } catch (error) {
      console.error("Drafting failed", error);
      setNotesDraft("Error connecting to Gemini AI.");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleGeneratePlaybook = async () => {
    setPlaybookLoading(true);
    setPlaybookError("");

    try {
      const response = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName,
          activeTab: "PLAYBOOK",
          researchContext: [
            researchInsight || "No AI research summary available.",
            `Website: ${leadWebsite}`,
            `City: ${leadCity}`,
            deployedUrl ? `Preview Link: ${deployedUrl}` : "No preview link available.",
          ].join("\n"),
        }),
      });

      const data = (await response.json().catch(() => null)) as { playbook?: AIDynamicPlaybook; draft?: string; error?: string; warning?: string } | null;

      if (!data) {
        setAiPlaybook(fallbackPlaybook);
        setPlaybookError("Gemini is temporarily unavailable. Showing fallback playbook.");
        return;
      }

      if (data.playbook) {
        setAiPlaybook(data.playbook);
        if (data.warning) {
          setPlaybookError(data.warning);
        }
        return;
      }

      if (!response.ok) {
        setAiPlaybook(fallbackPlaybook);
        if (data.error?.toLowerCase().includes("failed to generate draft")) {
          setPlaybookError("Gemini is temporarily unavailable. Showing fallback playbook.");
        } else {
          setPlaybookError(data.error || "Could not generate playbook with Gemini.");
        }
        return;
      }

      if (!data.draft) {
        setPlaybookError(data.error || "Could not generate playbook with Gemini.");
        return;
      }

      const parsed = JSON.parse(data.draft) as AIDynamicPlaybook;
      if (!Array.isArray(parsed.scripts) || !Array.isArray(parsed.objections) || !parsed.closing || !parsed.roiSnapshot) {
        throw new Error("Playbook response missing required fields");
      }

      setAiPlaybook(parsed);
    } catch (error) {
      console.error("Playbook generation failed", error);
      setPlaybookError("Gemini is temporarily unavailable. Showing fallback playbook.");
      setAiPlaybook(fallbackPlaybook);
    } finally {
      setPlaybookLoading(false);
    }
  };

  async function submitDisposition() {
    if (!selectedDisposition || !leadId) return;

    setSavingDisposition(true);
    const summary = dispositionSummary.trim();
    const content = summary || `Disposition recorded: ${selectedDisposition}`;
    const response = await fetch("/api/lead-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        content,
        channel: `disposition:${selectedDisposition.toLowerCase().replace(/\s+/g, "_")}`,
        contactId: currentContactId,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { note?: LeadNoteRecord; error?: string } | null;

    if (response.ok && payload?.note) {
      setNotes((previous) => [payload.note as LeadNoteRecord, ...previous].slice(0, 20));
      setShowDisposition(false);
      setSelectedDisposition("");
      setDispositionSummary("");
      setCcpStatus("READY");
    } else {
      setNotesError(payload?.error || "Unable to save disposition.");
    }

    setSavingDisposition(false);
  }

  const formattedTimer = `${String(Math.floor(callSeconds / 60)).padStart(2, "0")}:${String(callSeconds % 60).padStart(2, "0")}`;

  const handleCall = () => {
    setCcpStatus("READY");
    type ConnectWindow = Window & {
      connect?: {
        agent?: (callback: (agent: { connect?: (endpoint: { phoneNumber: string }, callbacks?: { success?: () => void; failure?: (error: unknown) => void }) => void }) => void) => void;
        Endpoint?: { byPhoneNumber?: (phoneNumber: string) => { phoneNumber: string } };
      };
    };

    const windowWithConnect = window as ConnectWindow;
    if (!windowWithConnect.connect?.agent || !windowWithConnect.connect?.Endpoint?.byPhoneNumber) return;

    const sourceNumber = dialNumber || leadPhone;
    const digitsOnly = sourceNumber.replace(/\D/g, "");
    if (!digitsOnly) return;

    const formattedNumber = digitsOnly.startsWith("1") ? `+${digitsOnly}` : `+1${digitsOnly}`;

    windowWithConnect.connect.agent(function (agent) {
      const endpoint = windowWithConnect.connect?.Endpoint?.byPhoneNumber?.(formattedNumber);
      if (!endpoint || !agent.connect) return;

      agent.connect(endpoint, {
        success: function () {
          console.log("Call initiated successfully to", formattedNumber);
        },
        failure: function (err: unknown) {
          console.error("Call failed to initiate:", err);
        },
      });
    });
  };

  const handleEndCall = () => {
    endActiveCall();
    setCcpStatus("ACW");
    setShowDisposition(true);
    setShowKeypad(false);
  };

  // Amazon Connect DTMF Handler
  const handleSendDigit = (digit: string) => {
    const activeContact = activeContactRef.current;

    // Prefer the lead page's live AWS contact subscription, with provider fallback.
    if (activeContact?.sendDigit) {
      activeContact.sendDigit(digit);
      return;
    }

    if (callActive) {
      sendCallDigit(digit);
      return;
    }

    console.warn("No active contact to send digit to.");
  };

  const softphoneStatusLabel =
    ccpStatus === "ACW"
      ? "After Call Work"
      : connectionStatus === "loading"
      ? "Loading AWS Streams…"
      : connectionStatus === "initializing"
        ? "Initializing CCP…"
        : connectionStatus === "error"
          ? "CCP initialization failed"
          : callStatus === "connecting"
            ? "Connecting call…"
            : callStatus === "connected"
              ? `Live ${formattedTimer}`
              : "Softphone ready";

  const softphoneStatusTone =
    connectionStatus === "error"
      ? "text-rose-300"
      : connectionStatus === "ready"
        ? "text-emerald-300"
        : "text-amber-300";

  const canStartCall = ccpReady && connectionStatus === "ready" && callStatus !== "connecting";

  const leadTimeMeta = useMemo(() => inferLeadTimeZone(lead), [lead]);
  const leadTimeZone = leadTimeMeta.timeZone;
  const repTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

  const leadDayOptions = useMemo(() => {
    const now = new Date();

    return [0, 1, 2, 3].map((offset) => {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);

      const shortLabel = date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      const fullLabel =
        offset === 0 ? `Today, ${shortLabel}` : offset === 1 ? `Tomorrow, ${shortLabel}` : shortLabel;

      return {
        value: date.toISOString().slice(0, 10),
        label: fullLabel,
      };
    });
  }, []);

  const combinedDayOptions = useMemo(() => [...leadDayOptions, ...customMeetingDays], [leadDayOptions, customMeetingDays]);

  const leadTimeSlots = ["09:00 AM", "11:30 AM", "02:00 PM", "03:30 PM", "05:00 PM", "06:30 PM"];
  const combinedTimeSlots = [...leadTimeSlots, ...customMeetingTimes];

  const leadLocalTimeText = useMemo(
    () =>
      new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: leadTimeZone,
        timeZoneName: "short",
      }),
    [leadTimeZone],
  );

  const repLocalTimeText = useMemo(
    () =>
      new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: repTimeZone,
        timeZoneName: "short",
      }),
    [repTimeZone],
  );

  const applyCustomDay = () => {
    if (!customDayInput) return;

    const customDate = new Date(`${customDayInput}T00:00:00`);
    const dateLabel = customDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    setCustomMeetingDays((previous) => {
      if (previous.some((day) => day.value === customDayInput)) return previous;
      return [...previous, { value: customDayInput, label: `Custom, ${dateLabel}` }];
    });
    setSelectedMeetingDay(customDayInput);
    setMeetingLink("");
    setCustomDayInput("");
  };

  const applyCustomTime = () => {
    if (!customTimeInput) return;

    const formattedTime = toTwelveHourLabel(customTimeInput);
    setCustomMeetingTimes((previous) => {
      if (previous.includes(formattedTime)) return previous;
      return [...previous, formattedTime];
    });
    setSelectedMeetingTime(formattedTime);
    setMeetingLink("");
    setCustomTimeInput("");
  };
  if (status === "loading") return <LeadWorkspaceSkeleton />;

  if (!lead) return <LeadWorkspaceSkeleton />;

  const leadLocation = lead?.city || "Unknown location";
  const resolveNoteType = (note: LeadNoteRecord) => {
    const explicitType = (note.activity_type || note.activityType || "").toUpperCase();
    if (["NOTE", "CALL", "SMS", "EMAIL"].includes(explicitType)) {
      return explicitType;
    }

    const channel = note.channel?.toLowerCase() || "";
    if (channel.startsWith("disposition:")) return "CALL";
    if (channel.includes("sms")) return "SMS";
    if (channel.includes("email")) return "EMAIL";
    return "NOTE";
  };

  const monthlyTouchpointCount = (() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    return notes.filter((note) => {
      const created = new Date(note.createdAt || note.created_at || "");
      return Number.isFinite(created.getTime()) && created.getMonth() === month && created.getFullYear() === year;
    }).length;
  })();

  const remainingTouchpoints = Math.max(0, 7 - monthlyTouchpointCount);

  async function createTask() {
    if (!leadId) return;
    const title = taskTitle.trim();
    if (!title || !taskReminderAt) return;

    setTasksLoading(true);
    setTasksError("");

    const reminderIso = new Date(taskReminderAt).toISOString();
    const response = await fetch("/api/lead-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        title,
        type: taskType,
        reminderAt: reminderIso,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { task?: LeadTaskRecord; error?: string } | null;

    if (!response.ok || !payload?.task) {
      setTasksError(payload?.error || "Unable to add task.");
      setTasksLoading(false);
      return;
    }

    setTasks((previous) => [payload.task as LeadTaskRecord, ...previous]);
    setTaskTitle("");
    setTaskReminderAt("");
    setTaskType("FOLLOW_UP");
    setTasksLoading(false);
  }

  async function toggleTaskCompletion(task: LeadTaskRecord) {
    if (!leadId) return;

    const response = await fetch("/api/lead-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        taskId: task.id,
        completed: !task.completed,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { task?: LeadTaskRecord; error?: string } | null;

    if (!response.ok || !payload?.task) {
      setTasksError(payload?.error || "Unable to update task.");
      return;
    }

    setTasks((previous) => previous.map((item) => (item.id === task.id ? (payload.task as LeadTaskRecord) : item)));
  }

  async function saveCompletedFollowUpToNotes(task: CompletedFollowUpTask) {
    if (!leadId) return;

    const response = await fetch("/api/lead-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        channel: "notes",
        content: `✅ Follow-up completed: ${task.title} (${task.type}) • Scheduled ${task.due_date} at ${task.due_time}`,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { note?: LeadNoteRecord; error?: string } | null;

    if (!response.ok || !payload?.note) {
      console.error(payload?.error || "Unable to save completed follow-up to notes.");
      return;
    }

    setNotes((previous) => [payload.note as LeadNoteRecord, ...previous]);
  }

  const filteredNotes = notes.filter((note) => {
    const type = resolveNoteType(note);
    if (activeTab === "Notes") {
      return type === "NOTE" || type === "CALL";
    }
    if (activeTab === "SMS") {
      return type === "SMS";
    }
    if (activeTab === "Email") {
      return type === "EMAIL";
    }
    return false;
  });

  const getNoteCreatedAt = (note: LeadNoteRecord) => note.created_at || note.createdAt || new Date().toISOString();
  const currentLeadIndex = orderedLeadIds.findIndex((id) => id === leadId);
  const previousLeadId = currentLeadIndex > 0 ? orderedLeadIds[currentLeadIndex - 1] : "";
  const nextLeadId = currentLeadIndex >= 0 && currentLeadIndex < orderedLeadIds.length - 1 ? orderedLeadIds[currentLeadIndex + 1] : "";

  function goToAdjacentLead(targetLeadId: string) {
    if (!targetLeadId) return;
    router.push(`/leads/${targetLeadId}`);
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 text-zinc-100 lg:p-6">
      {showDisposition ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-300">After Call Work Required</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-100">Log call disposition before continuing</h2>
            <p className="mt-1 text-sm text-zinc-400">Select an outcome and leave a short summary to close the call workflow.</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                "Interested",
                "Not Interested",
                "No Answer",
                "Call Back",
                "Wrong Number",
                "Booked Demo",
              ].map((option) => (
                <button
                  key={option}
                  onClick={() => setSelectedDisposition(option)}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    selectedDisposition === option
                      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                      : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
                  }`}
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
              onClick={submitDisposition}
              disabled={savingDisposition || !selectedDisposition}
              className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
            >
              {savingDisposition ? "Saving disposition..." : "Complete ACW"}
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-3">
          <div>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Lead Context</p>
              <div className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => goToAdjacentLead(previousLeadId)}
                    disabled={!previousLeadId}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => goToAdjacentLead(nextLeadId)}
                    disabled={!nextLeadId}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-indigo-400/40 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-100 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">
                  {currentLeadIndex >= 0 ? `Lead ${currentLeadIndex + 1} of ${orderedLeadIds.length}` : "Lead order unavailable"}
                </p>
              </div>
            </div>
            <h1 className="mt-2 text-2xl font-semibold leading-tight text-zinc-100">{leadName}</h1>
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-zinc-500">
              Execution target:{" "}
              {hasLeadWebsite ? (
                <a href={leadWebsiteHref} target="_blank" rel="noreferrer" className="underline underline-offset-2 transition hover:text-zinc-300">
                  {leadWebsite}
                </a>
              ) : (
                leadWebsite
              )}
            </p>
            <div className="mt-3 space-y-3">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  isDemoBooked
                    ? "border-fuchsia-300/70 bg-fuchsia-500/25 text-fuchsia-100 shadow-[0_0_24px_rgba(217,70,239,0.4)]"
                    : "border-indigo-400/30 bg-indigo-500/15 text-indigo-200"
                }`}
              >
                {isDemoBooked ? "Demo Booked" : leadExecutionStatus}
              </span>
              {isDemoBooked ? (
                <div className="rounded-lg border border-fuchsia-300/70 bg-gradient-to-r from-fuchsia-600/35 to-violet-600/35 p-3 shadow-[0_0_30px_rgba(217,70,239,0.25)]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fuchsia-100">Demo Booked</p>
                  <p className="mt-1 text-xs text-fuchsia-100/90">
                    {leadDemoBooking?.date && leadDemoBooking?.time
                      ? `${leadDemoBooking.date} at ${leadDemoBooking.time}${leadDemoBooking?.timeZone ? ` (${leadDemoBooking.timeZone})` : ""}`
                      : "Scheduled meeting is ready for follow-up."}
                  </p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={markLeadAsClosedDeal}
                disabled={closingDeal}
                className="w-full rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {closingDeal ? "Moving to closed deals..." : "Mark as Closed Deal"}
              </button>
              {closeDealError ? <p className="text-xs text-rose-300">{closeDealError}</p> : null}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">Lead Contacts</p>
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-zinc-400">📍</span>
              <span>{leadLocation}</span>
            </div>
            {leadContacts.map((contact) => (
              <div key={contact.id} className="rounded-lg border border-zinc-700 bg-zinc-950/70 p-3">
                <p className="text-sm font-medium text-zinc-100">{contact.name}</p>
                <p className="text-xs text-zinc-500">{contact.role || "No role specified"}</p>
                <div className="mt-2 space-y-1 text-xs text-zinc-300">
                  <p>📞 {contact.phones.length ? contact.phones.join(" • ") : "No phone on file"}</p>
                  <p>✉️ {contact.emails.length ? contact.emails.join(" • ") : "No email on file"}</p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={async () => {
                      const value = window.prompt("Add a phone number");
                      if (!value) return;
                      await handleLeadContactAddPhone(contact.id, value);
                    }}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 transition hover:border-zinc-500"
                  >
                    + Phone
                  </button>
                  <button
                    onClick={async () => {
                      const value = window.prompt("Add an email");
                      if (!value) return;
                      await handleLeadContactAddEmail(contact.id, value);
                    }}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 transition hover:border-zinc-500"
                  >
                    + Email
                  </button>
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-zinc-700 bg-zinc-950/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Add Contact</p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <input
                  value={newContactName}
                  onChange={(event) => setNewContactName(event.target.value)}
                  placeholder="Contact name"
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-500"
                />
                <input
                  value={newContactRole}
                  onChange={(event) => setNewContactRole(event.target.value)}
                  placeholder="Role (Owner, Manager, etc)"
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-500"
                />
                <input
                  value={newContactPhone}
                  onChange={(event) => setNewContactPhone(event.target.value)}
                  placeholder="Phone"
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-500"
                />
                <input
                  value={newContactEmail}
                  onChange={(event) => setNewContactEmail(event.target.value)}
                  placeholder="Email"
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-500"
                />
              </div>
              <button
                onClick={handleLeadContactAdd}
                disabled={savingContacts}
                className="mt-2 w-full rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-indigo-50 transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {savingContacts ? "Saving..." : "Add Contact"}
              </button>
              {contactsError ? <p className="mt-2 text-xs text-rose-300">{contactsError}</p> : null}
            </div>
          </div>

          <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 p-4 shadow-lg shadow-indigo-900/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Deploy Vercel Site</p>
                <p className="mt-1 text-xs text-indigo-100/90">Clone the master template, create a new repo/project, and deploy this lead with custom branding.</p>
              </div>
              <span className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-sm text-white">🚀</span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-indigo-100/90">
              <label className="space-y-1">
                <span className="block">Select Template</span>
                <select
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value as "garage-door" | "new-template")}
                  className="w-full rounded-md border border-indigo-300/40 bg-black/20 px-2 py-1.5 text-xs text-white outline-none"
                >
                  <option value="garage-door">Garage Door</option>
                  <option value="new-template">New Template</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="block">Logo URL or upload</span>
                <input
                  value={brandingLogoUrl}
                  onChange={(event) => setBrandingLogoUrl(event.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border border-indigo-300/40 bg-black/20 px-2 py-1.5 text-xs text-white outline-none placeholder:text-indigo-200/70"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleBrandingFileUpload(event.target.files?.[0], "logo")}
                  className="w-full text-[11px] text-indigo-100 file:mr-2 file:rounded file:border-0 file:bg-white/20 file:px-2 file:py-1 file:text-[11px] file:text-white"
                />
              </label>

              <label className="space-y-1">
                <span className="block">Hero image URL or upload</span>
                <input
                  value={brandingHeroImageUrl}
                  onChange={(event) => setBrandingHeroImageUrl(event.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border border-indigo-300/40 bg-black/20 px-2 py-1.5 text-xs text-white outline-none placeholder:text-indigo-200/70"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleBrandingFileUpload(event.target.files?.[0], "hero")}
                  className="w-full text-[11px] text-indigo-100 file:mr-2 file:rounded file:border-0 file:bg-white/20 file:px-2 file:py-1 file:text-[11px] file:text-white"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="block">Primary color</span>
                  <input type="color" value={brandingPrimaryColor} onChange={(event) => setBrandingPrimaryColor(event.target.value)} className="h-9 w-full rounded border border-indigo-300/40 bg-black/20" />
                </label>
                <label className="space-y-1">
                  <span className="block">Secondary color</span>
                  <input type="color" value={brandingSecondaryColor} onChange={(event) => setBrandingSecondaryColor(event.target.value)} className="h-9 w-full rounded border border-indigo-300/40 bg-black/20" />
                </label>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleDeploySite}
                disabled={deployLoading || siteStatus === "BUILDING"}
                className="rounded-md border border-white/40 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deployLoading ? "Starting..." : siteStatus === "BUILDING" ? "Building..." : "Deploy Vercel Site"}
              </button>
              {deployedUrl ? (
                <a
                  href={deployedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-semibold text-white/90 transition hover:bg-white/20"
                >
                  View Live Site
                </a>
              ) : null}
            </div>

            {siteStatus === "BUILDING" || deployLoading ? (
              <div className="mt-3 rounded-lg border border-white/20 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-white/90">{deployStageLabel || "Build in progress..."}</span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 font-semibold text-white">{Math.max(deployProgress, 8)}%</span>
                </div>
                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-indigo-300 to-violet-300 transition-all duration-700"
                    style={{ width: `${Math.max(deployProgress, 8)}%` }}
                  />
                  <div className="pointer-events-none absolute inset-0 -translate-x-full animate-pulse bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-indigo-100/90">
                  <span>Background deploy running on Vercel</span>
                  <span>{deployEtaLabel || "Calculating ETA..."}</span>
                </div>
              </div>
            ) : null}
            {siteStatus === "LIVE" && deployedUrl ? <p className="mt-2 text-[11px] text-emerald-100">Site is live and ready to share.</p> : null}
            {deployError ? <p className="mt-2 text-xs text-rose-100">{deployError}</p> : null}
          </div>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">AI Deep Research</h2>
              <button
                onClick={runResearch}
                disabled={researchLoading}
                className="rounded-lg border border-zinc-600 px-3 py-1 text-xs transition hover:border-zinc-300 disabled:opacity-50"
              >
                {researchLoading ? "Running..." : researchInsight ? "Rerun Analysis" : "Run Analysis"}
              </button>
            </div>
            <p className="mt-4 min-h-14 text-sm text-zinc-300">
              {researchInsight || "Run analysis to generate localized insights and conversion weaknesses."}
            </p>
            {researchError ? <p className="mt-2 text-xs text-rose-300">{researchError}</p> : null}
          </div>
        </section>

        <section className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-5">
          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Amazon Connect • Softphone</h2>
              <span className={`text-xs ${softphoneStatusTone}`}>{softphoneStatusLabel}</span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-950 p-3">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <span>{ccpReady ? "Softphone connected •" : "Softphone offline •"}</span>
                <input
                  type="tel"
                  value={dialNumber}
                  onChange={(event) => setDialNumber(event.target.value)}
                  className="w-32 border-b border-dashed border-zinc-600 bg-transparent px-1 text-zinc-100 focus:border-indigo-500 focus:outline-none"
                  placeholder={leadPhone}
                />
                <button
                  onClick={() => setDialNumber(lead?.phone || "")}
                  className="rounded-md border border-zinc-700 p-1 text-zinc-400 transition hover:text-zinc-200"
                  aria-label="Reset dial number"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
              {callActive ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowKeypad((previous) => !previous)}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500"
                  >
                    {showKeypad ? "Hide keypad" : "Show keypad"}
                  </button>
                  <button
                    onClick={handleEndCall}
                    className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-rose-950 hover:bg-rose-400"
                  >
                    <Phone className="h-4 w-4" /> End Call
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleCall}
                  disabled={!canStartCall}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
                >
                  <Phone className="h-4 w-4" /> {callStatus === "connecting" ? "Connecting…" : "Call"}
                </button>
              )}
            </div>
            {callActive && showKeypad ? (
              <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">DTMF Keypad</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {keypadDigits.map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleSendDigit(digit)}
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-indigo-500 hover:text-indigo-300"
                    >
                      {digit}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-300">
                <p className="text-zinc-500">Queue</p>
                <p className="mt-1 font-semibold text-zinc-100">{callStatus === "connecting" ? "Dialing…" : "—"}</p>
              </div>
              <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-300">
                <p className="text-zinc-500">Call Timer</p>
                <p className="mt-1 font-semibold text-zinc-100">{callActive ? formattedTimer : "00:00"}</p>
              </div>
              <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-300">
                <p className="text-zinc-500">Rep</p>
                <p className={`mt-1 font-semibold ${ccpReady ? "text-emerald-300" : "text-zinc-400"}`}>{ccpReady ? "Online" : "Offline"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            {/* THE TABS */}
            <div className="mb-4 flex items-center gap-6 border-b border-zinc-800 px-2">
              {(["Notes", "SMS", "Email", "Call Audio & AI"] as ActivityTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative pb-3 text-sm font-bold transition-all ${
                    activeTab === tab ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-t-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></span>
                  )}
                </button>
              ))}
            </div>

            {/* TAB CONTENT: CALL AUDIO & AI */}
            {activeTab === "Call Audio & AI" ? (
              <div className="flex min-h-[400px] flex-col gap-4 animate-in fade-in duration-300">
                {isLoadingIntel ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-zinc-800/50 bg-zinc-900/20 p-8">
                    <span className="relative mb-4 flex h-6 w-6">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex h-6 w-6 rounded-full bg-indigo-500"></span>
                    </span>
                    <p className="text-sm font-bold uppercase tracking-widest text-zinc-400">Querying AWS Contact Lens...</p>
                  </div>
                ) : !callIntel ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-zinc-800/50 bg-zinc-900/20 p-8">
                    <svg className="mb-4 h-12 w-12 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    <p className="text-sm font-bold uppercase tracking-widest text-zinc-500">No Call Intel Found</p>
                    <p className="mt-1 text-xs text-zinc-600">Make an outbound call to generate AI transcripts and sentiment data.</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                      <div className="mb-3 flex items-start justify-between">
                        <div>
                          <h3 className="flex items-center gap-2 font-bold text-white">
                            <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                            Outbound Connect
                          </h3>
                          <p className="text-xs text-zinc-500">
                            {callIntel.created_at ? new Date(callIntel.created_at).toLocaleString() : "Unknown time"} • Duration: {callIntel.duration_seconds || "00:00"}s
                          </p>
                        </div>
                        {callIntel.overall_sentiment && (
                          <div className={`rounded border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                            callIntel.overall_sentiment === "POSITIVE"
                              ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                              : callIntel.overall_sentiment === "NEGATIVE"
                                ? "border border-red-500/20 bg-red-500/10 text-red-400"
                                : "border border-zinc-700 bg-zinc-800 text-zinc-400"
                          }`}>
                            Sentiment: {callIntel.overall_sentiment}
                          </div>
                        )}
                      </div>

                      {callIntel.recording_url && (
                        <div className="mt-2 w-full rounded-lg border border-zinc-800/80 bg-zinc-950 p-2">
                          <audio controls className="h-8 w-full" src={callIntel.recording_url}>
                            Your browser does not support the audio element.
                          </audio>
                        </div>
                      )}
                    </div>

                    {callIntel.ai_summary && (
                      <div className="relative overflow-hidden rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-indigo-500/10 blur-[40px]"></div>
                        <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-400">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          Contact Lens AI Summary
                        </h4>
                        <p className="relative z-10 text-sm leading-relaxed text-zinc-300">{callIntel.ai_summary}</p>
                      </div>
                    )}

                    <div className="flex max-h-[400px] flex-col rounded-xl border border-zinc-800 bg-zinc-900">
                      <div className="grid grid-cols-3 divide-x divide-zinc-800 border-b border-zinc-800 text-center">
                        <div className="py-2">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Rep Talk</p>
                          <p className="text-sm font-bold text-white">{callIntel.agent_talk_time_pct || "0"}%</p>
                        </div>
                        <div className="py-2">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Cust Talk</p>
                          <p className="text-sm font-bold text-white">{callIntel.customer_talk_time_pct || "0"}%</p>
                        </div>
                        <div className="py-2">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Interrupts</p>
                          <p className="text-sm font-bold text-orange-400">{callIntel.interruptions || "0"}</p>
                        </div>
                      </div>

                      <div className="flex-1 space-y-4 overflow-y-auto p-4">
                        {callIntel.transcript_json && Array.isArray(callIntel.transcript_json) ? (
                          callIntel.transcript_json.map((line, index) => (
                            <div key={index} className="flex gap-3">
                              <div className="w-12 shrink-0 pt-0.5 text-right">
                                <span className="font-mono text-[9px] text-zinc-600">{line.time || "00:00"}</span>
                              </div>
                              <div className="flex-1">
                                <div className="mb-0.5 flex items-center gap-2">
                                  <span className={`text-[10px] font-black uppercase tracking-widest ${line.speaker === "AGENT" ? "text-indigo-400" : "text-emerald-400"}`}>
                                    {line.speaker}
                                  </span>
                                  {line.sentiment === "NEGATIVE" && <span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]" title="Negative Sentiment detected"></span>}
                                  {line.sentiment === "POSITIVE" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" title="Positive Sentiment detected"></span>}
                                </div>
                                <p className="text-sm leading-snug text-zinc-300">{line.text}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="py-4 text-center text-xs italic text-zinc-500">Transcript data unavailable or processing.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredNotes.map((note) => {
                const isCall = note.activity_type === "CALL" || note.aws_contact_id;
                const createdAt = getNoteCreatedAt(note);

                if (isCall) {
                  return (
                    <div key={note.id} className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-md">
                      <div className="mb-3 flex items-center justify-between border-b border-zinc-800/80 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-indigo-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-400">Outbound Call</span>
                          <span className="text-xs text-zinc-500">{new Date(createdAt).toLocaleString()}</span>
                        </div>
                        {note.aws_contact_id && (
                          <span className="text-[10px] font-mono text-zinc-600" title={note.aws_contact_id}>
                            ID: {note.aws_contact_id.substring(0, 8)}...
                          </span>
                        )}
                      </div>

                      <p className="mb-4 text-sm leading-relaxed text-zinc-300">
                        <span className="mr-2 font-semibold text-zinc-500">Disposition:</span>
                        {note.content}
                      </p>

                      {note.aws_contact_id ? (
                        <div className="space-y-4 rounded-lg border border-zinc-800/50 bg-zinc-950/80 p-4">
                          <div className="flex h-10 w-full items-center gap-3 rounded border border-zinc-700/50 bg-zinc-900 px-3">
                            <button className="flex items-center gap-1 text-xs font-semibold text-zinc-400 transition-colors hover:text-indigo-400">
                              ▶ Play
                            </button>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                              <div className="h-full w-0 bg-indigo-500" />
                            </div>
                            <span className="text-[10px] text-zinc-500">Processing...</span>
                          </div>

                          <div>
                            <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">AI Call Summary</h4>
                            <p className="border-l-2 border-indigo-500/30 pl-2.5 text-xs italic leading-relaxed text-zinc-400">
                              AWS Contact Lens is analyzing this recording. Summary and sentiment will appear here shortly...
                            </p>
                          </div>

                          <div>
                            <h4 className="mb-1.5 mt-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Transcript snippet</h4>
                            <div className="space-y-1.5 rounded border border-zinc-800/30 bg-zinc-900/50 p-2.5 text-xs text-zinc-500">
                              <p>
                                <span className="font-medium text-indigo-400">Rep:</span> [Audio processing...]
                              </p>
                              <p>
                                <span className="font-medium text-emerald-500">Lead:</span> [Audio processing...]
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs italic text-amber-500/80">No AWS audio linked to this call.</p>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={note.id} className="mb-4 rounded-lg border border-zinc-800/50 bg-zinc-900/40 p-3">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      {note.activity_type || "NOTE"} • {new Date(createdAt).toLocaleString()}
                    </div>
                    <p className="text-sm text-zinc-300">{note.content}</p>
                  </div>
                );
              })}
              {!notesLoading && filteredNotes.length === 0 ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm text-zinc-500">No {activeTab.toLowerCase()} activity yet for this lead.</div>
              ) : null}
              {notesLoading ? <div className="text-xs text-zinc-500">Loading notes...</div> : null}
              {notesError ? <div className="text-xs text-rose-300">{notesError}</div> : null}
              </div>
            )}

            {activeTab !== "Call Audio & AI" ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 p-2">
              <button
                onClick={handleAIDraft}
                disabled={isDrafting}
                className="rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDrafting ? "Drafting..." : "AI draft"}
              </button>
              <input
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void saveOmniNote();
                  }
                }}
                className="h-9 flex-1 bg-transparent px-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
                placeholder={`Draft ${activeTab === "Notes" ? "note" : activeTab === "Email" ? "email" : "SMS"} content for ${leadName}...`}
              />
              <button
                onClick={saveOmniNote}
                disabled={notesLoading || !notesDraft.trim()}
                className="rounded-md bg-indigo-500 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                Send
              </button>
              </div>
            ) : null}
          </div>

          <FollowUpEngine leadId={leadId} leadName={leadName} onTaskCompleted={saveCompletedFollowUpToNotes} />

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Smart Scheduling Hub</h2>
              <button
                type="button"
                onClick={() => setIsCustomScheduling((previous) => !previous)}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-zinc-500"
              >
                {isCustomScheduling ? "Close Edit" : "Edit Date & Time"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-300">
              <Globe className="h-3.5 w-3.5 text-zinc-500" />
              <span>Lead Local Time: {leadLocalTimeText} • {leadTimeMeta.location}</span>
              <span className="text-zinc-500">(Your Time: {repLocalTimeText})</span>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">Timezone auto-detected from {leadTimeMeta.source}.</p>

            {isCustomScheduling ? (
              <div className="mt-4 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Add custom date/time options</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="rounded-md border border-indigo-400/20 bg-zinc-950/70 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-400">Add custom day</p>
                    <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="date"
                        value={customDayInput}
                        onChange={(event) => setCustomDayInput(event.target.value)}
                        className="h-8 flex-1 rounded-md border border-indigo-400/30 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none"
                      />
                      <button
                        type="button"
                        onClick={applyCustomDay}
                        disabled={!customDayInput}
                        className="rounded-md bg-indigo-500 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="rounded-md border border-indigo-400/20 bg-zinc-950/70 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-400">Add custom time</p>
                    <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="time"
                        value={customTimeInput}
                        onChange={(event) => setCustomTimeInput(event.target.value)}
                        className="h-8 flex-1 rounded-md border border-indigo-400/30 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none"
                      />
                      <button
                        type="button"
                        onClick={applyCustomTime}
                        disabled={!customTimeInput}
                        className="rounded-md bg-indigo-500 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Select Day</p>
              <div className="flex flex-wrap gap-2">
                {combinedDayOptions.map((day) => {
                  const isActive = selectedMeetingDay === day.value;

                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => {
                        setSelectedMeetingDay(day.value);
                        setMeetingLink("");
                      }}
                      className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                        isActive
                          ? "border-zinc-600 bg-zinc-700 text-white"
                          : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
                {selectedMeetingDay && !leadDayOptions.some((day) => day.value === selectedMeetingDay) ? (
                  <span className="rounded-full border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-xs font-medium text-indigo-200">
                    Custom Day: {selectedMeetingDay}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Available Times ({leadTimeZone})</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {combinedTimeSlots.map((slot) => {
                  const isActive = selectedMeetingTime === slot;

                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => {
                        setSelectedMeetingTime(slot);
                        setMeetingLink("");
                      }}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                        isActive
                          ? "border-indigo-500 bg-indigo-600/20 text-indigo-400"
                          : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={generateMeetingLink}
              disabled={meetingLoading || !selectedMeetingDay || !selectedMeetingTime}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                meetingLink ? "bg-emerald-600 text-white" : "bg-indigo-500 text-white"
              }`}
            >
              {meetingLoading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                  Booking...
                </>
              ) : meetingLink ? (
                "Demo Booked! • Meet link generated"
              ) : (
                "Book & Generate Meet Link"
              )}
            </button>
            {meetingError ? <p className="mt-2 text-xs text-rose-300">{meetingError}</p> : null}
            {meetingLink ? (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={goToUpcomingDemos}
                  className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400"
                >
                  Booked Demo → View Upcoming Demos
                </button>
                <a
                  href={meetingLink.startsWith("http") ? meetingLink : `https://${meetingLink}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                >
                  {meetingLink}
                </a>
                <button
                  onClick={copyInviteText}
                  className="rounded-lg border border-zinc-700 bg-transparent px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                >
                  {inviteCopied ? "Invite Copied" : "Copy Invite Text"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold">Checkout &amp; Payments</h2>
            <p className="mt-1 text-xs text-zinc-500">Generate a Stripe checkout link instantly, or route sub-$500 deals for manager approval.</p>

            <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950 p-3">
              <label className="text-xs uppercase tracking-wide text-zinc-500">Deal Price</label>
              <div className="mt-2 flex items-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 focus-within:border-zinc-500">
                <span className="text-sm text-zinc-400">$</span>
                <input
                  type="number"
                  min={0}
                  disabled={approvalPending}
                  value={checkoutAmount}
                  onChange={(event) => {
                    const amount = Number(event.target.value);
                    setCheckoutAmount(Number.isFinite(amount) ? amount : 0);
                    setCheckoutLink("");
                    setApprovalPending(false);
                  }}
                  className="h-10 w-full bg-transparent px-2 text-sm text-zinc-100 outline-none disabled:cursor-not-allowed disabled:text-zinc-500"
                  placeholder="500"
                />
              </div>
            </div>

            <button
              onClick={handleCheckoutAction}
              disabled={checkoutLoading || approvalPending}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60 ${
                checkoutAmount >= 500 ? "bg-indigo-600 hover:bg-indigo-500" : "bg-amber-600 hover:bg-amber-500"
              }`}
            >
              {checkoutLoading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                  Processing...
                </>
              ) : checkoutAmount >= 500 ? (
                "Generate Stripe Link"
              ) : (
                "Request Manager Approval"
              )}
            </button>

            {checkoutLink ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                <div className="flex items-center gap-2 truncate">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{checkoutLink}</span>
                </div>
                <button
                  onClick={copyCheckoutLink}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300/30 px-2 py-1 text-[11px] font-semibold hover:bg-emerald-500/20"
                >
                  {checkoutLinkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {checkoutLinkCopied ? "Copied" : "Copy Link"}
                </button>
              </div>
            ) : null}

            {approvalPending ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200">
                <Link2 className="h-3.5 w-3.5" />
                Approval pending from Manager...
              </div>
            ) : null}
          </div>
        </section>

        <section className="col-span-12 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-4">
          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
                <span>🧠</span>
                Dynamic AI Playbook
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGeneratePlaybook}
                  disabled={playbookLoading}
                  className="rounded-lg border border-indigo-500/40 px-3 py-1 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {playbookLoading ? "Building..." : "Generate with Gemini"}
                </button>
                {(["Scripts", "Objections"] as ScriptTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setScriptTab(tab)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold ${scriptTab === tab ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {scriptTab === "Scripts" ? (
              <div className="space-y-3 text-sm text-zinc-200">
                <h3 className="text-sm font-semibold text-zinc-100">Gemini Deep-Research Pitch Sequence</h3>
                {aiPlaybook.scripts.map((script) => (
                  <p key={script} className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                    {script}
                  </p>
                ))}
                <p className="rounded-lg border border-emerald-600/40 bg-emerald-900/20 p-3 text-emerald-100">
                  <span className="font-semibold">ROI Snapshot:</span> {aiPlaybook.roiSnapshot}
                </p>
                <p className="rounded-lg border border-indigo-600/40 bg-indigo-950/30 p-3 text-indigo-100">
                  <span className="font-semibold">Close:</span> {aiPlaybook.closing}
                </p>
                <span className="inline-flex rounded-md border border-zinc-600 px-2 py-1 text-[11px] text-zinc-300">
                  Injected data: {aiPlaybook.injectedData.join(" + ")}
                </span>
                {playbookError ? <p className="text-xs text-amber-300">{playbookError}</p> : null}
              </div>
            ) : (
              <ul className="space-y-3 text-sm text-zinc-300">
                {aiPlaybook.objections.map((item) => (
                  <li key={item.objection} className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                    “{item.objection}” → {item.counter}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
