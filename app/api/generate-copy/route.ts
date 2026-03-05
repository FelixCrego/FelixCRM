import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const apiKey = process.env.GEMINI_API_KEY;

const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
] as const;

type PlaybookPayload = {
  scripts: string[];
  objections: Array<{ objection: string; counter: string }>;
  closing: string;
  roiSnapshot: string;
  injectedData: string[];
};

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
    // Fall back to delimiter-based parsing.
  }

  return normalizedInput
    .split(/[\n,]+/)
    .map((model) => model.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function normalizePlaybookPayload(raw: unknown): PlaybookPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<PlaybookPayload>;

  if (
    !Array.isArray(candidate.scripts) ||
    !Array.isArray(candidate.objections) ||
    typeof candidate.closing !== "string" ||
    typeof candidate.roiSnapshot !== "string" ||
    !Array.isArray(candidate.injectedData)
  ) {
    return null;
  }

  const scripts = candidate.scripts.filter((line): line is string => typeof line === "string" && line.trim().length > 0);
  const objections = candidate.objections
    .filter(
      (item): item is { objection: string; counter: string } =>
        Boolean(item && typeof item === "object" && typeof item.objection === "string" && typeof item.counter === "string"),
    )
    .slice(0, 5);
  const closing = candidate.closing.trim();
  const roiSnapshot = candidate.roiSnapshot.trim();
  const injectedData = candidate.injectedData.filter((line): line is string => typeof line === "string" && line.trim().length > 0);

  if (!scripts.length || !objections.length || !closing || !roiSnapshot) return null;

  return {
    scripts,
    objections,
    closing,
    roiSnapshot,
    injectedData,
  };
}

function parsePlaybookFromText(text: string): PlaybookPayload | null {
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
      // try next variant
    }
  }

  return null;
}

function buildFallbackPlaybook(leadName: string, researchContext?: string): PlaybookPayload {
  const contextSnippet = (researchContext || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" • ");

  return {
    scripts: [
      `Hey ${leadName}, quick note — your current site is likely leaking high-intent mobile leads before they book.`,
      "I already built a faster, conversion-focused version we can launch today with no downtime and direct booking/call routing.",
      contextSnippet
        ? `Based on research (${contextSnippet}), this upgrade can recover missed inquiries and turn existing traffic into booked jobs.`
        : "This is designed to recover missed inquiries and turn existing traffic into booked jobs quickly.",
    ],
    objections: [
      {
        objection: "We already have a website.",
        counter: "Totally fair — this is a conversion upgrade, not just a redesign. Same traffic, more booked jobs.",
      },
      {
        objection: "I need to think about it.",
        counter: "Makes sense. Let’s do a 10-minute ROI walkthrough so you can decide with numbers, not guesses.",
      },
      {
        objection: "Send me details.",
        counter: "Absolutely. I’ll send the preview + ROI snapshot and hold a deployment window for 24 hours.",
      },
    ],
    closing: "Want me to lock your deployment slot so this can go live today?",
    roiSnapshot: "Even a few recovered mobile bookings per month can add meaningful recurring revenue.",
    injectedData: ["AI research context", "Mobile conversion gap", "Fast deployment offer"],
  };
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
      const message = error instanceof Error ? error.message : String(error);
      modelErrors.push({ attemptedModels: [modelName], message });
    }
  }

  throw new GeminiModelFallbackError(modelErrors);
}

type GenerateCopyPayload = {
  leadName?: string;
  activeTab?: string;
  researchContext?: string;
};

