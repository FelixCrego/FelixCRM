export type PlaybookTimingWindow = {
  label: string;
  prompt: string;
};

export type PlaybookSection = {
  id: string;
  title: string;
  goal: string;
  lines: string[];
};

export type PlaybookObjection = {
  objection: string;
  counter: string;
  bridge: string;
};

export type AIDynamicPlaybook = {
  headline: string;
  summary: string;
  timingWindows: PlaybookTimingWindow[];
  sections: PlaybookSection[];
  objections: PlaybookObjection[];
  closingOptions: string[];
  proofPoints: string[];
  transcriptSignals: string[];
  injectedData: string[];
  refreshSummary: string;
};

type BuildFallbackPlaybookParams = {
  leadName: string;
  repName?: string;
  city?: string;
  previewUrl?: string;
  researchContext?: string;
  learnedData?: string[];
  transcriptSignals?: string[];
  hasSocialPresence?: boolean;
  refreshSummary?: string;
};

function normalizeLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractResearchBullets(researchContext?: string) {
  return (researchContext || "")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean)
    .filter((line) => !/^website:/i.test(line) && !/^city:/i.test(line) && !/^preview link:/i.test(line))
    .slice(0, 3);
}

function dedupeLines(values: Array<string | undefined | null>, limit = 6) {
  return Array.from(new Set(values.map((value) => normalizeLine(value || "")).filter(Boolean))).slice(0, limit);
}

