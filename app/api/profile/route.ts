import type { UserRole } from "@/lib/types";
import { NextResponse } from "next/server";
import { getEffectiveUserRole, getProfile, saveProfile } from "@/lib/store";
import { getAuthenticatedUser, getAuthenticatedUserId } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getProfile(user.id);
    const effectiveRole = await getEffectiveUserRole(user.id, user.email);
    return NextResponse.json({ ...profile, role: effectiveRole, userId: user.id, email: user.email ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load profile." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    await saveProfile(userId, {
      niche: body.niche ?? "",
      toneOfVoice: body.toneOfVoice ?? "CONSULTATIVE",
      calendarLink: body.calendarLink ?? "",
      onboardingCompleted: Boolean(body.onboardingCompleted),
      role: (body.role ?? "REP") as UserRole,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save profile." }, { status: 500 });
  }
}
