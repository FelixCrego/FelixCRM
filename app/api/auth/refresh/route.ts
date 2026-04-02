export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
  getSupabaseUserByAccessToken,
  refreshSupabaseSession,
  setAuthCookies,
  shouldRefreshAccessToken,
} from "@/lib/auth";

export async function POST() {
  const accessToken = cookies().get(AUTH_ACCESS_TOKEN_COOKIE)?.value ?? "";
  const refreshToken = cookies().get(AUTH_REFRESH_TOKEN_COOKIE)?.value ?? "";
  const currentUser = accessToken ? await getSupabaseUserByAccessToken(accessToken) : null;
  const needsRefresh = !currentUser?.id || shouldRefreshAccessToken(accessToken);

  if (!needsRefresh && currentUser?.id) {
    return NextResponse.json({ ok: true, refreshed: false, userId: currentUser.id });
  }

  if (!refreshToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const refreshed = await refreshSupabaseSession(refreshToken);
    const response = NextResponse.json({ ok: true, refreshed: true, userId: refreshed.userId });
    setAuthCookies(response, refreshed);
    return response;
  } catch {
    if (currentUser?.id) {
      return NextResponse.json({ ok: true, refreshed: false, userId: currentUser.id });
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
