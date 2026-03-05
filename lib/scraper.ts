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

const SCRAPE_FETCH_TIMEOUT_MS = 15000;
const SCRAPE_RETRY_ATTEMPTS = 3;
const MAX_AI_MICRO_QUERIES = 10;
const MAX_RESULTS_PAGES_PER_QUERY = 2;
const MAX_PLACE_DETAILS_LOOKUPS_PER_RUN = 80;
const MAX_LEADS_PER_RUN = 40;
const SCRAPE_RUNTIME_BUDGET_MS = 45000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  return Array.from(new Set(baseQueries.map((query) => query.trim()).filter(Boolean)));
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

async function callGeminiText(prompt: string, geminiApiKey?: string): Promise<string> {
  if (!geminiApiKey) return "";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return "";
    const json = await response.json() as any;
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function generateMicroQueries(userPrompt: string, geminiApiKey?: string) {
  const fallback = buildSearchQueries(userPrompt.split(" in ").slice(1).join(" in ") || userPrompt, userPrompt.split(" in ")[0] || userPrompt);
  if (!geminiApiKey) return fallback;

  const prompt = `You are an elite local SEO expert building Google Maps micro-queries.
Generate 60 to 90 highly specific, local search queries for: "${userPrompt}".
Use multiple keyword variations and include neighborhoods/zip/city variants.
Return ONLY a comma-separated list. No bullets, no markdown, no explanation.`;

  const raw = await callGeminiText(prompt, geminiApiKey);
  const aiQueries = raw
    .split(",")
    .map((q: string) => q.trim())
    .filter(Boolean);

  const merged = Array.from(new Set([...fallback, ...aiQueries]));
  return merged.slice(0, MAX_AI_MICRO_QUERIES);
}

async function fetchSearchPage(params: URLSearchParams) {
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;

  for (let attempt = 1; attempt <= SCRAPE_RETRY_ATTEMPTS; attempt += 1) {
    const searchJson = await fetchJsonWithTimeout<GooglePlaceSearchResponse>(searchUrl);
    if (!searchJson) {
      if (attempt < SCRAPE_RETRY_ATTEMPTS) {
        await sleep(1200 * attempt);
        continue;
      }
      return null;
    }

    const status = searchJson.status ?? "";
    if (status === "DEADLINE_EXCEEDED") {
      if (attempt < SCRAPE_RETRY_ATTEMPTS) {
        await sleep(1800 * attempt);
        continue;
      }
      return null;
    }

    return searchJson;
  }

  return null;
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

export type ScrapeDiagnostics = {
  queriesAttempted: number;
  textSearchOkCount: number;
  textSearchErrorCount: number;
  detailsOkCount: number;
  detailsErrorCount: number;
  detailsLookupCount: number;
  stoppedEarly: boolean;
  timeBudgetExceeded: boolean;
  leadCapReached: boolean;
  skippedByRating: number;
  skippedByDedupe: number;
};

export async function scrapeLeads(
  city: string,
  businessType: string,
  minRating = 0,
  includeNoWebsiteOnly = false,
): Promise<{ leads: Omit<Lead, "id" | "updatedAt" | "status">[]; diagnostics: ScrapeDiagnostics }> {
  const mapsApiKey = process.env.MAPS_API_KEY;
  if (!mapsApiKey) {
    throw new Error("MAPS_API_KEY is required to scrape leads with Google Places API.");
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
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
  const diagnostics: ScrapeDiagnostics = {
    queriesAttempted: 0,
    textSearchOkCount: 0,
    textSearchErrorCount: 0,
    detailsOkCount: 0,
    detailsErrorCount: 0,
    detailsLookupCount: 0,
    stoppedEarly: false,
    timeBudgetExceeded: false,
    leadCapReached: false,
    skippedByRating: 0,
    skippedByDedupe: 0,
  };

  const querySeed = `${businessType} in ${city}`;
  const queries = await generateMicroQueries(querySeed, geminiApiKey);
  const startedAt = Date.now();

  const isRuntimeBudgetExceeded = () => Date.now() - startedAt >= SCRAPE_RUNTIME_BUDGET_MS;

  for (const query of queries) {
    if (isRuntimeBudgetExceeded()) {
      diagnostics.stoppedEarly = true;
      diagnostics.timeBudgetExceeded = true;
      break;
    }

    diagnostics.queriesAttempted += 1;
    let params = new URLSearchParams({ query, key: mapsApiKey });
    let pageCount = 0;

    while (pageCount < MAX_RESULTS_PAGES_PER_QUERY) {
      if (isRuntimeBudgetExceeded()) {
        diagnostics.stoppedEarly = true;
        diagnostics.timeBudgetExceeded = true;
        break;
      }

      const searchJson = await fetchSearchPage(params);
      if (!searchJson) {
        diagnostics.textSearchErrorCount += 1;
        break;
      }

      const status = searchJson.status ?? "";
      if (status === "INVALID_REQUEST" && params.has("pagetoken")) {
        await sleep(4000);
        continue;
      }

      if (status !== "OK" && status !== "ZERO_RESULTS") {
        diagnostics.textSearchErrorCount += 1;
        break;
      }

      diagnostics.textSearchOkCount += 1;

      pageCount += 1;
      const results = searchJson.results ?? [];
      if (!results.length) break;

      for (const place of results) {
        if (isRuntimeBudgetExceeded()) {
          diagnostics.stoppedEarly = true;
          diagnostics.timeBudgetExceeded = true;
          break;
        }

        if (leads.length >= MAX_LEADS_PER_RUN) {
          diagnostics.stoppedEarly = true;
          diagnostics.leadCapReached = true;
          break;
        }

        if (diagnostics.detailsLookupCount >= MAX_PLACE_DETAILS_LOOKUPS_PER_RUN) {
          diagnostics.stoppedEarly = true;
          break;
        }

        if (!place.place_id || seenPlaceIds.has(place.place_id)) {
          diagnostics.skippedByDedupe += 1;
          continue;
        }
        seenPlaceIds.add(place.place_id);
        diagnostics.detailsLookupCount += 1;

        const detailsParams = new URLSearchParams({
          place_id: place.place_id,
          fields: "name,formatted_address,website,formatted_phone_number,rating,user_ratings_total,reviews",
          key: mapsApiKey,
        });

        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?${detailsParams.toString()}`;
        const detailsJson = await fetchJsonWithTimeout<GooglePlaceDetailsResponse>(detailsUrl, 12000);
        if (!detailsJson || detailsJson.status !== "OK" || !detailsJson.result) {
          diagnostics.detailsErrorCount += 1;
          continue;
        }
        diagnostics.detailsOkCount += 1;

        const details = detailsJson.result;
        const website = (details.website ?? "").toLowerCase();
        const hasRealWebsite = Boolean(website) && !fakeWebsiteDomains.some((domain) => website.includes(domain));

        if (includeNoWebsiteOnly && hasRealWebsite) continue;

        const name = (details.name ?? "N/A").trim();
        const phone = details.formatted_phone_number ?? "N/A";
        const normalizedName = name.toLowerCase();
        const normalizedPhone = cleanPhoneNumber(phone);

        if (seenNames.has(normalizedName)) {
          diagnostics.skippedByDedupe += 1;
          continue;
        }
        if (normalizedPhone && seenPhones.has(normalizedPhone)) {
          diagnostics.skippedByDedupe += 1;
          continue;
        }

        seenNames.add(normalizedName);
        if (normalizedPhone) seenPhones.add(normalizedPhone);

        const rating = details.rating ?? 0;
        if (rating < minRating) {
          diagnostics.skippedByRating += 1;
          continue;
        }

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

      const nextPageToken = searchJson.next_page_token;
      if (diagnostics.stoppedEarly) break;
      if (nextPageToken && results.length === 20) {
        await sleep(4000);
        params = new URLSearchParams({ pagetoken: nextPageToken, key: mapsApiKey });
      } else {
        break;
      }
    }

    if (diagnostics.stoppedEarly) break;
  }

  return { leads, diagnostics };
}
