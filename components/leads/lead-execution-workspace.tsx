"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarDays,
  ChevronDown,
  Clock3,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Rocket,
  UserCircle2,
} from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase-client";

type WorkspaceLeadContact = {
  id: string;
  name: string;
  role?: string;
  phones: string[];
  emails: string[];
};

type LeadExecutionWorkspaceProps = {
  lead: {
    id: string;
    businessName: string;
    status: string;
    phone?: string | null;
    email?: string | null;
    websiteUrl?: string | null;
    city?: string | null;
    businessType?: string | null;
    aiResearchSummary?: string | null;
    deployedUrl?: string | null;
  };
};

const statusOptions = ["NEW", "CONTACTED", "IN_PROGRESS", "CLOSED", "DISQUALIFIED"] as const;

const statusLabelMap: Record<(typeof statusOptions)[number], string> = {
  NEW: "Not Contacted",
  CONTACTED: "Contacted",
  IN_PROGRESS: "In Progress",
  CLOSED: "Closed",
  DISQUALIFIED: "Disqualified",
};

const notesFeed = [
  { from: "You", body: "Owner asked to prioritize speed and mobile-first booking UX.", at: "Today · 09:41", activity_type: "NOTES" },
  { from: "You", body: "Agreed to review sample Vercel preview after lunch.", at: "Today · 10:03", activity_type: "NOTES" },
];

const smsFeed = [
  { from: "Lead", body: "Can you include online booking with reminders?", at: "Today · 10:17", activity_type: "SMS" },
  { from: "You", body: "Absolutely. I can wire booking + confirmations in this sprint.", at: "Today · 10:19", activity_type: "SMS" },
];

const emailFeed = [{ from: "Lead", body: "Send me a preview and implementation timeline.", at: "Today · 10:31", activity_type: "EMAIL" }];

const mockAnalysis =
  "Analyzed 14 Google Reviews and local SEO. Weakness: No mobile booking. Competitors rank higher for 'emergency repair'.";

const bookingSlots = ["09:30 AM", "10:00 AM", "11:30 AM", "01:00 PM", "02:30 PM", "04:00 PM"];

const objections = [
  {
    objection: "I already have a web guy.",
    counter:
      "Great! Send him this [Vercel Link]. If he can't get your site loading this fast by tomorrow, let's keep talking.",
  },
  {
    objection: "We're too busy to change things right now.",
    counter:
      "Totally fair — this is exactly why we do a no-downtime migration. You keep operating while we swap in a faster funnel.",
  },
  {
    objection: "I need to think about it.",
    counter:
      "Makes sense. Let's book a 15-minute checkpoint with your team so you can review real lead-flow projections before deciding.",
  },
];

function resolveStatus(input: string): (typeof statusOptions)[number] {
  return statusOptions.includes(input as (typeof statusOptions)[number]) ? (input as (typeof statusOptions)[number]) : "NEW";
}

function fallbackContacts(phone?: string | null, email?: string | null): WorkspaceLeadContact[] {
  return [{
    id: "primary",
    name: "Primary Contact",
    role: "Owner",
    phones: phone ? [phone] : [],
    emails: email ? [email] : [],
  }];
}

function normalizeContacts(value: unknown, phone?: string | null, email?: string | null): WorkspaceLeadContact[] {
  if (!Array.isArray(value)) return fallbackContacts(phone, email);

  const contacts = value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const record = item as Partial<WorkspaceLeadContact>;
      const phones = Array.isArray(record.phones) ? record.phones.map((v) => String(v).trim()).filter(Boolean) : [];
      const emails = Array.isArray(record.emails) ? record.emails.map((v) => String(v).trim()).filter(Boolean) : [];
      return {
        id: typeof record.id === "string" && record.id ? record.id : crypto.randomUUID(),
        name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : "Untitled Contact",
        role: typeof record.role === "string" ? record.role.trim() : "",
        phones,
        emails,
      };
    });

  return contacts.length ? contacts : fallbackContacts(phone, email);
}

