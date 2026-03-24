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

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const includeSharedRequested = new URL(request.url).searchParams.get("includeShared") === "1";
    const access = await getRecruitingAccessScope(user.id, user.email, includeSharedRequested);
    const { supabaseUrl, serviceRoleKey } = getConfig();
    const query = new URLSearchParams({
      select: "id,job_id,name,email,phone,resume_url,linkedin_url,status,applied_at,jobs!inner(id,title,manager_id)",
      "jobs.manager_id": access.managerIds.length > 1 ? toSupabaseInFilter(access.managerIds) : `eq.${access.managerIds[0]}`,
      order: "applied_at.desc",
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/applicants?${query.toString()}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => []);
    if (!response.ok) return NextResponse.json({ error: "Unable to load applicants." }, { status: response.status });

    const applicants = Array.isArray(data)
      ? data.map((row) => ({
          ...row,
          jobTitle: typeof row?.jobs?.title === "string" ? row.jobs.title : "",
        }))
      : [];

    return NextResponse.json({
      applicants,
      canViewShared: access.canViewShared,
      includeShared: access.includeShared,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load applicants.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
