import { dedupeKey } from "@/lib/utils";
import type { Lead, LeadEnrichmentPayload, LeadResearchStructuredPayload, Script, ToneOfVoice, UserRole } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(supabaseUrl && supabaseServiceRoleKey);

const USERS_TABLE_CANDIDATES = ["User", "user", "users"];
const LEADS_TABLE_CANDIDATES = ["leads", "lead", "Lead"];
const SCRIPTS_TABLE_CANDIDATES = ["Script", "script"];
const LEAD_NOTES_TABLE_CANDIDATES = ["lead_notes", "leadNotes", "LeadNotes"];

const resolvedTableCache = new Map<string, string>();

const MOCK_USER = { id: "test-uuid-1", name: "Alex Rep", role: "REP" as UserRole };

type SupabaseError = { code?: string; message?: string };

export type LeadNote = {
  id: string;
  leadId: string;
  contactId?: string | null;
  content: string;
  channel: string;
  createdAt: string;
};

export type LeadTask = {
  id: string;
  leadId: string;
  title: string;
  type: "CALLBACK" | "FOLLOW_UP" | "CHECK_IN" | "CUSTOM";
  reminderAt: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string | null;
};

function parseJsonSafely<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function buildUrl(table: string, query?: Record<string, string>) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function supabaseRequest<T>(table: string, init?: RequestInit, query?: Record<string, string>): Promise<T> {
  if (!hasDb) throw new Error("Supabase environment variables are required for database access.");

  const response = await fetch(buildUrl(table, query), {
    ...init,
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payloadText = await response.text();
    const payload = payloadText ? (parseJsonSafely<SupabaseError>(payloadText) ?? {}) : {};
    const error = new Error(payload.message ?? `Supabase request failed: ${response.status}`) as Error & SupabaseError;
    error.code = payload.code;
    throw error;
  }

  if (response.status === 204) return [] as T;

  const payloadText = await response.text();
  if (!payloadText.trim()) return undefined as T;

  const payload = parseJsonSafely<T>(payloadText);
  if (payload === null) {
    throw new Error(`Supabase response returned non-JSON payload with status ${response.status}.`);
  }
  return payload;
}

function isMissingTableError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as SupabaseError).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "42P01" || code === "PGRST205" || (message.includes("Could not find the table") && message.includes("schema cache"));
}

function isSchemaCacheColumnError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as SupabaseError).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "PGRST204" || (message.includes("Could not find the") && message.includes("column") && message.includes("schema cache"));
}

function isMissingColumnError(error: unknown, column: string) {
  const message = error instanceof Error ? error.message : String(error);
  return isSchemaCacheColumnError(error) && message.includes(`'${column}'`);
}

function getMissingColumnName(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

async function patchLeadDeploymentWithPayload(table: string, leadId: string, payload: Record<string, unknown>) {
  let currentPayload: Record<string, unknown> = { ...payload };

  while (Object.keys(currentPayload).length > 0) {
    try {
      return await supabaseRequest(table, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(currentPayload),
      }, { id: `eq.${leadId}` });
    } catch (error) {
      if (!isSchemaCacheColumnError(error)) throw error;
      const missingColumn = getMissingColumnName(error);
      if (!missingColumn || !(missingColumn in currentPayload)) throw error;
      const { [missingColumn]: _removed, ...nextPayload } = currentPayload;
      currentPayload = nextPayload;
    }
  }

  throw new Error("No compatible deployment columns found for the resolved leads table schema.");
}

async function withTableFallback<T>(cacheKey: string, candidates: string[], requester: (table: string) => Promise<T>): Promise<T> {
  const cached = resolvedTableCache.get(cacheKey);
  if (cached) return requester(cached);

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const result = await requester(candidate);
      resolvedTableCache.set(cacheKey, candidate);
      return result;
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
      lastError = error;
    }
  }

  throw lastError ?? new Error(`Unable to resolve Supabase table for ${cacheKey}`);
}

async function withLeadTableFallback<T>(requester: (table: string) => Promise<T>): Promise<T> {
  const cached = resolvedTableCache.get("leads");
  if (cached) {
    try {
      return await requester(cached);
    } catch (error) {
      if (!isMissingTableError(error) && !isSchemaCacheColumnError(error)) throw error;
      resolvedTableCache.delete("leads");
    }
  }

  let lastError: unknown = null;
  for (const candidate of LEADS_TABLE_CANDIDATES) {
    try {
      const result = await requester(candidate);
      resolvedTableCache.set("leads", candidate);
      return result;
    } catch (error) {
      if (!isMissingTableError(error) && !isSchemaCacheColumnError(error)) throw error;
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to resolve Supabase table for leads");
}

function isSnakeLeadsTable(table: string) {
  return table === "leads";
}

function isMissingUserTableError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as SupabaseError).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return isMissingTableError(error) || (message.includes("relation") && message.includes("User") && message.includes("does not exist"));
}

async function getSafeFirstUser(userId: string) {
  if (!hasDb) return null;

  try {
    const rows = await withTableFallback("users", USERS_TABLE_CANDIDATES, (table) => supabaseRequest<any[]>(table, undefined, {
      select: "*",
      id: `eq.${userId}`,
      limit: "1",
    }));
    return rows[0] ?? null;
  } catch (error) {
    if (isMissingUserTableError(error)) {
      console.warn("[store] Falling back to mock user because user table is unavailable.");
      return null;
    }
    throw error;
  }
}


