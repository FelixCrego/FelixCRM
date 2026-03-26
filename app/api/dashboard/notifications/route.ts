import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, setDashboardNotificationReviewed } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await canUserViewAllLeads(user.id, user.email))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as { notificationId?: string; reviewed?: boolean };
    const notificationId = typeof body.notificationId === "string" ? body.notificationId.trim() : "";
    const reviewed = body.reviewed !== false;

    if (!notificationId) {
      return NextResponse.json({ error: "notificationId is required." }, { status: 400 });
    }

    const reviewedIds = await setDashboardNotificationReviewed(user.id, notificationId, reviewed);
    return NextResponse.json({ ok: true, reviewedIds });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update notification." }, { status: 500 });
  }
}