export async function POST(req: Request) {
  let leadName = "this business";
  let activeTab = "";
  let researchContext = "";
  let rawBody = "";

  try {
    rawBody = await req.text();

    let payload: Record<string, unknown> = {};
    try {
      payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }

    leadName = typeof payload.leadName === "string" && payload.leadName.trim() ? payload.leadName : "this business";
    activeTab = typeof payload.activeTab === "string" ? payload.activeTab.trim().toUpperCase() : "";
    researchContext = typeof payload.researchContext === "string" ? payload.researchContext : "";

    if (!activeTab) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!apiKey) {
      if (activeTab === "PLAYBOOK") {
        return NextResponse.json({
          playbook: buildFallbackPlaybook(leadName, researchContext),
          warning: "Gemini is temporarily unavailable. Showing fallback playbook.",
        });
      }

      return NextResponse.json({ error: "Missing GEMINI_API_KEY configuration" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const systemPrompt =
      activeTab === "PLAYBOOK"
        ? `You are an elite sales strategist helping close pre-built website deals for local service businesses.
Create a highly persuasive, context-aware playbook for ${leadName}.

CRITICAL CONTEXT (Deep Research): ${researchContext || "No specific deep research provided. Focus on mobile booking, speed-to-lead, and conversion lift."}

Return VALID JSON only (no markdown) with this exact shape:
{
  "scripts": [
    "string opener that references their specific opportunity gap",
    "string value pitch with speed-to-launch + conversion angle",
    "string ROI line with realistic missed revenue framing"
  ],
  "objections": [
    {"objection":"string","counter":"string"},
    {"objection":"string","counter":"string"},
    {"objection":"string","counter":"string"}
  ],
  "closing": "string closing ask that creates urgency without being pushy",
  "roiSnapshot": "string one-liner estimate of lost leads/revenue opportunity",
  "injectedData": ["string","string","string"]
}

Rules:
- Be specific, persuasive, and natural.
- Mention website/mobile performance, missed lead capture, and fast deployment.
- Include objection handling and close-ready language.
- Do not include placeholders like [Your Name].`
        : `You are an elite, high-converting tech sales copywriter.
Write a draft for a ${activeTab} to a prospect named ${leadName}.

CRITICAL CONTEXT (Deep Research): ${researchContext || "No specific deep research provided. Focus on web optimization and speed-to-lead."}

RULES FOR FORMATTING:
- If SMS: Keep it extremely casual, under 2 sentences. No emojis. Sound like a quick text from a human rep. Do NOT include placeholders like [Your Name].
- If EMAIL: Include a catchy subject line like "Subject: [Your Subject]". Keep the body under 4 sentences. Focus directly on the gap found in the research.
- If NOTE: Write a concise internal strategy note on how we should pitch this lead based on the research.

Output ONLY the draft text. No robotic greetings, no filler.`;

    try {
      const generation = await generateWithGeminiModelFallback(genAI, systemPrompt);
      const text = generation.text;

      if (activeTab === "PLAYBOOK") {
        const parsedPlaybook = parsePlaybookFromText(text);
        if (parsedPlaybook) {
          return NextResponse.json({ playbook: parsedPlaybook, draft: text, model: generation.modelName });
        }

        return NextResponse.json({
          playbook: buildFallbackPlaybook(leadName, researchContext),
          draft: text,
          model: generation.modelName,
          warning: "Gemini is temporarily unavailable. Showing fallback playbook.",
        });
      }

      return NextResponse.json({ draft: text, model: generation.modelName });
    } catch (generationError) {
      if (activeTab === "PLAYBOOK") {
        const fallbackMessage = "Gemini is temporarily unavailable. Showing fallback playbook.";

        if (generationError instanceof GeminiModelFallbackError) {
          console.error("Gemini Playbook Generation Error (all models failed):", {
            attemptedModels: generationError.attemptedModels,
            modelErrors: generationError.modelErrors,
          });
        } else {
          console.error("Gemini Playbook Generation Error:", generationError);
        }
        return NextResponse.json({
          playbook: buildFallbackPlaybook(leadName, researchContext),
          warning: fallbackMessage,
        });
      }

      throw generationError;
    }
  } catch (error) {
    console.error("Gemini Draft Error:", error);

    if (activeTab === "PLAYBOOK" || rawBody.toUpperCase().includes("PLAYBOOK")) {
      return NextResponse.json({
        playbook: buildFallbackPlaybook(leadName, researchContext),
        warning: "Gemini is temporarily unavailable. Showing fallback playbook.",
      });
    }

    return NextResponse.json({ error: "Failed to generate draft" }, { status: 500 });
  }
}
