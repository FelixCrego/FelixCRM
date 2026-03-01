import type { Lead } from "@/lib/types";

export async function scrapeLeads(city: string, businessType: string): Promise<Omit<Lead, "id" | "updatedAt" | "status">[]> {
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
  }));
}
