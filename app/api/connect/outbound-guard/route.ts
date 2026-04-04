import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  OUTBOUND_DIAL_GUARD_SETUP_SQL,
  getOutboundDialGuard,
  reportOutboundThrottle,
  reserveOutboundDialSlot,
} from "@/lib/outbound-dial-guard";

export const runtime = "nodejs";

type OutboundGuardBody = {
  action?: "reserve" | "throttle";
};

async function parseBody(request: Request): Promise<OutboundGuardBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as OutboundGuardBody;
  }

  const text = await request.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as OutboundGuardBody;
  } catch {
    return {};
  }
}

export async function GET() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const status = await getOutboundDialGuard();
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Outbound dial guard is unavailable.";
    return NextResponse.json(
      {
        error: message,
        code: "OUTBOUND_DIAL_GUARD_UNAVAILABLE",
        setupSqlText: OUTBOUND_DIAL_GUARD_SETUP_SQL,
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await parseBody(request);

    if (body.action === "throttle") {
      const result = await reportOutboundThrottle({
        userId: user.id,
        userEmail: user.email ?? null,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await reserveOutboundDialSlot({
      userId: user.id,
      userEmail: user.email ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Outbound dial guard is unavailable.";
    return NextResponse.json(
      {
        error: message,
        code: "OUTBOUND_DIAL_GUARD_UNAVAILABLE",
        setupSqlText: OUTBOUND_DIAL_GUARD_SETUP_SQL,
      },
      { status: 503 },
    );
  }
}
