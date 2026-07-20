import OpenAI from "openai";
import type { LeadEnrichmentPayload, LeadResearchSocialLinks } from "@/lib/types";

const MAX_PAGES = 6;
const MAX_TEXT_PER_PAGE = 9000;
const FETCH_TIMEOUT_MS = 12000;
const COMMON_PATHS = ["/", "/about", "/about-us", "/services", "/contact", "/contact-us"];
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SOCIAL_HOSTS: Record<string, keyof LeadResearchSocialLinks> = {
  "facebook.com": "facebook",
  "instagram.com": "instagram",
  "linkedin.com": "linkedin",
  "x.com": "x",
  "twitter.com": "x",
  "youtube.com": "youtube",
  "tiktok.com": "tiktok",
  "yelp.com": "yelp",
};

type PageEvidence = { url: string; title: string; text: string; emails: string[]; links: string[] };

function normalizeUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString(); } catch { return null; }
}

function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function stripHtml(html: string) {
  return decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string) {
  return decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
}

function extractLinks(html: string, base: string) {
  const links = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try { links.add(new URL(match[1], base).toString()); } catch { /* ignore */ }
  }
  return [...links];
}

function cleanEmail(email: string) {
  return email.toLowerCase().replace(/[),.;:]+$/, "");
}

function scoreEmail(email: string, domain: string) {
  const [local, host] = email.split("@");
  let score = host === domain || host.endsWith(`.${domain}`) ? 50 : 0;
  if (/^(info|hello|contact|sales|office|support|admin|team)$/.test(local)) score += 20;
  if (/^(noreply|no-reply|privacy|abuse|webmaster)$/.test(local)) score -= 40;
  if (/gmail\.com|yahoo\.com|outlook\.com|hotmail\.com/.test(host)) score += 5;
  return score;
}

async function fetchPage(url: string): Promise<PageEvidence | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: "follow", cache: "no-store", signal: controller.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; FelixCRMResearchBot/1.0)" } });
    if (!response.ok || !String(response.headers.get("content-type") || "").includes("text/html")) return null;
    const html = (await response.text()).slice(0, 500000);
    const emails = [...new Set([...(html.match(EMAIL_RE) || []), ...[...html.matchAll(/mailto:([^?"'\s>]+)/gi)].map(m => m[1])].map(cleanEmail))];
    return { url: response.url, title: extractTitle(html), text: stripHtml(html).slice(0, MAX_TEXT_PER_PAGE), emails, links: extractLinks(html, response.url) };
  } catch { return null; } finally { clearTimeout(timeout); }
}

function discoverPages(home: PageEvidence, website: string) {
  const origin = new URL(website).origin;
  const candidates = new Set(COMMON_PATHS.map(path => new URL(path, origin).toString()));
  for (const link of home.links) {
    try {
      const parsed = new URL(link);
      if (parsed.origin !== origin) continue;
      if (/about|service|contact|team|company|who-we-are|what-we-do/i.test(parsed.pathname)) candidates.add(parsed.toString());
    } catch { /* ignore */ }
  }
  candidates.delete(home.url);
  return [...candidates].slice(0, MAX_PAGES - 1);
}

function socialLinksFromPages(pages: PageEvidence[]) {
  const socials: LeadResearchSocialLinks = {};
  for (const page of pages) for (const link of page.links) {
    try {
      const host = new URL(link).hostname.replace(/^www\./, "");
      for (const [domain, key] of Object.entries(SOCIAL_HOSTS)) if (host === domain || host.endsWith(`.${domain}`)) socials[key] ||= link;
    } catch { /* ignore */ }
  }
  return socials;
}

export async function deepResearchLead(input: { name: string; websiteUrl?: string | null; email?: string | null; phone?: string | null; city?: string | null; businessType?: string | null }): Promise<LeadEnrichmentPayload> {
  const website = normalizeUrl(input.websiteUrl);
  const pages: PageEvidence[] = [];
  if (website) {
    const home = await fetchPage(website);
    if (home) {
      pages.push(home);
      const additional = discoverPages(home, website);
      const fetched = await Promise.all(additional.map(fetchPage));
      pages.push(...fetched.filter((page): page is PageEvidence => Boolean(page)));
    }
  }

  const websiteDomain = website ? new URL(website).hostname.replace(/^www\./, "") : "";
  const foundEmails = [...new Set(pages.flatMap(page => page.emails))]
    .filter(email => !/example\.(com|org)|sentry\.io|wixpress\.com|cloudflare\.com/i.test(email))
    .sort((a, b) => scoreEmail(b, websiteDomain) - scoreEmail(a, websiteDomain));
  const primaryEmail = input.email || foundEmails[0] || null;
  const socials = socialLinksFromPages(pages);
  const sourcePages = pages.map(page => page.url);

  const evidence = pages.map(page => ({ url: page.url, title: page.title, text: page.text.slice(0, 4500) }));
  let summary = pages.length ? `Reviewed ${pages.length} public page${pages.length === 1 ? "" : "s"} for ${input.name}.` : "No accessible website pages were found.";
  let services: string[] = [];
  let trustSignals: string[] = [];
  let heroCopy: string | null = pages[0]?.title || null;
  let confidence = pages.length ? 0.65 : 0.2;

  if (process.env.OPENAI_API_KEY && evidence.length) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You analyze public business website evidence. Use only supplied text. Never infer unsupported facts. Return strict JSON." },
        { role: "user", content: `Business: ${input.name}\nCity: ${input.city || "unknown"}\nType: ${input.businessType || "unknown"}\nReturn {summary, services, trustSignals, heroCopy, confidence}. Summary should identify specific offerings, positioning, visible proof, and one evidence-backed outreach angle. Avoid generic praise. confidence 0-1. Evidence:\n${JSON.stringify(evidence)}` },
      ],
    });
    try {
      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
      summary = typeof parsed.summary === "string" ? parsed.summary : summary;
      services = Array.isArray(parsed.services) ? parsed.services.map(String).slice(0, 12) : [];
      trustSignals = Array.isArray(parsed.trustSignals) ? parsed.trustSignals.map(String).slice(0, 12) : [];
      heroCopy = typeof parsed.heroCopy === "string" ? parsed.heroCopy : heroCopy;
      confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : confidence;
    } catch { /* retain deterministic extraction */ }
  }

  return {
    summary,
    structured: {
      businessName: input.name,
      primaryPhone: input.phone || null,
      primaryEmail,
      logoUrl: null,
      brandColors: [],
      socialLinks: socials,
      heroCopy,
      services,
      trustSignals,
      confidence,
      sources: sourcePages,
    },
  };
}