function normalizeLeadResearchStructuredPayload(value: unknown, fallbackBusinessName: string, fallbackPhone?: string | null): LeadResearchStructuredPayload {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const socialInput = input.socialLinks && typeof input.socialLinks === "object" ? (input.socialLinks as Record<string, unknown>) : {};

  const socialLinks = Object.entries(socialInput).reduce<Record<string, string>>((acc, [key, socialValue]) => {
    if (typeof socialValue !== "string") return acc;
    const normalized = socialValue.trim();
    if (!normalized) return acc;
    acc[key] = normalized;
    return acc;
  }, {});

  const normalizeStringArray = (raw: unknown) => Array.isArray(raw) ? raw.map((item) => String(item).trim()).filter(Boolean) : [];
  const stringOrNull = (raw: unknown) => typeof raw === "string" && raw.trim() ? raw.trim() : null;

  const confidenceRaw = typeof input.confidence === "number" ? input.confidence : 0;
  const confidence = Math.min(1, Math.max(0, confidenceRaw));

  return {
    businessName: stringOrNull(input.businessName) ?? fallbackBusinessName,
    primaryPhone: stringOrNull(input.primaryPhone) ?? (fallbackPhone && fallbackPhone.trim() ? fallbackPhone.trim() : null),
    primaryEmail: stringOrNull(input.primaryEmail),
    logoUrl: stringOrNull(input.logoUrl),
    brandColors: normalizeStringArray(input.brandColors),
    socialLinks,
    heroCopy: stringOrNull(input.heroCopy),
    services: normalizeStringArray(input.services),
    trustSignals: normalizeStringArray(input.trustSignals),
    confidence,
    sources: normalizeStringArray(input.sources),
  };
}

function normalizeLeadEnrichmentPayload(value: unknown, fallbackBusinessName: string, fallbackPhone?: string | null): LeadEnrichmentPayload | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const summary = typeof input.summary === "string" && input.summary.trim() ? input.summary.trim() : null;
  const structured = normalizeLeadResearchStructuredPayload(input.structured, fallbackBusinessName, fallbackPhone);

  if (!summary && !structured.services.length && !structured.trustSignals.length && !structured.sources.length) {
    return null;
  }

  return {
    summary: summary ?? "Limited online footprint found.",
    structured,
  };
}

function leadToMemory(lead: any): Lead {
  const rawSourcePayload = lead.sourcePayload ?? lead.source_payload ?? {};
  const sourcePayload =
    rawSourcePayload && typeof rawSourcePayload === "object"
      ? (rawSourcePayload as Record<string, unknown>)
      : typeof rawSourcePayload === "string"
        ? (parseJsonSafely<Record<string, unknown>>(rawSourcePayload) ?? {})
        : {};
  const contactsFromPayload = Array.isArray(sourcePayload.contacts)
    ? sourcePayload.contacts
        .filter((contact: unknown) => contact && typeof contact === "object")
        .map((contact: any) => ({
          id: typeof contact.id === "string" && contact.id ? contact.id : crypto.randomUUID(),
          name: typeof contact.name === "string" && contact.name.trim() ? contact.name.trim() : "Untitled Contact",
          role: typeof contact.role === "string" ? contact.role.trim() : "",
          phones: Array.isArray(contact.phones) ? contact.phones.map((value: unknown) => String(value).trim()).filter(Boolean) : [],
          emails: Array.isArray(contact.emails) ? contact.emails.map((value: unknown) => String(value).trim()).filter(Boolean) : [],
        }))
    : [];
  const closedDealValueFromPayload =
    typeof sourcePayload.closedDealValue === "number"
      ? sourcePayload.closedDealValue
      : typeof sourcePayload.closed_deal_value === "number"
        ? sourcePayload.closed_deal_value
        : null;
  const closedAtFromPayload =
    typeof sourcePayload.closedAt === "string"
      ? sourcePayload.closedAt
      : typeof sourcePayload.closed_at === "string"
        ? sourcePayload.closed_at
        : null;
  const stripeCheckoutLinkFromPayload =
    typeof sourcePayload.stripeCheckoutLink === "string"
      ? sourcePayload.stripeCheckoutLink
      : typeof sourcePayload.stripe_checkout_link === "string"
        ? sourcePayload.stripe_checkout_link
        : null;

  return {
    id: lead.id,
    businessName: lead.businessName ?? lead.business_name,
    city: lead.city,
    businessType: lead.businessType ?? lead.business_type,
    phone: lead.phone,
    email: lead.email,
    websiteUrl: lead.websiteUrl ?? lead.website_url,
    websiteStatus: lead.websiteStatus ?? lead.website_status,
    status: lead.status,
    deployedUrl: lead.deployedUrl ?? lead.deployed_url,
    siteStatus: (lead.siteStatus ?? lead.site_status ?? "UNBUILT") as Lead["siteStatus"],
    vercelDeploymentId: typeof (lead.vercelDeploymentId ?? lead.vercel_deployment_id) === "string" ? (lead.vercelDeploymentId ?? lead.vercel_deployment_id) : null,
    ownerId: lead.ownerId ?? lead.owner_id,
    updatedAt: new Date(lead.updatedAt ?? lead.updated_at).toISOString(),
    socialLinks: Array.isArray(sourcePayload.socialLinks)
      ? sourcePayload.socialLinks
      : Array.isArray(sourcePayload.social_links)
        ? sourcePayload.social_links
        : [],
    aiResearchSummary:
      typeof sourcePayload.aiResearchSummary === "string"
        ? sourcePayload.aiResearchSummary
        : typeof sourcePayload.ai_research_summary === "string"
          ? sourcePayload.ai_research_summary
          : null,
    enrichment: normalizeLeadEnrichmentPayload(sourcePayload.enrichment, lead.businessName ?? lead.business_name, lead.phone),
    sourceQuery:
      typeof sourcePayload.sourceQuery === "string"
        ? sourcePayload.sourceQuery
        : typeof sourcePayload.source_query === "string"
          ? sourcePayload.source_query
          : null,
    contacts: contactsFromPayload,
    demoBooking:
      sourcePayload.demoBooking && typeof sourcePayload.demoBooking === "object"
        ? {
            date: typeof (sourcePayload.demoBooking as Record<string, unknown>).date === "string"
              ? (sourcePayload.demoBooking as Record<string, unknown>).date as string
              : undefined,
            time: typeof (sourcePayload.demoBooking as Record<string, unknown>).time === "string"
              ? (sourcePayload.demoBooking as Record<string, unknown>).time as string
              : undefined,
            timeZone: typeof (sourcePayload.demoBooking as Record<string, unknown>).timeZone === "string"
              ? (sourcePayload.demoBooking as Record<string, unknown>).timeZone as string
              : undefined,
            meetLink: typeof (sourcePayload.demoBooking as Record<string, unknown>).meetLink === "string"
              ? (sourcePayload.demoBooking as Record<string, unknown>).meetLink as string
              : undefined,
            bookedAt: typeof (sourcePayload.demoBooking as Record<string, unknown>).bookedAt === "string"
              ? (sourcePayload.demoBooking as Record<string, unknown>).bookedAt as string
              : undefined,
          }
        : null,
    closedDealValue:
      (typeof lead.closedDealValue === "number" ? lead.closedDealValue : null) ??
      (typeof lead.closed_deal_value === "number" ? lead.closed_deal_value : null) ??
      closedDealValueFromPayload,
    closedAt:
      (typeof lead.closedAt === "string" ? lead.closedAt : null) ??
      (typeof lead.closed_at === "string" ? lead.closed_at : null) ??
      closedAtFromPayload,
    stripeCheckoutLink:
      (typeof lead.stripeCheckoutLink === "string" ? lead.stripeCheckoutLink : null) ??
      (typeof lead.stripe_checkout_link === "string" ? lead.stripe_checkout_link : null) ??
      stripeCheckoutLinkFromPayload,
    transferRequests: Array.isArray(sourcePayload.transferRequests)
      ? sourcePayload.transferRequests.filter((request: any) =>
          request && typeof request.requesterId === "string" && typeof request.requestedAt === "string" && typeof request.status === "string",
        )
      : [],
  };
}

