export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { listLeads, releaseStaleLeads } from "@/lib/store";

export async function GET() {
  await releaseStaleLeads();
  const leads = await listLeads();
  return NextResponse.json({ leads });
}
