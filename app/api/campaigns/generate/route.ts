import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, getLeadById, setLeadResearchSummary } from "@/lib/store";
import { deepResearchLead } from "@/lib/deep-lead-research";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const leadId = String(body.leadId || "");
  const includeAll = await canUserViewAllLeads(user.id, user.email);
  const lead = await getLeadById(leadId, user.id, { includeAll });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const research = await deepResearchLead({
    name: lead.businessName,
    phone: lead.phone,
    email: lead.email,
    websiteUrl: lead.websiteUrl,
    city: lead.city,
    businessType: lead.businessType,
  });
  await setLeadResearchSummary(leadId, research);

  if (!research.structured.sources.length) {
    return NextResponse.json({ error: "No accessible public sources were found. Add or verify the lead website before generating a researched email.", research }, { status: 422 });
  }
  if (research.structured.confidence < 0.45) {
    return NextResponse.json({ error: "Research confidence is too low for automated personalized outreach.", research }, { status: 422 });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `Write a carefully researched B2B cold email for Felix Crego and Buildvora AI.
Use ONLY the supplied evidence. Every specific observation must be traceable to one of the source URLs. Never invent names, achievements, problems, technologies, traffic, revenue, staffing, or marketing performance.
Requirements:
- Under 130 words.
- Start with one precise observation, not praise.
- Connect that observation to one relevant business outcome Buildvora may help improve.
- Do not claim their current process is broken.
- Use a low-friction CTA asking permission to share one concrete idea.
- Plain text; no hype, exclamation marks, fake familiarity, or "I hope this finds you well."
- Return JSON: {subject, body, factsUsed:[{fact,source}], confidence, personalizationReason}.

LEAD AND VERIFIED RESEARCH:
${JSON.stringify({
  businessName: lead.businessName,
  email: research.structured.primaryEmail,
  websiteUrl: lead.websiteUrl,
  city: lead.city,
  businessType: lead.businessType,
  summary: research.summary,
  services: research.structured.services,
  trustSignals: research.structured.trustSignals,
  heroCopy: research.structured.heroCopy,
  socialLinks: research.structured.socialLinks,
  sources: research.structured.sources,
  researchConfidence: research.structured.confidence,
}, null, 2)}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are a compliance-conscious B2B outbound researcher and copywriter. Ground every personalization claim in supplied public-source evidence." },
      { role: "user", content: prompt },
    ],
  });
  const result = JSON.parse(response.choices[0]?.message?.content || "{}");
  return NextResponse.json({ ...result, research });
}
