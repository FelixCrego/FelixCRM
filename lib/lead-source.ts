import type { Lead } from "@/lib/types";

export type LeadSourceType = "SCRAPED" | "ADDED";

export const RECENT_LEAD_WINDOW_DAYS = 7;

const ADDED_SOURCE_QUERY_MARKERS = new Set(["manual_entry", "csv_import"]);

export function normalizeLeadSourceType(value: unknown): LeadSourceType | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "SCRAPED" || normalized === "ADDED") {
    return normalized;
  }

  return null;
}

export function inferLeadSourceType(input: {
  sourceType?: unknown;
  sourceQuery?: unknown;
  businessType?: unknown;
  city?: unknown;
}): LeadSourceType | null {
  const explicitSourceType = normalizeLeadSourceType(input.sourceType);
  if (explicitSourceType) return explicitSourceType;

  const normalizedSourceQuery = typeof input.sourceQuery === "string" ? input.sourceQuery.trim().toLowerCase() : "";
  if (ADDED_SOURCE_QUERY_MARKERS.has(normalizedSourceQuery)) {
    return "ADDED";
  }
  if (normalizedSourceQuery) {
    return "SCRAPED";
  }

  const normalizedBusinessType = typeof input.businessType === "string" ? input.businessType.trim().toLowerCase() : "";
  const normalizedCity = typeof input.city === "string" ? input.city.trim().toLowerCase() : "";
  if (normalizedBusinessType === "manual" && normalizedCity === "unknown") {
    return "ADDED";
  }

  return null;
}

export function getLeadSourceType(lead: Pick<Lead, "sourceType" | "sourceQuery" | "businessType" | "city">): LeadSourceType | null {
  return inferLeadSourceType(lead);
}

export function getLeadCreatedAt(lead: Pick<Lead, "createdAt" | "updatedAt">): string | null {
  const candidate = typeof lead.createdAt === "string" && lead.createdAt.trim() ? lead.createdAt : lead.updatedAt;
  if (typeof candidate !== "string" || !candidate.trim()) return null;

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function isRecentLead(
  lead: Pick<Lead, "createdAt" | "updatedAt">,
  days = RECENT_LEAD_WINDOW_DAYS,
  now = new Date(),
) {
  const createdAt = getLeadCreatedAt(lead);
  if (!createdAt) return false;

  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return false;

  const windowMs = Math.max(days, 1) * 24 * 60 * 60 * 1000;
  return parsed.getTime() >= now.getTime() - windowMs;
}
