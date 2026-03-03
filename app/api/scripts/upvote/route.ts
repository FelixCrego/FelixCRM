import { NextResponse } from "next/server";
import { upvoteScript } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const scriptId = String(body.scriptId ?? "");
  if (!scriptId) return NextResponse.json({ error: "scriptId required" }, { status: 400 });
  await upvoteScript(scriptId);
  return NextResponse.json({ ok: true });
}
