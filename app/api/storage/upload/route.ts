import { NextResponse } from "next/server";

const BUCKET_CANDIDATES = ["user-uploads", "assets"];

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { supabaseUrl, serviceRoleKey };
}

function sanitizeFilename(name: string) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safeBase = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "upload";
  return extension ? `${safeBase}.${extension}` : safeBase;
}

async function ensurePublicBucket(supabaseUrl: string, serviceRoleKey: string): Promise<string> {
  for (const bucket of BUCKET_CANDIDATES) {
    const getResponse = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (getResponse.ok) {
      return bucket;
    }

    const message = await getResponse.text();
    const bucketMissing =
      getResponse.status === 404 ||
      /bucket\s+not\s+found/i.test(message) ||
      /"statusCode"\s*:\s*"?404"?/i.test(message);

    if (!bucketMissing) {
      throw new Error(`Unable to check storage bucket \"${bucket}\": ${message || getResponse.statusText}`);
    }

    const createResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: bucket,
        name: bucket,
        public: true,
      }),
    });

    if (createResponse.ok || createResponse.status === 409) {
      return bucket;
    }

    const createMessage = await createResponse.text();
    throw new Error(`Unable to create storage bucket \"${bucket}\": ${createMessage || createResponse.statusText}`);
  }

  throw new Error("No storage bucket candidates are available.");
}

export async function POST(request: Request) {
  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const formData = await request.formData();
    const file = formData.get("file");
    const leadId = typeof formData.get("leadId") === "string" ? String(formData.get("leadId")) : "lead";
    const target = typeof formData.get("target") === "string" ? String(formData.get("target")) : "image";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const bucket = await ensurePublicBucket(supabaseUrl, serviceRoleKey);
    const safeName = sanitizeFilename(file.name || "upload");
    const objectPath = `${leadId.replace(/[^a-zA-Z0-9_-]/g, "-")}/${target.replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now()}-${safeName}`;

    const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: Buffer.from(await file.arrayBuffer()),
    });

    if (!uploadResponse.ok) {
      const message = await uploadResponse.text();
      return NextResponse.json({ error: message || "Failed to upload file to Supabase Storage." }, { status: 502 });
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;

    return NextResponse.json({
      url: publicUrl,
      bucket,
      path: objectPath,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to upload file.",
    }, { status: 500 });
  }
}
