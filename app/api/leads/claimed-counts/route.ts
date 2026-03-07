import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { listClaimedLeadCountsByUser } from "@/lib/store";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const counts = await listClaimedLeadCountsByUser();
    return NextResponse.json({ counts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load claimed lead counts." },
      { status: 500 },
    );
  }
}