export function LeadExecutionWorkspace({ lead }: LeadExecutionWorkspaceProps) {
  const [currentStatus, setCurrentStatus] = useState<(typeof statusOptions)[number]>(resolveStatus(lead.status));
  const [commsTab, setCommsTab] = useState<"NOTES" | "SMS" | "EMAIL">("NOTES");
  const [playbookTab, setPlaybookTab] = useState<"SCRIPTS" | "OBJECTIONS">("SCRIPTS");
  const [expandedObjection, setExpandedObjection] = useState(0);

  const [isResearchLoading, setIsResearchLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(lead.aiResearchSummary ?? null);

  const [selectedDate, setSelectedDate] = useState("2026-03-06");
  const [selectedSlot, setSelectedSlot] = useState("11:30 AM");
  const [isBookingLoading, setIsBookingLoading] = useState(false);
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [contacts, setContacts] = useState<WorkspaceLeadContact[]>(fallbackContacts(lead.phone, lead.email));
  const [contactsError, setContactsError] = useState("");
  const [savingContacts, setSavingContacts] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactRole, setNewContactRole] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const activeTab = commsTab;
  const supabase = useMemo(() => createClientComponentClient(), []);

  const siteUrl = useMemo(
    () => lead.deployedUrl ?? `https://${lead.businessName.toLowerCase().replace(/[^a-z0-9]/g, "-")}.vercel.app`,
    [lead.businessName, lead.deployedUrl],
  );

  const commsFeed = [...notesFeed, ...smsFeed, ...emailFeed];

  const personalizedScript = `Hey ${lead.businessName}, I noticed from your Google Reviews that customers love your speed, but your current site makes it hard to book on mobile. I actually just built a faster, mobile-optimized site for you here: ${siteUrl}. Do you have 5 mins to check it out?`;

  useEffect(() => {
    let alive = true;

    async function loadContacts() {
      const response = await fetch("/api/leads", { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { leads?: Array<{ id?: string; source_payload?: { contacts?: unknown }; sourcePayload?: { contacts?: unknown } }>; error?: string } | null;
      if (!alive) return;

      const matchingLead = Array.isArray(payload?.leads) ? payload.leads.find((item) => item?.id === lead.id) : null;
      const payloadContacts = matchingLead?.source_payload?.contacts ?? matchingLead?.sourcePayload?.contacts;
      setContacts(normalizeContacts(payloadContacts, lead.phone, lead.email));
    }

    loadContacts().catch(() => {
      if (!alive) return;
      setContacts(fallbackContacts(lead.phone, lead.email));
    });

    return () => {
      alive = false;
    };
  }, [lead.id, lead.email, lead.phone]);

  const persistContacts = async (nextContacts: WorkspaceLeadContact[]) => {
    setSavingContacts(true);
    setContactsError("");

    try {
      const response = await fetch("/api/leads/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, contacts: nextContacts }),
      });

      const payload = (await response.json().catch(() => null)) as { contacts?: WorkspaceLeadContact[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Could not save contacts. Please try again.");

      setContacts(Array.isArray(payload?.contacts) ? payload.contacts : nextContacts);
    } catch (error) {
      setContactsError(error instanceof Error ? error.message : "Could not save contacts. Please try again.");
    } finally {
      setSavingContacts(false);
    }
  };

  const handleRunAnalysis = () => {
    setIsResearchLoading(true);
    setAnalysisResult(null);
    window.setTimeout(() => {
      setAnalysisResult(mockAnalysis);
      setIsResearchLoading(false);
    }, 2000);
  };

  const handleBookDemo = () => {
    setIsBookingLoading(true);
    setMeetLink(null);
    window.setTimeout(() => {
      setMeetLink("https://meet.google.com/abc-defg-hij");
      setIsBookingLoading(false);
    }, 1400);
  };

  const handleSendNote = () => {
    if (!noteText.trim()) return;
    setNoteText("");
  };

  const handleAIDraft = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDrafting(true);
    setNoteText("Drafting with Gemini...");

    try {
      const response = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName: lead.businessName || "this business",
          activeTab,
          researchContext: analysisResult || `Website: ${lead.websiteUrl || "Unknown"}`,
        }),
      });

      const data = await response.json();

      if (response.ok && data.draft) {
        setNoteText(data.draft);
      } else {
        setNoteText("Error: Could not generate draft.");
      }
    } catch (error) {
      console.error("Drafting failed", error);
      setNoteText("Error connecting to Gemini AI.");
    } finally {
      setIsDrafting(false);
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-9.5rem)] grid-cols-12 gap-4 bg-zinc-950 xl:h-[calc(100vh-9.5rem)] xl:overflow-hidden">
      <aside className="col-span-12 flex h-full flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 xl:col-span-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Lead Context</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-100">{lead.businessName}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {lead.businessType || "Local Services"} · {lead.city || "Unknown city"}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-sm">
          <p className="mb-2 font-medium text-zinc-200">Contact Info</p>
          <p className="mb-2 flex items-center gap-2 text-zinc-400">
            <MapPin className="h-3.5 w-3.5" /> {lead.city || "Unknown city"}
          </p>
          <div className="space-y-2">
            {contacts.map((contact) => (
              <div key={contact.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
                <p className="text-xs font-semibold text-zinc-200">{contact.name}</p>
                <p className="text-[11px] text-zinc-500">{contact.role || "No role"}</p>
                <p className="mt-1 flex items-center gap-2 text-zinc-400">
                  <Phone className="h-3.5 w-3.5" /> {contact.phones.length ? contact.phones.join(" • ") : "No phone on file"}
                </p>
                <p className="mt-1 flex items-center gap-2 text-zinc-400">
                  <Mail className="h-3.5 w-3.5" /> {contact.emails.length ? contact.emails.join(" • ") : "No email on file"}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      const value = window.prompt("Add phone number");
                      if (!value?.trim()) return;
                      const nextContacts = contacts.map((item) =>
                        item.id === contact.id && !item.phones.includes(value.trim())
                          ? { ...item, phones: [...item.phones, value.trim()] }
                          : item,
                      );
                      void persistContacts(nextContacts);
                    }}
                    className="rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300"
                  >
                    + Phone
                  </button>
                  <button
                    onClick={() => {
                      const value = window.prompt("Add email");
                      if (!value?.trim()) return;
                      const nextContacts = contacts.map((item) =>
                        item.id === contact.id && !item.emails.includes(value.trim())
                          ? { ...item, emails: [...item.emails, value.trim()] }
                          : item,
                      );
                      void persistContacts(nextContacts);
                    }}
                    className="rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300"
                  >
                    + Email
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Add contact</p>
            <div className="mt-2 grid gap-2">
              <input
                value={newContactName}
                onChange={(event) => setNewContactName(event.target.value)}
                placeholder="Name"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none"
              />
              <input
                value={newContactRole}
                onChange={(event) => setNewContactRole(event.target.value)}
                placeholder="Role (Owner, Manager, etc)"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none"
              />
              <input
                value={newContactPhone}
                onChange={(event) => setNewContactPhone(event.target.value)}
                placeholder="Phone"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none"
              />
              <input
                value={newContactEmail}
                onChange={(event) => setNewContactEmail(event.target.value)}
                placeholder="Email"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none"
              />
              <button
                onClick={() => {
                  if (!newContactName.trim() && !newContactPhone.trim() && !newContactEmail.trim()) return;
                  const nextContacts = [
                    ...contacts,
                    {
                      id: crypto.randomUUID(),
                      name: newContactName.trim() || "Untitled Contact",
                      role: newContactRole.trim(),
                      phones: newContactPhone.trim() ? [newContactPhone.trim()] : [],
                      emails: newContactEmail.trim() ? [newContactEmail.trim()] : [],
                    },
                  ];
                  void persistContacts(nextContacts);
                  setNewContactName("");
                  setNewContactRole("");
                  setNewContactPhone("");
                  setNewContactEmail("");
                }}
                disabled={savingContacts}
                className="rounded bg-indigo-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
              >
                Add Contact
              </button>
              {contactsError ? <p className="text-[11px] text-rose-300">{contactsError}</p> : null}
            </div>
          </div>
        </div>

        <label className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-500">Status</p>
          <div className="relative">
            <select
              value={currentStatus}
              onChange={(event) => setCurrentStatus(event.target.value as (typeof statusOptions)[number])}
              className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-400"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {statusLabelMap[option]}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-zinc-500" />
          </div>
        </label>

        <button className="group relative overflow-hidden rounded-2xl border border-indigo-400/50 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-6 text-left shadow-2xl shadow-indigo-950/40 transition hover:brightness-110">
          <div className="flex items-center justify-between text-white">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100/90">Deployment</p>
              <p className="mt-1 text-xl font-semibold">Deploy Vercel Site</p>
            </div>
            <Rocket className="h-6 w-6" />
          </div>
          <p className="mt-2 text-xs text-indigo-100/80">Push this lead from conversation to live site in one action.</p>
        </button>

        <div className="min-h-0 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">AI Deep Research</p>
              <p className="text-sm font-medium text-zinc-100">Market intelligence bento</p>
            </div>
            <button
              onClick={handleRunAnalysis}
              disabled={isResearchLoading}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-indigo-400/60 hover:text-white disabled:opacity-50"
            >
              Run Analysis
            </button>
          </div>

          {isResearchLoading && (
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-zinc-800" />
              <div className="h-3 w-10/12 animate-pulse rounded bg-zinc-800" />
              <div className="h-3 w-9/12 animate-pulse rounded bg-zinc-800" />
              <div className="h-20 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/70" />
            </div>
          )}

          {!isResearchLoading && (
            <p className="text-sm leading-6 text-zinc-300">
              {analysisResult ||
                "No analysis run yet. Trigger Deep Research to generate SEO, review intelligence, and conversion weak points."}
            </p>
          )}
        </div>
      </aside>

      <section className="col-span-12 flex h-full min-h-0 flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 xl:col-span-5">
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-zinc-900 to-zinc-950 p-4 shadow-lg shadow-emerald-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/80">Amazon Connect · Softphone</p>
              <p className="mt-1 text-sm text-zinc-300">Dialing {lead.phone || "No number available"}</p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400">
              <Phone className="h-4 w-4" /> Call
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-center text-xs text-zinc-400 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-2">
              <Clock3 className="mx-auto mb-1 h-3.5 w-3.5 text-zinc-500" /> Queue: 00:09
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-2">
              <Clock3 className="mx-auto mb-1 h-3.5 w-3.5 text-zinc-500" /> Call Timer: 02:14
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-2">
              <UserCircle2 className="mx-auto mb-1 h-3.5 w-3.5 text-zinc-500" /> Rep: Online
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
          <div className="flex flex-wrap border-b border-zinc-800 text-xs font-medium uppercase tracking-wide text-zinc-400">
            {(["NOTES", "SMS", "EMAIL"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setCommsTab(tab)}
                className={`px-4 py-3 ${commsTab === tab ? "border-b-2 border-indigo-400 text-indigo-300" : "hover:text-zinc-200"}`}
              >
                {tab === "NOTES" ? "Notes" : tab}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {commsFeed
              .filter((message) => (message.activity_type || "NOTES") === commsTab.toUpperCase())
              .map((message) => (
              <div
                key={message.at + message.body}
                className={`max-w-[90%] rounded-2xl border p-3 text-sm ${
                  message.from === "You"
                    ? "ml-auto border-indigo-500/30 bg-indigo-500/10 text-indigo-100"
                    : "border-zinc-800 bg-zinc-900/80 text-zinc-200"
                }`}
              >
                <p className="text-xs text-zinc-500">{message.at}</p>
                <p className="mt-1">{message.body}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-800 bg-zinc-900/70 p-3">
            <div className="mt-4 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
              <button 
                onClick={handleAIDraft}
                disabled={isDrafting}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-md transition-colors"
              >
                {isDrafting ? "Drafting..." : "AI draft"}
              </button>
              
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={`Draft ${activeTab} content for ${lead.businessName}...`}
                className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-zinc-200 px-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendNote();
                }}
              />
              
              <button 
                onClick={handleSendNote}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-md transition-colors shadow-sm"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-300" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-200">Book Demo</h3>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-zinc-300">
              <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Date</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-indigo-400"
              />
            </label>

            <label className="text-sm text-zinc-300">
              <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Time Slot</span>
              <select
                value={selectedSlot}
                onChange={(event) => setSelectedSlot(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-indigo-400"
              >
                {bookingSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={handleBookDemo}
            disabled={isBookingLoading}
            className="mt-4 w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {isBookingLoading ? "Generating Calendar + Meet Link..." : "Book & Generate Meet Link"}
          </button>

          {meetLink && (
            <article className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              <p className="font-medium">Google Calendar Confirmation</p>
              <p className="mt-1 text-emerald-200">Booked for {selectedDate} at {selectedSlot}.</p>
              <a href={meetLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-emerald-200 underline underline-offset-4">
                {meetLink}
              </a>
            </article>
          )}
        </div>
      </section>

      <aside className="col-span-12 flex h-full min-h-0 flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 xl:col-span-4">
        <div className="flex items-center gap-2 text-indigo-200">
          <Bot className="h-4 w-4" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Dynamic AI Playbook</h2>
        </div>

        <div className="flex rounded-xl border border-zinc-800 bg-zinc-950/80 p-1 text-xs uppercase tracking-wide text-zinc-400">
          <button
            onClick={() => setPlaybookTab("SCRIPTS")}
            className={`flex-1 rounded-lg px-3 py-2 ${playbookTab === "SCRIPTS" ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"}`}
          >
            Scripts
          </button>
          <button
            onClick={() => setPlaybookTab("OBJECTIONS")}
            className={`flex-1 rounded-lg px-3 py-2 ${playbookTab === "OBJECTIONS" ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"}`}
          >
            Objections
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {playbookTab === "SCRIPTS" && (
            <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-sm text-zinc-300">
              <p className="font-medium text-zinc-100">Context-Aware Script</p>
              <p className="leading-6">{personalizedScript}</p>
              <p className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400">
                <MessageSquare className="h-3 w-3" /> Injected data: Google Reviews + Vercel Link + mobile booking gap
              </p>
            </div>
          )}

          {playbookTab === "OBJECTIONS" && (
            <div className="space-y-2">
              {objections.map((item, index) => {
                const isOpen = expandedObjection === index;
                return (
                  <div key={item.objection} className="rounded-xl border border-zinc-800 bg-zinc-950/80">
                    <button
                      onClick={() => setExpandedObjection(isOpen ? -1 : index)}
                      className="flex w-full items-center justify-between px-3 py-3 text-left text-sm text-zinc-200"
                    >
                      <span>{item.objection}</span>
                      <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="border-t border-zinc-800 px-3 py-3 text-sm text-zinc-400">
                        <p>
                          AI Counter: {item.counter.replace("[Vercel Link]", siteUrl)}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
