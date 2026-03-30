import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { buildFallbackPlaybook, type AIDynamicPlaybook } from "@/lib/ai-playbook";
import { getAuthenticatedUser } from "@/lib/auth";
import { buildSalesLearningSnapshot } from "@/lib/sales-learning";
import { canUserManageAllLeads, getLeadById, listAssignableUsers, prettyNameFromEmail } from "@/lib/store";

const geminiApiKey = process.env.GEMINI_API_KEY;
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
] as const;

type GeminiFallbackError = {
  attemptedModels: string[];
  message: string;
};

class GeminiModelFallbackError extends Error {
  attemptedModels: string[];
  modelErrors: GeminiFallbackError[];

  constructor(modelErrors: GeminiFallbackError[]) {
    super(modelErrors.map((entry) => `${entry.attemptedModels.join("/")}: ${entry.message}`).join(" | "));
    this.name = "GeminiModelFallbackError";
    this.modelErrors = modelErrors;
    this.attemptedModels = modelErrors.flatMap((entry) => entry.attemptedModels);
  }
}

function parseConfiguredGeminiModels(rawModels: string | undefined): string[] {
  if (!rawModels) return [];

  const normalizedInput = rawModels.trim();
  if (!normalizedInput) return [];

  try {
    const parsed = JSON.parse(normalizedInput);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((model): model is string => typeof model === "string")
        .map((model) => model.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    }
  } catch {
    // Fall back to delimiter parsing.
  }

  return normalizedInput
    .split(/[\n,]+/)
    .map((model) => model.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function dedupeLines(values: Array<string | undefined | null>, limit = 6) {
  return Array.from(new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))).slice(0, limit);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

async function resolveRepName(userId: string, email?: string | null) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const fallbackName = normalizedEmail ? prettyNameFromEmail(normalizedEmail) : "someone from Felix";
  const assignableUsers = await listAssignableUsers().catch(() => []);
  const matchedUser =
    assignableUsers.find((candidate) => candidate.id === userId) ??
    assignableUsers.find((candidate) => (candidate.email ?? "").trim().toLowerCase() === normalizedEmail);
  return matchedUser?.name || fallbackName;
}

function normalizePlaybookPayload(raw: unknown): AIDynamicPlaybook | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<AIDynamicPlaybook> & Record<string, unknown>;

  const headline = typeof candidate.headline === "string" ? candidate.headline.trim() : "";
  const summary = typeof candidate.summary === "string" ? candidate.summary.trim() : "";
  const refreshSummary = typeof candidate.refreshSummary === "string" ? candidate.refreshSummary.trim() : "";

  const timingWindows = Array.isArray(candidate.timingWindows)
    ? (candidate.timingWindows as unknown[])
        .filter(isObjectRecord)
        .map((item) => ({
          label: typeof item.label === "string" ? item.label.trim() : "",
          prompt: typeof item.prompt === "string" ? item.prompt.trim() : "",
        }))
        .filter((item) => item.label && item.prompt)
        .slice(0, 4)
    : [];

  const sections = Array.isArray(candidate.sections)
    ? (candidate.sections as unknown[])
        .filter(isObjectRecord)
        .map((item, index) => ({
          id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `section-${index + 1}`,
          title: typeof item.title === "string" ? item.title.trim() : "",
          goal: typeof item.goal === "string" ? item.goal.trim() : "",
          lines: Array.isArray(item.lines)
            ? item.lines.filter((line): line is string => typeof line === "string" && line.trim().length > 0).slice(0, 6)
            : [],
        }))
        .filter((item) => item.title && item.goal && item.lines.length > 0)
        .slice(0, 6)
    : [];

  const objections = Array.isArray(candidate.objections)
    ? (candidate.objections as unknown[])
        .filter(isObjectRecord)
        .map((item) => ({
          objection: typeof item.objection === "string" ? item.objection.trim() : "",
          counter: typeof item.counter === "string" ? item.counter.trim() : "",
          bridge: typeof item.bridge === "string" ? item.bridge.trim() : "",
        }))
        .filter((item) => item.objection && item.counter && item.bridge)
        .slice(0, 8)
    : [];

  const closingOptions = Array.isArray(candidate.closingOptions)
    ? candidate.closingOptions.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 5)
    : [];
  const proofPoints = Array.isArray(candidate.proofPoints)
    ? candidate.proofPoints.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8)
    : [];
  const transcriptSignals = Array.isArray(candidate.transcriptSignals)
    ? candidate.transcriptSignals.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8)
    : [];
  const injectedData = Array.isArray(candidate.injectedData)
    ? candidate.injectedData.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8)
    : [];

  if (!headline || !summary || !refreshSummary || !timingWindows.length || !sections.length || !objections.length || !closingOptions.length) {
    return null;
  }

  return {
    headline,
    summary,
    refreshSummary,
    timingWindows,
    sections,
    objections,
    closingOptions,
    proofPoints,
    transcriptSignals,
    injectedData,
  };
}

