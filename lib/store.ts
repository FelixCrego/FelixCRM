import { dedupeKey } from "@/lib/utils";
import type { Lead, Script, ToneOfVoice, UserRole } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(supabaseUrl && supabaseServiceRoleKey);

const USERS_TABLE_CANDIDATES = ["User", "user"];
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
    closedDealValue: typeof (lead.sourcePayload ?? lead.source_payload)?.closedDealValue === "number" ? (lead.sourcePayload ?? lead.source_payload).closedDealValue : null,
    closedAt: typeof (lead.sourcePayload ?? lead.source_payload)?.closedAt === "string" ? (lead.sourcePayload ?? lead.source_payload).closedAt : null,
    stripeCheckoutLink: typeof (lead.sourcePayload ?? lead.source_payload)?.stripeCheckoutLink === "string" ? (lead.sourcePayload ?? lead.source_payload).stripeCheckoutLink : null,
    transferRequests: Array.isArray((lead.sourcePayload ?? lead.source_payload)?.transferRequests)
      ? (lead.sourcePayload ?? lead.source_payload).transferRequests.filter((request: any) =>
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

export async function listClaimableLeads(limit = 100) {
  if (!hasDb) throw new Error("Supabase environment variables are required to load leads.");
  const leads = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: "*",
    order: isSnakeLeadsTable(table) ? "updated_at.desc" : "updatedAt.desc",
    limit: String(limit),
  }));
  return leads.map(leadToMemory);
}

export async function createLead(ownerId: string, lead: { businessName: string; phone?: string | null; websiteUrl?: string | null }) {
  if (!hasDb) throw new Error("Supabase environment variables are required to insert leads.");

  const domain = lead.websiteUrl?.replace(/^https?:\/\//, "") ?? "";
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
          dedupe_key: dedupeKey(lead.businessName, "Unknown", "Manual", lead.phone ?? "", domain),
          status: "NEW",
          site_status: "UNBUILT",
          owner_id: ownerId,
          source_payload: {
            socialLinks: [],
            aiResearchSummary: null,
            sourceQuery: "manual_entry",
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
          dedupeKey: dedupeKey(lead.businessName, "Unknown", "Manual", lead.phone ?? "", domain),
          status: "NEW",
          siteStatus: "UNBUILT",
          ownerId,
          sourcePayload: {
            socialLinks: [],
            aiResearchSummary: null,
            sourceQuery: "manual_entry",
          },
        }),
  }));

  const created = payload[0];
  if (!created) throw new Error("Lead was not returned after insert.");
  return leadToMemory(created);
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
