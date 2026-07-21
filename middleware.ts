import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_USER_EMAIL_HEADER, AUTH_USER_HEADER } from "@/lib/auth";

const OPEN_ACCESS_USER_ID = "felix-open-access-owner";
const OPEN_ACCESS_USER_EMAIL = "felix@felixcrego.com";
const LOGIN_PATHS = new Set(["/login", "/signup", "/forgot-password", "/reset-password", "/owner-setup"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (LOGIN_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(AUTH_USER_HEADER, OPEN_ACCESS_USER_ID);
  requestHeaders.set(AUTH_USER_EMAIL_HEADER, OPEN_ACCESS_USER_EMAIL);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
