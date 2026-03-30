"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TapeRoomEntry = {
  id: string;
  noteId: string;
  leadId: string;
  leadName: string;
  repName: string;
  nominatedByName: string;
  reason: string;
  createdAt: string;
  category: "HALL_OF_FAME" | "HALL_OF_SHAME";
  contactId: string | null;
  recordingUrl: string | null;
};

type QuizQuestion = {
  questionText: string;
  answerOptions: Array<{ answerText: string; isCorrect: boolean }>;
};

const tabs = [
  { id: "SCRIPTS", label: "Battle Scripts" },
  { id: "SOPS", label: "Playbook" },
  { id: "TAPE_ROOM", label: "Tape Room" },
  { id: "DEMOS", label: "Demo Vault" },
  { id: "JARGON", label: "Industry Intel" },
  { id: "QUIZ", label: "Certification" },
  { id: "CONTINUING_ED", label: "Continuing Ed" },
] as const;

const questions: QuizQuestion[] = [
  {
    questionText: "What is your absolute minimum daily dial target?",
    answerOptions: [
      { answerText: "30 calls", isCorrect: false },
      { answerText: "50 calls", isCorrect: true },
      { answerText: "100 calls", isCorrect: false },
      { answerText: "Whatever I feel like", isCorrect: false },
    ],
  },
  {
    questionText: "What is your non-negotiable daily target for booked demos?",
    answerOptions: [
      { answerText: "1 demo per day", isCorrect: false },
      { answerText: "2 demos per day", isCorrect: true },
      { answerText: "5 demos per day", isCorrect: false },
    ],
  },
  {
    questionText: "How many closed deals are reps expected to generate per week?",
    answerOptions: [
      { answerText: "1 closed deal", isCorrect: false },
      { answerText: "2 closed deals", isCorrect: true },
      { answerText: "4 closed deals", isCorrect: false },
    ],
  },
  {
    questionText: "Why must calls happen inside the CRM dialer instead of a personal cell phone?",
    answerOptions: [
      { answerText: "It makes the dashboard look busier", isCorrect: false },
      { answerText: "It captures Contact IDs so recordings and transcripts attach to the lead", isCorrect: true },
      { answerText: "It automatically closes deals", isCorrect: false },
    ],
  },
];

const scriptCards = [
  {
    title: "The Opener",
    script: "I help local service businesses lock more booked jobs without increasing ad spend. Got 27 seconds to see if this is worth a deeper look?",
  },
  {
    title: "The Pitch",
    script: "We build a pipeline machine: lead response, no-show kill sequences, and close-ready follow-up so reps stop chasing and deals move on rails.",
  },
  {
    title: "Objection: Send an Email",
    script: "I can do that. Fast check first: if the email shows you can recover two or three dead quotes this month, is that worth a 12-minute teardown tomorrow?",
  },
  {
    title: "Objection: Too Expensive",
    script: "Totally fair. Expensive compared to what: one lost install or another quarter of pipeline leakage? We price against leakage, not software.",
  },
];

const playbookSections = [
  {
    heading: "Pipeline Management",
    steps: ["New lead touched in under 5 minutes", "Discovery call scheduled before day end", "Demo slot confirmed with recap text"],
  },
  {
    heading: "Disposition Rules",
    steps: ["No answer after 6 touches becomes recycle queue", "Budget freeze becomes nurture list with monthly check-in", "Not ICP becomes disqualified with reason logged"],
  },
  {
    heading: "Follow-up Cadence",
    steps: ["Day 0: recap plus CTA", "Day 1: value clip plus proof", "Day 3: urgency close with two slot options"],
  },
];

const demoVault = [
  "Product Demo Walkthrough",
  "How to Pitch the ROI",
  "Objection Handling Live Demo",
  "Closing the Next Step Confidently",
];

const jargonCards = [
  {
    term: "Torsion Springs",
    definition: "The heavy-duty springs above the door. When they snap, the door is dead.",
  },
  {
    term: "Extension Springs",
    definition: "Cheaper springs on the side tracks. Common in older homes.",
  },
  {
    term: "R-Value",
    definition: "The insulation rating. Higher R-Value means better efficiency.",
  },
  {
    term: "Photo Eyes",
    definition: "The safety sensors at the bottom of the track. A common reason doors will not close.",
  },
];

