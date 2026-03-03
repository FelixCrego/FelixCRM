import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { requestLeadOwnershipTransfer } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const requesterId = await getAuthenticatedUserId();
    if (!requesterId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await request.json();
    const leadId = typeof payload?.leadId === "string" ? payload.leadId : "";

    if (!leadId) return NextResponse.json({ error: "leadId is required." }, { status: 400 });

    const result = await requestLeadOwnershipTransfer(leadId, requesterId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to request transfer." }, { status: 500 });
  }
}
