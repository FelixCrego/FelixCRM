export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { listScripts } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ scripts: await listScripts() });
}
