import type { Lead } from "@/lib/types";

type GooglePlaceSearchResponse = {
  status?: string;
  results?: Array<{ place_id?: string }>;
  next_page_token?: string;
};

type GooglePlaceDetailsResponse = {
  status?: string;
  result?: {
    name?: string;
    formatted_address?: string;
    website?: string;
    formatted_phone_number?: string;
    rating?: number;
    user_ratings_total?: number;
    reviews?: Array<{ time?: number }>;
  };
};

const SCRAPE_FETCH_TIMEOUT_MS = 12000;
const MAX_SEARCH_QUERIES = 12;
const MAX_RESULTS_PAGES_PER_QUERY = 2;

function cleanPhoneNumber(phoneStr?: string | null) {
  if (!phoneStr) return "";
  return phoneStr.replace(/\D/g, "");
}

function buildSearchQueries(city: string, businessType: string) {
  const cleanCity = city.trim();
  const cleanBusinessType = businessType.trim();

  const baseQueries = [
    `${cleanBusinessType} ${cleanCity}`,
    `${cleanBusinessType} in ${cleanCity}`,
    `${cleanBusinessType} near ${cleanCity}`,
    `best ${cleanBusinessType} ${cleanCity}`,
    `${cleanBusinessType} services ${cleanCity}`,
    `local ${cleanBusinessType} ${cleanCity}`,
    `${cleanBusinessType} company ${cleanCity}`,
    `${cleanBusinessType} contractor ${cleanCity}`,
    `${cleanBusinessType} repair ${cleanCity}`,
    `${cleanBusinessType} installation ${cleanCity}`,
    `${cleanBusinessType} maintenance ${cleanCity}`,
    `${cleanBusinessType} emergency ${cleanCity}`,
  ];

  return Array.from(new Set(baseQueries.map((query) => query.trim()).filter(Boolean))).slice(0, MAX_SEARCH_QUERIES);
}

function buildFallbackLeads(city: string, businessType: string): Omit<Lead, "id" | "updatedAt" | "status">[] {
  return Array.from({ length: 8 }).map((_, idx) => ({
    businessName: `${city} ${businessType} ${idx + 1}`,
    city,
    businessType,
    phone: `+1-555-010${idx}`,
    email: `hello${idx}@${businessType.toLowerCase().replace(/\s+/g, "")}${idx}.com`,
    websiteUrl: idx % 2 === 0 ? `https://${businessType.toLowerCase().replace(/\s+/g, "")}${idx}.com` : null,
    websiteStatus: idx % 2 === 0 ? "LIVE" : "MISSING",
    socialLinks: ["https://facebook.com/example", "https://instagram.com/example"],
    aiResearchSummary: null,
    sourceQuery: `${businessType} ${city}`,
    ownerId: null,
    deployedUrl: null,
    siteStatus: "UNBUILT",
  }));
}

async function callGeminiText(prompt: string, geminiApiKey?: string): Promise<string> {
  if (!geminiApiKey) return "";
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      cache: "no-store",
    });
    if (!response.ok) return "";
    const json = await response.json() as any;
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch {
    return "";
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = SCRAPE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function researchLeadWithGemini(name: string, phone: string, address: string, geminiApiKey?: string) {
  if (!geminiApiKey) return "Limited online footprint found.";

  const prompt = `You are an expert lead generation researcher. Research this local business and return a concise 2-3 sentence summary.
Include: services offered, likely owner name if available, and online footprint.
If nothing meaningful is found reply exactly: "Limited online footprint found."
Business Name: ${name}
Phone: ${phone}
Address: ${address}`;

  const text = await callGeminiText(prompt, geminiApiKey);
  return text.trim() || "AI Research timeout or quota limit reached.";
}

export async function runLeadResearch(input: { name: string; phone?: string | null; address?: string | null }) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  return researchLeadWithGemini(input.name, input.phone ?? "N/A", input.address ?? "N/A", geminiApiKey);
}