export async function getProfile(userId: string) {
  const user = await getSafeFirstUser(userId);

  if (!user) {
    return {
      niche: "",
      toneOfVoice: "CONSULTATIVE" as ToneOfVoice,
      calendarLink: "",
      onboardingCompleted: true,
      role: MOCK_USER.role,
    };
  }

  return {
    niche: user.niche ?? "",
    toneOfVoice: (user.toneOfVoice ?? "CONSULTATIVE") as ToneOfVoice,
    calendarLink: user.calendarLink ?? "",
    onboardingCompleted: user.onboardingCompleted,
    role: (user.role ?? "REP") as UserRole,
  };
}

export async function saveProfile(userId: string, profile: { niche: string; toneOfVoice: ToneOfVoice; calendarLink: string; onboardingCompleted: boolean; role: UserRole }) {
  if (!hasDb) return;

  try {
    await withTableFallback("users", USERS_TABLE_CANDIDATES, (table) => supabaseRequest(table, { method: "PATCH", body: JSON.stringify(profile), headers: { Prefer: "return=minimal" } }, { id: `eq.${userId}` }));
  } catch (error) {
    if (isMissingUserTableError(error)) {
      console.warn("[store] Skipping profile save because user table is unavailable.");
      return;
    }
    throw error;
  }
}

export async function listLeads(ownerId: string) {
  if (!hasDb) throw new Error("Supabase environment variables are required to load leads.");
  const leads = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: "*",
    [isSnakeLeadsTable(table) ? "owner_id" : "ownerId"]: `eq.${ownerId}`,
    order: isSnakeLeadsTable(table) ? "updated_at.desc" : "updatedAt.desc",
  }));
  return leads.map(leadToMemory);
}

export type ClaimedLeadCountByUser = {
  userId: string;
  userName: string;
  claimedLeads: number;
};

export async function listClaimedLeadCountsByUser(): Promise<ClaimedLeadCountByUser[]> {
  if (!hasDb) throw new Error("Supabase environment variables are required to load claimed lead counts.");

  const [users, leads] = await Promise.all([
    withTableFallback("users", USERS_TABLE_CANDIDATES, (table) =>
      supabaseRequest<any[]>(table, undefined, {
        select: "id,name,full_name,email,username",
      }),
    ),
    withLeadTableFallback((table) =>
      supabaseRequest<any[]>(table, undefined, {
        select: isSnakeLeadsTable(table) ? "owner_id" : "ownerId",
        [isSnakeLeadsTable(table) ? "owner_id" : "ownerId"]: "not.is.null",
      }),
    ),
  ]);

  const countsByUserId = new Map<string, number>();
  for (const lead of leads) {
    const ownerId = typeof lead.ownerId === "string" ? lead.ownerId : typeof lead.owner_id === "string" ? lead.owner_id : null;
    if (!ownerId) continue;
    countsByUserId.set(ownerId, (countsByUserId.get(ownerId) ?? 0) + 1);
  }

  const usersById = new Map<string, string>();
  for (const user of users) {
    if (typeof user.id !== "string") continue;
    const userName = [user.name, user.full_name, user.username, user.email].find((value) => typeof value === "string" && value.trim().length > 0);
    usersById.set(user.id, typeof userName === "string" ? userName : user.id);
  }

  return [...countsByUserId.entries()]
    .map(([userId, claimedLeads]) => ({
      userId,
      userName: usersById.get(userId) ?? userId,
      claimedLeads,
    }))
    .sort((a, b) => b.claimedLeads - a.claimedLeads || a.userName.localeCompare(b.userName));
}

export async function listClaimableLeads(limit = 100) {
  if (!hasDb) throw new Error("Supabase environment variables are required to load leads.");
  const leads = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: "*",
    order: isSnakeLeadsTable(table) ? "updated_at.desc" : "updatedAt.desc",
    limit: String(limit),
  }));
  return leads.map(leadToMemory);
}

