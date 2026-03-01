import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await getProfile());
}

export async function POST(request: Request) {
  const body = await request.json();
  await saveProfile({
    niche: body.niche ?? "",
    toneOfVoice: body.toneOfVoice ?? "CONSULTATIVE",
    calendarLink: body.calendarLink ?? "",
    onboardingCompleted: Boolean(body.onboardingCompleted),
  });
  return NextResponse.json({ ok: true });
}