function parsePlaybookFromText(text: string): AIDynamicPlaybook | null {
  const trimmed = text.trim();
  const variants = [trimmed];

  if (trimmed.startsWith("```")) {
    const noFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    variants.push(noFence);
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) {
    variants.push(jsonMatch[0]);
  }

  for (const variant of variants) {
    try {
      const parsed = JSON.parse(variant);
      const normalized = normalizePlaybookPayload(parsed);
      if (normalized) return normalized;
    } catch {
      // Try the next variant.
    }
  }

  return null;
}

async function generateWithGeminiModelFallback(genAI: GoogleGenerativeAI, prompt: string) {
  const modelErrors: GeminiFallbackError[] = [];
  const configuredModels = parseConfiguredGeminiModels(process.env.GEMINI_MODELS);
  const modelsToTry = Array.from(new Set([...(configuredModels || []), ...GEMINI_MODELS]));

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return { text: response.text().trim(), modelName };
    } catch (error) {
      modelErrors.push({
        attemptedModels: [modelName],
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new GeminiModelFallbackError(modelErrors);
}

async function generateWithOpenAI(prompt: string) {
  if (!openAiApiKey) throw new Error("Missing OPENAI_API_KEY configuration");

  const openai = new OpenAI({ apiKey: openAiApiKey });
  const completion = await openai.chat.completions.create({
    model: openAiModel,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "You rewrite spoken sales scripts into high-converting, transcript-aware call frameworks for live cold outreach. Return JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI returned no content.");
  return { text: content, modelName: openAiModel };
}

function buildPlaybookPrompt(params: {
  repName: string;
  leadName: string;
  researchContext: string;
  learnedContext: string;
  fallbackPlaybook: AIDynamicPlaybook;
  currentLeadCallContext: string;
  stage: "gemini" | "openai";
  geminiDraft?: string;
}) {
  const sharedRules = [
    `You are building a real-time phone script generator for ${params.repName}, who sells pre-built website demos to local service businesses.`,
    `Target lead: ${params.leadName}`,
    `Caller name to use when introducing the rep: ${params.repName}`,
    `Deep research context:\n${params.researchContext || "No specific deep research provided."}`,
    `Recent booked-demo learning and transcript context:\n${params.learnedContext}`,
    `Current lead live call context:\n${params.currentLeadCallContext}`,
    `Fallback framework to preserve and improve:\n${JSON.stringify(params.fallbackPlaybook)}`,
    "Keep the fallback strategy intact: pattern interrupt, website already built, two time-frame close, live walkthrough, and grounded objection handling.",
    "Use transcript-backed language from recent booked demos only when it is clearly supported by the CRM context.",
    "Write in natural spoken language, not polished marketing copy.",
    `If the caller says their name, it must be ${params.repName}. Do not use Eliot unless the rep name is actually Eliot.`,
    "No placeholders like [Your Name]. No markdown. Return valid JSON only.",
    "Every section should be easy for a rep to read live on a call.",
    "Give two time-frame prompts in timingWindows.",
    "Include transcriptSignals that summarize the most useful live coaching cues from the transcript-backed context.",
    "Use the exact JSON shape below:",
    JSON.stringify(
      {
        headline: "string",
        summary: "string",
        refreshSummary: "string",
        timingWindows: [{ label: "string", prompt: "string" }],
        sections: [{ id: "string", title: "string", goal: "string", lines: ["string"] }],
        objections: [{ objection: "string", counter: "string", bridge: "string" }],
        closingOptions: ["string"],
        proofPoints: ["string"],
        transcriptSignals: ["string"],
        injectedData: ["string"],
      },
      null,
      2,
    ),
  ];

  if (params.stage === "gemini") {
    return [
      ...sharedRules,
      "Use Gemini to draft the first pass. Keep it practical, sharp, and call-ready.",
    ].join("\n\n");
  }

  return [
    ...sharedRules,
    `Gemini first-pass draft to refine:\n${params.geminiDraft || "No Gemini draft available. Build the final version directly."}`,
    "Use OpenAI to tighten the phrasing, improve the navigation of the script, and make the final output easier for reps to follow live.",
  ].join("\n\n");
}

function mergePlaybook(
  basePlaybook: AIDynamicPlaybook,
  params: {
    transcriptSignals: string[];
    injectedData: string[];
    refreshSummary: string;
  },
) {
  return {
    ...basePlaybook,
    transcriptSignals: dedupeLines([...basePlaybook.transcriptSignals, ...params.transcriptSignals], 8),
    injectedData: dedupeLines([...basePlaybook.injectedData, ...params.injectedData], 8),
    refreshSummary: params.refreshSummary,
  };
}

type GenerateCopyPayload = {
  leadId?: string;
  leadName?: string;
  activeTab?: string;
  researchContext?: string;
};

export async function POST(req: Request) {
  let leadName = "this business";
  let leadId = "";
  let activeTab = "";
  let researchContext = "";
  let rawBody = "";
  let repName = "someone from Felix";

  try {
    rawBody = await req.text();

    let payload: GenerateCopyPayload = {};
    try {
      payload = rawBody ? (JSON.parse(rawBody) as GenerateCopyPayload) : {};
    } catch {
      payload = {};
    }

    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    repName = await resolveRepName(user.id, user.email);

    leadId = typeof payload.leadId === "string" ? payload.leadId.trim() : "";
    activeTab = typeof payload.activeTab === "string" ? payload.activeTab.trim().toUpperCase() : "";
    researchContext = typeof payload.researchContext === "string" ? payload.researchContext : "";

    const includeAll = await canUserManageAllLeads(user.id, user.email).catch(() => false);
    const lead = leadId ? await getLeadById(leadId, user.id, { includeAll }).catch(() => null) : null;
    leadName =
      (typeof payload.leadName === "string" && payload.leadName.trim()) ||
      lead?.businessName ||
      "this business";

    if (!activeTab) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const learningSnapshot = await buildSalesLearningSnapshot({
      userId: user.id,
      userEmail: user.email,
      currentLeadId: leadId || null,
    }).catch(() => null);

    const learnedContext =
      learningSnapshot?.promptContext ||
      "No team learning snapshot is available yet. Use only the target lead research context.";
    const learnedInjectedData = learningSnapshot?.injectedData ?? [];
    const transcriptSignals = learningSnapshot?.transcriptSignals ?? [];
    const currentLeadCallContext = learningSnapshot?.currentLeadCallContext || "Current lead live call context: no stored transcript yet.";
    const hasSocialPresence =
      Boolean(lead?.socialLinks?.length) || /(instagram|facebook|tiktok|youtube|linkedin|social)/i.test(researchContext);

    const baseFallbackPlaybook = buildFallbackPlaybook({
      leadName,
      repName,
      city: lead?.city,
      previewUrl: lead?.deployedUrl ?? "",
      researchContext,
      learnedData: learnedInjectedData,
      transcriptSignals,
      hasSocialPresence,
      refreshSummary:
        learningSnapshot
          ? `Fallback framework loaded with ${learningSnapshot.bookedDemoCount} booked-demo wins and ${learningSnapshot.transcriptBackedExampleCount} transcript-backed examples.`
          : undefined,
    });

    if (activeTab === "PLAYBOOK") {
      if (!geminiApiKey && !openAiApiKey) {
        return NextResponse.json({
          playbook: baseFallbackPlaybook,
          warning: "Gemini and OpenAI are unavailable. Showing fallback playbook.",
        });
      }

      const modelTrail: string[] = [];
      const warnings: string[] = [];
      let geminiDraft = "";
      let finalPlaybook: AIDynamicPlaybook | null = null;

      if (geminiApiKey) {
        try {
          const genAI = new GoogleGenerativeAI(geminiApiKey);
          const geminiGeneration = await generateWithGeminiModelFallback(
            genAI,
            buildPlaybookPrompt({
              repName,
              leadName,
              researchContext,
              learnedContext,
              fallbackPlaybook: baseFallbackPlaybook,
              currentLeadCallContext,
              stage: "gemini",
            }),
          );
          geminiDraft = geminiGeneration.text;
          modelTrail.push(`Gemini ${geminiGeneration.modelName}`);
          finalPlaybook = parsePlaybookFromText(geminiDraft);
        } catch (error) {
          if (error instanceof GeminiModelFallbackError) {
            warnings.push(error.modelErrors[0]?.message ?? "Gemini models failed.");
          } else {
            warnings.push(error instanceof Error ? error.message : "Gemini request failed.");
          }
        }
      }

      if (openAiApiKey) {
        try {
          const openAiGeneration = await generateWithOpenAI(
            buildPlaybookPrompt({
              repName,
              leadName,
              researchContext,
              learnedContext,
              fallbackPlaybook: baseFallbackPlaybook,
              currentLeadCallContext,
              stage: "openai",
              geminiDraft,
            }),
          );
          modelTrail.push(`OpenAI ${openAiGeneration.modelName}`);
          finalPlaybook = parsePlaybookFromText(openAiGeneration.text) ?? finalPlaybook;
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : "OpenAI request failed.");
        }
      }

      const refreshSummary = modelTrail.length
        ? `${modelTrail.join(" + ")} refreshed this script using deep research, recent booked demos, and Amazon Connect transcript signals.`
        : baseFallbackPlaybook.refreshSummary;

      const playbook = mergePlaybook(finalPlaybook ?? baseFallbackPlaybook, {
        transcriptSignals,
        injectedData: learnedInjectedData,
        refreshSummary,
      });

      return NextResponse.json({
        playbook,
        modelTrail,
        warning: warnings.length ? warnings.join(" ") : undefined,
      });
    }

    if (!geminiApiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY configuration" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const systemPrompt = `You are an elite, high-converting tech sales copywriter.
Write a draft for a ${activeTab} to a prospect named ${leadName}.

CRITICAL CONTEXT (Deep Research): ${researchContext || "No specific deep research provided. Focus on web optimization and speed-to-lead."}
TEAM LEARNING CONTEXT (Booked demos, winning calls, objections): ${learnedContext}

RULES FOR FORMATTING:
- If SMS: Keep it extremely casual, under 2 sentences. No emojis. Sound like a quick text from a human rep. Do NOT include placeholders like [Your Name].
- If EMAIL: Include a catchy subject line like "Subject: [Your Subject]". Keep the body under 4 sentences. Focus directly on the gap found in the research.
- If NOTE: Write a concise internal strategy note on how we should pitch this lead based on the research.
- Borrow the strongest proven positioning and objection framing from the team learning context when it fits.

Output ONLY the draft text. No robotic greetings, no filler.`;

    try {
      const generation = await generateWithGeminiModelFallback(genAI, systemPrompt);
      return NextResponse.json({ draft: generation.text, model: generation.modelName });
    } catch (generationError) {
      if (generationError instanceof GeminiModelFallbackError) {
        const firstError = generationError.modelErrors[0]?.message ?? "All configured Gemini models failed.";
        return NextResponse.json(
          {
            error: `Gemini request failed: ${firstError}`,
            attemptedModels: generationError.attemptedModels,
          },
          { status: 500 },
        );
      }

      throw generationError;
    }
  } catch (error) {
    console.error("Draft Error:", error);

    if (activeTab === "PLAYBOOK" || rawBody.toUpperCase().includes("PLAYBOOK")) {
      return NextResponse.json({
        playbook: buildFallbackPlaybook({
          leadName,
          repName,
          researchContext,
          refreshSummary: "Fallback playbook loaded because the AI refresh failed.",
        }),
        warning: "AI refresh failed. Showing fallback playbook.",
      });
    }

    return NextResponse.json({ error: "Failed to generate draft" }, { status: 500 });
  }
}
