import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserManageAllLeads, listAssignableUsers } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canOverrideSalesAttribution = await canUserManageAllLeads(user.id, user.email);
    if (!canOverrideSalesAttribution) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await listAssignableUsers();
    return NextResponse.json({
      users: users.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load users." },
      { status: 500 },
    );
  }
}
