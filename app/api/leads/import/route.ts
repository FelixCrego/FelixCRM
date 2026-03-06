import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { createLead } from "@/lib/store";

type ImportLeadInput = {
  businessName?: unknown;
  phone?: unknown;
  websiteUrl?: unknown;
};

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as { leads?: ImportLeadInput[] };
    if (!Array.isArray(body?.leads) || !body.leads.length) {
      return NextResponse.json({ error: "Leads array is required." }, { status: 400 });
    }

    let createdCount = 0;
    let skippedCount = 0;

    for (const lead of body.leads) {
      const businessName = typeof lead?.businessName === "string" ? lead.businessName.trim() : "";
      if (!businessName) {
        skippedCount += 1;
        continue;
      }

      await createLead(userId, {
        businessName,
        phone: typeof lead?.phone === "string" ? lead.phone.trim() || null : null,
        websiteUrl: typeof lead?.websiteUrl === "string" ? lead.websiteUrl.trim() || null : null,
      });
      createdCount += 1;
    }

    return NextResponse.json({ createdCount, skippedCount }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import leads." },
      { status: 500 },
    );
  }
}
