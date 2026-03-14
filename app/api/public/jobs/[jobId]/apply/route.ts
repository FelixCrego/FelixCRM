import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getConfig() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { supabaseUrl, serviceRoleKey };
}

export async function POST(request: Request, { params }: { params: { jobId: string } }) {
  try {
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      email?: string;
      phone?: string;
      resumeUrl?: string;
      linkedinUrl?: string;
    } | null;

    const name = body?.name?.trim();
    const email = body?.email?.trim().toLowerCase();
    const phone = body?.phone?.trim() || null;
    const resumeUrl = body?.resumeUrl?.trim() || null;
    const linkedinUrl = body?.linkedinUrl?.trim() || null;

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }

    const { supabaseUrl, serviceRoleKey } = getConfig();

    const jobResponse = await fetch(`${supabaseUrl}/rest/v1/jobs?id=eq.${params.jobId}&select=id,status&limit=1`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });
    const jobRows = await jobResponse.json().catch(() => []);
    const [job] = Array.isArray(jobRows) ? jobRows : [];

    if (!jobResponse.ok || !job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    if (job.status !== "open") {
      return NextResponse.json({ error: "This job is no longer accepting applications." }, { status: 400 });
    }

    const payload = {
      job_id: params.jobId,
      name,
      email,
      phone,
      resume_url: resumeUrl,
      linkedin_url: linkedinUrl,
      status: "New",
    };

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/applicants`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    const rows = await insertResponse.json().catch(() => []);
    if (!insertResponse.ok) return NextResponse.json({ error: "Unable to submit application." }, { status: insertResponse.status });

    const [applicant] = Array.isArray(rows) ? rows : [];
    return NextResponse.json({ applicant }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit application.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
