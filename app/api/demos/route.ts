import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, getEffectiveUserRole, listLeads } from "@/lib/store";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type DemoRow = {
  id: string;
  lead_id?: string | null;
  lead_name: string;
  selected_date: string;
  selected_time: string;
  meet_link?: string | null;
  rep_id: string;
  rep_email?: string | null;
  created_at?: string;
};

const REQUIRED_DEMO_COLUMNS = ["id", "lead_id", "lead_name", "selected_date", "selected_time", "rep_id"];
const OPTIONAL_DEMO_COLUMNS = ["meet_link", "rep_email", "created_at"];

function isMissingColumnError(message: string, column: string) {
  return message.includes(`'${column}'`) || message.includes(`"${column}"`) || message.includes(`column ${column}`);
}

function buildDemosUrl(
  filterField: "rep_id" | "rep_email",
  filterValue: string,
  selectedColumns: string[],
) {
  const url = new URL("/rest/v1/demos", supabaseUrl);
  url.searchParams.set("select", selectedColumns.join(","));
  url.searchParams.set(filterField, `eq.${filterValue}`);
  url.searchParams.set("order", "selected_date.asc,selected_time.asc");
  return url;
}

function buildAllDemosUrl(selectedColumns: string[]) {
  const url = new URL("/rest/v1/demos", supabaseUrl);
  url.searchParams.set("select", selectedColumns.join(","));
  url.searchParams.set("order", "selected_date.asc,selected_time.asc");
  return url;
}

async function fetchDemosByFilter(filterField: "rep_id" | "rep_email", filterValue: string) {
  let selectedColumns = [...REQUIRED_DEMO_COLUMNS, ...OPTIONAL_DEMO_COLUMNS];

  while (selectedColumns.length >= REQUIRED_DEMO_COLUMNS.length) {
    const response = await fetch(buildDemosUrl(filterField, filterValue, selectedColumns), {
      headers: {
        apikey: supabaseServiceRoleKey as string,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (response.ok) {
      const demos = (await response.json().catch(() => [])) as DemoRow[];
      return { demos, tableMissing: false as const };
    }

    const rawMessage = await response.text();
    const parsedMessage = (() => {
      try {
        return JSON.parse(rawMessage) as { code?: string; message?: string };
      } catch {
        return null;
      }
    })();
    const message = parsedMessage?.message || rawMessage || "Failed to fetch demos.";

    if (parsedMessage?.code === "PGRST205") {
      return { demos: [] as DemoRow[], tableMissing: true as const };
    }

    if (filterField === "rep_email" && isMissingColumnError(message, "rep_email")) {
      return { demos: [] as DemoRow[], tableMissing: false as const };
    }

    const missingOptionalColumn = OPTIONAL_DEMO_COLUMNS.find((column) => isMissingColumnError(message, column));
    if (missingOptionalColumn) {
      selectedColumns = selectedColumns.filter((column) => column !== missingOptionalColumn);
      continue;
    }

    throw new Error(message);
  }

  return { demos: [] as DemoRow[], tableMissing: false as const };
}

async function fetchAllDemos() {
  let selectedColumns = [...REQUIRED_DEMO_COLUMNS, ...OPTIONAL_DEMO_COLUMNS];

  while (selectedColumns.length >= REQUIRED_DEMO_COLUMNS.length) {
    const response = await fetch(buildAllDemosUrl(selectedColumns), {
      headers: {
        apikey: supabaseServiceRoleKey as string,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (response.ok) {
      const demos = (await response.json().catch(() => [])) as DemoRow[];
      return { demos, tableMissing: false as const };
    }

    const rawMessage = await response.text();
    const parsedMessage = (() => {
      try {
        return JSON.parse(rawMessage) as { code?: string; message?: string };
      } catch {
        return null;
      }
    })();
    const message = parsedMessage?.message || rawMessage || "Failed to fetch demos.";

    if (parsedMessage?.code === "PGRST205") {
      return { demos: [] as DemoRow[], tableMissing: true as const };
    }

    const missingOptionalColumn = OPTIONAL_DEMO_COLUMNS.find((column) => isMissingColumnError(message, column));
    if (missingOptionalColumn) {
      selectedColumns = selectedColumns.filter((column) => column !== missingOptionalColumn);
      continue;
    }

    throw new Error(message);
  }

  return { demos: [] as DemoRow[], tableMissing: false as const };
}

async function buildLeadFallbackDemos(userId: string, includeAll: boolean) {
  const leads = await listLeads(userId, { includeAll });
  return leads
    .filter((lead) => Boolean(lead.demoBooking?.date && lead.demoBooking?.time))
    .map((lead) => ({
      id: `lead-booking-${lead.id}-${lead.demoBooking?.date}-${lead.demoBooking?.time}`,
      lead_id: lead.id,
      lead_name: lead.businessName || "Unknown Lead",
      selected_date: lead.demoBooking?.date ?? "",
      selected_time: lead.demoBooking?.time ?? "",
      meet_link: lead.demoBooking?.meetLink ?? null,
      rep_id: lead.ownerId ?? "",
      rep_email: null,
      created_at: lead.demoBooking?.bookedAt ?? lead.updatedAt,
    }))
    .filter((demo) => demo.selected_date && demo.selected_time)
    .sort((firstDemo, secondDemo) => {
      const firstKey = `${firstDemo.selected_date} ${firstDemo.selected_time}`;
      const secondKey = `${secondDemo.selected_date} ${secondDemo.selected_time}`;
      return firstKey.localeCompare(secondKey);
    });
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
    const [includeAll, viewerRole] = await Promise.all([
      canUserViewAllLeads(user.id, user.email),
      getEffectiveUserRole(user.id, user.email),
    ]);
    const includeAllUpcomingDemos = includeAll || viewerRole === "TEAM_LEAD";
    if (includeAllUpcomingDemos) {
      const allDemos = await fetchAllDemos();
      if (allDemos.tableMissing) {
        const demos = await buildLeadFallbackDemos(user.id, true);
        return NextResponse.json({ demos });
      }

      return NextResponse.json({ demos: allDemos.demos });
    }

    const byId = await fetchDemosByFilter("rep_id", user.id);
    const byEmail = user.email ? await fetchDemosByFilter("rep_email", user.email) : { demos: [] as DemoRow[], tableMissing: false as const };

    if (byId.tableMissing && byEmail.tableMissing) {
      const demos = await buildLeadFallbackDemos(user.id, false);
      return NextResponse.json({ demos });
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
