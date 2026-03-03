import type { UserRole } from "@/lib/types";
import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/store";

export async function GET() {
  try {
    return NextResponse.json(await getProfile());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load profile." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await saveProfile({
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
