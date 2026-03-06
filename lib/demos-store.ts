const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SupabaseErrorPayload = {
  code?: string;
  message?: string;
  hint?: string;
  details?: string | null;
  error?: string;
};

type DemoTableConfig = {
  table: string;
  leadNameCol: string;
  selectedDateCol: string;
  selectedTimeCol: string;
  meetLinkCol: string;
  repIdCol: string;
  repEmailCol?: string;
  createdAtCol?: string;
};

const DEMO_TABLE_CONFIGS: DemoTableConfig[] = [
  {
    table: "demos",
    leadNameCol: "lead_name",
    selectedDateCol: "selected_date",
    selectedTimeCol: "selected_time",
    meetLinkCol: "meet_link",
    repIdCol: "rep_id",
    repEmailCol: "rep_email",
    createdAtCol: "created_at",
  },
  {
    table: "demo",
    leadNameCol: "lead_name",
    selectedDateCol: "selected_date",
    selectedTimeCol: "selected_time",
    meetLinkCol: "meet_link",
    repIdCol: "rep_id",
    repEmailCol: "rep_email",
    createdAtCol: "created_at",
  },
  {
    table: "Demos",
    leadNameCol: "leadName",
    selectedDateCol: "selectedDate",
    selectedTimeCol: "selectedTime",
    meetLinkCol: "meetLink",
    repIdCol: "repId",
    repEmailCol: "repEmail",
    createdAtCol: "createdAt",
  },
  {
    table: "Demo",
    leadNameCol: "leadName",
    selectedDateCol: "selectedDate",
    selectedTimeCol: "selectedTime",
    meetLinkCol: "meetLink",
    repIdCol: "repId",
    repEmailCol: "repEmail",
    createdAtCol: "createdAt",
  },
];

export type DemoRecord = {
  id: string;
  lead_name: string;
  selected_date: string;
  selected_time: string;
  meet_link: string;
  rep_id: string;
  rep_email?: string | null;
  created_at?: string;
};

export type DemoInsertInput = {
  leadName: string;
  selectedDate: string;
  selectedTime: string;
  meetLink: string;
  repId: string;
  repEmail?: string | null;
};

function parsePayload(text: string): SupabaseErrorPayload {
  if (!text) return {};
  try {
    return JSON.parse(text) as SupabaseErrorPayload;
  } catch {
    return { message: text };
  }
}

function isMissingTableOrColumnError(payload: SupabaseErrorPayload) {
  const code = payload.code ?? "";
  const message = payload.message ?? payload.error ?? "";
  return code === "PGRST205" || code === "42P01" || code === "PGRST204" || message.includes("schema cache");
}

function ensureSupabaseConfig() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase database configuration is missing.");
  }
}

async function requestSupabase(path: string, init: RequestInit) {
  ensureSupabaseConfig();

  return fetch(new URL(path, supabaseUrl), {
    ...init,
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

export async function insertDemoRecord(input: DemoInsertInput) {
  let lastError: SupabaseErrorPayload | null = null;

  for (const config of DEMO_TABLE_CONFIGS) {
    const row: Record<string, string | null> = {
      [config.leadNameCol]: input.leadName,
      [config.selectedDateCol]: input.selectedDate,
      [config.selectedTimeCol]: input.selectedTime,
      [config.meetLinkCol]: input.meetLink,
      [config.repIdCol]: input.repId,
    };

    if (config.repEmailCol) {
      row[config.repEmailCol] = input.repEmail ?? null;
    }

    const response = await requestSupabase(`/rest/v1/${config.table}`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([row]),
    });

    if (response.ok) {
      return { inserted: true, table: config.table } as const;
    }

    const payload = parsePayload(await response.text());
    if (isMissingTableOrColumnError(payload)) {
      lastError = payload;
      continue;
    }

    throw new Error(payload.message || payload.error || `Failed to save scheduled demo (${response.status}).`);
  }

  return {
    inserted: false,
    table: null,
    error:
      lastError?.message ||
      "Unable to locate a demos table. Run the SQL in supabase/demos_table.sql to enable upcoming demos storage.",
  } as const;
}

export async function listRepDemos(repId: string): Promise<{ demos: DemoRecord[]; setupRequired: boolean; warning?: string }> {
  ensureSupabaseConfig();
  const baseUrl = supabaseUrl as string;
  let lastError: SupabaseErrorPayload | null = null;

  for (const config of DEMO_TABLE_CONFIGS) {
    const selectFields = [
      "id",
      `lead_name:${config.leadNameCol}`,
      `selected_date:${config.selectedDateCol}`,
      `selected_time:${config.selectedTimeCol}`,
      `meet_link:${config.meetLinkCol}`,
      `rep_id:${config.repIdCol}`,
      config.repEmailCol ? `rep_email:${config.repEmailCol}` : null,
      config.createdAtCol ? `created_at:${config.createdAtCol}` : null,
    ]
      .filter(Boolean)
      .join(",");

    const url = new URL(`/rest/v1/${config.table}`, baseUrl);
    url.searchParams.set("select", selectFields);
    url.searchParams.set(config.repIdCol, `eq.${repId}`);
    url.searchParams.set("order", `${config.selectedDateCol}.asc,${config.selectedTimeCol}.asc`);

    const response = await requestSupabase(url.pathname + url.search, { method: "GET" });

    if (response.ok) {
      const rows = (await response.json().catch(() => [])) as DemoRecord[];
      return { demos: rows, setupRequired: false };
    }

    const payload = parsePayload(await response.text());
    if (isMissingTableOrColumnError(payload)) {
      lastError = payload;
      continue;
    }

    throw new Error(payload.message || payload.error || `Failed to fetch demos (${response.status}).`);
  }

  return {
    demos: [],
    setupRequired: true,
    warning:
      lastError?.message ||
      "No compatible demos table was found. Run the SQL in supabase/demos_table.sql to enable Upcoming Demos.",
  };
}
