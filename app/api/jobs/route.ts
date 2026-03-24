import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getRecruitingAccessScope, toSupabaseInFilter } from "@/lib/recruiting-access";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getConfig() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { supabaseUrl, serviceRoleKey };
}

type PostgrestError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;

  const maybeError = payload as PostgrestError;
  const message = typeof maybeError.message === "string" ? maybeError.message : "";
  const details = typeof maybeError.details === "string" ? maybeError.details : "";

  if (message.includes("Could not find the table 'public.jobs' in the schema cache")) {
    return "Recruiting tables are not installed in Supabase yet. Run supabase/ats_tables.sql and refresh the PostgREST schema cache.";
  }

  return message || details || fallback;
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const includeSharedRequested = new URL(request.url).searchParams.get("includeShared") === "1";
    const access = await getRecruitingAccessScope(user.id, user.email, includeSharedRequested);
    const { supabaseUrl, serviceRoleKey } = getConfig();
    const query = new URLSearchParams({
      select: "id,manager_id,title,description,department,status,created_at",
      manager_id: access.managerIds.length > 1 ? toSupabaseInFilter(access.managerIds) : `eq.${access.managerIds[0]}`,
      order: "created_at.desc",
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/jobs?${query.toString()}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return NextResponse.json({ error: getErrorMessage(data, "Unable to load jobs.") }, { status: response.status });
    }

    return NextResponse.json({
      jobs: Array.isArray(data) ? data : [],
      canViewShared: access.canViewShared,
      includeShared: access.includeShared,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load jobs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => null)) as { title?: string; description?: string; department?: string | null } | null;
    const title = body?.title?.trim();
    const description = body?.description?.trim();
    const department = body?.department?.trim() || null;

    if (!title || !description) {
      return NextResponse.json({ error: "Title and description are required." }, { status: 400 });
    }

    const payload = {
      manager_id: user.id,
      title,
      description,
      department,
      status: "open",
    };

    const { supabaseUrl, serviceRoleKey } = getConfig();
    const response = await fetch(`${supabaseUrl}/rest/v1/jobs`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return NextResponse.json({ error: getErrorMessage(data, "Unable to create job.") }, { status: response.status });
    }

    const [job] = Array.isArray(data) ? data : [];
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create job.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
