import { sanitizeContactLensNoteContent } from "@/lib/contact-lens";
import {
  getTrainingBucketFromChannel,
  type TrainingTapeBucket,
} from "@/lib/lead-note-channels";
import { listLeadNotes, type LeadNote } from "@/lib/store";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LEADS_TABLE_CANDIDATES = ["leads", "lead", "Lead"];

export type LeadNoteWithMetadata = LeadNote & {
  targetUserId?: string | null;
  targetUserName?: string | null;
  requiresAcknowledgement?: boolean;
  acknowledgedAt?: string | null;
  acknowledgedByUserId?: string | null;
  acknowledgedByName?: string | null;
  createdByUserId?: string | null;
  createdByName?: string | null;
  trainingBucket?: TrainingTapeBucket | null;
  taggedUserId?: string | null;
  taggedUserName?: string | null;
};

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return false;
}

function normalizePayloadNote(row: any): LeadNoteWithMetadata {
  const channel = String(row.channel ?? "notes");
  return {
    id: String(row.id ?? crypto.randomUUID()),
    leadId: String(row.lead_id ?? row.leadId ?? ""),
    content: sanitizeContactLensNoteContent(String(row.content ?? row.note ?? "")),
    channel,
    contactId: row.contact_id ?? row.contactId ?? null,
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    targetUserId: normalizeOptionalString(row.target_user_id ?? row.targetUserId),
    targetUserName: normalizeOptionalString(row.target_user_name ?? row.targetUserName),
    requiresAcknowledgement: normalizeOptionalBoolean(row.requires_acknowledgement ?? row.requiresAcknowledgement),
    acknowledgedAt: normalizeOptionalString(row.acknowledged_at ?? row.acknowledgedAt),
    acknowledgedByUserId: normalizeOptionalString(row.acknowledged_by_user_id ?? row.acknowledgedByUserId),
    acknowledgedByName: normalizeOptionalString(row.acknowledged_by_name ?? row.acknowledgedByName),
    createdByUserId: normalizeOptionalString(row.created_by_user_id ?? row.createdByUserId),
    createdByName: normalizeOptionalString(row.created_by_name ?? row.createdByName),
    trainingBucket:
      getTrainingBucketFromChannel(channel) ??
      (normalizeOptionalString(row.training_bucket ?? row.trainingBucket) as TrainingTapeBucket | null),
    taggedUserId: normalizeOptionalString(row.tagged_user_id ?? row.taggedUserId),
    taggedUserName: normalizeOptionalString(row.tagged_user_name ?? row.taggedUserName),
  };
}

