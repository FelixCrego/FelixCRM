import { NextResponse } from "next/server";
import { AUTH_ACCESS_TOKEN_COOKIE, AUTH_REFRESH_TOKEN_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_ACCESS_TOKEN_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(AUTH_REFRESH_TOKEN_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
