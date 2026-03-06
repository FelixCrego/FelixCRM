import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type DemoRow = {
  id: string;
  lead_id?: string | null;
  lead_name: string;
  selected_date: string;
  selected_time: string;
  meet_link: string;
  rep_id: string;
  rep_email?: string | null;
  created_at?: string;
};

function buildDemosUrl(filterField: "rep_id" | "rep_email", filterValue: string) {
  const url = new URL("/rest/v1/demos", supabaseUrl);
  url.searchParams.set("select", "id,lead_id,lead_name,selected_date,selected_time,meet_link,rep_id,rep_email,created_at");
  url.searchParams.set(filterField, `eq.${filterValue}`);
  url.searchParams.set("order", "selected_date.asc,selected_time.asc");
  return url;
}

async function fetchDemosByFilter(filterField: "rep_id" | "rep_email", filterValue: string) {
  const response = await fetch(buildDemosUrl(filterField, filterValue), {
    headers: {
      apikey: supabaseServiceRoleKey as string,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const rawMessage = await response.text();
    const parsedMessage = (() => {
      try {
        return JSON.parse(rawMessage) as { code?: string; message?: string };
      } catch {
        return null;
      }
    })();

    if (parsedMessage?.code === "PGRST205") {
      return { demos: [] as DemoRow[], tableMissing: true as const };
    }

    throw new Error(parsedMessage?.message || rawMessage || "Failed to fetch demos.");
  }

  const demos = (await response.json().catch(() => [])) as DemoRow[];
  return { demos, tableMissing: false as const };
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Supabase configuration is missing." }, { status: 500 });
  }

  try {
    const byId = await fetchDemosByFilter("rep_id", user.id);
    const byEmail = user.email ? await fetchDemosByFilter("rep_email", user.email) : { demos: [] as DemoRow[], tableMissing: false as const };

    if (byId.tableMissing && byEmail.tableMissing) {
      return NextResponse.json({
        demos: [],
        warning: "Upcoming demos are unavailable because the Supabase demos table has not been created yet.",
      });
    }

    const deduped = new Map<string, DemoRow>();
    for (const demo of [...byId.demos, ...byEmail.demos]) {
      deduped.set(demo.id, demo);
    }

    const demos = [...deduped.values()].sort((firstDemo, secondDemo) => {
      const firstKey = `${firstDemo.selected_date} ${firstDemo.selected_time}`;
      const secondKey = `${secondDemo.selected_date} ${secondDemo.selected_time}`;
      return firstKey.localeCompare(secondKey);
    });

    return NextResponse.json({ demos });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch demos.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
