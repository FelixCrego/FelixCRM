export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createChatMessage, listChatMessages } from "@/lib/chat-store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const peerId = url.searchParams.get("peerId");
    const parsedLimit = limitParam ? Number(limitParam) : undefined;
    const safeLimit = typeof parsedLimit === "number" && Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 5000) : undefined;
    const messages = await listChatMessages(userId, safeLimit, peerId);

    return NextResponse.json({ messages, userId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load chat messages." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as { content?: string; recipientId?: string | null } | null;
    const content = body?.content?.trim();
    const recipientId = body?.recipientId?.trim() || null;

    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const message = await createChatMessage(userId, content, recipientId);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send chat message." }, { status: 500 });
  }
}
