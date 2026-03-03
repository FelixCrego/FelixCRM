"use client";

import { Bot, Building2, Clock3, Mail, MapPin, MessageSquare, Phone, Rocket, Send, Sparkles, Timer, UserCircle2 } from "lucide-react";

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

const messages = [
  { from: "Lead", channel: "SMS", body: "Can you send examples for nearby businesses?", at: "Today · 10:02" },
  { from: "You", channel: "SMS", body: "Absolutely — I can deploy a tailored site draft this afternoon.", at: "Today · 10:05" },
  { from: "Lead", channel: "Email", body: "Interested in pricing options for a phased launch.", at: "Today · 10:27" },
];

export function LeadExecutionWorkspace({ lead }: LeadExecutionWorkspaceProps) {
  const siteUrl = lead.deployedUrl ?? `https://${lead.businessName.toLowerCase().replace(/[^a-z0-9]/g, "-")}.vercel.app`;
  const statusTone = lead.status === "IN_PROGRESS" ? "text-indigo-300 border-indigo-500/40 bg-indigo-500/10" : "text-zinc-300 border-zinc-700 bg-zinc-800/60";

  return (
    <div className="grid min-h-[calc(100vh-10rem)] gap-4 xl:grid-cols-[1fr_2fr_1fr]">
      <aside className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Lead Context</p>
          <h1 className="mt-2 text-xl font-semibold text-zinc-100">{lead.businessName}</h1>
          <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone}`}>{lead.status}</span>
        </div>

        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition hover:brightness-110">
          <Rocket className="h-4 w-4" /> Deploy Vercel Site
        </button>

        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-sm">
          <p className="font-medium text-zinc-200">Contact Intel</p>
          <p className="flex items-center gap-2 text-zinc-400"><Phone className="h-3.5 w-3.5" /> {lead.phone || "No phone"}</p>
          <p className="flex items-center gap-2 text-zinc-400"><Mail className="h-3.5 w-3.5" /> {lead.email || "No email"}</p>
          <p className="flex items-center gap-2 text-zinc-400"><MapPin className="h-3.5 w-3.5" /> {lead.city || "Unknown city"}</p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
          <p className="mb-2 text-sm font-medium text-zinc-200">AI Summary</p>
          <p className="text-sm leading-6 text-zinc-400">{lead.aiResearchSummary || "No research captured yet. Run AI analysis to generate vertical-specific talking points and local proof hooks."}</p>
        </div>
      </aside>

      <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/80">Amazon Connect Ready</p>
              <p className="mt-1 text-sm text-zinc-300">Dialer status: <span className="font-medium text-emerald-300">Ready to dial</span></p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400">
              <Phone className="h-4 w-4" /> Call via Connect
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-zinc-400">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2"><Clock3 className="mx-auto mb-1 h-3.5 w-3.5 text-zinc-500" /> Queue: 00:12</div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2"><Timer className="mx-auto mb-1 h-3.5 w-3.5 text-zinc-500" /> Call timer: 00:00</div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2"><UserCircle2 className="mx-auto mb-1 h-3.5 w-3.5 text-zinc-500" /> Rep: Online</div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70">
          <div className="flex border-b border-zinc-800 text-xs font-medium uppercase tracking-wide text-zinc-400">
            <button className="border-b-2 border-indigo-400 px-4 py-3 text-indigo-300">Call Notes</button>
            <button className="px-4 py-3 hover:text-zinc-200">SMS</button>
            <button className="px-4 py-3 hover:text-zinc-200">Email</button>
          </div>

          <div className="space-y-3 p-3">
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
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Omnichannel Timeline</p>
          <div className="space-y-2">
            {messages.map((message) => (
              <div key={message.at + message.body} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                <p className="text-xs text-zinc-500">{message.at} · {message.channel}</p>
                <p className="mt-1 text-sm font-medium text-zinc-200">{message.from}</p>
                <p className="text-sm text-zinc-400">{message.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-2">
            <textarea rows={3} placeholder="Write SMS or email update..." className="w-full resize-none bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500" />
            <div className="mt-2 flex items-center justify-between">
              <button className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"><Sparkles className="h-3.5 w-3.5" /> Inject AI template</button>
              <button className="inline-flex items-center gap-2 rounded-md bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"><Send className="h-3.5 w-3.5" /> Send</button>
            </div>
          </div>
        </div>
      </section>

      <aside className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div className="flex items-center gap-2 text-indigo-200">
          <Bot className="h-4 w-4" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">AI Playbook</h2>
        </div>

        <div className="space-y-3 text-sm">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
            <p className="font-medium text-zinc-100">Cold opener script</p>
            <p className="mt-1 text-zinc-400">“Hi {lead.businessName}, this is Felix. I mocked your launch-ready funnel at {siteUrl} so you can see what same-week deployment looks like.”</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
            <p className="font-medium text-zinc-100">Objection handling</p>
            <p className="mt-1 text-zinc-400">“If timing is tight, we can phase this: publish your Vercel site first, then layer automation once calls start converting.”</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
            <p className="font-medium text-zinc-100">Tactical tip</p>
            <p className="mt-1 text-zinc-400">Use the first 20 seconds to anchor to speed: “Live in days, not weeks,” then point to their personalized URL.</p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-xs text-zinc-500">
          <p className="inline-flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> Context from {lead.businessType || "Local Services"}</p>
        </div>
      </aside>
    </div>
  );
}
