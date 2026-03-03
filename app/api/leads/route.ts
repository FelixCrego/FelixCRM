export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { listLeads, releaseStaleLeads } from "@/lib/store";

export async function GET() {
  try {
    await releaseStaleLeads();
    const leads = await listLeads();
    return NextResponse.json({ leads });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load leads." }, { status: 500 });
  }
}
