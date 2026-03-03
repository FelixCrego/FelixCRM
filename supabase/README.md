# Supabase leads setup

Run `supabase/sql/leads_storage_and_queries.sql` in the Supabase SQL editor.

## JS query examples (`@supabase/supabase-js`)

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// 1) Fetch one lead
const { data: oneLead, error: oneLeadError } = await supabase
  .from("leads")
  .select("*")
  .eq("id", leadId)
  .single();

// 2) List leads with direct table query
const { data: leads, error: leadsError } = await supabase
  .from("leads")
  .select("*")
  .order("updated_at", { ascending: false })
  .limit(50);

// 3) Filtered list via RPC helper
const { data: filteredLeads, error: filteredError } = await supabase.rpc("get_leads", {
  p_owner_id: null,
  p_status: "NEW",
  p_city: "Orlando",
  p_business_type: "Garage Door Repair",
  p_search: "door",
  p_limit: 50,
  p_offset: 0,
});

// 4) Upsert (dedupe-safe ingestion)
const { data: upsertedLead, error: upsertError } = await supabase.rpc("upsert_lead", {
  p_business_name: "Eustis Garage Door Repair",
  p_city: "Eustis",
  p_business_type: "Garage Door Repair",
  p_phone: "(352) 845-1524",
  p_email: null,
  p_website_url: null,
  p_website_status: "MISSING",
  p_normalized_name: "eustisgaragedoorrepair",
  p_normalized_phone: "3528451524",
  p_normalized_domain: null,
  p_dedupe_key: "eustis|garage door repair|eustisgaragedoorrepair|3528451524",
  p_source_provider: "google_places",
  p_source_payload: { placeId: "abc123" },
});
```
