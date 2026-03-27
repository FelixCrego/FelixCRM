const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizeEmail(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

const SHARED_RECRUITING_VIEWER_EMAILS = new Set(
  (process.env.FELIXCRM_SHARED_RECRUITING_VIEWER_EMAILS ?? "eliot30523@gmail.com,mikanikago@gmail.com")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean),
);

const SHARED_RECRUITING_OWNER_EMAILS = new Set(
  (process.env.FELIXCRM_SHARED_RECRUITING_OWNER_EMAILS ?? "felix@felixcrego.com")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean),
);

type AuthAdminUser = {
  id?: string;
  email?: string | null;
};

async function listAuthUsers(): Promise<Array<AuthAdminUser & { id: string }>> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to load auth users for recruiting access.");
  }

  const payload = (await response.json().catch(() => null)) as { users?: AuthAdminUser[] } | null;
  return Array.isArray(payload?.users)
    ? payload.users.filter((user): user is AuthAdminUser & { id: string } => typeof user.id === "string" && user.id.length > 0)
    : [];
}

export type RecruitingAccessScope = {
  includeShared: boolean;
  canViewShared: boolean;
  managerIds: string[];
};

export function canEmailAccessSharedRecruiting(email: string | null | undefined) {
  return SHARED_RECRUITING_VIEWER_EMAILS.has(normalizeEmail(email));
}

export async function getRecruitingAccessScope(userId: string, email: string | null | undefined, includeSharedRequested: boolean) {
  const canViewShared = canEmailAccessSharedRecruiting(email);

  if (!includeSharedRequested || !canViewShared) {
    return {
      includeShared: false,
      canViewShared,
      managerIds: [userId],
    } satisfies RecruitingAccessScope;
  }

  const users = await listAuthUsers();
  const ownerIds = users
    .filter((user) => SHARED_RECRUITING_OWNER_EMAILS.has(normalizeEmail(user.email)))
    .map((user) => user.id);

  return {
    includeShared: true,
    canViewShared,
    managerIds: [...new Set([userId, ...ownerIds])],
  } satisfies RecruitingAccessScope;
}

export function toSupabaseInFilter(values: string[]) {
  return `in.(${values.map((value) => `"${value}"`).join(",")})`;
}
