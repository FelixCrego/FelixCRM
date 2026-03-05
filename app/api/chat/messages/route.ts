export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createChatMessage, listChatMessages } from "@/lib/chat-store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limitParam = new URL(request.url).searchParams.get("limit");
    const limit = Number(limitParam ?? "100");
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 100;
    const messages = await listChatMessages(safeLimit);

    return NextResponse.json({ messages, userId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load chat messages." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as { content?: string } | null;
    const content = body?.content?.trim();

    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const message = await createChatMessage(userId, content);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send chat message." }, { status: 500 });
  }
}
