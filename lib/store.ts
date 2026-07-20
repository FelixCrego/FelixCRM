import { dedupeKey } from "@/lib/utils";
import type {
  Lead,
  LeadEnrichmentPayload,
  LeadResearchStructuredPayload,
  Script,
  ServiceTicket,
  ServiceTicketCategory,
  ServiceTicketPriority,
  ServiceTicketStatus,
  ServiceTicketSource,
  ToneOfVoice,
  UserRole,
} from "@/lib/types";
import { sanitizeContactLensNoteContent } from "@/lib/contact-lens";
import { inferLeadSourceType, normalizeLeadSourceType, type LeadSourceType } from "@/lib/lead-source";
import { normalizeShiftQueueSettings, type ShiftQueueSettings } from "@/lib/shift-queue";
import { normalizeUserRole } from "@/lib/role-utils";
import { getImportedFieldValue, normalizeImportedFieldKey, type LeadCsvImportedFields } from "@/lib/lead-csv";
import { resolveLeadWorkspaceStatus } from "@/lib/lead-workspace-status";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(supabaseUrl && supabaseServiceRoleKey);

const USERS_TABLE_CANDIDATES = ["User", "user", "users"];
const LEADS_TABLE_CANDIDATES = ["leads", "lead", "Lead"];
const SCRIPTS_TABLE_CANDIDATES = ["Script", "script"];
const LEAD_NOTES_TABLE_CANDIDATES = ["lead_notes", "leadNotes", "LeadNotes"];
const GLOBAL_LEAD_VIEWER_EMAILS = new Set(
  (process.env.FELIXCRM_GLOBAL_LEAD_VIEWER_EMAILS ?? "felix@felixcrego.com")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const ACCOUNT_MANAGEMENT_VIEWER_EMAILS = new Set(
  (process.env.FELIXCRM_ACCOUNT_MANAGEMENT_VIEWER_EMAILS ?? "felix@felixcrego.com,eliot30523@gmail.com")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

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

function normalizeImportedFields(value: unknown): LeadCsvImportedFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<LeadCsvImportedFields>((accumulator, [key, rawValue]) => {
    const label = key.trim();
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue === null || rawValue === undefined ? "" : String(rawValue).trim();
    if (!label || !value) return accumulator;
    accumulator[label] = value;
    return accumulator;
  }, {});
}

function getImportedFieldsFromPayload(sourcePayload: Record<string, unknown>) {
  return normalizeImportedFields(sourcePayload.importedFields ?? sourcePayload.imported_fields);
}

function getSourcePayloadString(sourcePayload: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const value = sourcePayload[alias];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return getImportedFieldValue(getImportedFieldsFromPayload(sourcePayload), aliases);
}

function mergeImportedFields(existingPayload: Record<string, unknown>, incomingFields: LeadCsvImportedFields | null | undefined) {
  const existingFields = getImportedFieldsFromPayload(existingPayload);
  const nextFields = normalizeImportedFields(incomingFields);
  if (!Object.keys(nextFields).length) return existingFields;

  const merged = { ...existingFields };
  const existingByNormalizedKey = new Map(
    Object.entries(existingFields).map(([label, value]) => [normalizeImportedFieldKey(label), { label, value }]),
  );

  for (const [label, value] of Object.entries(nextFields)) {
    const normalizedLabel = normalizeImportedFieldKey(label);
    const existingEntry = existingByNormalizedKey.get(normalizedLabel);
    if (!existingEntry || !existingEntry.value.trim()) {
      if (existingEntry && existingEntry.label !== label) {
        delete merged[existingEntry.label];
      }
      merged[label] = value;
      existingByNormalizedKey.set(normalizedLabel, { label, value });
    }
  }

  return merged;
}

function normalizeEmailAddress(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isFelixOwnerEmail(email: string) {
  if (!email) return false;
  const localPart = email.split("@")[0] ?? "";
  return localPart.startsWith("felix");
}

function titleCaseWords(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function prettyNameFromEmail(email: string) {
  const normalized = normalizeEmailAddress(email);
  if (normalized === "felix@felixcrego.com") return "Felix Crego";
  const localPart = normalized.split("@")[0] ?? normalized;
  return titleCaseWords(localPart.replace(/\d+/g, " ").trim() || localPart);
}

type AuthAdminUser = {
  id?: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  invited_at?: string | null;
  banned_until?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type AssignableUser = {
  id: string;
  email: string | null;
  name: string;
  commissionRate: number | null;
};

export type LeadAssignmentUser = {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
};

export type ManagedUser = AssignableUser & {
  role: UserRole;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
};

export type FinanceExpense = {
  id: string;
  label: string;
  amount: number;
  cadence: "MONTHLY" | "ONE_TIME";
  effectiveDate?: string | null;
  notes?: string | null;
};

export type FinanceSettings = {
  feeHoldbackRate: number;
  expenses: FinanceExpense[];
};

function parseCommissionRateValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function normalizeFinanceExpense(value: unknown): FinanceExpense | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const amount =
    typeof input.amount === "number" && Number.isFinite(input.amount)
      ? input.amount
      : typeof input.amount === "string" && input.amount.trim()
        ? Number(input.amount)
        : NaN;
  if (!label || !Number.isFinite(amount) || amount < 0) return null;

  return {
    id: typeof input.id === "string" && input.id.trim() ? input.id.trim() : crypto.randomUUID(),
    label,
    amount,
    cadence: input.cadence === "ONE_TIME" ? "ONE_TIME" : "MONTHLY",
    effectiveDate: typeof input.effectiveDate === "string" && input.effectiveDate.trim() ? input.effectiveDate.trim() : null,
    notes: typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null,
  };
}

function normalizeFinanceSettings(value: unknown): FinanceSettings {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const feeHoldbackRate =
    typeof input.feeHoldbackRate === "number" && Number.isFinite(input.feeHoldbackRate) && input.feeHoldbackRate >= 0
      ? input.feeHoldbackRate
      : 0.06;
  const expenses = Array.isArray(input.expenses)
    ? input.expenses.map(normalizeFinanceExpense).filter((expense): expense is FinanceExpense => Boolean(expense))
    : [];
  return { feeHoldbackRate, expenses };
}

async function listAuthAdminUsersRaw(): Promise<Array<AuthAdminUser & { id: string }>> {
  if (!hasDb) throw new Error("Supabase environment variables are required to list users.");

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to list auth users.");
  }

  const payload = (await response.json()) as { users?: AuthAdminUser[] };
  return (payload.users ?? []).filter((user): user is AuthAdminUser & { id: string } => typeof user.id === "string" && user.id.length > 0);
}

async function getAuthAdminUserById(userId: string): Promise<(AuthAdminUser & { id: string }) | null> {
  const users = await listAuthAdminUsersRaw();
  return users.find((user) => user.id === userId) ?? null;
}

export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const users = await listAuthAdminUsersRaw();
  return users
    .map((user) => {
      const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
      const email = typeof user.email === "string" && user.email.trim() ? user.email.trim().toLowerCase() : null;
      const nameCandidate =
        typeof metadata.name === "string" && metadata.name.trim()
          ? metadata.name.trim()
          : typeof metadata.full_name === "string" && metadata.full_name.trim()
            ? metadata.full_name.trim()
            : email
              ? prettyNameFromEmail(email)
              : user.id;

      return {
        id: user.id,
        email,
        name: nameCandidate,
        commissionRate: parseCommissionRateValue(metadata.commissionRate),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listLeadAssignmentUsers(): Promise<LeadAssignmentUser[]> {
  const users = await listAuthAdminUsersRaw();
  return users
    .map((user) => {
      const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
      const email = typeof user.email === "string" && user.email.trim() ? user.email.trim().toLowerCase() : null;
      const name =
        typeof metadata.name === "string" && metadata.name.trim()
          ? metadata.name.trim()
          : typeof metadata.full_name === "string" && metadata.full_name.trim()
            ? metadata.full_name.trim()
            : email
              ? prettyNameFromEmail(email)
              : user.id;
      const metadataRole = normalizeUserRole(metadata.role);
      const role = metadataRole ?? (email && GLOBAL_LEAD_VIEWER_EMAILS.has(email) ? "SUPER_ADMIN" : "REP");

      return {
        id: user.id,
        email,
        name,
        role,
      } satisfies LeadAssignmentUser;
    })
    .filter((user) => user.role === "REP" || user.role === "TEAM_LEAD" || user.role === "MANAGER" || user.role === "SUPER_ADMIN")
    .sort((a, b) => a.name.localeCompare(b.name));
}

function looksLikeSupabaseUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function isValidLeadAssignmentUserId(userId: string): Promise<boolean> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return false;

  try {
    const assignableUsers = await listLeadAssignmentUsers();
    return assignableUsers.some((candidate) => candidate.id === normalizedUserId);
  } catch (error) {
    console.warn("[store] Lead assignment validation fell back after auth-admin lookup failed.", error);
  }

  const profileUser = await getSafeFirstUser(normalizedUserId).catch(() => null);
  if (profileUser) return true;

  return looksLikeSupabaseUserId(normalizedUserId);
}

export async function getShiftQueueSettings(userId: string): Promise<ShiftQueueSettings | null> {
  const targetUser = await getAuthAdminUserById(userId).catch(() => null);
  if (!targetUser) return null;

  const metadata = targetUser.user_metadata && typeof targetUser.user_metadata === "object" ? targetUser.user_metadata : {};
  return normalizeShiftQueueSettings(
    (metadata as Record<string, unknown>).shiftQueueSettings ??
    (metadata as Record<string, unknown>).shift_queue_settings ??
    null,
  );
}

export async function saveShiftQueueSettings(
  targetUserId: string,
  settings: ShiftQueueSettings | null,
  actingUserId: string,
) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save shift queue settings.");

  const targetUser = await getAuthAdminUserById(targetUserId);
  if (!targetUser) throw new Error("User not found.");

  const metadata =
    targetUser.user_metadata && typeof targetUser.user_metadata === "object"
      ? { ...targetUser.user_metadata }
      : {};

  if (!settings) {
    delete (metadata as Record<string, unknown>).shiftQueueSettings;
    delete (metadata as Record<string, unknown>).shift_queue_settings;
  } else {
    (metadata as Record<string, unknown>).shiftQueueSettings = {
      ...settings,
      updatedAt: new Date().toISOString(),
      updatedByUserId: actingUserId,
    };
    delete (metadata as Record<string, unknown>).shift_queue_settings;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`, {
    method: "PUT",
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_metadata: metadata,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Failed to save shift queue settings.");
  }

  return settings
    ? {
        ...settings,
        updatedAt: new Date().toISOString(),
        updatedByUserId: actingUserId,
      }
    : null;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const users = await listAuthAdminUsersRaw();
  return users
    .map((user) => {
      const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
      const email = typeof user.email === "string" && user.email.trim() ? user.email.trim().toLowerCase() : null;
      const name =
        typeof metadata.name === "string" && metadata.name.trim()
          ? metadata.name.trim()
          : typeof metadata.full_name === "string" && metadata.full_name.trim()
            ? metadata.full_name.trim()
            : email
              ? prettyNameFromEmail(email)
              : user.id;
      const metadataRole = normalizeUserRole(metadata.role);
      const role = metadataRole ?? (email && GLOBAL_LEAD_VIEWER_EMAILS.has(email) ? "SUPER_ADMIN" : "REP");
      const bannedUntil = typeof user.banned_until === "string" ? user.banned_until : null;
      const emailConfirmedAt =
        typeof user.email_confirmed_at === "string"
          ? user.email_confirmed_at
          : typeof user.confirmed_at === "string"
            ? user.confirmed_at
            : null;
      const invitedAt = typeof user.invited_at === "string" ? user.invited_at : null;
      const bannedUntilDate = bannedUntil ? new Date(bannedUntil) : null;
      const isSuspended = Boolean(bannedUntilDate && !Number.isNaN(bannedUntilDate.getTime()) && bannedUntilDate.getTime() > Date.now());
      const status: ManagedUser["status"] = isSuspended
        ? "SUSPENDED"
        : !user.last_sign_in_at && invitedAt && !emailConfirmedAt
          ? "INVITED"
          : "ACTIVE";
      return {
        id: user.id,
        email,
        name,
        role,
        commissionRate: parseCommissionRateValue(metadata.commissionRate),
        createdAt: typeof user.created_at === "string" ? user.created_at : null,
        lastSignInAt: typeof user.last_sign_in_at === "string" ? user.last_sign_in_at : null,
        emailConfirmedAt,
        status,
      } satisfies ManagedUser;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveManagedUserSettings(
  userId: string,
  settings: { name: string; role: UserRole; commissionRate: number | null },
) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save user settings.");

  const targetUser = await getAuthAdminUserById(userId);
  if (!targetUser) throw new Error("User not found.");

  const metadata =
    targetUser.user_metadata && typeof targetUser.user_metadata === "object"
      ? { ...targetUser.user_metadata }
      : {};

  metadata.name = settings.name.trim();
  metadata.role = settings.role;
  if (settings.commissionRate === null) {
    delete metadata.commissionRate;
  } else {
    metadata.commissionRate = settings.commissionRate;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_metadata: metadata,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to save user settings.");
  }
}

export async function inviteManagedUser(input: {
  email: string;
  name: string;
  role: UserRole;
  commissionRate: number | null;
}) {
  if (!hasDb) throw new Error("Supabase environment variables are required to invite users.");

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("A valid email is required.");
  if (!input.name.trim()) throw new Error("A name is required.");

  const redirectTo = `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://felix-crm-xi.vercel.app"}/login`;
  const inviteUrl = new URL("/auth/v1/invite", supabaseUrl);
  inviteUrl.searchParams.set("redirect_to", redirectTo);

  const response = await fetch(inviteUrl.toString(), {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: normalizedEmail,
      data: {
        name: input.name.trim(),
        role: input.role,
        commissionRate: input.commissionRate,
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Failed to invite user.");
  }

  return text ? (parseJsonSafely<Record<string, unknown>>(text) ?? {}) : {};
}

export async function createManagedUser(input: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  commissionRate: number | null;
}) {
  if (!hasDb) throw new Error("Supabase environment variables are required to create users.");

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("A valid email is required.");
  if (!input.name.trim()) throw new Error("A name is required.");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: normalizedEmail,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        name: input.name.trim(),
        role: input.role,
        commissionRate: input.commissionRate,
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Failed to create user.");
  }

  return text ? (parseJsonSafely<Record<string, unknown>>(text) ?? {}) : {};
}

export async function setManagedUserActive(userId: string, active: boolean) {
  if (!hasDb) throw new Error("Supabase environment variables are required to update user status.");

  const targetUser = await getAuthAdminUserById(userId);
  if (!targetUser) throw new Error("User not found.");

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ban_duration: active ? "none" : "876000h",
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Failed to ${active ? "reactivate" : "deactivate"} user.`);
  }

  return text ? (parseJsonSafely<Record<string, unknown>>(text) ?? {}) : {};
}

export async function resetManagedUserPassword(userId: string, password: string) {
  if (!hasDb) throw new Error("Supabase environment variables are required to reset passwords.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const targetUser = await getAuthAdminUserById(userId);
  if (!targetUser) throw new Error("User not found.");

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      password,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Failed to reset password.");
  }

  return text ? (parseJsonSafely<Record<string, unknown>>(text) ?? {}) : {};
}

export async function resendManagedUserInvite(userId: string) {
  const targetUser = await getAuthAdminUserById(userId);
  if (!targetUser) throw new Error("User not found.");

  const metadata = targetUser.user_metadata && typeof targetUser.user_metadata === "object" ? targetUser.user_metadata : {};
  const email = typeof targetUser.email === "string" ? targetUser.email.trim().toLowerCase() : "";
  const name =
    typeof metadata.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : typeof metadata.full_name === "string" && metadata.full_name.trim()
        ? metadata.full_name.trim()
        : email
          ? prettyNameFromEmail(email)
          : "";
  const role = typeof metadata.role === "string" ? metadata.role.trim().toUpperCase() : "REP";

  if (!email) throw new Error("User email not found.");

  await inviteManagedUser({
    email,
    name: name || email,
    role: role === "SUPER_ADMIN" || role === "MANAGER" || role === "TEAM_LEAD" ? (role as UserRole) : "REP",
    commissionRate: parseCommissionRateValue(metadata.commissionRate),
  });
}

function normalizeReviewedDashboardNotificationIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(-200);
}

export async function getReviewedDashboardNotificationIds(userId: string): Promise<string[]> {
  const targetUser = await getAuthAdminUserById(userId);
  if (!targetUser) return [];
  const metadata = targetUser.user_metadata && typeof targetUser.user_metadata === "object" ? targetUser.user_metadata : {};
  return normalizeReviewedDashboardNotificationIds(metadata.reviewedDashboardNotificationIds);
}

export async function setDashboardNotificationReviewed(userId: string, notificationId: string, reviewed: boolean) {
  if (!hasDb) throw new Error("Supabase environment variables are required to update dashboard notifications.");
  const targetUser = await getAuthAdminUserById(userId);
  if (!targetUser) throw new Error("User not found.");

  const cleanId = notificationId.trim();
  if (!cleanId) throw new Error("notificationId is required.");

  const metadata =
    targetUser.user_metadata && typeof targetUser.user_metadata === "object"
      ? { ...targetUser.user_metadata }
      : {};
  const currentIds = normalizeReviewedDashboardNotificationIds(metadata.reviewedDashboardNotificationIds);
  const nextIds = reviewed ? [...new Set([...currentIds, cleanId])].slice(-200) : currentIds.filter((id) => id !== cleanId);
  metadata.reviewedDashboardNotificationIds = nextIds;

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_metadata: metadata,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Failed to update reviewed notifications.");
  }

  return nextIds;
}

export async function saveAssignableUserCommissionRate(userId: string, commissionRate: number | null) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save commission rates.");

  const users = await listAuthAdminUsersRaw();
  const targetUser = users.find((user) => user.id === userId);
  if (!targetUser) throw new Error("User not found.");

  const metadata =
    targetUser.user_metadata && typeof targetUser.user_metadata === "object"
      ? { ...targetUser.user_metadata }
      : {};

  if (commissionRate === null) {
    delete metadata.commissionRate;
  } else {
    metadata.commissionRate = commissionRate;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_metadata: metadata,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to save commission rate.");
  }
}

export async function getUserFinanceSettings(userId: string): Promise<FinanceSettings> {
  const users = await listAuthAdminUsersRaw();
  const targetUser = users.find((user) => user.id === userId);
  const metadata = targetUser?.user_metadata && typeof targetUser.user_metadata === "object" ? targetUser.user_metadata : {};
  return normalizeFinanceSettings(metadata.financeSettings);
}

export async function saveUserFinanceSettings(userId: string, settings: FinanceSettings) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save finance settings.");

  const users = await listAuthAdminUsersRaw();
  const targetUser = users.find((user) => user.id === userId);
  if (!targetUser) throw new Error("User not found.");

  const metadata =
    targetUser.user_metadata && typeof targetUser.user_metadata === "object"
      ? { ...targetUser.user_metadata }
      : {};

  metadata.financeSettings = {
    feeHoldbackRate: settings.feeHoldbackRate,
    expenses: settings.expenses,
  };

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_metadata: metadata,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to save finance settings.");
  }
}

export async function getEffectiveUserRole(userId: string, email?: string | null): Promise<UserRole> {
  const normalizedEmail = normalizeEmailAddress(email);
  if (normalizedEmail && GLOBAL_LEAD_VIEWER_EMAILS.has(normalizedEmail)) {
    return "SUPER_ADMIN";
  }

  const profile = await getProfile(userId).catch(() => null);
  const profileRole = normalizeUserRole(profile?.role);
  if (profileRole && profileRole !== "REP") return profileRole;

  const authUser = await getAuthAdminUserById(userId).catch(() => null);
  const authUserEmail = normalizeEmailAddress(authUser?.email);
  if (authUserEmail && GLOBAL_LEAD_VIEWER_EMAILS.has(authUserEmail)) {
    return "SUPER_ADMIN";
  }
  const metadata = authUser?.user_metadata && typeof authUser.user_metadata === "object" ? authUser.user_metadata : {};
  const metadataRole = normalizeUserRole(metadata.role);
  if (metadataRole) return metadataRole;

  return profileRole ?? "REP";
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

function isLeadStatusConstraintError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as SupabaseError).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "23514" && message.includes("leads_status_check");
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
  const importedFields = getImportedFieldsFromPayload(sourcePayload);
  const csvImportBatchId =
    typeof sourcePayload.csvImportBatchId === "string"
      ? sourcePayload.csvImportBatchId
      : typeof sourcePayload.csv_import_batch_id === "string"
        ? sourcePayload.csv_import_batch_id
        : null;
  const csvImportedAt =
    typeof sourcePayload.csvImportedAt === "string"
      ? sourcePayload.csvImportedAt
      : typeof sourcePayload.csv_imported_at === "string"
        ? sourcePayload.csv_imported_at
        : null;
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
  const soldByUserIdFromPayload =
    typeof sourcePayload.soldByUserId === "string"
      ? sourcePayload.soldByUserId
      : typeof sourcePayload.sold_by_user_id === "string"
        ? sourcePayload.sold_by_user_id
        : null;
  const soldByNameFromPayload =
    typeof sourcePayload.soldByName === "string"
      ? sourcePayload.soldByName
      : typeof sourcePayload.sold_by_name === "string"
        ? sourcePayload.sold_by_name
        : null;
  const soldByEmailFromPayload =
    typeof sourcePayload.soldByEmail === "string"
      ? sourcePayload.soldByEmail
      : typeof sourcePayload.sold_by_email === "string"
        ? sourcePayload.sold_by_email
        : null;
  const billingProfileRaw =
    sourcePayload.billingProfile && typeof sourcePayload.billingProfile === "object"
      ? (sourcePayload.billingProfile as Record<string, unknown>)
      : sourcePayload.billing_profile && typeof sourcePayload.billing_profile === "object"
        ? (sourcePayload.billing_profile as Record<string, unknown>)
        : null;
  const commissionPayoutRaw =
    sourcePayload.commissionPayout && typeof sourcePayload.commissionPayout === "object"
      ? (sourcePayload.commissionPayout as Record<string, unknown>)
      : sourcePayload.commission_payout && typeof sourcePayload.commission_payout === "object"
        ? (sourcePayload.commission_payout as Record<string, unknown>)
        : null;
  const accountManagementRaw =
    sourcePayload.accountManagement && typeof sourcePayload.accountManagement === "object"
      ? (sourcePayload.accountManagement as Record<string, unknown>)
      : sourcePayload.account_management && typeof sourcePayload.account_management === "object"
        ? (sourcePayload.account_management as Record<string, unknown>)
        : null;
  const seoTasksRaw =
    accountManagementRaw && Array.isArray(accountManagementRaw.seoTasks)
      ? accountManagementRaw.seoTasks
      : accountManagementRaw && Array.isArray(accountManagementRaw.seo_tasks)
        ? accountManagementRaw.seo_tasks
        : [];
  const successPlanRaw =
    accountManagementRaw && accountManagementRaw.successPlan && typeof accountManagementRaw.successPlan === "object"
      ? (accountManagementRaw.successPlan as Record<string, unknown>)
      : accountManagementRaw && accountManagementRaw.success_plan && typeof accountManagementRaw.success_plan === "object"
        ? (accountManagementRaw.success_plan as Record<string, unknown>)
        : null;

  return {
    id: lead.id,
    businessName: lead.businessName ?? lead.business_name,
    city: lead.city,
    businessType: lead.businessType ?? lead.business_type,
    createdAt:
      (typeof lead.createdAt === "string" ? lead.createdAt : null) ??
      (typeof lead.created_at === "string" ? lead.created_at : null) ??
      new Date(lead.updatedAt ?? lead.updated_at).toISOString(),
    phone: lead.phone,
    email: lead.email,
    websiteUrl: lead.websiteUrl ?? lead.website_url,
    websiteStatus: lead.websiteStatus ?? lead.website_status,
    status: lead.status,
    workspaceStatus:
      typeof sourcePayload.workspaceStatus === "string"
        ? sourcePayload.workspaceStatus
        : typeof sourcePayload.workspace_status === "string"
          ? sourcePayload.workspace_status
          : null,
    deployedUrl: lead.deployedUrl ?? lead.deployed_url,
    siteStatus: (lead.siteStatus ?? lead.site_status ?? "UNBUILT") as Lead["siteStatus"],
    vercelDeploymentId: typeof (lead.vercelDeploymentId ?? lead.vercel_deployment_id) === "string" ? (lead.vercelDeploymentId ?? lead.vercel_deployment_id) : null,
    ownerId: lead.ownerId ?? lead.owner_id,
    soldByUserId: soldByUserIdFromPayload,
    soldByName: soldByNameFromPayload,
    soldByEmail: soldByEmailFromPayload,
    billingProfile:
      billingProfileRaw
        ? {
            billingType: billingProfileRaw.billingType === "RECURRING" ? "RECURRING" : "ONE_TIME",
            recurringAmount:
              typeof billingProfileRaw.recurringAmount === "number" && Number.isFinite(billingProfileRaw.recurringAmount)
                ? billingProfileRaw.recurringAmount
                : null,
            oneTimeAmount:
              typeof billingProfileRaw.oneTimeAmount === "number" && Number.isFinite(billingProfileRaw.oneTimeAmount)
                ? billingProfileRaw.oneTimeAmount
                : null,
            autoRenew: Boolean(billingProfileRaw.autoRenew),
            billingStatus:
              billingProfileRaw.billingStatus === "PAUSED" || billingProfileRaw.billingStatus === "CANCELLED" || billingProfileRaw.billingStatus === "PAID"
                ? billingProfileRaw.billingStatus
                : "ACTIVE",
            billingStartDate: typeof billingProfileRaw.billingStartDate === "string" ? billingProfileRaw.billingStartDate : null,
            stripeCustomerId: typeof billingProfileRaw.stripeCustomerId === "string" ? billingProfileRaw.stripeCustomerId : null,
            stripeSubscriptionId: typeof billingProfileRaw.stripeSubscriptionId === "string" ? billingProfileRaw.stripeSubscriptionId : null,
            stripeCheckoutSessionId: typeof billingProfileRaw.stripeCheckoutSessionId === "string" ? billingProfileRaw.stripeCheckoutSessionId : null,
            notes: typeof billingProfileRaw.notes === "string" ? billingProfileRaw.notes : null,
          }
        : null,
    commissionPayout:
      commissionPayoutRaw
        ? {
            status: commissionPayoutRaw.status === "PAID" ? "PAID" : "UNPAID",
            paidAt: typeof commissionPayoutRaw.paidAt === "string" ? commissionPayoutRaw.paidAt : null,
            paidAmount:
              typeof commissionPayoutRaw.paidAmount === "number" && Number.isFinite(commissionPayoutRaw.paidAmount)
                ? commissionPayoutRaw.paidAmount
                : null,
            paidByUserId: typeof commissionPayoutRaw.paidByUserId === "string" ? commissionPayoutRaw.paidByUserId : null,
            paidByName: typeof commissionPayoutRaw.paidByName === "string" ? commissionPayoutRaw.paidByName : null,
            note: typeof commissionPayoutRaw.note === "string" ? commissionPayoutRaw.note : null,
          }
        : null,
    updatedAt: new Date(lead.updatedAt ?? lead.updated_at).toISOString(),
    socialLinks: Array.isArray(sourcePayload.socialLinks)
      ? sourcePayload.socialLinks
      : Array.isArray(sourcePayload.social_links)
        ? sourcePayload.social_links
        : [],
    aiResearchSummary: getSourcePayloadString(sourcePayload, ["aiResearchSummary", "ai_research_summary"]),
    leadQuality: getSourcePayloadString(sourcePayload, ["leadQuality", "lead_quality", "LeadQuality"]),
    googleRating: getSourcePayloadString(sourcePayload, ["googleRating", "google_rating", "GoogleRating"]),
    googleReviews: getSourcePayloadString(sourcePayload, ["googleReviews", "google_reviews", "GoogleReviews"]),
    importedFields: Object.keys(importedFields).length ? importedFields : null,
    csvImportBatchId,
    csvImportedAt,
    enrichment: normalizeLeadEnrichmentPayload(sourcePayload.enrichment, lead.businessName ?? lead.business_name, lead.phone),
    sourceQuery: getSourcePayloadString(sourcePayload, ["sourceQuery", "source_query"]),
    sourceType:
      normalizeLeadSourceType(sourcePayload.sourceType) ??
      normalizeLeadSourceType(sourcePayload.source_type) ??
      inferLeadSourceType({
        sourceQuery: getSourcePayloadString(sourcePayload, ["sourceQuery", "source_query"]),
        businessType: lead.businessType ?? lead.business_type,
        city: lead.city,
      }),
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
            timeZone:
              typeof (sourcePayload.demoBooking as Record<string, unknown>).timeZone === "string"
                ? (sourcePayload.demoBooking as Record<string, unknown>).timeZone as string
                : typeof (sourcePayload.demoBooking as Record<string, unknown>).time_zone === "string"
                  ? (sourcePayload.demoBooking as Record<string, unknown>).time_zone as string
                  : undefined,
            meetLink:
              typeof (sourcePayload.demoBooking as Record<string, unknown>).meetLink === "string"
                ? (sourcePayload.demoBooking as Record<string, unknown>).meetLink as string
                : typeof (sourcePayload.demoBooking as Record<string, unknown>).meet_link === "string"
                  ? (sourcePayload.demoBooking as Record<string, unknown>).meet_link as string
                  : undefined,
            bookedAt:
              typeof (sourcePayload.demoBooking as Record<string, unknown>).bookedAt === "string"
                ? (sourcePayload.demoBooking as Record<string, unknown>).bookedAt as string
                : typeof (sourcePayload.demoBooking as Record<string, unknown>).booked_at === "string"
                  ? (sourcePayload.demoBooking as Record<string, unknown>).booked_at as string
                  : undefined,
          }
        : sourcePayload.demo_booking && typeof sourcePayload.demo_booking === "object"
          ? {
              date: typeof (sourcePayload.demo_booking as Record<string, unknown>).date === "string"
                ? (sourcePayload.demo_booking as Record<string, unknown>).date as string
                : undefined,
              time: typeof (sourcePayload.demo_booking as Record<string, unknown>).time === "string"
                ? (sourcePayload.demo_booking as Record<string, unknown>).time as string
                : undefined,
              timeZone:
                typeof (sourcePayload.demo_booking as Record<string, unknown>).timeZone === "string"
                  ? (sourcePayload.demo_booking as Record<string, unknown>).timeZone as string
                  : typeof (sourcePayload.demo_booking as Record<string, unknown>).time_zone === "string"
                    ? (sourcePayload.demo_booking as Record<string, unknown>).time_zone as string
                    : undefined,
              meetLink:
                typeof (sourcePayload.demo_booking as Record<string, unknown>).meetLink === "string"
                  ? (sourcePayload.demo_booking as Record<string, unknown>).meetLink as string
                  : typeof (sourcePayload.demo_booking as Record<string, unknown>).meet_link === "string"
                    ? (sourcePayload.demo_booking as Record<string, unknown>).meet_link as string
                    : undefined,
              bookedAt:
                typeof (sourcePayload.demo_booking as Record<string, unknown>).bookedAt === "string"
                  ? (sourcePayload.demo_booking as Record<string, unknown>).bookedAt as string
                  : typeof (sourcePayload.demo_booking as Record<string, unknown>).booked_at === "string"
                    ? (sourcePayload.demo_booking as Record<string, unknown>).booked_at as string
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
    accountManagement:
      accountManagementRaw
        ? {
            serviceStatus:
              accountManagementRaw.serviceStatus === "ONBOARDING" ||
              accountManagementRaw.serviceStatus === "ACTIVE" ||
              accountManagementRaw.serviceStatus === "AT_RISK" ||
              accountManagementRaw.serviceStatus === "PAUSED"
                ? accountManagementRaw.serviceStatus
                : "ONBOARDING",
            syncEnabled: Boolean(accountManagementRaw.syncEnabled),
            primaryOwnerId: typeof accountManagementRaw.primaryOwnerId === "string" ? accountManagementRaw.primaryOwnerId : null,
            primaryOwnerName: typeof accountManagementRaw.primaryOwnerName === "string" ? accountManagementRaw.primaryOwnerName : null,
            startDate: typeof accountManagementRaw.startDate === "string" ? accountManagementRaw.startDate : null,
            renewalDate: typeof accountManagementRaw.renewalDate === "string" ? accountManagementRaw.renewalDate : null,
            seo: normalizeManagedServiceLine(accountManagementRaw.seo),
            seoTasks: seoTasksRaw
              .filter((task): task is Record<string, unknown> => Boolean(task) && typeof task === "object")
              .map((task, index) => ({
                id: typeof task.id === "string" ? task.id : `seo-task-${index + 1}`,
                title: typeof task.title === "string" ? task.title : `SEO Task ${index + 1}`,
                instruction: typeof task.instruction === "string" ? task.instruction : "",
                completed: Boolean(task.completed),
              })),
            ppc: normalizeManagedServiceLine(accountManagementRaw.ppc),
            social: normalizeManagedServiceLine(accountManagementRaw.social),
            analyticsConnections:
              accountManagementRaw.analyticsConnections && typeof accountManagementRaw.analyticsConnections === "object"
                ? {
                    gscConnected: Boolean((accountManagementRaw.analyticsConnections as Record<string, unknown>).gscConnected),
                    gscPropertyUrl:
                      typeof (accountManagementRaw.analyticsConnections as Record<string, unknown>).gscPropertyUrl === "string"
                        ? ((accountManagementRaw.analyticsConnections as Record<string, unknown>).gscPropertyUrl as string)
                        : null,
                    ga4Connected: Boolean((accountManagementRaw.analyticsConnections as Record<string, unknown>).ga4Connected),
                    ga4PropertyId:
                      typeof (accountManagementRaw.analyticsConnections as Record<string, unknown>).ga4PropertyId === "string"
                        ? ((accountManagementRaw.analyticsConnections as Record<string, unknown>).ga4PropertyId as string)
                        : null,
                    lastAiReviewAt:
                      typeof (accountManagementRaw.analyticsConnections as Record<string, unknown>).lastAiReviewAt === "string"
                        ? ((accountManagementRaw.analyticsConnections as Record<string, unknown>).lastAiReviewAt as string)
                        : null,
                    aiSuggestions:
                      typeof (accountManagementRaw.analyticsConnections as Record<string, unknown>).aiSuggestions === "string"
                        ? ((accountManagementRaw.analyticsConnections as Record<string, unknown>).aiSuggestions as string)
                        : null,
                  }
                : null,
            clientHealth:
              accountManagementRaw.clientHealth && typeof accountManagementRaw.clientHealth === "object"
                ? {
                    lastTouchAt:
                      typeof (accountManagementRaw.clientHealth as Record<string, unknown>).lastTouchAt === "string"
                        ? ((accountManagementRaw.clientHealth as Record<string, unknown>).lastTouchAt as string)
                        : null,
                    nextMeetingAt:
                      typeof (accountManagementRaw.clientHealth as Record<string, unknown>).nextMeetingAt === "string"
                        ? ((accountManagementRaw.clientHealth as Record<string, unknown>).nextMeetingAt as string)
                        : null,
                    satisfaction:
                      (accountManagementRaw.clientHealth as Record<string, unknown>).satisfaction === "STRONG" ||
                      (accountManagementRaw.clientHealth as Record<string, unknown>).satisfaction === "STABLE" ||
                      (accountManagementRaw.clientHealth as Record<string, unknown>).satisfaction === "WATCH" ||
                      (accountManagementRaw.clientHealth as Record<string, unknown>).satisfaction === "AT_RISK"
                        ? ((accountManagementRaw.clientHealth as Record<string, unknown>).satisfaction as "STRONG" | "STABLE" | "WATCH" | "AT_RISK")
                        : "STABLE",
                    blockers:
                      typeof (accountManagementRaw.clientHealth as Record<string, unknown>).blockers === "string"
                        ? ((accountManagementRaw.clientHealth as Record<string, unknown>).blockers as string)
                        : null,
                    expansionOpportunity:
                      typeof (accountManagementRaw.clientHealth as Record<string, unknown>).expansionOpportunity === "string"
                        ? ((accountManagementRaw.clientHealth as Record<string, unknown>).expansionOpportunity as string)
                        : null,
                  }
                : null,
            successPlan:
              successPlanRaw
                ? {
                    primaryClientEmail:
                      typeof successPlanRaw.primaryClientEmail === "string"
                        ? (successPlanRaw.primaryClientEmail as string)
                        : null,
                    ccEmails: Array.isArray(successPlanRaw.ccEmails)
                      ? successPlanRaw.ccEmails
                          .map((value) => (typeof value === "string" ? value.trim() : ""))
                          .filter(Boolean)
                      : [],
                    sendWeeklyReport: Boolean(successPlanRaw.sendWeeklyReport),
                    weeklyReportDay:
                      successPlanRaw.weeklyReportDay === "MONDAY" ||
                      successPlanRaw.weeklyReportDay === "TUESDAY" ||
                      successPlanRaw.weeklyReportDay === "WEDNESDAY" ||
                      successPlanRaw.weeklyReportDay === "THURSDAY" ||
                      successPlanRaw.weeklyReportDay === "FRIDAY" ||
                      successPlanRaw.weeklyReportDay === "SATURDAY" ||
                      successPlanRaw.weeklyReportDay === "SUNDAY"
                        ? (successPlanRaw.weeklyReportDay as
                            | "MONDAY"
                            | "TUESDAY"
                            | "WEDNESDAY"
                            | "THURSDAY"
                            | "FRIDAY"
                            | "SATURDAY"
                            | "SUNDAY")
                        : "MONDAY",
                    weeklyReportTime:
                      typeof successPlanRaw.weeklyReportTime === "string"
                        ? (successPlanRaw.weeklyReportTime as string)
                        : "09:00",
                    timeZone:
                      typeof successPlanRaw.timeZone === "string" ? (successPlanRaw.timeZone as string) : "America/New_York",
                    communicationSummary:
                      typeof successPlanRaw.communicationSummary === "string"
                        ? (successPlanRaw.communicationSummary as string)
                        : null,
                    currentFocus:
                      typeof successPlanRaw.currentFocus === "string" ? (successPlanRaw.currentFocus as string) : null,
                    recentWins:
                      typeof successPlanRaw.recentWins === "string" ? (successPlanRaw.recentWins as string) : null,
                    currentRisks:
                      typeof successPlanRaw.currentRisks === "string" ? (successPlanRaw.currentRisks as string) : null,
                    nextSteps:
                      typeof successPlanRaw.nextSteps === "string" ? (successPlanRaw.nextSteps as string) : null,
                    lastWeeklyReportSentAt:
                      typeof successPlanRaw.lastWeeklyReportSentAt === "string"
                        ? (successPlanRaw.lastWeeklyReportSentAt as string)
                        : null,
                    nextWeeklyReportDueAt:
                      typeof successPlanRaw.nextWeeklyReportDueAt === "string"
                        ? (successPlanRaw.nextWeeklyReportDueAt as string)
                        : null,
                  }
                : null,
          }
        : null,
    transferRequests: Array.isArray(sourcePayload.transferRequests)
      ? sourcePayload.transferRequests.filter((request: any) =>
          request && typeof request.requesterId === "string" && typeof request.requestedAt === "string" && typeof request.status === "string",
        )
      : [],
  };
}

function normalizeManagedServiceLine(value: unknown): NonNullable<Lead["accountManagement"]>["seo"] {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    enabled: Boolean(record.enabled),
    status:
      record.status === "NOT_STARTED" || record.status === "ON_TRACK" || record.status === "NEEDS_ATTENTION" || record.status === "PAUSED"
        ? record.status
        : "NOT_STARTED",
    cadence: record.cadence === "WEEKLY" || record.cadence === "BIWEEKLY" || record.cadence === "MONTHLY" ? record.cadence : "MONTHLY",
    deliverables: typeof record.deliverables === "string" ? record.deliverables : null,
    kpiSummary: typeof record.kpiSummary === "string" ? record.kpiSummary : null,
    nextReportDate: typeof record.nextReportDate === "string" ? record.nextReportDate : null,
    notes: typeof record.notes === "string" ? record.notes : null,
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
    role: normalizeUserRole(user.role) ?? "REP",
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

export async function canUserViewAllLeads(userId: string, email?: string | null) {
  const role = await getEffectiveUserRole(userId, email);
  return role === "MANAGER" || role === "SUPER_ADMIN";
}

export async function canUserAccessAccountManagement(userId: string, email?: string | null) {
  const normalizedEmail = normalizeEmailAddress(email);
  if (normalizedEmail && ACCOUNT_MANAGEMENT_VIEWER_EMAILS.has(normalizedEmail)) return true;
  if (isFelixOwnerEmail(normalizedEmail)) return true;

  const role = await getEffectiveUserRole(userId, email);
  if (role === "TEAM_LEAD" || role === "MANAGER" || role === "SUPER_ADMIN") return true;

  const authUser = await getAuthAdminUserById(userId).catch(() => null);
  const authUserEmail = normalizeEmailAddress(authUser?.email);
  if (authUserEmail && ACCOUNT_MANAGEMENT_VIEWER_EMAILS.has(authUserEmail)) return true;
  if (isFelixOwnerEmail(authUserEmail)) return true;

  const metadata = authUser?.user_metadata && typeof authUser.user_metadata === "object" ? authUser.user_metadata : {};
  const metadataName = typeof metadata.name === "string" ? metadata.name.trim().toLowerCase() : "";
  const metadataFullName = typeof metadata.full_name === "string" ? metadata.full_name.trim().toLowerCase() : "";
  return metadataName.includes("felix") || metadataFullName.includes("felix");
}

export async function canUserAssignLeads(userId: string, email?: string | null) {
  const role = await getEffectiveUserRole(userId, email);
  return role === "MANAGER" || role === "SUPER_ADMIN";
}

export async function canUserManageAllLeads(userId: string, email?: string | null) {
  const role = await getEffectiveUserRole(userId, email);
  return role === "SUPER_ADMIN";
}

export async function listLeads(ownerId: string, options?: { includeAll?: boolean }) {
  if (!hasDb) throw new Error("Supabase environment variables are required to load leads.");
  const leads = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: "*",
    ...(options?.includeAll ? {} : { [isSnakeLeadsTable(table) ? "owner_id" : "ownerId"]: `eq.${ownerId}` }),
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

type CreateLeadInput = {
  businessName: string;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  aiResearchSummary?: string | null;
  sourceQuery?: string | null;
  sourceType?: LeadSourceType | null;
  leadQuality?: string | null;
  googleRating?: string | null;
  googleReviews?: string | null;
  importedFields?: LeadCsvImportedFields | null;
  csvImportBatchId?: string | null;
  csvImportedAt?: string | null;
};

export async function createOrMergeLead(ownerId: string | null, lead: CreateLeadInput, options?: { mergeOnDuplicate?: boolean }) {
  if (!hasDb) throw new Error("Supabase environment variables are required to insert leads.");

  const domain = lead.websiteUrl?.replace(/^https?:\/\//, "") ?? "";
  const computedDedupeKey = dedupeKey(lead.businessName, "Unknown", "Manual", lead.phone ?? "", domain);
  const importedFields = normalizeImportedFields(lead.importedFields);
  const csvImportBatchId = typeof lead.csvImportBatchId === "string" && lead.csvImportBatchId.trim() ? lead.csvImportBatchId.trim() : null;
  const csvImportedAt = typeof lead.csvImportedAt === "string" && lead.csvImportedAt.trim() ? lead.csvImportedAt.trim() : null;
  const resolvedSourceQuery = lead.sourceQuery ?? "manual_entry";
  const resolvedSourceType =
    normalizeLeadSourceType(lead.sourceType) ??
    inferLeadSourceType({
      sourceQuery: resolvedSourceQuery,
      businessType: "Manual",
      city: "Unknown",
    });

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
            email: lead.email ?? null,
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
              ai_research_summary: lead.aiResearchSummary ?? null,
              leadQuality: lead.leadQuality ?? null,
              lead_quality: lead.leadQuality ?? null,
              googleRating: lead.googleRating ?? null,
              google_rating: lead.googleRating ?? null,
              googleReviews: lead.googleReviews ?? null,
              google_reviews: lead.googleReviews ?? null,
              importedFields,
              imported_fields: importedFields,
              csvImportBatchId,
              csv_import_batch_id: csvImportBatchId,
              csvImportedAt,
              csv_imported_at: csvImportedAt,
              enrichment: null,
              sourceQuery: resolvedSourceQuery,
              source_query: resolvedSourceQuery,
              sourceType: resolvedSourceType,
              source_type: resolvedSourceType,
            },
          }
        : {
            businessName: lead.businessName,
            city: "Unknown",
            businessType: "Manual",
            phone: lead.phone ?? null,
            email: lead.email ?? null,
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
              ai_research_summary: lead.aiResearchSummary ?? null,
              leadQuality: lead.leadQuality ?? null,
              lead_quality: lead.leadQuality ?? null,
              googleRating: lead.googleRating ?? null,
              google_rating: lead.googleRating ?? null,
              googleReviews: lead.googleReviews ?? null,
              google_reviews: lead.googleReviews ?? null,
              importedFields,
              imported_fields: importedFields,
              csvImportBatchId,
              csv_import_batch_id: csvImportBatchId,
              csvImportedAt,
              csv_imported_at: csvImportedAt,
              enrichment: null,
              sourceQuery: resolvedSourceQuery,
              source_query: resolvedSourceQuery,
              sourceType: resolvedSourceType,
              source_type: resolvedSourceType,
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
      const mergedImportedFields = mergeImportedFields(existingPayload, importedFields);
      const existingAiResearchSummary = getSourcePayloadString(existingPayload, ["aiResearchSummary", "ai_research_summary"]);
      const existingSourceQuery = getSourcePayloadString(existingPayload, ["sourceQuery", "source_query"]);
      const existingSourceType =
        normalizeLeadSourceType(existingPayload.sourceType) ??
        normalizeLeadSourceType(existingPayload.source_type);
      const existingLeadQuality = getSourcePayloadString(existingPayload, ["leadQuality", "lead_quality", "LeadQuality"]);
      const existingGoogleRating = getSourcePayloadString(existingPayload, ["googleRating", "google_rating", "GoogleRating"]);
      const existingGoogleReviews = getSourcePayloadString(existingPayload, ["googleReviews", "google_reviews", "GoogleReviews"]);
      const patchPayload = isSnakeLeadsTable(table)
        ? {
            ...(existing.owner_id ? {} : { owner_id: ownerId }),
            phone: existing.phone ?? lead.phone ?? null,
            email: existing.email ?? lead.email ?? null,
            website_url: existing.website_url ?? lead.websiteUrl ?? null,
            source_payload: {
              ...existingPayload,
              aiResearchSummary: existingAiResearchSummary ?? lead.aiResearchSummary ?? null,
              ai_research_summary: existingAiResearchSummary ?? lead.aiResearchSummary ?? null,
              sourceQuery: existingSourceQuery ?? resolvedSourceQuery,
              source_query: existingSourceQuery ?? resolvedSourceQuery,
              sourceType: existingSourceType ?? resolvedSourceType,
              source_type: existingSourceType ?? resolvedSourceType,
              leadQuality: existingLeadQuality ?? lead.leadQuality ?? null,
              lead_quality: existingLeadQuality ?? lead.leadQuality ?? null,
              googleRating: existingGoogleRating ?? lead.googleRating ?? null,
              google_rating: existingGoogleRating ?? lead.googleRating ?? null,
              googleReviews: existingGoogleReviews ?? lead.googleReviews ?? null,
              google_reviews: existingGoogleReviews ?? lead.googleReviews ?? null,
              importedFields: mergedImportedFields,
              imported_fields: mergedImportedFields,
              csvImportBatchId: csvImportBatchId ?? existingPayload.csvImportBatchId ?? existingPayload.csv_import_batch_id ?? null,
              csv_import_batch_id: csvImportBatchId ?? existingPayload.csvImportBatchId ?? existingPayload.csv_import_batch_id ?? null,
              csvImportedAt: csvImportedAt ?? existingPayload.csvImportedAt ?? existingPayload.csv_imported_at ?? null,
              csv_imported_at: csvImportedAt ?? existingPayload.csvImportedAt ?? existingPayload.csv_imported_at ?? null,
            },
          }
        : {
            ...(existing.ownerId ? {} : { ownerId }),
            phone: existing.phone ?? lead.phone ?? null,
            email: existing.email ?? lead.email ?? null,
            websiteUrl: existing.websiteUrl ?? lead.websiteUrl ?? null,
            sourcePayload: {
              ...existingPayload,
              aiResearchSummary: existingAiResearchSummary ?? lead.aiResearchSummary ?? null,
              ai_research_summary: existingAiResearchSummary ?? lead.aiResearchSummary ?? null,
              sourceQuery: existingSourceQuery ?? resolvedSourceQuery,
              source_query: existingSourceQuery ?? resolvedSourceQuery,
              sourceType: existingSourceType ?? resolvedSourceType,
              source_type: existingSourceType ?? resolvedSourceType,
              leadQuality: existingLeadQuality ?? lead.leadQuality ?? null,
              lead_quality: existingLeadQuality ?? lead.leadQuality ?? null,
              googleRating: existingGoogleRating ?? lead.googleRating ?? null,
              google_rating: existingGoogleRating ?? lead.googleRating ?? null,
              googleReviews: existingGoogleReviews ?? lead.googleReviews ?? null,
              google_reviews: existingGoogleReviews ?? lead.googleReviews ?? null,
              importedFields: mergedImportedFields,
              imported_fields: mergedImportedFields,
              csvImportBatchId: csvImportBatchId ?? existingPayload.csvImportBatchId ?? existingPayload.csv_import_batch_id ?? null,
              csv_import_batch_id: csvImportBatchId ?? existingPayload.csvImportBatchId ?? existingPayload.csv_import_batch_id ?? null,
              csvImportedAt: csvImportedAt ?? existingPayload.csvImportedAt ?? existingPayload.csv_imported_at ?? null,
              csv_imported_at: csvImportedAt ?? existingPayload.csvImportedAt ?? existingPayload.csv_imported_at ?? null,
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

export async function createLead(ownerId: string | null, lead: CreateLeadInput) {
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
              status: "NEW",
              site_status: "UNBUILT",
              owner_id: ownerId,
              source_payload: {
                socialLinks: lead.socialLinks ?? [],
                aiResearchSummary: lead.aiResearchSummary ?? null,
                enrichment: lead.enrichment ?? null,
                sourceQuery: lead.sourceQuery ?? null,
                sourceType: "SCRAPED",
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
              ownerId,
              sourcePayload: {
                socialLinks: lead.socialLinks ?? [],
                aiResearchSummary: lead.aiResearchSummary ?? null,
                enrichment: lead.enrichment ?? null,
                sourceQuery: lead.sourceQuery ?? null,
                sourceType: "SCRAPED",
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
          ...(research.structured.primaryEmail ? { email: research.structured.primaryEmail } : {}),
          source_payload: {
            ...payload,
            aiResearchSummary: research.summary,
            enrichment: research,
            socialLinks: research.structured.socialLinks,
            researchSources: research.structured.sources,
          },
        }
      : {
          ...(research.structured.primaryEmail ? { email: research.structured.primaryEmail } : {}),
          sourcePayload: {
            ...payload,
            aiResearchSummary: research.summary,
            enrichment: research,
            socialLinks: research.structured.socialLinks,
            researchSources: research.structured.sources,
          },
        }),
  }, { id: `eq.${leadId}` }));
}

export async function setLeadDemoBooking(
  leadId: string,
  booking: { date: string; time: string; timeZone: string; meetLink: string; bookedAt?: string },
) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save booked demos.");

  const rows = await withLeadTableFallback((table) =>
    supabaseRequest<any[]>(table, undefined, {
      select: isSnakeLeadsTable(table) ? "source_payload" : "sourcePayload",
      id: `eq.${leadId}`,
      limit: "1",
    }),
  );
  const existing = rows[0];
  const existingPayload = existing?.sourcePayload ?? existing?.source_payload;
  const payload = existingPayload && typeof existingPayload === "object" ? (existingPayload as Record<string, unknown>) : {};

  const nextDemoBooking = {
    date: booking.date,
    time: booking.time,
    timeZone: booking.timeZone,
    meetLink: booking.meetLink,
    bookedAt: booking.bookedAt ?? new Date().toISOString(),
  };
  const updatedAt = new Date().toISOString();
  const patchLead = async (includeStatus: boolean) =>
    withLeadTableFallback((table) =>
      supabaseRequest(
        table,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(
            isSnakeLeadsTable(table)
              ? {
                  ...(includeStatus ? { status: "DEMO_BOOKED" } : {}),
                  updated_at: updatedAt,
                  source_payload: {
                    ...payload,
                    demoBooking: nextDemoBooking,
                    workspaceStatus: "DEMO_BOOKED",
                    workspaceStatusUpdatedAt: updatedAt,
                  },
                }
              : {
                  ...(includeStatus ? { status: "DEMO_BOOKED" } : {}),
                  updatedAt,
                  sourcePayload: {
                    ...payload,
                    demoBooking: nextDemoBooking,
                    workspaceStatus: "DEMO_BOOKED",
                    workspaceStatusUpdatedAt: updatedAt,
                  },
                },
          ),
        },
        { id: `eq.${leadId}` },
      ),
    );

  try {
    await patchLead(true);
  } catch (error) {
    if (!isLeadStatusConstraintError(error)) throw error;
    await patchLead(false);
  }
}

export async function setLeadStatus(
  leadId: string,
  ownerId: string,
  status: string | null,
  options?: { bypassOwnership?: boolean },
) {
  if (!hasDb) throw new Error("Supabase environment variables are required to update lead status.");

  const nextStatus = typeof status === "string" ? status.trim() : "";

  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,owner_id" : "id,ownerId",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const leadOwnerId = lead.owner_id ?? lead.ownerId ?? null;
  if (!options?.bypassOwnership && leadOwnerId && leadOwnerId !== ownerId) {
    throw new Error("Forbidden");
  }

  const updatedAt = new Date().toISOString();

  await withLeadTableFallback((table) => {
    const ownerColumn = isSnakeLeadsTable(table) ? "owner_id" : "ownerId";
    const filters = {
      id: `eq.${leadId}`,
      ...(!options?.bypassOwnership && leadOwnerId ? { [ownerColumn]: `eq.${ownerId}` } : {}),
    } as Record<string, string>;

    return supabaseRequest(table, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(
        isSnakeLeadsTable(table)
          ? { status: nextStatus || "NEW", updated_at: updatedAt }
          : { status: nextStatus || "NEW", updatedAt },
      ),
    }, filters);
  });

  return { status: nextStatus || "NEW", updatedAt };
}

export async function setLeadWorkspaceStatus(
  leadId: string,
  ownerId: string,
  workspaceStatus: string | null,
  options?: { bypassOwnership?: boolean; canonicalStatus?: string | null },
) {
  if (!hasDb) throw new Error("Supabase environment variables are required to update lead status.");

  const nextWorkspaceStatus = typeof workspaceStatus === "string" ? workspaceStatus.trim().toUpperCase() : "";
  const nextCanonicalStatus = typeof options?.canonicalStatus === "string" ? options.canonicalStatus.trim().toUpperCase() : "";

  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,owner_id,source_payload" : "id,ownerId,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const leadOwnerId = lead.owner_id ?? lead.ownerId ?? null;
  if (!options?.bypassOwnership && leadOwnerId && leadOwnerId !== ownerId) {
    throw new Error("Forbidden");
  }

  const rawPayload = lead.source_payload ?? lead.sourcePayload ?? {};
  const payload =
    rawPayload && typeof rawPayload === "object"
      ? { ...(rawPayload as Record<string, unknown>) }
      : typeof rawPayload === "string"
        ? { ...(parseJsonSafely<Record<string, unknown>>(rawPayload) ?? {}) }
        : {};

  const updatedAt = new Date().toISOString();
  if (nextWorkspaceStatus) {
    payload.workspaceStatus = nextWorkspaceStatus;
    payload.workspaceStatusUpdatedAt = updatedAt;
  } else {
    delete payload.workspaceStatus;
    delete payload.workspaceStatusUpdatedAt;
  }

  const patchLead = async (includeCanonicalStatus: boolean) =>
    withLeadTableFallback((table) => {
      const ownerColumn = isSnakeLeadsTable(table) ? "owner_id" : "ownerId";
      const filters = {
        id: `eq.${leadId}`,
        ...(!options?.bypassOwnership && leadOwnerId ? { [ownerColumn]: `eq.${ownerId}` } : {}),
      } as Record<string, string>;

      return supabaseRequest(table, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(
          isSnakeLeadsTable(table)
            ? {
                ...(includeCanonicalStatus && nextCanonicalStatus ? { status: nextCanonicalStatus } : {}),
                updated_at: updatedAt,
                source_payload: payload,
              }
            : {
                ...(includeCanonicalStatus && nextCanonicalStatus ? { status: nextCanonicalStatus } : {}),
                updatedAt,
                sourcePayload: payload,
              },
        ),
      }, filters);
    });

  try {
    await patchLead(Boolean(nextCanonicalStatus));
  } catch (error) {
    if (!nextCanonicalStatus || !isLeadStatusConstraintError(error)) throw error;
    await patchLead(false);
  }

  return {
    workspaceStatus: nextWorkspaceStatus || null,
    updatedAt,
    status: nextCanonicalStatus || null,
  };
}


export type LeadContactRecord = {
  id: string;
  name: string;
  role?: string;
  phones: string[];
  emails: string[];
};

export async function closeLeadDeal(params: {
  leadId: string;
  actingUserId: string;
  closedDealValue: number;
  stripeCheckoutLink?: string | null;
  bypassOwnership?: boolean;
  soldByUserId?: string | null;
}) {
  if (!hasDb) throw new Error("Supabase environment variables are required to close deals.");

  const { leadId, actingUserId, closedDealValue, stripeCheckoutLink, bypassOwnership = false, soldByUserId } = params;
  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,owner_id,source_payload" : "id,ownerId,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const leadOwnerId = lead.owner_id ?? lead.ownerId ?? null;
  if (!bypassOwnership && leadOwnerId && leadOwnerId !== actingUserId) throw new Error("Forbidden");

  const sourcePayload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;
  const closedAt = new Date().toISOString();
  const resolvedSoldByUserId = (bypassOwnership && typeof soldByUserId === "string" && soldByUserId.trim())
    ? soldByUserId.trim()
    : typeof leadOwnerId === "string" && leadOwnerId.trim()
      ? leadOwnerId.trim()
      : actingUserId;
  const assignableUsers = await listAssignableUsers().catch(() => []);
  const soldByUser = assignableUsers.find((user) => user.id === resolvedSoldByUserId) ?? null;

  const updatedRows = await withLeadTableFallback((table) => {
    const ownerColumn = isSnakeLeadsTable(table) ? "owner_id" : "ownerId";
    const sourcePayloadColumn = isSnakeLeadsTable(table) ? "source_payload" : "sourcePayload";
    const filters = {
      id: `eq.${leadId}`,
      select: "id",
      ...(!bypassOwnership && leadOwnerId ? { [ownerColumn]: `eq.${actingUserId}` } : {}),
    } as Record<string, string>;

      const fullPayload = isSnakeLeadsTable(table)
      ? {
          status: "CLOSED",
          source_payload: {
            ...sourcePayload,
            closedDealValue,
            closedAt,
            stripeCheckoutLink: stripeCheckoutLink ?? null,
            soldByUserId: resolvedSoldByUserId,
            soldByName: soldByUser?.name ?? null,
            soldByEmail: soldByUser?.email ?? null,
          },
        }
      : {
          status: "CLOSED",
          sourcePayload: {
            ...sourcePayload,
            closedDealValue,
            closedAt,
            stripeCheckoutLink: stripeCheckoutLink ?? null,
            soldByUserId: resolvedSoldByUserId,
            soldByName: soldByUser?.name ?? null,
            soldByEmail: soldByUser?.email ?? null,
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
        body: JSON.stringify({ status: "CLOSED" }),
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
    soldByUserId: resolvedSoldByUserId,
    soldByName: soldByUser?.name ?? null,
    soldByEmail: soldByUser?.email ?? null,
  };
}

export async function saveLeadBillingProfile(
  leadId: string,
  billingProfile: NonNullable<Lead["billingProfile"]>,
) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save billing profiles.");

  const rows = await withLeadTableFallback((table) =>
    supabaseRequest<any[]>(table, undefined, {
      select: isSnakeLeadsTable(table) ? "id,source_payload" : "id,sourcePayload",
      id: `eq.${leadId}`,
      limit: "1",
    }),
  );

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const payload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;

  await withLeadTableFallback((table) =>
    supabaseRequest<any[]>(
      table,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(
          isSnakeLeadsTable(table)
            ? { source_payload: { ...payload, billingProfile } }
            : { sourcePayload: { ...payload, billingProfile } },
        ),
      },
      { id: `eq.${leadId}` },
    ),
  );
}

export async function saveLeadAccountManagementProfile(
  leadId: string,
  accountManagement: NonNullable<Lead["accountManagement"]>,
) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save account management profiles.");

  const rows = await withLeadTableFallback((table) =>
    supabaseRequest<any[]>(table, undefined, {
      select: isSnakeLeadsTable(table) ? "id,source_payload" : "id,sourcePayload",
      id: `eq.${leadId}`,
      limit: "1",
    }),
  );

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const payload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;

  await withLeadTableFallback((table) =>
    supabaseRequest<any[]>(
      table,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(
          isSnakeLeadsTable(table)
            ? { source_payload: { ...payload, accountManagement } }
            : { sourcePayload: { ...payload, accountManagement } },
        ),
      },
      { id: `eq.${leadId}` },
    ),
  );
}

export async function saveLeadCommissionPayout(
  leadId: string,
  commissionPayout: NonNullable<Lead["commissionPayout"]>,
) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save commission payouts.");

  const rows = await withLeadTableFallback((table) =>
    supabaseRequest<any[]>(table, undefined, {
      select: isSnakeLeadsTable(table) ? "id,source_payload" : "id,sourcePayload",
      id: `eq.${leadId}`,
      limit: "1",
    }),
  );

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const payload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;

  await withLeadTableFallback((table) =>
    supabaseRequest<any[]>(
      table,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(
          isSnakeLeadsTable(table)
            ? { source_payload: { ...payload, commissionPayout } }
            : { sourcePayload: { ...payload, commissionPayout } },
        ),
      },
      { id: `eq.${leadId}` },
    ),
  );
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

export async function setLeadContacts(leadId: string, ownerId: string, contacts: LeadContactRecord[], options?: { bypassOwnership?: boolean }) {
  if (!hasDb) throw new Error("Supabase environment variables are required to save lead contacts.");

  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,owner_id,source_payload" : "id,ownerId,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) throw new Error("Lead not found.");

  const leadOwnerId = lead.owner_id ?? lead.ownerId ?? null;
  if (!options?.bypassOwnership && leadOwnerId && leadOwnerId !== ownerId) {
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
    const updatedAt = new Date().toISOString();
    const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(
        isSnakeLeadsTable(table)
          ? { owner_id: ownerId, updated_at: updatedAt }
          : { ownerId, updatedAt },
      ),
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

export async function assignLeadOwners(leadIds: string[], ownerId: string | null) {
  if (!leadIds.length) return { assigned: 0, missing: 0 };
  if (!hasDb) throw new Error("Supabase environment variables are required to assign leads.");

  const idFilter = `in.(${leadIds.join(",")})`;
  const existing = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: "id",
    id: idFilter,
  }));

  if (!existing.length) {
    return { assigned: 0, missing: leadIds.length };
  }

  const existingIds = existing
    .map((lead) => (typeof lead.id === "string" ? lead.id : ""))
    .filter(Boolean);

  const assignableIdFilter = `in.(${existingIds.join(",")})`;
  const updatedAt = new Date().toISOString();
  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(
      isSnakeLeadsTable(table)
        ? { owner_id: ownerId, updated_at: updatedAt }
        : { ownerId, updatedAt },
    ),
  }, {
    id: assignableIdFilter,
    select: "id",
  }));

  return {
    assigned: rows.length,
    missing: leadIds.length - existing.length,
  };
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

export async function getLeadById(leadId: string, ownerId: string, options?: { includeAll?: boolean }) {
  if (!hasDb) throw new Error("Supabase environment variables are required to load leads.");
  const leads = await withLeadTableFallback((table) =>
    supabaseRequest<any[]>(table, undefined, {
      select: "*",
      id: `eq.${leadId}`,
      ...(options?.includeAll ? {} : { [isSnakeLeadsTable(table) ? "owner_id" : "ownerId"]: `eq.${ownerId}` }),
      limit: "1",
    }),
  );
  const lead = leads[0];
  return lead ? leadToMemory(lead) : undefined;
}

function normalizeLeadNote(row: any): LeadNote {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    leadId: String(row.lead_id ?? row.leadId ?? ""),
    content: sanitizeContactLensNoteContent(String(row.content ?? row.note ?? "")),
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
  const cleanContent = sanitizeContactLensNoteContent(note.content);
  const created: LeadNote = {
    id: note.id ?? crypto.randomUUID(),
    leadId,
    content: cleanContent,
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

async function sanitizePayloadLeadNotes(leadId: string): Promise<void> {
  const rows = await withLeadTableFallback((table) => supabaseRequest<any[]>(table, undefined, {
    select: isSnakeLeadsTable(table) ? "id,source_payload" : "id,sourcePayload",
    id: `eq.${leadId}`,
    limit: "1",
  }));

  const lead = rows[0];
  if (!lead) return;

  const payload = (lead.source_payload ?? lead.sourcePayload ?? {}) as Record<string, unknown>;
  const existingNotes = Array.isArray(payload.notes) ? payload.notes : [];
  if (!existingNotes.length) return;

  let changed = false;
  const sanitizedNotes = existingNotes.map((item) => {
    if (!item || typeof item !== "object") return item;
    const note = item as Record<string, unknown>;
    const currentContent = typeof note.content === "string" ? note.content : typeof note.note === "string" ? note.note : "";
    const sanitizedContent = sanitizeContactLensNoteContent(currentContent);
    if (sanitizedContent !== currentContent) {
      changed = true;
      return {
        ...note,
        ...(typeof note.content === "string" ? { content: sanitizedContent } : {}),
        ...(typeof note.note === "string" ? { note: sanitizedContent } : {}),
      };
    }
    return item;
  });

  if (!changed) return;

  await withLeadTableFallback((table) => supabaseRequest(table, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(isSnakeLeadsTable(table)
      ? { source_payload: { ...payload, notes: sanitizedNotes } }
      : { sourcePayload: { ...payload, notes: sanitizedNotes } }),
  }, { id: `eq.${leadId}` }));
}

async function sanitizeTableLeadNotes(leadId: string): Promise<void> {
  const updateRows = async (table: string, query: Record<string, string>, idColumn: "id", contentColumn: "content" | "note", createdOrder: string) => {
    const rows = await withTableFallback("lead_notes", LEAD_NOTES_TABLE_CANDIDATES, (resolvedTable) =>
      supabaseRequest<any[]>(resolvedTable, undefined, {
        select: `${idColumn},${contentColumn}`,
        ...query,
        order: createdOrder,
        limit: "50",
      }),
    );

    for (const row of rows) {
      const rowId = typeof row?.id === "string" ? row.id.trim() : "";
      const currentContent = typeof row?.[contentColumn] === "string" ? row[contentColumn].trim() : "";
      if (!rowId || !currentContent) continue;
      const sanitizedContent = sanitizeContactLensNoteContent(currentContent);
      if (sanitizedContent === currentContent) continue;

      await supabaseRequest(table, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ [contentColumn]: sanitizedContent }),
      }, { id: `eq.${rowId}` });
    }
  };

  try {
    const table = await withTableFallback("lead_notes", LEAD_NOTES_TABLE_CANDIDATES, async (resolvedTable) => resolvedTable);
    try {
      await updateRows(table, { lead_id: `eq.${leadId}` }, "id", "content", "created_at.desc");
      return;
    } catch (error) {
      if (!isSchemaCacheColumnError(error)) throw error;
    }

    try {
      await updateRows(table, { leadId: `eq.${leadId}` }, "id", "content", "createdAt.desc");
      return;
    } catch (error) {
      if (!isSchemaCacheColumnError(error)) throw error;
    }

    try {
      await updateRows(table, { lead_id: `eq.${leadId}` }, "id", "note", "created_at.desc");
    } catch (error) {
      if (isMissingTableError(error) || isSchemaCacheColumnError(error)) return;
      throw error;
    }
  } catch (error) {
    if (isMissingTableError(error)) return;
    throw error;
  }
}

export async function sanitizeLeadNotesForLead(leadId: string): Promise<void> {
  if (!hasDb) throw new Error("Supabase environment variables are required to sanitize lead notes.");
  await Promise.allSettled([
    sanitizePayloadLeadNotes(leadId),
    sanitizeTableLeadNotes(leadId),
  ]);
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

export async function findLeadIdByContactId(contactId: string): Promise<string | null> {
  if (!hasDb) throw new Error("Supabase environment variables are required to load lead notes.");
  const cleanContactId = contactId.trim();
  if (!cleanContactId) return null;

  try {
    const rows = await withTableFallback("lead_notes", LEAD_NOTES_TABLE_CANDIDATES, (table) =>
      supabaseRequest<any[]>(table, undefined, {
        select: "lead_id,leadId",
        contact_id: `eq.${cleanContactId}`,
        order: "created_at.desc",
        limit: "1",
      }),
    );
    const first = rows[0];
    const leadId = typeof first?.lead_id === "string" ? first.lead_id.trim() : typeof first?.leadId === "string" ? first.leadId.trim() : "";
    if (leadId) return leadId;
  } catch (error) {
    if (!isSchemaCacheColumnError(error)) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
  }

  try {
    const rows = await withTableFallback("lead_notes", LEAD_NOTES_TABLE_CANDIDATES, (table) =>
      supabaseRequest<any[]>(table, undefined, {
        select: "lead_id,leadId",
        contactId: `eq.${cleanContactId}`,
        order: "createdAt.desc",
        limit: "1",
      }),
    );
    const first = rows[0];
    const leadId = typeof first?.lead_id === "string" ? first.lead_id.trim() : typeof first?.leadId === "string" ? first.leadId.trim() : "";
    return leadId || null;
  } catch (error) {
    if (isMissingTableError(error) || isSchemaCacheColumnError(error)) {
      return null;
    }
    throw error;
  }
}

export async function findLeadIdByPhone(phoneNumber: string): Promise<string | null> {
  if (!hasDb) throw new Error("Supabase environment variables are required to load leads.");
  const digits = phoneNumber.replace(/\D/g, "");
  const normalized = digits.length > 10 ? digits.slice(-10) : digits;
  if (!normalized) return null;

  const selectLeadId = (row: any) =>
    typeof row?.id === "string" && row.id.trim()
      ? row.id.trim()
      : typeof row?.lead_id === "string" && row.lead_id.trim()
        ? row.lead_id.trim()
        : typeof row?.leadId === "string" && row.leadId.trim()
          ? row.leadId.trim()
          : "";

  const queries: Record<string, string>[] = [
    { select: "id", normalized_phone: `eq.${normalized}`, order: "created_at.desc", limit: "1" },
    { select: "id", normalizedPhone: `eq.${normalized}`, order: "createdAt.desc", limit: "1" },
    { select: "id,phone", phone: `like.*${normalized}`, order: "created_at.desc", limit: "5" },
  ];

  for (const query of queries) {
    try {
      const rows = await withTableFallback("leads", LEADS_TABLE_CANDIDATES, (table) =>
        supabaseRequest<any[]>(table, undefined, query),
      );
      const exactMatch = rows.find((row) => {
        const value = typeof row?.phone === "string" ? row.phone.replace(/\D/g, "") : "";
        return value.endsWith(normalized);
      });
      const leadId = selectLeadId(exactMatch ?? rows[0]);
      if (leadId) return leadId;
    } catch (error) {
      if (isMissingTableError(error) || isSchemaCacheColumnError(error)) {
        continue;
      }
      throw error;
    }
  }

  return null;
}

export async function createLeadNote(leadId: string, content: string, channel: string, contactId: string | null = null): Promise<LeadNote> {
  if (!hasDb) throw new Error("Supabase environment variables are required to save lead notes.");

  const cleanContent = sanitizeContactLensNoteContent(content.trim());
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

function isLeadClosedWonForTicketPortal(lead: Lead) {
  return (
    resolveLeadWorkspaceStatus(lead) === "CLOSED" ||
    (typeof lead.closedAt === "string" && lead.closedAt.trim().length > 0) ||
    (typeof lead.closedDealValue === "number" && lead.closedDealValue > 0)
  );
}

export function isLeadEligibleForTicketPortal(lead: Lead) {
  return isLeadClosedWonForTicketPortal(lead) && Boolean(lead.accountManagement?.syncEnabled);
}

export async function assertLeadEligibleForTicketPortal(leadId: string) {
  const lead = await getLeadById(leadId, "ticket-portal", { includeAll: true });
  if (!lead) throw new Error("Lead not found.");
  if (!isLeadEligibleForTicketPortal(lead)) {
    throw new Error("Lead is not eligible for client portal ticketing.");
  }
  return lead;
}

const SERVICE_TICKET_CATEGORY_SET = new Set<ServiceTicketCategory>([
  "WEBSITE",
  "CRM",
  "SOCIAL_MEDIA",
  "GOOGLE_ADS",
  "SEO",
  "AUTOMATION",
  "BILLING",
  "OTHER",
]);

const SERVICE_TICKET_PRIORITY_SET = new Set<ServiceTicketPriority>(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const SERVICE_TICKET_STATUS_SET = new Set<ServiceTicketStatus>([
  "NEW",
  "TRIAGED",
  "IN_PROGRESS",
  "WAITING_ON_CLIENT",
  "COMPLETED",
  "CANCELLED",
]);
const SERVICE_TICKET_SOURCE_SET = new Set<ServiceTicketSource>(["CLIENT_PORTAL", "INTERNAL"]);

function normalizeServiceTicketCategory(value: unknown): ServiceTicketCategory {
  const candidate = typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
  return SERVICE_TICKET_CATEGORY_SET.has(candidate as ServiceTicketCategory) ? (candidate as ServiceTicketCategory) : "OTHER";
}

function normalizeServiceTicketPriority(value: unknown): ServiceTicketPriority {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() : "";
  return SERVICE_TICKET_PRIORITY_SET.has(candidate as ServiceTicketPriority) ? (candidate as ServiceTicketPriority) : "MEDIUM";
}

function normalizeServiceTicketStatus(value: unknown): ServiceTicketStatus {
  const candidate = typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
  return SERVICE_TICKET_STATUS_SET.has(candidate as ServiceTicketStatus) ? (candidate as ServiceTicketStatus) : "NEW";
}

function normalizeServiceTicketSource(value: unknown): ServiceTicketSource {
  const candidate = typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
  return SERVICE_TICKET_SOURCE_SET.has(candidate as ServiceTicketSource) ? (candidate as ServiceTicketSource) : "INTERNAL";
}

function normalizeServiceTicketRecord(leadId: string, businessName: string, value: unknown): ServiceTicket | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : crypto.randomUUID();
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (!title || !description) return null;

  const nowIso = new Date().toISOString();
  const createdAt = typeof record.createdAt === "string" && record.createdAt.trim() ? record.createdAt : nowIso;
  const updatedAt = typeof record.updatedAt === "string" && record.updatedAt.trim() ? record.updatedAt : createdAt;

  return {
    id,
    leadId,
    businessName: typeof record.businessName === "string" && record.businessName.trim() ? record.businessName : businessName,
    category: normalizeServiceTicketCategory(record.category),
    priority: normalizeServiceTicketPriority(record.priority),
    status: normalizeServiceTicketStatus(record.status),
    source: normalizeServiceTicketSource(record.source),
    title,
    description,
    createdAt,
    updatedAt,
    dueDate: typeof record.dueDate === "string" && record.dueDate.trim() ? record.dueDate : null,
    createdByUserId: typeof record.createdByUserId === "string" ? record.createdByUserId : null,
    createdByName: typeof record.createdByName === "string" ? record.createdByName : null,
    clientName: typeof record.clientName === "string" ? record.clientName : null,
    clientEmail: typeof record.clientEmail === "string" ? record.clientEmail : null,
    resolutionNotes: typeof record.resolutionNotes === "string" ? record.resolutionNotes : null,
    resolvedAt: typeof record.resolvedAt === "string" ? record.resolvedAt : null,
  };
}

async function getLeadSourcePayloadRecord(leadId: string): Promise<{ table: string; leadRow: any; payload: Record<string, unknown> }> {
  if (!hasDb) throw new Error("Supabase environment variables are required to load leads.");

  let resolvedTableName = "";
  const rows = await withLeadTableFallback((table) => {
    resolvedTableName = table;
    return supabaseRequest<any[]>(table, undefined, {
      select: isSnakeLeadsTable(table) ? "id,business_name,businessName,source_payload" : "id,business_name,businessName,sourcePayload",
      id: `eq.${leadId}`,
      limit: "1",
    });
  });

  const leadRow = rows[0];
  if (!leadRow) throw new Error("Lead not found.");

  const payload = (leadRow.source_payload ?? leadRow.sourcePayload ?? {}) as Record<string, unknown>;
  return { table: resolvedTableName, leadRow, payload };
}

function getClientPortalTokenFromPayload(payload: Record<string, unknown>) {
  const clientPortal =
    payload.clientPortal && typeof payload.clientPortal === "object"
      ? (payload.clientPortal as Record<string, unknown>)
      : payload.client_portal && typeof payload.client_portal === "object"
        ? (payload.client_portal as Record<string, unknown>)
        : null;

  if (clientPortal && typeof clientPortal.accessToken === "string" && clientPortal.accessToken.trim()) {
    return clientPortal.accessToken.trim();
  }

  if (typeof payload.clientPortalAccessToken === "string" && payload.clientPortalAccessToken.trim()) {
    return payload.clientPortalAccessToken.trim();
  }

  if (typeof payload.client_portal_access_token === "string" && payload.client_portal_access_token.trim()) {
    return payload.client_portal_access_token.trim();
  }

  return "";
}

function getServiceTicketsFromPayload(leadId: string, businessName: string, payload: Record<string, unknown>): ServiceTicket[] {
  const rawTickets = Array.isArray(payload.serviceTickets)
    ? payload.serviceTickets
    : Array.isArray(payload.service_tickets)
      ? payload.service_tickets
      : [];

  return rawTickets
    .map((item) => normalizeServiceTicketRecord(leadId, businessName, item))
    .filter((item): item is ServiceTicket => Boolean(item))
    .sort((a, b) => {
      const statusRank = (status: ServiceTicketStatus) => {
        if (status === "NEW") return 0;
        if (status === "TRIAGED") return 1;
        if (status === "IN_PROGRESS") return 2;
        if (status === "WAITING_ON_CLIENT") return 3;
        if (status === "COMPLETED") return 4;
        return 5;
      };
      const statusCompare = statusRank(a.status) - statusRank(b.status);
      if (statusCompare !== 0) return statusCompare;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

async function saveLeadSourcePayloadRecord(table: string, leadId: string, payload: Record<string, unknown>) {
  await supabaseRequest(table, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(
      isSnakeLeadsTable(table)
        ? { source_payload: payload }
        : { sourcePayload: payload },
    ),
  }, { id: `eq.${leadId}` });
}

export async function ensureLeadClientPortalToken(leadId: string) {
  const eligibleLead = await assertLeadEligibleForTicketPortal(leadId);
  const { table, leadRow, payload } = await getLeadSourcePayloadRecord(leadId);
  const existingToken = getClientPortalTokenFromPayload(payload);
  if (existingToken) {
    return {
      token: existingToken,
      businessName: eligibleLead.businessName || String(leadRow.businessName ?? leadRow.business_name ?? "Client"),
    };
  }

  const token = crypto.randomUUID();
  const clientPortal =
    payload.clientPortal && typeof payload.clientPortal === "object"
      ? (payload.clientPortal as Record<string, unknown>)
      : payload.client_portal && typeof payload.client_portal === "object"
        ? (payload.client_portal as Record<string, unknown>)
        : {};

  const nextPayload = {
    ...payload,
    clientPortal: {
      ...clientPortal,
      accessToken: token,
      enabled: true,
      updatedAt: new Date().toISOString(),
    },
    clientPortalAccessToken: token,
    client_portal_access_token: token,
  };

  await saveLeadSourcePayloadRecord(table, leadId, nextPayload);
  return {
    token,
    businessName: eligibleLead.businessName || String(leadRow.businessName ?? leadRow.business_name ?? "Client"),
  };
}

export async function validateLeadClientPortalToken(leadId: string, token: string) {
  const normalizedToken = token.trim();
  if (!normalizedToken) return false;
  try {
    await assertLeadEligibleForTicketPortal(leadId);
  } catch {
    return false;
  }
  const { payload } = await getLeadSourcePayloadRecord(leadId);
  const existingToken = getClientPortalTokenFromPayload(payload);
  return Boolean(existingToken && existingToken === normalizedToken);
}

export async function listLeadServiceTickets(leadId: string): Promise<ServiceTicket[]> {
  const { leadRow, payload } = await getLeadSourcePayloadRecord(leadId);
  const businessName = String(leadRow.businessName ?? leadRow.business_name ?? "Client");
  return getServiceTicketsFromPayload(leadId, businessName, payload);
}

export async function listAllServiceTickets(): Promise<ServiceTicket[]> {
  if (!hasDb) throw new Error("Supabase environment variables are required to load tickets.");

  const rows = await withLeadTableFallback((table) =>
    supabaseRequest<any[]>(table, undefined, {
      select: isSnakeLeadsTable(table) ? "id,business_name,source_payload" : "id,businessName,sourcePayload",
      order: isSnakeLeadsTable(table) ? "updated_at.desc" : "updatedAt.desc",
      limit: "2000",
    }),
  );

  const tickets = rows.flatMap((row) => {
    const leadId = String(row.id ?? "");
    if (!leadId) return [];
    const businessName = String(row.businessName ?? row.business_name ?? "Client");
    const payload = (row.source_payload ?? row.sourcePayload ?? {}) as Record<string, unknown>;
    return getServiceTicketsFromPayload(leadId, businessName, payload);
  });

  return tickets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createLeadServiceTicket(
  leadId: string,
  input: {
    category: ServiceTicketCategory;
    priority?: ServiceTicketPriority;
    source?: ServiceTicketSource;
    title: string;
    description: string;
    dueDate?: string | null;
    createdByUserId?: string | null;
    createdByName?: string | null;
    clientName?: string | null;
    clientEmail?: string | null;
  },
) {
  const { table, leadRow, payload } = await getLeadSourcePayloadRecord(leadId);
  const businessName = String(leadRow.businessName ?? leadRow.business_name ?? "Client");
  const existingTickets = getServiceTicketsFromPayload(leadId, businessName, payload);

  const title = input.title.trim();
  const description = input.description.trim();
  if (!title) throw new Error("Ticket title is required.");
  if (!description) throw new Error("Ticket description is required.");

  const nowIso = new Date().toISOString();
  const ticket: ServiceTicket = {
    id: crypto.randomUUID(),
    leadId,
    businessName,
    category: normalizeServiceTicketCategory(input.category),
    priority: normalizeServiceTicketPriority(input.priority),
    status: "NEW",
    source: normalizeServiceTicketSource(input.source),
    title,
    description,
    createdAt: nowIso,
    updatedAt: nowIso,
    dueDate: input.dueDate?.trim() ? input.dueDate.trim() : null,
    createdByUserId: input.createdByUserId ?? null,
    createdByName: input.createdByName ?? null,
    clientName: input.clientName ?? null,
    clientEmail: input.clientEmail ?? null,
    resolutionNotes: null,
    resolvedAt: null,
  };

  const nextTickets = [ticket, ...existingTickets].slice(0, 300);
  const nextPayload = {
    ...payload,
    serviceTickets: nextTickets,
    service_tickets: nextTickets,
  };
  await saveLeadSourcePayloadRecord(table, leadId, nextPayload);
  return ticket;
}

export async function updateLeadServiceTicket(
  leadId: string,
  ticketId: string,
  patch: {
    status?: ServiceTicketStatus;
    priority?: ServiceTicketPriority;
    dueDate?: string | null;
    resolutionNotes?: string | null;
  },
) {
  const { table, leadRow, payload } = await getLeadSourcePayloadRecord(leadId);
  const businessName = String(leadRow.businessName ?? leadRow.business_name ?? "Client");
  const existingTickets = getServiceTicketsFromPayload(leadId, businessName, payload);
  const index = existingTickets.findIndex((ticket) => ticket.id === ticketId);
  if (index < 0) throw new Error("Ticket not found.");

  const current = existingTickets[index];
  const nextStatus = patch.status ? normalizeServiceTicketStatus(patch.status) : current.status;
  const updated: ServiceTicket = {
    ...current,
    status: nextStatus,
    priority: patch.priority ? normalizeServiceTicketPriority(patch.priority) : current.priority,
    dueDate: patch.dueDate === undefined ? current.dueDate ?? null : patch.dueDate,
    resolutionNotes: patch.resolutionNotes === undefined ? current.resolutionNotes ?? null : patch.resolutionNotes,
    resolvedAt:
      nextStatus === "COMPLETED"
        ? current.resolvedAt ?? new Date().toISOString()
        : nextStatus === "CANCELLED"
          ? current.resolvedAt
          : null,
    updatedAt: new Date().toISOString(),
  };
  existingTickets[index] = updated;

  const nextPayload = {
    ...payload,
    serviceTickets: existingTickets,
    service_tickets: existingTickets,
  };
  await saveLeadSourcePayloadRecord(table, leadId, nextPayload);
  return updated;
}
