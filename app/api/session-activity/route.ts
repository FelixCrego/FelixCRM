import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  USER_SESSIONS_SETUP_SQL,
  endUserSession,
  heartbeatUserSession,
  startUserSession,
} from "@/lib/session-activity";

export const runtime = "nodejs";

type SessionActivityBody = {
  action?: "start" | "heartbeat" | "end";
  sessionId?: string;
  path?: string;
  userAgent?: string;
};

async function parseBody(request: Request): Promise<SessionActivityBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as SessionActivityBody;
  }

  const text = await request.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as SessionActivityBody;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await parseBody(request);
    const action = body.action ?? "heartbeat";

    if (action === "start") {
      const session = await startUserSession({
        userId: user.id,
        userEmail: user.email ?? null,
        lastPath: body.path ?? null,
        userAgent: body.userAgent ?? request.headers.get("user-agent"),
      });
      return NextResponse.json({ ok: true, sessionId: session.id });
    }

    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    }

    if (action === "end") {
      await endUserSession({
        sessionId: body.sessionId,
        userId: user.id,
        lastPath: body.path ?? null,
      });
      return NextResponse.json({ ok: true });
    }

    await heartbeatUserSession({
      sessionId: body.sessionId,
      userId: user.id,
      lastPath: body.path ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to track session activity.";
    const status = message.includes("user_sessions") ? 503 : 500;
    return NextResponse.json(
      {
        error: status === 503 ? "Session activity table is not installed yet." : message,
        code: status === 503 ? "USER_SESSIONS_TABLE_MISSING" : undefined,
        setupSql: status === 503 ? "supabase/user_sessions.sql" : undefined,
        setupSqlText: status === 503 ? USER_SESSIONS_SETUP_SQL : undefined,
      },
      { status },
    );
  }
}
