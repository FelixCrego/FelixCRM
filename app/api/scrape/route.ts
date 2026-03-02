import { NextResponse } from "next/server";
import { scrapeLeads } from "@/lib/scraper";
import { insertLeads } from "@/lib/store";
import { buildLeadScraperChatPrompt } from "@/lib/lead-scraper-prompt";

export async function POST(request: Request) {
  const body = await request.json();
  const city = String(body.city ?? "").trim();
  const businessType = String(body.businessType ?? "").trim();

  if (!city || !businessType) {
    return NextResponse.json({ error: "City and businessType are required." }, { status: 400 });
  }

  const scraped = await scrapeLeads(city, businessType);
  const inserted = await insertLeads(scraped);

  const chatbotPrompt = buildLeadScraperChatPrompt({
    niche: businessType,
    area: city,
    includeNoWebsiteOnly: true,
    minRating: Number(body.minRating ?? 0),
  });

  return NextResponse.json({ inserted, fetched: scraped.length, chatbotPrompt });
}