type CreateLeadInput = { businessName: string; phone?: string | null; websiteUrl?: string | null; aiResearchSummary?: string | null; sourceQuery?: string | null };

export async function createOrMergeLead(ownerId: string, lead: CreateLeadInput, options?: { mergeOnDuplicate?: boolean }) {
  if (!hasDb) throw new Error("Supabase environment variables are required to insert leads.");

  const domain = lead.websiteUrl?.replace(/^https?:\/\//, "") ?? "";
  const computedDedupeKey = dedupeKey(lead.businessName, "Unknown", "Manual", lead.phone ?? "", domain);

  try {
    const payload = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(isSnakeLeadsTable(table)
        ? {
            business_name: lead.businessName,
            city: "Unknown",
            business_type: "Manual",
            phone: lead.phone ?? null,
            website_url: lead.websiteUrl ?? null,
            normalized_name: lead.businessName.toLowerCase(),
            normalized_phone: lead.phone?.replace(/\D/g, "") ?? null,
            normalized_domain: domain.toLowerCase(),
            dedupe_key: computedDedupeKey,
            status: "NEW",
            site_status: "UNBUILT",
            owner_id: ownerId,
            source_payload: {
              socialLinks: [],
              aiResearchSummary: lead.aiResearchSummary ?? null,
              enrichment: null,
              sourceQuery: lead.sourceQuery ?? "manual_entry",
            },
          }
        : {
            businessName: lead.businessName,
            city: "Unknown",
            businessType: "Manual",
            phone: lead.phone ?? null,
            websiteUrl: lead.websiteUrl ?? null,
            normalizedName: lead.businessName.toLowerCase(),
            normalizedPhone: lead.phone?.replace(/\D/g, "") ?? null,
            normalizedDomain: domain.toLowerCase(),
            dedupeKey: computedDedupeKey,
            status: "NEW",
            siteStatus: "UNBUILT",
            ownerId,
            sourcePayload: {
              socialLinks: [],
              aiResearchSummary: lead.aiResearchSummary ?? null,
              enrichment: null,
              sourceQuery: lead.sourceQuery ?? "manual_entry",
            },
          }),
    }));

    const created = payload[0];
    if (!created) throw new Error("Lead was not returned after insert.");
    return { lead: leadToMemory(created), merged: false };
  } catch (error) {
    if (!(options?.mergeOnDuplicate) || typeof error !== "object" || !error || !("code" in error) || (error as SupabaseError).code !== "23505") {
      throw error;
    }

    const mergedLead = await withLeadTableFallback(async (table) => {
      const dedupeColumn = isSnakeLeadsTable(table) ? "dedupe_key" : "dedupeKey";
      const payloadColumn = isSnakeLeadsTable(table) ? "source_payload" : "sourcePayload";
      const rows = await supabaseRequest<any[]>(table, undefined, {
        select: "*",
        [dedupeColumn]: `eq.${computedDedupeKey}`,
        limit: "1",
      });

      const existing = rows[0];
      if (!existing) throw error;

      const existingPayload = existing[payloadColumn] && typeof existing[payloadColumn] === "object" ? existing[payloadColumn] as Record<string, unknown> : {};
      const patchPayload = isSnakeLeadsTable(table)
        ? {
            ...(existing.owner_id ? {} : { owner_id: ownerId }),
            phone: existing.phone ?? lead.phone ?? null,
            website_url: existing.website_url ?? lead.websiteUrl ?? null,
            source_payload: {
              ...existingPayload,
              aiResearchSummary: typeof existingPayload.aiResearchSummary === "string" && existingPayload.aiResearchSummary.trim()
                ? existingPayload.aiResearchSummary
                : lead.aiResearchSummary ?? null,
              sourceQuery: typeof existingPayload.sourceQuery === "string" && existingPayload.sourceQuery.trim()
                ? existingPayload.sourceQuery
                : lead.sourceQuery ?? "csv_import",
            },
          }
        : {
            ...(existing.ownerId ? {} : { ownerId }),
            phone: existing.phone ?? lead.phone ?? null,
            websiteUrl: existing.websiteUrl ?? lead.websiteUrl ?? null,
            sourcePayload: {
              ...existingPayload,
              aiResearchSummary: typeof existingPayload.aiResearchSummary === "string" && existingPayload.aiResearchSummary.trim()
                ? existingPayload.aiResearchSummary
                : lead.aiResearchSummary ?? null,
              sourceQuery: typeof existingPayload.sourceQuery === "string" && existingPayload.sourceQuery.trim()
                ? existingPayload.sourceQuery
                : lead.sourceQuery ?? "csv_import",
            },
          };

      const mergedRows = await supabaseRequest<any[]>(table, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patchPayload),
      }, {
        id: `eq.${existing.id}`,
        select: "*",
      });

      return mergedRows[0] ?? existing;
    });

    return { lead: leadToMemory(mergedLead), merged: true };
  }
}

export async function createLead(ownerId: string, lead: CreateLeadInput) {
  const result = await createOrMergeLead(ownerId, lead, { mergeOnDuplicate: false });
  return result.lead;
}

