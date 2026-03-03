import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getLeadById, getProfile, saveScript } from "@/lib/store";

export async function POST(request: Request) {
  try {
  const body = await request.json();
  const leadId = String(body.leadId ?? "");
  const type = (body.type ?? "EMAIL") as "EMAIL" | "SMS";
  const lead = await getLeadById(leadId);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const profile = await getProfile();

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is required to generate scripts." }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: "You write concise high-converting outbound sales messages." },
      {
        role: "user",
        content: `Write a ${type} message for ${lead.businessName}. Tone: ${profile.toneOfVoice}. Mention we already generated a website demo: ${lead.deployedUrl ?? "coming soon"}. Include clear CTA to book: ${profile.calendarLink || "provide your availability"}. Social data: ${(lead.socialLinks ?? []).join(", ")}`,
      },
    ],
    temperature: 0.8,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: "Script generation returned no content." }, { status: 502 });
  }
  const script = await saveScript({ content, type, leadId });
  return NextResponse.json({ script });

  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 500 });
  }
}
