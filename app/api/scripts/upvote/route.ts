import { NextResponse } from "next/server";
import { upvoteScript } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json();
  const scriptId = String(body.scriptId ?? "");
  if (!scriptId) return NextResponse.json({ error: "scriptId required" }, { status: 400 });
  await upvoteScript(scriptId);
  return NextResponse.json({ ok: true });
}
