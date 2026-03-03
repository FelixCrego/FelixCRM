import { dedupeKey } from "@/lib/utils";
import type { Lead, Script, ToneOfVoice, UserRole } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(supabaseUrl && supabaseServiceRoleKey);

const USERS_TABLE_CANDIDATES = ["User", "user"];
const LEADS_TABLE_CANDIDATES = ["leads", "lead", "Lead"];
const SCRIPTS_TABLE_CANDIDATES = ["Script", "script"];

const resolvedTableCache = new Map<string, string>();

const MOCK_USER = { id: "test-uuid-1", name: "Alex Rep", role: "REP" as UserRole };

type SupabaseError = { code?: string; message?: string };

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
    const payload = await response.json().catch(() => ({}));
    const error = new Error((payload as SupabaseError).message ?? `Supabase request failed: ${response.status}`) as Error & SupabaseError;
    error.code = (payload as SupabaseError).code;
    throw error;
  }

  if (response.status === 204) return [] as T;
  return response.json() as Promise<T>;
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

async function getSafeFirstUser() {
  if (!hasDb) return null;

  try {
    const rows = await withTableFallback("users", USERS_TABLE_CANDIDATES, (table) => supabaseRequest<any[]>(table, undefined, {
      select: "*",
      order: 'createdAt.asc',
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

function leadToMemory(lead: any): Lead {
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
    ownerId: lead.ownerId ?? lead.owner_id,
    updatedAt: new Date(lead.updatedAt ?? lead.updated_at).toISOString(),
    socialLinks: Array.isArray((lead.sourcePayload ?? lead.source_payload)?.socialLinks) ? (lead.sourcePayload ?? lead.source_payload).socialLinks : [],
    aiResearchSummary: typeof (lead.sourcePayload ?? lead.source_payload)?.aiResearchSummary === "string" ? (lead.sourcePayload ?? lead.source_payload).aiResearchSummary : null,
    sourceQuery: typeof (lead.sourcePayload ?? lead.source_payload)?.sourceQuery === "string" ? (lead.sourcePayload ?? lead.source_payload).sourceQuery : null,
  };
}

export async function getProfile() {
  const user = await getSafeFirstUser();

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

export async function saveProfile(profile: { niche: string; toneOfVoice: ToneOfVoice; calendarLink: string; onboardingCompleted: boolean; role: UserRole }) {
  if (!hasDb) return;

  try {
    const rows = await withTableFallback("users", USERS_TABLE_CANDIDATES, (table) => supabaseRequest<any[]>(table, undefined, { select: "id", order: "createdAt.asc", limit: "1" }));
    const user = rows[0];
    if (!user?.id) return;
    await withTableFallback("users", USERS_TABLE_CANDIDATES, (table) => supabaseRequest(table, { method: "PATCH", body: JSON.stringify(profile), headers: { Prefer: "return=minimal" } }, { id: `eq.${user.id}` }));
  } catch (error) {
    if (isMissingUserTableError(error)) {
      console.warn("[store] Skipping profile save because user table is unavailable.");
      return;
    }
    throw error;
  }
}

export async function listLeads() {
  if (!hasDb) throw new Error("Supabase environment variables are required to load leads.");
  const leads = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: "*",
    order: isSnakeLeadsTable(table) ? "updated_at.desc" : "updatedAt.desc",
  }));
  return leads.map(leadToMemory);
}

export async function insertLeads(leads: Omit<Lead, "id" | "updatedAt" | "status">[]) {
  if (!hasDb) throw new Error("Supabase environment variables are required to insert leads.");

  let inserted = 0;
  let duplicatesSkipped = 0;

  for (const lead of leads) {
    const domain = lead.websiteUrl?.replace(/^https?:\/\//, "") ?? "";
    const key = dedupeKey(lead.businessName, lead.city, lead.businessType, lead.phone ?? "", domain);
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
              status: "NEW",
              site_status: "UNBUILT",
              owner_id: null,
              source_payload: {
                socialLinks: lead.socialLinks ?? [],
                aiResearchSummary: lead.aiResearchSummary ?? null,
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
              status: "NEW",
              siteStatus: "UNBUILT",
              ownerId: null,
              sourcePayload: {
                socialLinks: lead.socialLinks ?? [],
                aiResearchSummary: lead.aiResearchSummary ?? null,
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
  await withLeadTableFallback((table) => supabaseRequest(table, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(isSnakeLeadsTable(table)
      ? {
          deployed_url: deployment.deployedUrl,
          site_status: deployment.siteStatus,
        }
      : {
          deployedUrl: deployment.deployedUrl,
          siteStatus: deployment.siteStatus,
          vercelDeploymentId: deployment.vercelDeploymentId,
        }),
  }, { [isSnakeLeadsTable(table) ? "id" : "id"]: `eq.${leadId}` }));
}

export async function saveScript(script: Omit<Script, "id" | "upvoteCount">) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save scripts.");

  let authorId = MOCK_USER.id;
  try {
    const rows = await withTableFallback("users", USERS_TABLE_CANDIDATES, (table) => supabaseRequest<any[]>(table, undefined, { select: "id", order: "createdAt.asc", limit: "1" }));
    authorId = rows[0]?.id ?? MOCK_USER.id;
  } catch (error) {
    if (!isMissingUserTableError(error)) throw error;
    console.warn("[store] Saving script with mock author because user table is unavailable.");
  }

  const profile = await getProfile();
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

export async function setLeadResearchSummary(leadId: string, summary: string) {
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
            aiResearchSummary: summary,
          },
        }
      : {
          sourcePayload: {
            ...payload,
            aiResearchSummary: summary,
          },
        }),
  }, { id: `eq.${leadId}` }));
}

export async function claimLeads(leadIds: string[], ownerId: string) {
  if (!leadIds.length) return 0;
  if (!hasDb) throw new Error("Supabase environment variables are required to claim leads.");

  const idFilter = `in.(${leadIds.join(",")})`;
  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(isSnakeLeadsTable(table) ? { owner_id: ownerId, status: "IN_PROGRESS" } : { ownerId, status: "IN_PROGRESS" }),
  }, { id: idFilter, select: "id" }));

  return rows.length;
}

export async function getLeadById(leadId: string) {
  const leads = await listLeads();
  return leads.find((lead) => lead.id === leadId);
}

export async function getCurrentUserId() {
  if (!hasDb) return MOCK_USER.id;

  try {
    const rows = await withTableFallback("users", USERS_TABLE_CANDIDATES, (table) => supabaseRequest<any[]>(table, undefined, { select: "id", order: "createdAt.asc", limit: "1" }));
    return rows[0]?.id ?? MOCK_USER.id;
  } catch (error) {
    if (isMissingUserTableError(error)) {
      console.warn("[store] Falling back to mock user id because user table is unavailable.");
      return MOCK_USER.id;
    }
    throw error;
  }
}
