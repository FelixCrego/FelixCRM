import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserAccessAccountManagement, saveLeadAccountManagementProfile } from "@/lib/store";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await canUserAccessAccountManagement(user.id, user.email))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      leadId?: string;
      accountManagement?: Lead["accountManagement"];
    };

    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    if (!leadId || !body.accountManagement) {
      return NextResponse.json({ error: "leadId and accountManagement are required." }, { status: 400 });
    }

    await saveLeadAccountManagementProfile(leadId, body.accountManagement as NonNullable<Lead["accountManagement"]>);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save account management profile." }, { status: 500 });
  }
}
