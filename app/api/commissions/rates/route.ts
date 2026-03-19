import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserManageAllLeads, listAssignableUsers, saveAssignableUserCommissionRate } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isSuperAdmin = await canUserManageAllLeads(user.id, user.email);
    if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const users = await listAssignableUsers();
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load commission rates." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isSuperAdmin = await canUserManageAllLeads(user.id, user.email);
    if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await request.json()) as { userId?: string; commissionRate?: number | null };
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const commissionRate =
      body.commissionRate === null
        ? null
        : typeof body.commissionRate === "number" && Number.isFinite(body.commissionRate) && body.commissionRate >= 0
          ? body.commissionRate
          : null;

    if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });
    await saveAssignableUserCommissionRate(userId, commissionRate);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save commission rate." }, { status: 500 });
  }
}
