import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserManageAllLeads, getUserFinanceSettings, saveUserFinanceSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isSuperAdmin = await canUserManageAllLeads(user.id, user.email);
    if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const settings = await getUserFinanceSettings(user.id);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load finance settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isSuperAdmin = await canUserManageAllLeads(user.id, user.email);
    if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await request.json()) as {
      feeHoldbackRate?: number;
      expenses?: Array<{ id: string; label: string; amount: number; cadence: "MONTHLY" | "ONE_TIME"; effectiveDate?: string | null; notes?: string | null }>;
    };

    await saveUserFinanceSettings(user.id, {
      feeHoldbackRate:
        typeof body.feeHoldbackRate === "number" && Number.isFinite(body.feeHoldbackRate) && body.feeHoldbackRate >= 0
          ? body.feeHoldbackRate
          : 0.06,
      expenses: Array.isArray(body.expenses) ? body.expenses : [],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save finance settings." }, { status: 500 });
  }
}