export async function insertLeads(ownerId: string, leads: Omit<Lead, "id" | "updatedAt" | "status">[]) {
  if (!hasDb) throw new Error("Supabase environment variables are required to insert leads.");

  let inserted = 0;
  let duplicatesSkipped = 0;

  for (const lead of leads) {
    const domain = lead.websiteUrl?.replace(/^https?:\/\//, "") ?? "";
    const rawKey = dedupeKey(lead.businessName, lead.city, lead.businessType, lead.phone ?? "", domain);
    const key = rawKey;
    try {
      await withLeadTableFallback((table) => supabaseRequest(table, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(isSnakeLeadsTable(table)
          ? {
              business_name: lead.businessName,
              city: lead.city,
              business_type: lead.businessType,
              phone: lead.phone,
              email: lead.email,
              website_url: lead.websiteUrl,
              website_status: lead.websiteStatus,
              normalized_name: lead.businessName.toLowerCase(),
              normalized_phone: lead.phone?.replace(/\D/g, "") ?? null,
              normalized_domain: domain.toLowerCase(),
              dedupe_key: key,
              status: "IN_PROGRESS",
              site_status: "UNBUILT",
              owner_id: ownerId,
              source_payload: {
                socialLinks: lead.socialLinks ?? [],
                aiResearchSummary: lead.aiResearchSummary ?? null,
                enrichment: lead.enrichment ?? null,
                sourceQuery: lead.sourceQuery ?? null,
              },
            }
          : {
              businessName: lead.businessName,
              city: lead.city,
              businessType: lead.businessType,
              phone: lead.phone,
              email: lead.email,
              websiteUrl: lead.websiteUrl,
              websiteStatus: lead.websiteStatus,
              normalizedName: lead.businessName.toLowerCase(),
              normalizedPhone: lead.phone?.replace(/\D/g, "") ?? null,
              normalizedDomain: domain.toLowerCase(),
              dedupeKey: key,
              status: "IN_PROGRESS",
              siteStatus: "UNBUILT",
              ownerId,
              sourcePayload: {
                socialLinks: lead.socialLinks ?? [],
                aiResearchSummary: lead.aiResearchSummary ?? null,
                enrichment: lead.enrichment ?? null,
                sourceQuery: lead.sourceQuery ?? null,
              },
            }),
      }));
      inserted++;
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && (error as SupabaseError).code === "23505") {
        duplicatesSkipped += 1;
        continue;
      }
      throw error;
    }
  }

  console.info("[insertLeads] db path used", { dbPathUsed: true, inserted, duplicatesSkipped });
  return inserted;
}

export async function setLeadDeployment(leadId: string, deployment: { deployedUrl?: string; siteStatus: "BUILDING" | "LIVE" | "FAILED"; vercelDeploymentId?: string }) {
  if (!hasDb) throw new Error("Supabase environment variables are required to update lead deployment.");

  const snakePayload = {
    deployed_url: deployment.deployedUrl,
    site_status: deployment.siteStatus,
    vercel_deployment_id: deployment.vercelDeploymentId,
  };
  const camelPayload = {
    deployedUrl: deployment.deployedUrl,
    siteStatus: deployment.siteStatus,
    vercelDeploymentId: deployment.vercelDeploymentId,
  };

  await withLeadTableFallback(async (table) => {
    const preferredPayload = isSnakeLeadsTable(table) ? snakePayload : camelPayload;
    const fallbackPayload = isSnakeLeadsTable(table) ? camelPayload : snakePayload;

    try {
      return await patchLeadDeploymentWithPayload(table, leadId, preferredPayload);
    } catch (error) {
      if (!isSchemaCacheColumnError(error)) throw error;
      return patchLeadDeploymentWithPayload(table, leadId, fallbackPayload);
    }
  });
}

export async function saveScript(ownerId: string, script: Omit<Script, "id" | "upvoteCount">) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save scripts.");

  const authorId = ownerId || MOCK_USER.id;
  const profile = await getProfile(authorId);
  const rows = await withTableFallback("scripts", SCRIPTS_TABLE_CANDIDATES, (table) => supabaseRequest<any[]>(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      content: script.content,
      type: script.type,
      leadId: script.leadId ?? null,
      authorId,
      toneUsed: profile.toneOfVoice,
      modelName: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      promptVersion: "v1",
    }),
  }, { select: "id,content,type,upvoteCount,leadId" }));

  const row = rows[0];
  return { id: row.id, content: row.content, type: row.type as Script["type"], upvoteCount: row.upvoteCount, leadId: row.leadId ?? undefined };
}

export async function listScripts() {
  if (!hasDb) throw new Error("Supabase environment variables are required to list scripts.");
  const rows = await withTableFallback("scripts", SCRIPTS_TABLE_CANDIDATES, (table) => supabaseRequest<any[]>(table, undefined, {
    select: "id,content,type,upvoteCount,leadId",
    isShared: "eq.true",
    order: "upvoteCount.desc,createdAt.desc",
  }));
  return rows.map((row) => ({ id: row.id, content: row.content, type: row.type as Script["type"], upvoteCount: row.upvoteCount, leadId: row.leadId ?? undefined }));
}

export async function upvoteScript(scriptId: string) {
  if (!hasDb) throw new Error("Supabase environment variables are required to upvote scripts.");

  const rows = await withTableFallback("scripts", SCRIPTS_TABLE_CANDIDATES, (table) => supabaseRequest<any[]>(table, undefined, { select: "upvoteCount", id: `eq.${scriptId}`, limit: "1" }));
  const currentCount = rows[0]?.upvoteCount ?? 0;

  await withTableFallback("scripts", SCRIPTS_TABLE_CANDIDATES, (table) => supabaseRequest(table, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ upvoteCount: currentCount + 1 }),
  }, { id: `eq.${scriptId}` }));
}

export async function releaseStaleLeads() {
  if (!hasDb) throw new Error("Supabase environment variables are required to release stale leads.");

  await withLeadTableFallback((table) => supabaseRequest(table, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(isSnakeLeadsTable(table) ? { owner_id: null } : { ownerId: null }),
  }, {
    [isSnakeLeadsTable(table) ? "owner_id" : "ownerId"]: "not.is.null",
    status: "not.in.(IN_PROGRESS,CLOSED)",
    [isSnakeLeadsTable(table) ? "updated_at" : "updatedAt"]: `lt.${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}`,
  }));
}

