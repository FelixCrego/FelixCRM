import { NextResponse } from "next/server";
import {
  setAuthCookies,
  signInWithUsernamePassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");

    const session = await signInWithUsernamePassword(username, password);

    const response = NextResponse.json({ ok: true, userId: session.userId });
    setAuthCookies(response, session);

    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sign in." }, { status: 400 });
  }
}
