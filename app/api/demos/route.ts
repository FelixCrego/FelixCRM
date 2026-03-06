import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type DemoRow = {
  id: string;
  lead_name: string;
  selected_date: string;
  selected_time: string;
  meet_link: string;
  rep_id: string;
  rep_email?: string | null;
  created_at?: string;
};

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Supabase configuration is missing." }, { status: 500 });
  }

  const url = new URL("/rest/v1/demos", supabaseUrl);
  url.searchParams.set("select", "id,lead_name,selected_date,selected_time,meet_link,rep_id,rep_email,created_at");
  url.searchParams.set("rep_id", `eq.${user.id}`);
  url.searchParams.set("order", "selected_date.asc,selected_time.asc");

  const response = await fetch(url, {
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    return NextResponse.json({ error: message || "Failed to fetch demos." }, { status: 500 });
  }

  const demos = (await response.json().catch(() => [])) as DemoRow[];
  return NextResponse.json({ demos });
}
