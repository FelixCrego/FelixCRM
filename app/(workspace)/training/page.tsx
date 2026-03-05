"use client";

import { useState } from "react";

export default function TrainingCenter() {
  const [activeTab, setActiveTab] = useState("SCRIPTS");

  const tabs = [
    { id: "SCRIPTS", label: "Battle Scripts", icon: "📜" },
    { id: "SOPS", label: "The Playbook (SOPs)", icon: "📋" },
    { id: "TAPE_ROOM", label: "The Tape Room", icon: "🎧" },
    { id: "DEMOS", label: "Demo Vault", icon: "💻" },
    { id: "JARGON", label: "Industry Intel", icon: "🧠" },
    { id: "CONTINUING_ED", label: "Continuing Ed", icon: "🚀" },
  ];

  return (
    <div className="flex h-[calc(100vh-80px)] bg-[#0a0a0a] text-zinc-200 font-sans">
      <div className="w-64 border-r border-zinc-800 bg-zinc-950/50 p-4 flex flex-col gap-2">
        <h2 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-4 px-2">Enablement Hub</h2>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.id === "CONTINUING_ED" && <span className="ml-auto text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">LOCKED</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === "SCRIPTS" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">Battle Scripts</h1>
            <p className="text-zinc-400 text-sm">Stick to the framework. Control the frame.</p>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "The Opener",
                  script:
                    "You reached the growth desk. I help garage door businesses lock more installs without adding ad spend. Got 27 seconds to see if this is worth a deeper run?",
                },
                {
                  title: "The Pitch",
                  script:
                    "We build a pipeline machine: lead response, no-show kill sequences, and close-ready follow-up. Reps stop chasing. Deals move on rails.",
                },
                {
                  title: "Objection: Send an Email",
                  script:
                    "I can do that. Fast check first: if the email shows you can recover 2-3 dead quotes this month, is that worth a 12-minute teardown tomorrow?",
                },
                {
                  title: "Objection: Too Expensive",
                  script:
                    "Totally fair. Expensive compared to what—one lost install or a stalled pipeline for another quarter? We price against leakage, not software.",
                },
              ].map((track) => (
                <article key={track.title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
                  <h2 className="text-lg font-bold text-zinc-100 uppercase tracking-wide">{track.title}</h2>
                  <p className="text-sm text-zinc-300 leading-relaxed">{track.script}</p>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === "SOPS" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">The Playbook</h1>
            <p className="text-zinc-400 text-sm">No freestyle. Execute the system.</p>
            <div className="space-y-4">
              {[
                {
                  heading: "Pipeline Management",
                  steps: ["New lead touched in < 5 minutes", "Discovery call scheduled before day end", "Demo slot confirmed with recap text"],
                },
                {
                  heading: "Disposition Rules",
                  steps: ["No answer after 6 touches → recycle queue", "Budget freeze → nurture list with monthly check-in", "Not ICP → disqualify and annotate reason"],
                },
                {
                  heading: "Follow-up Cadence",
                  steps: ["Day 0: recap + CTA", "Day 1: value clip + social proof", "Day 3: urgency close with slot options"],
                },
              ].map((section) => (
                <section key={section.heading} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <h2 className="text-base font-bold text-zinc-100 mb-3 uppercase tracking-wide">{section.heading}</h2>
                  <ul className="space-y-2">
                    {section.steps.map((step) => (
                      <li key={step} className="flex items-center gap-3 text-sm text-zinc-300">
                        <span className="h-5 w-5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs grid place-items-center">
                          ✓
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}

        {activeTab === "TAPE_ROOM" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">The Tape Room</h1>
            <p className="text-zinc-400 text-sm">Study winners. Expose leaks. Raise the floor.</p>
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
                <h2 className="text-base font-bold text-emerald-300 uppercase tracking-wide">Hall of Fame Calls</h2>
                {["Roofline Doors - One-call close", "West End Garage - Price objection reversal"].map((call) => (
                  <div key={call} className="space-y-2">
                    <p className="text-sm text-zinc-200">{call}</p>
                    <div className="w-full h-10 bg-zinc-950 rounded flex items-center px-3 gap-3 border border-zinc-800">
                      <span>▶</span>
                      <div className="h-1.5 flex-1 rounded bg-zinc-800" />
                      <span className="text-xs text-zinc-500">05:24</span>
                    </div>
                  </div>
                ))}
              </section>

              <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
                <h2 className="text-base font-bold text-rose-300 uppercase tracking-wide">Hall of Shame Calls</h2>
                {["Rapid Rollups - No agenda control", "Prime Lift Doors - No close attempt"].map((call) => (
                  <div key={call} className="space-y-2">
                    <p className="text-sm text-zinc-200">{call}</p>
                    <div className="w-full h-10 bg-zinc-950 rounded flex items-center px-3 gap-3 border border-zinc-800">
                      <span>▶</span>
                      <div className="h-1.5 flex-1 rounded bg-zinc-800" />
                      <span className="text-xs text-zinc-500">04:11</span>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          </div>
        )}

        {activeTab === "DEMOS" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">Demo Vault</h1>
            <p className="text-zinc-400 text-sm">Sharpen your delivery before every pitch.</p>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                "Product Demo Walkthrough",
                "How to Pitch the ROI",
                "Objection Handling Live Demo",
                "Closing the Next Step Confidently",
              ].map((title) => (
                <div key={title} className="space-y-2">
                  <div className="aspect-video bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-800 text-zinc-500">Video Placeholder</div>
                  <p className="text-sm font-semibold text-zinc-200">{title}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "JARGON" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">Industry Intel: Garage Doors</h1>
            <p className="text-zinc-400 text-sm">Talk like a veteran. Win trust in 30 seconds.</p>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  term: "Torsion Springs",
                  definition: "The heavy-duty springs above the door. When they snap, the door is dead. High-ticket repair.",
                },
                {
                  term: "Extension Springs",
                  definition: "Cheaper springs on the side tracks. Common in older homes.",
                },
                {
                  term: "R-Value",
                  definition: "The insulation rating. Higher R-Value = better energy efficiency. Huge selling point.",
                },
                {
                  term: "Photo Eyes",
                  definition: "The safety sensors at the bottom of the track. #1 cause of \"my door won't close\" calls.",
                },
              ].map((item) => (
                <article key={item.term} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
                  <h2 className="text-lg font-bold text-indigo-300">{item.term}</h2>
                  <p className="text-sm text-zinc-300">{item.definition}</p>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === "CONTINUING_ED" && (
          <div className="h-full flex flex-col items-center justify-center animate-in fade-in duration-500 relative">
            <div className="absolute w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
            <div className="text-8xl mb-6 relative z-10 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]">🔒</div>
            <p className="text-zinc-300 text-base mt-2 max-w-md text-center relative z-10 font-semibold">
              New Industries Unlocking Soon. Master the current pipeline first.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
