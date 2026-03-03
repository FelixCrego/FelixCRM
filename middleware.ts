import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
  AUTH_USER_HEADER,
  getSupabaseUserByAccessToken,
  refreshSupabaseSession,
} from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth/login", "/api/auth/signup"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function unauthorizedResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const accessToken = request.cookies.get(AUTH_ACCESS_TOKEN_COOKIE)?.value ?? "";
  const refreshToken = request.cookies.get(AUTH_REFRESH_TOKEN_COOKIE)?.value ?? "";

  if (!accessToken && !refreshToken) {
    return unauthorizedResponse(request);
  }

  const user = accessToken ? await getSupabaseUserByAccessToken(accessToken) : null;

  if (user?.id) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(AUTH_USER_HEADER, user.id);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!refreshToken) {
    return unauthorizedResponse(request);
  }

  try {
    const refreshed = await refreshSupabaseSession(refreshToken);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(AUTH_USER_HEADER, refreshed.userId);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.set(AUTH_ACCESS_TOKEN_COOKIE, refreshed.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: refreshed.expiresIn,
    });
    response.cookies.set(AUTH_REFRESH_TOKEN_COOKIE, refreshed.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch {
    return unauthorizedResponse(request);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