export async function setLeadResearchSummary(leadId: string, research: LeadEnrichmentPayload) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save lead research.");

  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "source_payload" : "sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));
  const existing = rows[0];
  const existingPayload = existing?.sourcePayload ?? existing?.source_payload;
  const payload = existingPayload && typeof existingPayload === "object" ? existingPayload as Record<string, unknown> : {};

  await withLeadTableFallback((table) => supabaseRequest(table, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(isSnakeLeadsTable(table)
      ? {
          source_payload: {
            ...payload,
            aiResearchSummary: research.summary,
            enrichment: research,
          },
        }
      : {
          sourcePayload: {
            ...payload,
            aiResearchSummary: research.summary,
            enrichment: research,
          },
        }),
  }, { id: `eq.${leadId}` }));
}


export type LeadContactRecord = {
  id: string;
  name: string;
  role?: string;
  phones: string[];
  emails: string[];
};

export async function closeLeadDeal(params: { leadId: string; ownerId: string; closedDealValue: number; stripeCheckoutLink?: string | null }) {
  if (!hasDb) throw new Error("Supabase environment variables are required to close deals.");

  const { leadId, ownerId, closedDealValue, stripeCheckoutLink } = params;
  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,owner_id,source_payload" : "id,ownerId,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const leadOwnerId = lead.owner_id ?? lead.ownerId ?? null;
  if (leadOwnerId && leadOwnerId !== ownerId) throw new Error("Forbidden");

  const sourcePayload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;
  const closedAt = new Date().toISOString();

  const updatedRows = await withLeadTableFallback((table) => {
    const ownerColumn = isSnakeLeadsTable(table) ? "owner_id" : "ownerId";
    const sourcePayloadColumn = isSnakeLeadsTable(table) ? "source_payload" : "sourcePayload";
    const filters = {
      id: `eq.${leadId}`,
      select: "id",
      ...(leadOwnerId ? { [ownerColumn]: `eq.${ownerId}` } : {}),
    } as Record<string, string>;

    const fullPayload = isSnakeLeadsTable(table)
      ? {
          status: "CLOSED",
          owner_id: ownerId,
          source_payload: {
            ...sourcePayload,
            closedDealValue,
            closedAt,
            stripeCheckoutLink: stripeCheckoutLink ?? null,
          },
        }
      : {
          status: "CLOSED",
          ownerId,
          sourcePayload: {
            ...sourcePayload,
            closedDealValue,
            closedAt,
            stripeCheckoutLink: stripeCheckoutLink ?? null,
          },
        };

    return supabaseRequest<any[]>(table, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(fullPayload),
    }, filters).catch((error) => {
      if (!isMissingColumnError(error, sourcePayloadColumn)) throw error;

      return supabaseRequest<any[]>(table, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(isSnakeLeadsTable(table) ? { status: "CLOSED", owner_id: ownerId } : { status: "CLOSED", ownerId }),
      }, filters);
    });
  });

  if (!updatedRows.length) {
    throw new Error("Unable to close this lead.");
  }

  return {
    closedAt,
    closedDealValue,
    stripeCheckoutLink: stripeCheckoutLink ?? null,
  };
}

function normalizeLeadContactsInput(contacts: LeadContactRecord[]): LeadContactRecord[] {
  return contacts
    .filter((contact) => contact && typeof contact === "object")
    .map((contact) => ({
      id: typeof contact.id === "string" && contact.id ? contact.id : crypto.randomUUID(),
      name: typeof contact.name === "string" && contact.name.trim() ? contact.name.trim() : "Untitled Contact",
      role: typeof contact.role === "string" ? contact.role.trim() : "",
      phones: Array.isArray(contact.phones) ? contact.phones.map((value) => String(value).trim()).filter(Boolean) : [],
      emails: Array.isArray(contact.emails) ? contact.emails.map((value) => String(value).trim()).filter(Boolean) : [],
    }));
}

export async function setLeadContacts(leadId: string, ownerId: string, contacts: LeadContactRecord[]) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save lead contacts.");

  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,owner_id,source_payload" : "id,ownerId,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const leadOwnerId = lead.owner_id ?? lead.ownerId ?? null;
  if (leadOwnerId && leadOwnerId !== ownerId) {
    throw new Error("Forbidden");
  }

  const payload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;
  const nextContacts = normalizeLeadContactsInput(contacts);

  await withLeadTableFallback((table) => supabaseRequest(table, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(isSnakeLeadsTable(table)
      ? { source_payload: { ...payload, contacts: nextContacts } }
      : { sourcePayload: { ...payload, contacts: nextContacts } }),
  }, { id: `eq.${leadId}` }));

  return nextContacts;
}

export async function claimLeads(leadIds: string[], ownerId: string) {
  if (!leadIds.length) return { claimed: 0, alreadyOwnedByYou: 0, claimedByOthers: 0, missing: 0 };
  if (!hasDb) throw new Error("Supabase environment variables are required to claim leads.");

  const idFilter = `in.(${leadIds.join(",")})`;

  const existing = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,owner_id" : "id,ownerId",
    id: idFilter,
  }));

  const ownableLeadIds: string[] = [];
  let alreadyOwnedByYou = 0;
  let claimedByOthers = 0;

  for (const lead of existing) {
    const leadOwnerId = lead.ownerId ?? lead.owner_id ?? null;
    if (!leadOwnerId) {
      ownableLeadIds.push(lead.id);
      continue;
    }
    if (leadOwnerId === ownerId) {
      alreadyOwnedByYou += 1;
      continue;
    }
    claimedByOthers += 1;
  }

  let claimed = 0;
  if (ownableLeadIds.length) {
    const ownableIdFilter = `in.(${ownableLeadIds.join(",")})`;
    const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(isSnakeLeadsTable(table) ? { owner_id: ownerId, status: "IN_PROGRESS" } : { ownerId, status: "IN_PROGRESS" }),
    }, {
      id: ownableIdFilter,
      [isSnakeLeadsTable(table) ? "owner_id" : "ownerId"]: "is.null",
      select: "id",
    }));
    claimed = rows.length;
  }

  const missing = leadIds.length - existing.length;
  return { claimed, alreadyOwnedByYou, claimedByOthers, missing };
}