export async function scrapeLeads(city: string, businessType: string, minRating = 0, includeNoWebsiteOnly = false): Promise<Omit<Lead, "id" | "updatedAt" | "status">[]> {
  const provider = process.env.SCRAPING_API_URL;
  if (provider && process.env.SCRAPING_API_KEY) {
    const response = await fetch(provider, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SCRAPING_API_KEY}`,
      },
      body: JSON.stringify({ city, businessType }),
    });
    if (!response.ok) throw new Error("Scraping provider failed");
    return response.json();
  }

  const mapsApiKey = process.env.MAPS_API_KEY;
  if (!mapsApiKey) {
    return buildFallbackLeads(city, businessType);
  }

  const fakeWebsiteDomains = [
    "facebook.com",
    "yelp.com",
    "yellowpages.com",
    "bbb.org",
    "angi.com",
    "houzz.com",
    "instagram.com",
    "manta.com",
    "homeadvisor.com",
    "porch.com",
    "thumbtack.com",
  ];

  const seenPlaceIds = new Set<string>();
  const seenNames = new Set<string>();
  const seenPhones = new Set<string>();
  const leads: Omit<Lead, "id" | "updatedAt" | "status">[] = [];

  const queries = buildSearchQueries(city, businessType);

  for (const query of queries) {
    let params = new URLSearchParams({ query, key: mapsApiKey });
    let pagesFetched = 0;

    while (pagesFetched < MAX_RESULTS_PAGES_PER_QUERY) {
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
      const searchJson = await fetchJsonWithTimeout<GooglePlaceSearchResponse>(searchUrl);
      if (!searchJson) break;

      const status = searchJson.status ?? "";
      if (status === "INVALID_REQUEST" && params.has("pagetoken")) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      if (!status || !["OK", "ZERO_RESULTS"].includes(status)) break;

      pagesFetched += 1;
      const results = searchJson.results ?? [];
      if (!results.length) break;

      for (const place of results) {
        if (!place.place_id || seenPlaceIds.has(place.place_id)) continue;
        seenPlaceIds.add(place.place_id);

        const detailsParams = new URLSearchParams({
          place_id: place.place_id,
          fields: "name,formatted_address,website,formatted_phone_number,rating,user_ratings_total,reviews",
          key: mapsApiKey,
        });

        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?${detailsParams.toString()}`;
        const detailsJson = await fetchJsonWithTimeout<GooglePlaceDetailsResponse>(detailsUrl);
        if (!detailsJson || detailsJson.status !== "OK" || !detailsJson.result) continue;

        const details = detailsJson.result;
        const website = (details.website ?? "").toLowerCase();
        const hasRealWebsite =
          Boolean(website) && !fakeWebsiteDomains.some((domain) => website.includes(domain));

        if (includeNoWebsiteOnly && hasRealWebsite) continue;

        const name = (details.name ?? "N/A").trim();
        const phone = details.formatted_phone_number ?? "N/A";
        const normalizedName = name.toLowerCase();
        const normalizedPhone = cleanPhoneNumber(phone);

        if (seenNames.has(normalizedName)) continue;
        if (normalizedPhone && seenPhones.has(normalizedPhone)) continue;

        seenNames.add(normalizedName);
        if (normalizedPhone) seenPhones.add(normalizedPhone);

        const rating = details.rating ?? 0;
        if (rating < minRating) continue;

        leads.push({
          businessName: name,
          city,
          businessType,
          phone,
          email: null,
          websiteUrl: details.website ?? null,
          websiteStatus: hasRealWebsite ? "LIVE" : "MISSING",
          socialLinks: [],
          aiResearchSummary: null,
          sourceQuery: query,
          ownerId: null,
          deployedUrl: null,
          siteStatus: "UNBUILT",
        });
      }

      const token = searchJson.next_page_token;
      if (!token || results.length < 20) break;
      await new Promise((resolve) => setTimeout(resolve, 1800));
      params = new URLSearchParams({ pagetoken: token, key: mapsApiKey });
    }
  }

  return leads;
}
