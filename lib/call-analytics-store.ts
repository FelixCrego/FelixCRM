const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type CallAnalyticsRecord = {
  id?: string | null;
  lead_id?: string | null;
  contact_id: string;
  customer_phone?: string | null;
  duration_seconds?: number | null;
  overall_sentiment?: string | null;
  recording_url?: string | null;
  recording_url_expires_at?: string | null;
  recording_s3_uri?: string | null;
  analysis_s3_uri?: string | null;
  transcript_text?: string | null;
  transcript_json?: unknown;
  ai_summary?: string | null;
  agent_talk_time_pct?: number | null;
  customer_talk_time_pct?: number | null;
  interruptions?: number | null;
  event_source?: string | null;
  source_event_time?: string | null;
  raw_payload?: unknown;
};

function getSupabaseHeaders() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase configuration for call analytics.");
  }

  return {
    "Content-Type": "application/json",
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
  };
}

export async function getCallAnalyticsByContactId(contactId: string) {
  const url = new URL("/rest/v1/call_analytics", supabaseUrl);
  url.searchParams.set("contact_id", `eq.${contactId}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: getSupabaseHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const rows = (await response.json()) as CallAnalyticsRecord[];
  return rows[0] ?? null;
}

export async function getCallAnalyticsByLeadAndContactId(leadId: string, contactId: string) {
  const url = new URL("/rest/v1/call_analytics", supabaseUrl);
  url.searchParams.set("lead_id", `eq.${leadId}`);
  url.searchParams.set("contact_id", `eq.${contactId}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: getSupabaseHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const rows = (await response.json()) as CallAnalyticsRecord[];
  return rows[0] ?? null;
}

export async function upsertCallAnalytics(record: CallAnalyticsRecord) {
  const url = new URL("/rest/v1/call_analytics", supabaseUrl);
  url.searchParams.set("on_conflict", "contact_id");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...getSupabaseHeaders(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([record]),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}
