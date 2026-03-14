import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getConfig() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { supabaseUrl, serviceRoleKey };
}

export async function GET(_request: Request, { params }: { params: { jobId: string } }) {
  try {
    const { supabaseUrl, serviceRoleKey } = getConfig();
    const query = new URLSearchParams({
      select: "id,title,description,department,status,created_at",
      id: `eq.${params.jobId}`,
      limit: "1",
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/jobs?${query.toString()}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => []);
    if (!response.ok) return NextResponse.json({ error: "Unable to load job." }, { status: response.status });

    const [job] = Array.isArray(data) ? data : [];
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load job.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