export async function deleteLeads(leadIds: string[], userId: string) {
  if (!leadIds.length) return { deleted: 0, forbidden: 0, missing: 0 };
  if (!hasDb) throw new Error("Supabase environment variables are required to delete leads.");

  const idFilter = `in.(${leadIds.join(",")})`;
  const existing = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,owner_id" : "id,ownerId",
    id: idFilter,
  }));

  const deletableLeadIds: string[] = [];
  let forbidden = 0;

  for (const lead of existing) {
    const leadOwnerId = lead.ownerId ?? lead.owner_id ?? null;
    if (!leadOwnerId || leadOwnerId === userId) {
      deletableLeadIds.push(lead.id);
      continue;
    }
    forbidden += 1;
  }

  let deleted = 0;
  if (deletableLeadIds.length) {
    const deletableIdFilter = `in.(${deletableLeadIds.join(",")})`;
    const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    }, {
      id: deletableIdFilter,
      select: "id",
    }));
    deleted = rows.length;
  }

  const missing = leadIds.length - existing.length;
  return { deleted, forbidden, missing };
}

export async function requestLeadOwnershipTransfer(leadId: string, requesterId: string) {
  if (!hasDb) throw new Error("Supabase environment variables are required to request transfer.");

  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,owner_id,source_payload" : "id,ownerId,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const currentOwnerId = lead.ownerId ?? lead.owner_id ?? null;
  if (!currentOwnerId) throw new Error("Lead is not currently claimed; claim it directly.");
  if (currentOwnerId === requesterId) throw new Error("You already own this lead.");

  const payload = (lead.sourcePayload ?? lead.source_payload ?? {}) as Record<string, unknown>;
  const existingRequests = Array.isArray(payload.transferRequests) ? payload.transferRequests as any[] : [];

  const alreadyRequested = existingRequests.some((request) =>
    request && request.requesterId === requesterId && request.status === "PENDING",
  );

  if (alreadyRequested) {
    return { requested: false, reason: "ALREADY_REQUESTED" as const };
  }

  const nextRequests = [
    ...existingRequests,
    {
      requesterId,
      requestedAt: new Date().toISOString(),
      status: "PENDING",
    },
  ];

  await withLeadTableFallback((table) => supabaseRequest(table, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(isSnakeLeadsTable(table)
      ? {
          source_payload: {
            ...payload,
            transferRequests: nextRequests,
          },
        }
      : {
          sourcePayload: {
            ...payload,
            transferRequests: nextRequests,
          },
        }),
  }, { id: `eq.${leadId}` }));

  return { requested: true as const, reason: null };
}

export async function getLeadById(leadId: string, ownerId: string) {
  const leads = await listLeads(ownerId);
  return leads.find((lead) => lead.id === leadId);
}

function normalizeLeadNote(row: any): LeadNote {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    leadId: String(row.lead_id ?? row.leadId ?? ""),
    content: String(row.content ?? row.note ?? ""),
    channel: String(row.channel ?? "notes"),
    contactId: row.contact_id ?? row.contactId ?? null,
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
  };
}

