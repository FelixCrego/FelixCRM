import { NextResponse } from "next/server";
import { scrapeLeads } from "@/lib/scraper";
import { insertLeads } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const city = String(body.city ?? "").trim();
    const businessType = String(body.businessType ?? "").trim();

    if (!city || !businessType) {
      return NextResponse.json({ error: "City and businessType are required." }, { status: 400 });
    }

    const minRating = Number(body.minRating ?? 0);
    const includeNoWebsiteOnly = Boolean(body.includeNoWebsiteOnly ?? false);
    const { leads, diagnostics } = await scrapeLeads(city, businessType, Number.isFinite(minRating) ? minRating : 0, includeNoWebsiteOnly);
    const inserted = await insertLeads(leads);

    return NextResponse.json({ inserted, fetched: leads.length, diagnostics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to scrape leads.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
