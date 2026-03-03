"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  Building2,
  Clock3,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Rocket,
  Send,
  Sparkles,
  Timer,
  UserCircle2,
  Link as LinkIcon,
} from "lucide-react";

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

const callNotes = [
  { at: "09:41", title: "Discovery call scheduled", body: "Owner asked for a quick proof of lead quality and turnaround time." },
  { at: "09:12", title: "Intro voicemail left", body: "Positioned Felix as instant web presence + conversion layer." },
];

const smsFeed = [
  { from: "Lead", body: "Can you send examples for nearby businesses?", at: "Today · 10:02" },
  { from: "You", body: "Absolutely — I can deploy a tailored site draft this afternoon.", at: "Today · 10:05" },
];

const emailFeed = [{ from: "Lead", body: "Interested in pricing options for a phased launch.", at: "Today · 10:27" }];

export function LeadExecutionWorkspace({ lead }: LeadExecutionWorkspaceProps) {
  const [commsTab, setCommsTab] = useState<"CALL_NOTES" | "SMS" | "EMAIL">("CALL_NOTES");
  const [playbookTab, setPlaybookTab] = useState<"SCRIPTS" | "OBJECTIONS" | "TIPS">("SCRIPTS");

  const siteUrl = useMemo(
    () => lead.deployedUrl ?? `https://${lead.businessName.toLowerCase().replace(/[^a-z0-9]/g, "-")}.vercel.app`,
    [lead.businessName, lead.deployedUrl],
  );

  const commsFeed = commsTab === "SMS" ? smsFeed : commsTab === "EMAIL" ? emailFeed : [];
  const deployActionLabel = lead.deployedUrl ? "View Live Site" : "Deploy Vercel Site";

  return (
    <div className="grid h-[calc(100vh-9.5rem)] gap-4 xl:grid-cols-[25%_45%_30%]">
      <aside className="flex h-full flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Lead Context</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-100">{lead.businessName}</h1>
          <p className="mt-1 text-sm text-zinc-400">{lead.businessType || "Local Services"} · {lead.city || "Unknown city"}</p>
        </div>

        <button className="group relative overflow-hidden rounded-2xl border border-indigo-400/40 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 py-5 text-left shadow-lg shadow-indigo-900/30 transition hover:brightness-110">
          <div className="flex items-center justify-between text-white">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-100/80">Site action</p>
              <p className="mt-1 text-lg font-semibold">{deployActionLabel}</p>
            </div>
            <Rocket className="h-6 w-6" />
          </div>
          <p className="mt-2 text-xs text-indigo-100/80">One-click from call to deployment handoff.</p>
        </button>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-sm">
          <p className="mb-2 font-medium text-zinc-200">Contact Info</p>
          <p className="flex items-center gap-2 text-zinc-400"><Phone className="h-3.5 w-3.5" /> {lead.phone || "No phone"}</p>
          <p className="mt-1 flex items-center gap-2 text-zinc-400"><Mail className="h-3.5 w-3.5" /> {lead.email || "No email"}</p>
          <p className="mt-1 flex items-center gap-2 text-zinc-400"><MapPin className="h-3.5 w-3.5" /> {lead.city || "Unknown city"}</p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
          <p className="mb-2 text-sm font-medium text-zinc-200">AI Summary</p>
          <p className="text-sm leading-6 text-zinc-400">
            {lead.aiResearchSummary || "No research captured yet. Run AI analysis to generate vertical-specific talking points and local proof hooks."}
          </p>
        </div>
      </aside>

      <section className="flex h-full flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/80">Softphone Dialer · Amazon Connect Placeholder</p>
              <p className="mt-1 text-sm text-zinc-300">Dialing {lead.phone || "No number available"}</p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400">
              <Phone className="h-4 w-4" /> Call
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-zinc-400">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2"><Clock3 className="mx-auto mb-1 h-3.5 w-3.5 text-zinc-500" /> Queue: 00:12</div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2"><Timer className="mx-auto mb-1 h-3.5 w-3.5 text-zinc-500" /> Call timer: 00:00</div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2"><UserCircle2 className="mx-auto mb-1 h-3.5 w-3.5 text-zinc-500" /> Rep: Online</div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/70">
          <div className="flex border-b border-zinc-800 text-xs font-medium uppercase tracking-wide text-zinc-400">
            <button onClick={() => setCommsTab("CALL_NOTES")} className={`px-4 py-3 ${commsTab === "CALL_NOTES" ? "border-b-2 border-indigo-400 text-indigo-300" : "hover:text-zinc-200"}`}>
              Call Notes
            </button>
            <button onClick={() => setCommsTab("SMS")} className={`px-4 py-3 ${commsTab === "SMS" ? "border-b-2 border-indigo-400 text-indigo-300" : "hover:text-zinc-200"}`}>
              SMS
            </button>
            <button onClick={() => setCommsTab("EMAIL")} className={`px-4 py-3 ${commsTab === "EMAIL" ? "border-b-2 border-indigo-400 text-indigo-300" : "hover:text-zinc-200"}`}>
              Email
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {commsTab === "CALL_NOTES" && (
              <div className="space-y-3">
                {callNotes.map((note) => (
                  <article key={note.at + note.title} className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>{note.at}</span>
                      <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Call log</span>
                    </div>
                    <p className="text-sm font-medium text-zinc-200">{note.title}</p>
                    <p className="mt-1 text-sm text-zinc-400">{note.body}</p>
                  </article>
                ))}
              </div>
            )}

            {commsTab !== "CALL_NOTES" && (
              <div className="space-y-3">
                {commsFeed.map((message) => (
                  <div key={message.at + message.body} className={`max-w-[85%] rounded-2xl border p-3 text-sm ${message.from === "You" ? "ml-auto border-indigo-500/30 bg-indigo-500/10 text-indigo-100" : "border-zinc-800 bg-zinc-900/80 text-zinc-200"}`}>
                    <p className="text-xs text-zinc-500">{message.at}</p>
                    <p className="mt-1">{message.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {commsTab !== "CALL_NOTES" && (
            <div className="border-t border-zinc-800 bg-zinc-900/70 p-3">
              <div className="rounded-lg border border-zinc-700 bg-zinc-950/90 p-2">
                <textarea rows={2} placeholder={`Write ${commsTab === "SMS" ? "SMS" : "email"} update...`} className="w-full resize-none bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500" />
                <div className="mt-2 flex items-center justify-between">
                  <button className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"><Sparkles className="h-3.5 w-3.5" /> AI draft</button>
                  <button className="inline-flex items-center gap-2 rounded-md bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"><Send className="h-3.5 w-3.5" /> Send</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="flex h-full flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div className="flex items-center gap-2 text-indigo-200">
          <Bot className="h-4 w-4" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">AI Playbook</h2>
        </div>

        <div className="flex rounded-xl border border-zinc-800 bg-zinc-950/80 p-1 text-xs uppercase tracking-wide text-zinc-400">
          <button onClick={() => setPlaybookTab("SCRIPTS")} className={`flex-1 rounded-lg px-3 py-2 ${playbookTab === "SCRIPTS" ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"}`}>Scripts</button>
          <button onClick={() => setPlaybookTab("OBJECTIONS")} className={`flex-1 rounded-lg px-3 py-2 ${playbookTab === "OBJECTIONS" ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"}`}>Objections</button>
          <button onClick={() => setPlaybookTab("TIPS")} className={`flex-1 rounded-lg px-3 py-2 ${playbookTab === "TIPS" ? "bg-zinc-800 text-zinc-100" : "hover:text-zinc-200"}`}>Tips</button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm">
          {playbookTab === "SCRIPTS" && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
              <p className="font-medium text-zinc-100">Live opener script</p>
              <p className="mt-1 text-zinc-400">“Hi {lead.businessName}, this is Felix. I built your launch-ready funnel at {siteUrl} so you can preview exactly what goes live right after this call.”</p>
              <p className="mt-3 inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400"><LinkIcon className="h-3 w-3" /> {siteUrl}</p>
            </div>
          )}

          {playbookTab === "OBJECTIONS" && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
              <p className="font-medium text-zinc-100">Pricing objection</p>
              <p className="mt-1 text-zinc-400">“If timing or budget is tight, we can phase your rollout: publish the Vercel site first, then layer automation as leads come in.”</p>
            </div>
          )}

          {playbookTab === "TIPS" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
                <p className="font-medium text-zinc-100">Tactical tip</p>
                <p className="mt-1 text-zinc-400">Use the first 20 seconds to anchor to speed: “Live in days, not weeks,” then point to their personalized URL.</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-xs text-zinc-500">
                <p className="inline-flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> Context from {lead.businessType || "Local Services"}</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