function getHeaders() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase environment variables are required for lead note metadata.");
  }

  return {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function buildLeadUrl(table: string, query?: Record<string, string>) {
  if (!supabaseUrl) {
    throw new Error("Supabase URL is missing.");
  }

  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function requestLeadTable<T>(query?: Record<string, string>) {
  let lastError: unknown = null;

  for (const table of LEADS_TABLE_CANDIDATES) {
    const response = await fetch(buildLeadUrl(table, query), {
      headers: getHeaders(),
      cache: "no-store",
    });

    if (response.ok) {
      return {
        table,
        rows: (await response.json()) as T,
      };
    }

    const text = await response.text();
    if (response.status === 404 || text.includes("schema cache") || text.includes("Could not find the table")) {
      lastError = new Error(text || `Unable to resolve lead table ${table}.`);
      continue;
    }

    throw new Error(text || `Lead metadata query failed for ${table}.`);
  }

  throw lastError ?? new Error("Unable to resolve lead table.");
}

function shouldTryNextLeadTable(status: number, text: string) {
  return status === 404 || text.includes("schema cache") || text.includes("Could not find the table");
}

function shouldTryAlternatePayloadColumn(text: string, payloadColumn: "source_payload" | "sourcePayload") {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("42703") ||
    normalized.includes(`column leads.${payloadColumn}`.toLowerCase()) ||
    normalized.includes(`column ${payloadColumn}`.toLowerCase()) ||
    normalized.includes(`"${payloadColumn.toLowerCase()}"`) ||
    normalized.includes("does not exist")
  );
}

async function patchLeadPayload(
  table: string,
  leadId: string,
  payload: Record<string, unknown>,
  payloadColumn: "source_payload" | "sourcePayload",
) {
  const response = await fetch(buildLeadUrl(table, { id: `eq.${leadId}` }), {
    method: "PATCH",
    headers: {
      ...getHeaders(),
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ [payloadColumn]: payload }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Unable to update lead note metadata.");
  }
}

async function loadLeadPayloadNotes(leadId: string) {
  let lastError: unknown = null;

  for (const table of LEADS_TABLE_CANDIDATES) {
    for (const payloadColumn of ["source_payload", "sourcePayload"] as const) {
      const response = await fetch(buildLeadUrl(table, {
        select: `id,${payloadColumn}`,
        id: `eq.${leadId}`,
        limit: "1",
      }), {
        headers: getHeaders(),
        cache: "no-store",
      });

      if (response.ok) {
        const rows = (await response.json()) as any[];
        const lead = rows[0];
        if (!lead) {
          throw new Error("Lead not found.");
        }

        const payload = (lead[payloadColumn] ?? {}) as Record<string, unknown>;
        const rawNotes = Array.isArray(payload.notes) ? payload.notes : [];
        const normalizedNotes = rawNotes
          .filter((item) => item && typeof item === "object")
          .map((item) => normalizePayloadNote(item));

        return { table, payloadColumn, payload, normalizedNotes };
      }

      const text = await response.text();
      if (shouldTryNextLeadTable(response.status, text) || shouldTryAlternatePayloadColumn(text, payloadColumn)) {
        lastError = new Error(text || `Unable to read ${payloadColumn} from ${table}.`);
        continue;
      }

      throw new Error(text || "Unable to load lead note metadata.");
    }
  }

  throw lastError ?? new Error("Unable to resolve lead payload metadata.");
}

function mergeLeadNotes(baseNotes: LeadNote[], payloadNotes: LeadNoteWithMetadata[]) {
  const mergedByKey = new Map<string, LeadNoteWithMetadata>();

  for (const note of baseNotes) {
    const key = `${note.id}|${note.createdAt}|${note.content}`;
    mergedByKey.set(key, { ...note });
  }

  for (const note of payloadNotes) {
    const key = `${note.id}|${note.createdAt}|${note.content}`;
    const existing = mergedByKey.get(key);
    if (!existing) {
      mergedByKey.set(key, note);
      continue;
    }

    mergedByKey.set(key, {
      ...existing,
      ...(note.contactId ? { contactId: note.contactId } : {}),
      ...(note.targetUserId ? { targetUserId: note.targetUserId } : {}),
      ...(note.targetUserName ? { targetUserName: note.targetUserName } : {}),
      ...(note.requiresAcknowledgement ? { requiresAcknowledgement: note.requiresAcknowledgement } : {}),
      ...(note.acknowledgedAt ? { acknowledgedAt: note.acknowledgedAt } : {}),
      ...(note.acknowledgedByUserId ? { acknowledgedByUserId: note.acknowledgedByUserId } : {}),
      ...(note.acknowledgedByName ? { acknowledgedByName: note.acknowledgedByName } : {}),
      ...(note.createdByUserId ? { createdByUserId: note.createdByUserId } : {}),
      ...(note.createdByName ? { createdByName: note.createdByName } : {}),
      ...(note.trainingBucket ? { trainingBucket: note.trainingBucket } : {}),
      ...(note.taggedUserId ? { taggedUserId: note.taggedUserId } : {}),
      ...(note.taggedUserName ? { taggedUserName: note.taggedUserName } : {}),
    });
  }

  return [...mergedByKey.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listLeadNotesWithMetadata(leadId: string): Promise<LeadNoteWithMetadata[]> {
  const [baseNotes, payloadState] = await Promise.all([
    listLeadNotes(leadId),
    loadLeadPayloadNotes(leadId).catch(() => null),
  ]);

  return mergeLeadNotes(baseNotes, payloadState?.normalizedNotes ?? []).slice(0, 50);
}

export async function updateLeadNoteMetadata(
  leadId: string,
  noteId: string,
  metadata: Partial<
    Pick<
      LeadNoteWithMetadata,
      | "targetUserId"
      | "targetUserName"
      | "requiresAcknowledgement"
      | "acknowledgedAt"
      | "acknowledgedByUserId"
      | "acknowledgedByName"
      | "createdByUserId"
      | "createdByName"
      | "trainingBucket"
      | "taggedUserId"
      | "taggedUserName"
    >
  >,
): Promise<LeadNoteWithMetadata> {
  const { table, payloadColumn, payload, normalizedNotes } = await loadLeadPayloadNotes(leadId);
  let updatedNote: LeadNoteWithMetadata | null = null;

  const nextNotes = normalizedNotes.map((note) => {
    if (note.id !== noteId) return note;
    updatedNote = {
      ...note,
      ...(metadata.targetUserId !== undefined ? { targetUserId: metadata.targetUserId } : {}),
      ...(metadata.targetUserName !== undefined ? { targetUserName: metadata.targetUserName } : {}),
      ...(metadata.requiresAcknowledgement !== undefined ? { requiresAcknowledgement: metadata.requiresAcknowledgement } : {}),
      ...(metadata.acknowledgedAt !== undefined ? { acknowledgedAt: metadata.acknowledgedAt } : {}),
      ...(metadata.acknowledgedByUserId !== undefined ? { acknowledgedByUserId: metadata.acknowledgedByUserId } : {}),
      ...(metadata.acknowledgedByName !== undefined ? { acknowledgedByName: metadata.acknowledgedByName } : {}),
      ...(metadata.createdByUserId !== undefined ? { createdByUserId: metadata.createdByUserId } : {}),
      ...(metadata.createdByName !== undefined ? { createdByName: metadata.createdByName } : {}),
      ...(metadata.trainingBucket !== undefined ? { trainingBucket: metadata.trainingBucket } : {}),
      ...(metadata.taggedUserId !== undefined ? { taggedUserId: metadata.taggedUserId } : {}),
      ...(metadata.taggedUserName !== undefined ? { taggedUserName: metadata.taggedUserName } : {}),
    };
    return updatedNote;
  });

  if (!updatedNote) {
    throw new Error("Lead note not found.");
  }

  await patchLeadPayload(table, leadId, { ...payload, notes: nextNotes }, payloadColumn);
  return updatedNote;
}

export async function acknowledgeLeadNote(
  leadId: string,
  noteId: string,
  userId: string,
  userName: string,
) {
  return updateLeadNoteMetadata(leadId, noteId, {
    acknowledgedAt: new Date().toISOString(),
    acknowledgedByUserId: userId.trim(),
    acknowledgedByName: userName.trim(),
  });
}
