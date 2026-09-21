type SyncResult = { synced: boolean; skipped?: boolean; status?: number; error?: string };

function config() {
  return {
    baseUrl: process.env.MARKETING_HUB_BASE_URL?.trim().replace(/\/$/, "") || "",
    token: process.env.MARKETING_HUB_SYNC_TOKEN?.trim() || "",
  };
}

async function post(path: string, payload: unknown): Promise<SyncResult> {
  const { baseUrl, token } = config();
  if (!baseUrl || !token) return { synced: false, skipped: true };
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) return { synced: false, status: response.status, error: await response.text() };
  return { synced: true, status: response.status };
}

export async function syncClosedLeadOutcomeToMarketingHub(lead: unknown) {
  return post("/api/felixcrm/outcomes/closed", { lead, source: "felixcrm" });
}

export async function syncContactLensOutcomeToMarketingHub(lead: unknown, contactLens: unknown) {
  return post("/api/felixcrm/outcomes/contact-lens", { lead, contactLens, source: "felixcrm" });
}
