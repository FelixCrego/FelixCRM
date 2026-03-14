import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getConfig() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { supabaseUrl, serviceRoleKey };
}

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { supabaseUrl, serviceRoleKey } = getConfig();
    const query = new URLSearchParams({
      select: "id,manager_id,title,description,department,status,created_at",
      manager_id: `eq.${userId}`,
      order: "created_at.desc",
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/jobs?${query.toString()}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => []);
    if (!response.ok) return NextResponse.json({ error: "Unable to load jobs." }, { status: response.status });

    return NextResponse.json({ jobs: Array.isArray(data) ? data : [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load jobs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => null)) as { title?: string; description?: string; department?: string | null } | null;
    const title = body?.title?.trim();
    const description = body?.description?.trim();
    const department = body?.department?.trim() || null;

    if (!title || !description) {
      return NextResponse.json({ error: "Title and description are required." }, { status: 400 });
    }

    const payload = {
      manager_id: userId,
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

    const data = await response.json().catch(() => []);
    if (!response.ok) return NextResponse.json({ error: "Unable to create job." }, { status: response.status });

    const [job] = Array.isArray(data) ? data : [];
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create job.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