export default function TrainingCenter() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("SCRIPTS");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const [tapeRoom, setTapeRoom] = useState<{ hallOfFame: TapeRoomEntry[]; hallOfShame: TapeRoomEntry[] }>({
    hallOfFame: [],
    hallOfShame: [],
  });
  const [tapeRoomLoading, setTapeRoomLoading] = useState(false);
  const [tapeRoomError, setTapeRoomError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadTapeRoom() {
      setTapeRoomLoading(true);
      setTapeRoomError("");

      try {
        const response = await fetch("/api/training/tape-room", { cache: "no-store", credentials: "include" });
        const payload = (await response.json().catch(() => null)) as {
          hallOfFame?: TapeRoomEntry[];
          hallOfShame?: TapeRoomEntry[];
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load the tape room.");
        }

        if (!isActive) return;
        setTapeRoom({
          hallOfFame: Array.isArray(payload?.hallOfFame) ? payload.hallOfFame : [],
          hallOfShame: Array.isArray(payload?.hallOfShame) ? payload.hallOfShame : [],
        });
      } catch (error) {
        if (!isActive) return;
        setTapeRoomError(error instanceof Error ? error.message : "Unable to load the tape room.");
      } finally {
        if (isActive) {
          setTapeRoomLoading(false);
        }
      }
    }

    void loadTapeRoom();

    return () => {
      isActive = false;
    };
  }, []);

  const handleAnswerOptionClick = (isCorrect: boolean) => {
    if (isCorrect) {
      setScore((previousScore) => previousScore + 1);
    }

    const nextQuestion = currentQuestion + 1;
    if (nextQuestion < questions.length) {
      setCurrentQuestion(nextQuestion);
      return;
    }

    setShowScore(true);
  };

  const handleQuizReset = () => {
    setCurrentQuestion(0);
    setScore(0);
    setShowScore(false);
  };

  return (
    <div className="flex h-[calc(100vh-80px)] bg-zinc-950 text-zinc-200">
      <aside className="w-64 border-r border-zinc-800 bg-zinc-950/70 p-4">
        <h2 className="mb-4 px-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Enablement Hub</h2>
        <div className="space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-200"
                  : "border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        {activeTab === "SCRIPTS" ? (
          <div className="space-y-6">
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">Battle Scripts</h1>
            <p className="text-sm text-zinc-400">Stick to the framework. Control the frame.</p>
            <div className="grid gap-4 md:grid-cols-2">
              {scriptCards.map((track) => (
                <article key={track.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                  <h2 className="text-lg font-bold uppercase tracking-wide text-zinc-100">{track.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">{track.script}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "SOPS" ? (
          <div className="space-y-6">
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">The Playbook</h1>
            <p className="text-sm text-zinc-400">No freestyle. Execute the system.</p>
            <div className="space-y-4">
              {playbookSections.map((section) => (
                <section key={section.heading} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                  <h2 className="mb-3 text-base font-bold uppercase tracking-wide text-zinc-100">{section.heading}</h2>
                  <ul className="space-y-2">
                    {section.steps.map((step) => (
                      <li key={step} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
                        {step}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "TAPE_ROOM" ? (
          <div className="space-y-6">
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">The Tape Room</h1>
            <p className="text-sm text-zinc-400">Study winners. Expose leaks. Raise the floor.</p>
            {tapeRoomError ? (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-100">
                {tapeRoomError}
              </div>
            ) : null}
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <h2 className="mb-3 text-base font-bold uppercase tracking-wide text-emerald-300">Hall of Fame Calls</h2>
                <div className="space-y-3">
                  {tapeRoomLoading && tapeRoom.hallOfFame.length === 0 ? <p className="text-sm text-zinc-400">Loading saved Hall of Fame calls...</p> : null}
                  {!tapeRoomLoading && tapeRoom.hallOfFame.length === 0 ? <p className="text-sm text-zinc-500">No calls have been sent to Hall of Fame yet.</p> : null}
                  {tapeRoom.hallOfFame.map((call) => (
                    <article key={call.id} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">{call.leadName}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Rep: {call.repName} | Added by {call.nominatedByName}
                          </p>
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                          {new Date(call.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-zinc-300">{call.reason}</p>
                      {call.recordingUrl ? (
                        <audio controls preload="metadata" className="w-full" src={call.recordingUrl}>
                          Your browser does not support audio playback.
                        </audio>
                      ) : (
                        <p className="text-xs text-zinc-500">Recording link unavailable for this entry.</p>
                      )}
                      <Link
                        href={`/leads/${call.leadId}`}
                        className="inline-flex rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600"
                      >
                        Open Lead
                      </Link>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <h2 className="mb-3 text-base font-bold uppercase tracking-wide text-rose-300">Hall of Shame Calls</h2>
                <div className="space-y-3">
                  {tapeRoomLoading && tapeRoom.hallOfShame.length === 0 ? <p className="text-sm text-zinc-400">Loading saved Hall of Shame calls...</p> : null}
                  {!tapeRoomLoading && tapeRoom.hallOfShame.length === 0 ? <p className="text-sm text-zinc-500">No calls have been sent to Hall of Shame yet.</p> : null}
                  {tapeRoom.hallOfShame.map((call) => (
                    <article key={call.id} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">{call.leadName}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Rep: {call.repName} | Added by {call.nominatedByName}
                          </p>
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                          {new Date(call.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-zinc-300">{call.reason}</p>
                      {call.recordingUrl ? (
                        <audio controls preload="metadata" className="w-full" src={call.recordingUrl}>
                          Your browser does not support audio playback.
                        </audio>
                      ) : (
                        <p className="text-xs text-zinc-500">Recording link unavailable for this entry.</p>
                      )}
                      <Link
                        href={`/leads/${call.leadId}`}
                        className="inline-flex rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600"
                      >
                        Open Lead
                      </Link>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "DEMOS" ? (
          <div className="space-y-6">
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">Demo Vault</h1>
            <p className="text-sm text-zinc-400">Sharpen your delivery before every pitch.</p>
            <div className="grid gap-4 md:grid-cols-2">
              {demoVault.map((title) => (
                <div key={title} className="space-y-2">
                  <div className="aspect-video rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-500 grid place-items-center">Video Placeholder</div>
                  <p className="text-sm font-semibold text-zinc-200">{title}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "JARGON" ? (
          <div className="space-y-6">
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">Industry Intel</h1>
            <p className="text-sm text-zinc-400">Talk like a veteran. Win trust in 30 seconds.</p>
            <div className="grid gap-4 md:grid-cols-2">
              {jargonCards.map((item) => (
                <article key={item.term} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                  <h2 className="text-lg font-bold text-blue-300">{item.term}</h2>
                  <p className="mt-2 text-sm text-zinc-300">{item.definition}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "QUIZ" ? (
          <div className="max-w-3xl space-y-6">
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">Certification Quiz</h1>
            <p className="text-sm text-zinc-400">Pass the fundamentals before moving deeper into the system.</p>
            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              {showScore ? (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-emerald-300">
                    You scored {score} out of {questions.length}
                  </h2>
                  <p className="text-sm text-zinc-300">
                    {score === questions.length ? "Perfect score. You are certified and ready for the next phase." : "Review the playbook and run it back until this is second nature."}
                  </p>
                  <button
                    type="button"
                    onClick={handleQuizReset}
                    className="rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-200 transition hover:border-blue-400"
                  >
                    Retake Quiz
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Question {currentQuestion + 1} / {questions.length}
                  </div>
                  <h2 className="text-lg font-bold leading-relaxed text-zinc-100">{questions[currentQuestion].questionText}</h2>
                  <div className="grid gap-3">
                    {questions[currentQuestion].answerOptions.map((answerOption) => (
                      <button
                        key={answerOption.answerText}
                        type="button"
                        onClick={() => handleAnswerOptionClick(answerOption.isCorrect)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-left text-sm font-medium text-zinc-200 transition hover:border-blue-400 hover:bg-zinc-900"
                      >
                        {answerOption.answerText}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {activeTab === "CONTINUING_ED" ? (
          <div className="flex h-full min-h-[480px] flex-col items-center justify-center text-center">
            <div className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Locked
            </div>
            <p className="mt-6 max-w-md text-base font-semibold text-zinc-300">
              New industries unlock soon. Master the current pipeline first.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
