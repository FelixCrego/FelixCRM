import { NextResponse } from "next/server";
import { clearAuthCookies, getAuthenticatedUser } from "@/lib/auth";
import { endAllActiveUserSessions } from "@/lib/session-activity";

export async function POST() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (user?.id) {
    await endAllActiveUserSessions(user.id).catch(() => null);
  }
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
