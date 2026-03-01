import type { Lead } from "@/lib/types";

type GoogleTextSearchResponse = {
  status?: string;
  results?: Array<{ place_id: string }>;
  next_page_token?: string;
};

type GooglePlaceDetailsResponse = {
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

function cleanPhoneNumber(phone?: string | null) {
  if (!phone) return null;
  const normalized = phone.replace(/\D/g, "");
  return normalized.length > 0 ? normalized : null;
}

function scoreLead(reviewCount: number, latestReviewTime?: number) {
  if (!reviewCount || !latestReviewTime) return "⭐";

  const daysSinceReview = (Date.now() / 1000 - latestReviewTime) / 86400;
  if (reviewCount > 20 && daysSinceReview <= 30) return "⭐⭐⭐⭐⭐";
  if (reviewCount > 10 && daysSinceReview <= 90) return "⭐⭐⭐⭐";
  if (reviewCount > 5 && daysSinceReview <= 365) return "⭐⭐⭐";
  if (reviewCount > 0 && daysSinceReview > 365) return "⭐⭐";
  return "⭐";
}

async function generateMicroQueries(city: string, businessType: string): Promise<string[]> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return [`${businessType} in ${city}`];

  const prompt = `You are an elite local SEO expert. Create 20 to 30 targeted Google Maps text search queries for "${businessType}" in "${city}". Include service variants and nearby neighborhoods/zip-style modifiers when possible. Return only a comma-separated list.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    },
  );

  if (!response.ok) return [`${businessType} in ${city}`];

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join(" ") ?? "";
  const queries = text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 40);

  return queries.length > 0 ? queries : [`${businessType} in ${city}`];
}

async function researchLead(name: string, phone: string | null, address: string | null) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return "Limited online footprint found.";

  const prompt = `You are a lead generation researcher. Research this local business and return exactly 2 to 3 concise sentences with: 1) services they offer, 2) owner name if available, 3) online footprint. Business Name: ${name}. Phone: ${phone ?? "N/A"}. Address: ${address ?? "N/A"}. If there is not enough information, reply exactly: "Limited online footprint found."`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2 },
      }),
    },
  );

  if (!response.ok) return "AI research unavailable.";

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join(" ").trim();
  return text || "Limited online footprint found.";
}

async function fetchPlaceDetails(placeId: string, mapsApiKey: string) {
  const detailsParams = new URLSearchParams({
    place_id: placeId,
    fields: "name,formatted_address,website,formatted_phone_number,rating,user_ratings_total,reviews",
    key: mapsApiKey,
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${detailsParams.toString()}`);
  if (!response.ok) return null;
  const data = (await response.json()) as GooglePlaceDetailsResponse;
  return data.result ?? null;
}

export async function scrapeLeads(city: string, businessType: string): Promise<Omit<Lead, "id" | "updatedAt" | "status">[]> {
  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!mapsApiKey) {
    return Array.from({ length: 8 }).map((_, idx) => ({
      businessName: `${city} ${businessType} ${idx + 1}`,
      city,
      businessType,
      phone: `+1-555-010${idx}`,
      email: `hello${idx}@${businessType.toLowerCase().replace(/\s+/g, "")}${idx}.com`,
      websiteUrl: idx % 2 === 0 ? `https://${businessType.toLowerCase().replace(/\s+/g, "")}${idx}.com` : null,
      websiteStatus: idx % 2 === 0 ? "LIVE" : "MISSING",
      socialLinks: ["https://facebook.com/example", "https://instagram.com/example"],
      ownerId: null,
      deployedUrl: null,
      siteStatus: "UNBUILT",
      sourceMeta: {
        leadScore: "⭐",
        rating: null,
        totalReviews: 0,
        latestReviewDate: null,
        aiResearchSummary: "Mock lead generated without API keys.",
        queryUsed: `${businessType} in ${city}`,
      },
    }));
  }

  const queries = await generateMicroQueries(city, businessType);
  const seenPlaceIds = new Set<string>();
  const leads: Omit<Lead, "id" | "updatedAt" | "status">[] = [];

  for (const query of queries) {
    let params = new URLSearchParams({ query, key: mapsApiKey });
    let pageCount = 0;

    while (pageCount < 3) {
      const response = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`);
      if (!response.ok) break;
      const data = (await response.json()) as GoogleTextSearchResponse;

      if (!data.results?.length) break;

      for (const place of data.results) {
        if (!place.place_id || seenPlaceIds.has(place.place_id)) continue;
        seenPlaceIds.add(place.place_id);

        const details = await fetchPlaceDetails(place.place_id, mapsApiKey);
        if (!details?.name) continue;

        const website = details.website?.toLowerCase() ?? "";
        const hasRealWebsite = website.length > 0 && !fakeWebsiteDomains.some((domain) => website.includes(domain));
        if (hasRealWebsite) continue;

        const latestReviewTime = details.reviews?.[0]?.time ?? 0;
        const totalReviews = details.user_ratings_total ?? 0;
        const leadScore = scoreLead(totalReviews, latestReviewTime);
        const aiResearchSummary = await researchLead(details.name, details.formatted_phone_number ?? null, details.formatted_address ?? null);

        leads.push({
          businessName: details.name,
          city,
          businessType,
          phone: details.formatted_phone_number ?? null,
          email: null,
          websiteUrl: details.website ?? null,
          websiteStatus: details.website ? "LISTING_ONLY" : "MISSING",
          socialLinks: [],
          ownerId: null,
          deployedUrl: null,
          siteStatus: "UNBUILT",
          sourceMeta: {
            leadScore,
            rating: details.rating ?? null,
            totalReviews,
            latestReviewDate: latestReviewTime ? new Date(latestReviewTime * 1000).toISOString().slice(0, 10) : null,
            aiResearchSummary,
            queryUsed: query,
          },
        });
      }

      if (!data.next_page_token) break;
      pageCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      params = new URLSearchParams({ pagetoken: data.next_page_token, key: mapsApiKey });
    }
  }

  const deduped = new Map<string, Omit<Lead, "id" | "updatedAt" | "status">>();
  for (const lead of leads) {
    const key = `${lead.businessName.toLowerCase()}::${cleanPhoneNumber(lead.phone) ?? ""}`;
    if (!deduped.has(key)) deduped.set(key, lead);
  }

  return Array.from(deduped.values());
}
