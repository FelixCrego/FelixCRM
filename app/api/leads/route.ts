export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createLead, listClaimableLeads, listLeads, releaseStaleLeads } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await releaseStaleLeads();
    const scope = new URL(request.url).searchParams.get("scope");
    const leads = scope === "all" ? await listClaimableLeads(200) : await listLeads(userId);
    return NextResponse.json({ leads });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load leads." }, { status: 500 });
  }
}


export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as { businessName?: string; phone?: string | null; websiteUrl?: string | null };
    const businessName = body?.businessName?.trim() || "";

    if (!businessName) {
      return NextResponse.json({ error: "Business name is required." }, { status: 400 });
    }

    const lead = await createLead(userId, {
      businessName,
      phone: body?.phone?.trim() || null,
      websiteUrl: body?.websiteUrl?.trim() || null,
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to add lead." }, { status: 500 });
  }
}
