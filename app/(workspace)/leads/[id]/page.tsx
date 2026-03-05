"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, Copy, Globe, Link2, Phone, RotateCcw } from "lucide-react";
import { useAmazonConnect } from "@/components/amazon-connect-provider";
import { createClientComponentClient } from "@/lib/supabase-client";

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
  source_payload?: {
    aiResearchSummary?: string | null;
    contacts?: LeadContactRecord[];
  } | null;
  sourcePayload?: {
    aiResearchSummary?: string | null;
    contacts?: LeadContactRecord[];
  } | null;
};

type LeadContactRecord = {
  id: string;
  name: string;
  role?: string;
  phones: string[];
  emails: string[];
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

type FetchStatus = "loading" | "ready" | "error";
type ActivityTab = "NOTES" | "SMS" | "EMAIL";
type ScriptTab = "Scripts" | "Objections";
type ExecutionLeadStatus = "New" | "Pitched" | "Awaiting Approval" | "Payment Pending" | "Closed Won";

type AIDynamicPlaybook = {
  scripts: string[];
  objections: Array<{ objection: string; counter: string }>;
  closing: string;
  roiSnapshot: string;
  injectedData: string[];
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
  const payloadContacts = leadRecord?.source_payload?.contacts ?? leadRecord?.sourcePayload?.contacts;

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

  const [status, setStatus] = useState<FetchStatus>("loading");
  const [lead, setLead] = useState<LeadRecord | null>(null);

  const [researchLoading, setResearchLoading] = useState(false);
  const [researchInsight, setResearchInsight] = useState<string>("");
  const [researchError, setResearchError] = useState<string>("");

  const [activeTab, setActiveTab] = useState<ActivityTab>("NOTES");
  const [scriptTab, setScriptTab] = useState<ScriptTab>("Scripts");
  const [showDisposition, setShowDisposition] = useState(false);
  const [ccpStatus, setCcpStatus] = useState<"READY" | "ACW">("READY");
  const [currentContactId, setCurrentContactId] = useState<string | null>(null);
  const [selectedDisposition, setSelectedDisposition] = useState("");
  const [dispositionSummary, setDispositionSummary] = useState("");
  const [savingDisposition, setSavingDisposition] = useState(false);

  const { callActive, callSeconds, ccpReady, connectionStatus, callStatus, endActiveCall } = useAmazonConnect();
  const [dialNumber, setDialNumber] = useState("");

  const [selectedMeetingDay, setSelectedMeetingDay] = useState("");
  const [selectedMeetingTime, setSelectedMeetingTime] = useState("");
  const [isCustomScheduling, setIsCustomScheduling] = useState(false);
  const [customDayInput, setCustomDayInput] = useState("");
  const [customTimeInput, setCustomTimeInput] = useState("");
  const [customMeetingDays, setCustomMeetingDays] = useState<Array<{ value: string; label: string }>>([]);
  const [customMeetingTimes, setCustomMeetingTimes] = useState<string[]>([]);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingLink, setMeetingLink] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);

  const [leadExecutionStatus, setLeadExecutionStatus] = useState<ExecutionLeadStatus>("New");
  const [checkoutAmount, setCheckoutAmount] = useState(500);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutLink, setCheckoutLink] = useState("");
  const [checkoutLinkCopied, setCheckoutLinkCopied] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [playbookLoading, setPlaybookLoading] = useState(false);
  const [playbookError, setPlaybookError] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [notes, setNotes] = useState<LeadNoteRecord[]>([]);
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
        contact?: (callback: (contact: { onConnected?: (callback: () => void) => void; onEnded?: (callback: () => void) => void; getContactId?: () => string }) => void) => void;
      };
    };

    const windowWithConnect = window as ConnectWindow;
    windowWithConnect.connect?.contact?.((contact) => {
      contact.onConnected?.(() => {
        const contactId = contact.getContactId?.() ?? null;
        console.log("AWS Call Connected. Contact ID:", contactId);
        setCurrentContactId(contactId);
      });

      contact.onEnded?.(() => {
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

        const { data } = await supabase.from<LeadRecord>("leads").select("*").eq("id", leadId).single();

        if (!alive) return;

        if (data) {
          setLead(data);
          setLeadContacts(normalizeLeadContacts(data));
          const existingResearch = data.source_payload?.aiResearchSummary ?? data.sourcePayload?.aiResearchSummary ?? "";
          setResearchInsight(existingResearch);
          setResearchError("");
          const resolvedStatus = data.status as ExecutionLeadStatus | undefined;
          if (
            resolvedStatus === "New" ||
            resolvedStatus === "Pitched" ||
            resolvedStatus === "Awaiting Approval" ||
            resolvedStatus === "Payment Pending" ||
            resolvedStatus === "Closed Won"
          ) {
            setLeadExecutionStatus(resolvedStatus);
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
  }, [leadId, supabase]);

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
  const leadWebsite = lead?.website || lead?.website_url || lead?.websiteUrl || "No website on file";
  const hasLeadWebsite = leadWebsite !== "No website on file";
  const leadWebsiteHref = leadWebsite.startsWith("http://") || leadWebsite.startsWith("https://") ? leadWebsite : `https://${leadWebsite}`;

  useEffect(() => {
    setDialNumber(lead?.phone || "");
  }, [lead?.phone]);
  const deployedUrl = lead?.deployed_url || lead?.deployedUrl || "";
  const leadCity = lead?.city || "Unknown city";

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

  async function generateMeetingLink() {
    setMeetingLoading(true);
    setInviteCopied(false);
    setMeetingLink("");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setMeetingLink("meet.google.com/abc-defg-hij");
    setMeetingLoading(false);
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
      setCheckoutLink("buy.stripe.com/test_123");
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
      const amountParam = parsed.searchParams.get("amount") || parsed.searchParams.get("amount_total") || parsed.searchParams.get("unit_amount");
      if (!amountParam) return null;

      const numericAmount = Number(amountParam);
      return Number.isFinite(numericAmount) ? numericAmount : null;
    } catch {
      return null;
    }
  }

  async function markLeadAsClosedDeal() {
    if (!leadId) return;

    setClosingDeal(true);
    setCloseDealError("");

    const sourcePayload = lead?.source_payload ?? lead?.sourcePayload ?? {};
    const inferredDealValue = extractStripeValueFromLink(checkoutLink) ?? checkoutAmount;
    const closedAtIso = new Date().toISOString();

    const { error } = await supabase
      .from("leads")
      .update({
        status: "CLOSED",
        source_payload: {
          ...sourcePayload,
          closedDealValue: inferredDealValue,
          closedAt: closedAtIso,
          stripeCheckoutLink: checkoutLink || null,
        },
      })
      .eq("id", leadId);

    if (error) {
      setCloseDealError("Unable to mark this lead as closed right now.");
      setClosingDeal(false);
      return;
    }

    setLeadExecutionStatus("Closed Won");
    setLead((previous) =>
      previous
        ? {
            ...previous,
            status: "CLOSED",
            source_payload: {
              ...(previous.source_payload ?? previous.sourcePayload ?? {}),
              closedDealValue: inferredDealValue,
              closedAt: closedAtIso,
              stripeCheckoutLink: checkoutLink || null,
            },
          }
        : previous,
    );
    router.push("/closed-deals");
    router.refresh();
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
        channel: activeTab.toLowerCase(),
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
        setPlaybookError("Gemini returned an unreadable response. Showing fallback playbook.");
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
      setPlaybookError("Gemini could not return a valid playbook format. Showing the fallback playbook.");
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

  const filteredNotes = notes.filter((note) => {
    const type = resolveNoteType(note);
    if (activeTab === "NOTES") {
      return type === "NOTE" || type === "CALL";
    }
    return type === activeTab;
  });

  const getNoteCreatedAt = (note: LeadNoteRecord) => note.created_at || note.createdAt || new Date().toISOString();

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
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Lead Context</p>
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
            <span className="mt-3 inline-flex rounded-full border border-indigo-400/30 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-200">
              {leadExecutionStatus}
            </span>
            <button
              type="button"
              onClick={markLeadAsClosedDeal}
              disabled={closingDeal}
              className="mt-3 w-full rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {closingDeal ? "Moving to closed deals..." : "Mark as Closed Deal"}
            </button>
            {closeDealError ? <p className="mt-2 text-xs text-rose-300">{closeDealError}</p> : null}
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

          <a
            href={deployedUrl}
            target="_blank"
            rel="noreferrer"
            className="group block rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 p-4 shadow-lg shadow-indigo-900/40 transition hover:scale-[1.01]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Deploy Vercel Site</p>
                <p className="mt-1 text-xs text-indigo-100/90">Push this lead from conversation to live site with one click.</p>
              </div>
              <span className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-sm text-white">🚀</span>
            </div>
          </a>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">AI Deep Research</h2>
              <button
                onClick={runResearch}
                disabled={researchLoading}
                className="rounded-lg border border-zinc-600 px-3 py-1 text-xs transition hover:border-zinc-300 disabled:opacity-50"
              >
                {researchLoading ? "Running..." : "Run Analysis"}
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
                <button
                  onClick={handleEndCall}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-rose-950 hover:bg-rose-400"
                >
                  <Phone className="h-4 w-4" /> End Call
                </button>
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
            <div className="mb-3 flex gap-4 border-b border-zinc-800 pb-2">
              {(["NOTES", "SMS", "EMAIL"] as ActivityTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-1 pb-1 text-xs font-medium transition ${activeTab === tab ? "text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  {tab === "NOTES" ? "Notes" : tab === "EMAIL" ? "Email" : tab}
                  {activeTab === tab ? <span className="absolute inset-x-0 -bottom-[9px] h-0.5 rounded bg-blue-500" /> : null}
                </button>
              ))}
            </div>

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
                placeholder={`Draft ${activeTab === "NOTES" ? "note" : activeTab === "EMAIL" ? "email" : "SMS"} content for ${leadName}...`}
              />
              <button
                onClick={saveOmniNote}
                disabled={notesLoading || !notesDraft.trim()}
                className="rounded-md bg-indigo-500 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                Send
              </button>
            </div>
          </div>

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
                    <div className="mt-1.5 flex items-center gap-2">
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
                    <div className="mt-1.5 flex items-center gap-2">
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
              <div className="grid grid-cols-3 gap-2">
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
                `Demo Booked! • ${meetingLink}`
              ) : (
                "Book & Generate Meet Link"
              )}
            </button>
            {meetingLink ? (
              <div className="mt-3">
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
