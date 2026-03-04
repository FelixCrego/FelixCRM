import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const apiKey = process.env.GEMINI_API_KEY;

export async function POST(req: Request) {
  try {
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY configuration" }, { status: 500 });
    }

    const { leadName, activeTab, researchContext } = await req.json();

    if (!leadName || !activeTab) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const systemPrompt = `You are an elite, high-converting tech sales copywriter.
Write a draft for a ${activeTab} to a prospect named ${leadName}.

CRITICAL CONTEXT (Deep Research): ${researchContext || "No specific deep research provided. Focus on web optimization and speed-to-lead."}

RULES FOR FORMATTING:
- If SMS: Keep it extremely casual, under 2 sentences. No emojis. Sound like a quick text from a human rep. Do NOT include placeholders like [Your Name].
- If EMAIL: Include a catchy subject line like "Subject: [Your Subject]". Keep the body under 4 sentences. Focus directly on the gap found in the research.
- If NOTE: Write a concise internal strategy note on how we should pitch this lead based on the research.

Output ONLY the draft text. No robotic greetings, no filler.`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ draft: text.trim() });
  } catch (error) {
    console.error("Gemini Draft Error:", error);
    return NextResponse.json({ error: "Failed to generate draft" }, { status: 500 });
  }
}