export function buildFallbackPlaybook(params: BuildFallbackPlaybookParams): AIDynamicPlaybook {
  const leadName = normalizeLine(params.leadName || "this business");
  const repName = normalizeLine(params.repName || "someone from Felix");
  const city = normalizeLine(params.city || "");
  const researchBullets = extractResearchBullets(params.researchContext);
  const transcriptSignals = dedupeLines(params.transcriptSignals ?? [], 4);
  const previewLine = params.previewUrl ? `Preview ready: ${params.previewUrl}` : "Preview ready on the demo call.";
  const presenceLine = params.hasSocialPresence
    ? `I saw the quality of the work you are posting publicly for ${leadName}, and that is why we built this demo around your brand.`
    : `I noticed ${leadName} does not have a real website attached where people can see the work and take the next step.`;
  const locationLine = city ? `${leadName} in ${city}` : leadName;

  return {
    headline: `Fallback website-demo script for ${locationLine}`,
    summary:
      "Use a pattern interrupt, make it clear the website is already built, give two time-frame options, and keep control of the call by showing the demo live instead of emailing it cold.",
    timingWindows: [
      {
        label: "Later Today",
        prompt: "If you have 15 minutes later today, I can walk you through what we already built and you can tell me if it fits your business.",
      },
      {
        label: "Tomorrow",
        prompt: "If today is slammed, tomorrow works too. Give me 15 minutes and I will show you the site with zero pressure.",
      },
    ],
    sections: [
      {
        id: "pattern-interrupt",
        title: "Pattern Interrupt",
        goal: "Open with something that is unexpected, low pressure, and specific to their online presence.",
        lines: params.hasSocialPresence
          ? [
              `Hey, this is ${repName}. This is probably the weirdest call you will get all day, but I was looking at Google listings that did not have websites attached.`,
              presenceLine,
              "We already built a website draft for you so you can showcase your work properly. If you have 15 minutes later today or tomorrow, I would love to show you. If not, no pressure.",
            ]
          : [
              `Hey, this is ${repName}. This is probably the weirdest call you will get all day, but I noticed your Google Business Profile does not have a website attached to it.`,
              presenceLine,
              "We already built a website draft for you. If you have 15 minutes later today or tomorrow, I would love to show you what we made. No pressure either way.",
            ],
      },
      {
        id: "leverage-and-control",
        title: "Leverage and Time Frame",
        goal: "Make it clear they have the leverage because the work is already done and all you need is a quick walkthrough.",
        lines: [
          "You have the leverage here because the site is already built. If you like what you see, we talk next steps. If you do not, there is no obligation.",
          "I cannot just email it over because it is sitting on a test server. The fastest way to show it is a quick video call where I can walk you through it live.",
          "Which is easier for you: later today or tomorrow?",
        ],
      },
      {
        id: "capacity-and-differentiation",
        title: "Capacity and Differentiation",
        goal: "Tie the demo to more jobs, better efficiency, and a stronger position versus competitors.",
        lines: dedupeLines([
          "If you are already busy, that is exactly where the site helps. We build these with calendars, reminders, and AI integrations so you can cut admin work and stay efficient.",
          "How familiar are you with your competition? I want to show you two or three sites they are using, then show you yours side by side.",
          "This one is hand-coded and one-of-one. We have not put the finishing touches on it yet because we want your feedback before we lock it in.",
          researchBullets[0],
          researchBullets[1],
        ], 5),
      },
      {
        id: "walkthrough-and-close",
        title: "Walkthrough and Close",
        goal: "Guide the demo, get feedback, explain support, and ask for the next step.",
        lines: dedupeLines([
          "We used public images where needed, so anything low resolution gets replaced as soon as you send us the higher-quality files.",
          "Tell me if the color scheme fits your brand. We can give you 10 days of revisions so the finishing touches feel right.",
          "If you already have a domain, we will show you exactly how to connect it and what hosting setup you need.",
          "If you want to make edits yourself, we can give you an admin login. If you want us to handle changes, you can submit a ticket and we will take care of it.",
          previewLine,
        ], 5),
      },
    ],
    objections: [
      {
        objection: "I get these calls all the time. I am not interested.",
        counter:
          "Totally fair. The difference here is that we already built the website before asking for the meeting, so all I want is 15 minutes to show you something real.",
        bridge: "Would later today or tomorrow be less disruptive?",
      },
      {
        objection: "Can you just email it to me?",
        counter:
          "I would if I could, but it is sitting on a test server and the cleanest way to show it is live on a quick video call.",
        bridge: "Do you have time later today or tomorrow?",
      },
      {
        objection: "I am good. I do not need one.",
        counter:
          "Before you hang up, let me ask one thing. If this site helped you land even a few more of your best jobs each month, would that matter or are you completely at capacity already?",
        bridge: "What would that do to your cash flow if you had room for a few more of the right jobs?",
      },
      {
        objection: "I already have one. I just have not connected the domain.",
        counter:
          "Perfect. Let me show you how to connect it for free, and while we are there I can show you what we already built so you can decide which direction you want to go.",
        bridge: "That is an easy 15-minute call.",
      },
      {
        objection: "I have someone building one right now.",
        counter:
          "That is great. It still costs you nothing to look at what is already built on our side, and we can compare it to the timeline and direction you already have in motion.",
        bridge: "What is the ETA on the site they are building for you?",
      },
      {
        objection: "We are closed or out of business.",
        counter:
          "Got it. I wish I had called sooner. Just out of curiosity, what line of business are you in now?",
        bridge: "That answer tells me whether there is still something useful I can show you.",
      },
    ],
    closingOptions: [
      "Are you good with later today, or is tomorrow cleaner?",
      "Let us meet in the middle. Give me 15 minutes and if it is not useful, we leave it there.",
      "If the site feels right, we can move quickly. If not, at least you got a real look at what is possible for the business.",
    ],
    proofPoints: dedupeLines([
      "Hand-coded one-of-one website.",
      "Calendar, reminders, and AI integrations for efficiency.",
      "10 days of revisions after the walkthrough.",
      "Admin portal access plus support-ticket help.",
      previewLine,
      researchBullets[2],
    ], 6),
    transcriptSignals: transcriptSignals.length
      ? transcriptSignals
      : ["No transcript-backed coaching loaded yet. Refresh the script to pull the latest Amazon Connect call wins and objections."],
    injectedData: dedupeLines(
      [
        "Fallback core call framework",
        params.hasSocialPresence ? "Social proof opener" : "No-online-presence opener",
        ...(params.learnedData ?? []),
      ],
      6,
    ),
    refreshSummary:
      normalizeLine(params.refreshSummary || "") ||
      "Fallback playbook loaded. Refresh to blend in deep research, recent booked-demo wins, and transcript-backed call signals.",
  };
}