async function listLeadNotesFromPayload(leadId: string): Promise<LeadNote[]> {
  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,source_payload" : "id,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) return [];

  const payload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  return notes
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeLeadNote(item))
    .filter((note) => note.leadId === leadId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mergeLeadNotes(primary: LeadNote[], fallback: LeadNote[]): LeadNote[] {
  const seen = new Set<string>();
  const merged: LeadNote[] = [];

  for (const note of [...primary, ...fallback]) {
    const key = `${note.id}|${note.createdAt}|${note.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(note);
  }

  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
}

async function appendLeadNoteToPayload(leadId: string, note: Pick<LeadNote, "leadId" | "content" | "channel" | "contactId"> & Partial<Pick<LeadNote, "id" | "createdAt">>): Promise<LeadNote> {
  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,source_payload" : "id,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const payload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;
  const existingNotes = Array.isArray(payload.notes) ? payload.notes : [];
  const created: LeadNote = {
    id: note.id ?? crypto.randomUUID(),
    leadId,
    content: note.content,
    channel: note.channel,
    contactId: note.contactId ?? null,
    createdAt: note.createdAt ?? new Date().toISOString(),
  };

  const nextNotes = [created, ...existingNotes].slice(0, 50);
  await withLeadTableFallback((table) => supabaseRequest(table, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(isSnakeLeadsTable(table)
      ? { source_payload: { ...payload, notes: nextNotes } }
      : { sourcePayload: { ...payload, notes: nextNotes } }),
  }, { id: `eq.${leadId}` }));

  return created;
}

export async function listLeadNotes(leadId: string): Promise<LeadNote[]> {
  if (!hasDb) throw new Error("Supabase environment variables are required to load lead notes.");

  const payloadNotes = await listLeadNotesFromPayload(leadId);

  try {
    const rows = await withTableFallback("lead_notes", LEAD_NOTES_TABLE_CANDIDATES, (table) =>
      supabaseRequest<any[]>(table, undefined, {
        select: "*",
        lead_id: `eq.${leadId}`,
        order: "created_at.desc",
        limit: "50",
      }),
    );
    return mergeLeadNotes(rows.map(normalizeLeadNote), payloadNotes);
  } catch (error) {
    if (isSchemaCacheColumnError(error)) {
      try {
        const rows = await withTableFallback("lead_notes", LEAD_NOTES_TABLE_CANDIDATES, (table) =>
          supabaseRequest<any[]>(table, undefined, {
            select: "*",
            leadId: `eq.${leadId}`,
            order: "createdAt.desc",
            limit: "50",
          }),
        );
        return mergeLeadNotes(rows.map(normalizeLeadNote), payloadNotes);
      } catch {
        return payloadNotes;
      }
    }
    if (isMissingTableError(error)) {
      return payloadNotes;
    }
    throw error;
  }
}

export async function createLeadNote(leadId: string, content: string, channel: string, contactId: string | null = null): Promise<LeadNote> {
  if (!hasDb) throw new Error("Supabase environment variables are required to save lead notes.");

  const cleanContent = content.trim();
  if (!cleanContent) throw new Error("Note content is required.");
  const createdAt = new Date().toISOString();

  const insertNote = async (record: Record<string, unknown>) => {
    const rows = await withTableFallback("lead_notes", LEAD_NOTES_TABLE_CANDIDATES, (table) =>
      supabaseRequest<any[]>(table, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([record]),
      }),
    );

    if (!rows[0]) {
      throw new Error("Failed to create note.");
    }

    return normalizeLeadNote(rows[0]);
  };

  try {
    const created = await insertNote({
      lead_id: leadId,
      content: cleanContent,
      channel,
      contact_id: contactId,
      created_at: createdAt,
    });
    await appendLeadNoteToPayload(leadId, created);
    return created;
  } catch (snakeError) {
    if (!isSchemaCacheColumnError(snakeError)) {
      if (isMissingTableError(snakeError)) {
        return appendLeadNoteToPayload(leadId, { leadId, content: cleanContent, channel, contactId });
      }
      throw snakeError;
    }

    const snakeWithoutChannel = {
      lead_id: leadId,
      content: cleanContent,
      contact_id: contactId,
      created_at: createdAt,
    };

    try {
      if (isMissingColumnError(snakeError, "channel")) {
        const created = await insertNote(snakeWithoutChannel);
        await appendLeadNoteToPayload(leadId, created);
        return created;
      }

      const created = await insertNote({
        leadId,
        content: cleanContent,
        channel,
        contactId,
        createdAt,
      });
      await appendLeadNoteToPayload(leadId, created);
      return created;
    } catch (camelError) {
      if (isSchemaCacheColumnError(camelError) && isMissingColumnError(camelError, "channel")) {
        try {
          const created = await insertNote({
            leadId,
            content: cleanContent,
            contactId,
            createdAt,
          });
          await appendLeadNoteToPayload(leadId, created);
          return created;
        } catch {
          return appendLeadNoteToPayload(leadId, { leadId, content: cleanContent, channel, contactId });
        }
      }

      if (isMissingTableError(camelError) || isSchemaCacheColumnError(camelError)) {
        return appendLeadNoteToPayload(leadId, { leadId, content: cleanContent, channel, contactId });
      }

      throw camelError;
    }
  }
}

function normalizeLeadTask(row: any): LeadTask {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    leadId: String(row.leadId ?? row.lead_id ?? ""),
    title: String(row.title ?? "Follow up"),
    type: (row.type === "CALLBACK" || row.type === "FOLLOW_UP" || row.type === "CHECK_IN" ? row.type : "CUSTOM") as LeadTask["type"],
    reminderAt: String(row.reminderAt ?? row.reminder_at ?? new Date().toISOString()),
    completed: Boolean(row.completed),
    createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
    completedAt: typeof row.completedAt === "string"
      ? row.completedAt
      : typeof row.completed_at === "string"
        ? row.completed_at
        : null,
  };
}

export async function listLeadTasks(leadId: string): Promise<LeadTask[]> {
  if (!hasDb) throw new Error("Supabase environment variables are required to load lead tasks.");

  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,source_payload" : "id,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) return [];

  const payload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];

  return tasks
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeLeadTask(item))
    .filter((task) => task.leadId === leadId)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || a.reminderAt.localeCompare(b.reminderAt));
}

export async function createLeadTask(
  leadId: string,
  input: Pick<LeadTask, "title" | "type" | "reminderAt">,
): Promise<LeadTask> {
  if (!hasDb) throw new Error("Supabase environment variables are required to save lead tasks.");

  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,source_payload" : "id,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const payload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;
  const existingTasks = Array.isArray(payload.tasks) ? payload.tasks : [];

  const created: LeadTask = {
    id: crypto.randomUUID(),
    leadId,
    title: input.title.trim(),
    type: input.type,
    reminderAt: input.reminderAt,
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  const nextTasks = [created, ...existingTasks].slice(0, 100);
  await withLeadTableFallback((table) => supabaseRequest(table, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(isSnakeLeadsTable(table)
      ? { source_payload: { ...payload, tasks: nextTasks } }
      : { sourcePayload: { ...payload, tasks: nextTasks } }),
  }, { id: `eq.${leadId}` }));

  return created;
}

export async function setLeadTaskCompleted(leadId: string, taskId: string, completed: boolean): Promise<LeadTask> {
  if (!hasDb) throw new Error("Supabase environment variables are required to update lead tasks.");

  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,source_payload" : "id,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const payload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;
  const existingTasks = Array.isArray(payload.tasks) ? payload.tasks.map((task) => normalizeLeadTask(task)) : [];
  const index = existingTasks.findIndex((task) => task.id === taskId);
  if (index < 0) throw new Error("Task not found.");

  const updated: LeadTask = {
    ...existingTasks[index],
    completed,
    completedAt: completed ? new Date().toISOString() : null,
  };
  existingTasks[index] = updated;

  await withLeadTableFallback((table) => supabaseRequest(table, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(isSnakeLeadsTable(table)
      ? { source_payload: { ...payload, tasks: existingTasks } }
      : { sourcePayload: { ...payload, tasks: existingTasks } }),
  }, { id: `eq.${leadId}` }));

  return updated;
}
