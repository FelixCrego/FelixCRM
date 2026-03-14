import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";

const VALID_STATUSES = new Set(["New", "Reviewing", "Interviewing", "Hired", "Rejected"]);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getConfig() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { supabaseUrl, serviceRoleKey };
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => null)) as { status?: string } | null;
    const status = body?.status?.trim() || "";

    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid applicant status." }, { status: 400 });
    }

    const { supabaseUrl, serviceRoleKey } = getConfig();
    const ownershipQuery = new URLSearchParams({
      select: "id,jobs!inner(manager_id)",
      id: `eq.${params.id}`,
      "jobs.manager_id": `eq.${userId}`,
      limit: "1",
    });

    const ownershipResponse = await fetch(`${supabaseUrl}/rest/v1/applicants?${ownershipQuery.toString()}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    const ownershipRows = await ownershipResponse.json().catch(() => []);
    if (!ownershipResponse.ok || !Array.isArray(ownershipRows) || ownershipRows.length === 0) {
      return NextResponse.json({ error: "Applicant not found." }, { status: 404 });
    }

    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/applicants?id=eq.${params.id}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status }),
    });

    const data = await updateResponse.json().catch(() => []);
    if (!updateResponse.ok) return NextResponse.json({ error: "Unable to update applicant." }, { status: updateResponse.status });

    const [applicant] = Array.isArray(data) ? data : [];
    return NextResponse.json({ applicant });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update applicant.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
