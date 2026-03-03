import type { UserRole } from "@/lib/types";
import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await getProfile(userId));
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
