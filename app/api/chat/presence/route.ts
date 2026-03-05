export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { heartbeatChatPresence, listOnlineChatUsers } from "@/lib/chat-store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const onlineCount = heartbeatChatPresence(userId);
    return NextResponse.json({ onlineCount });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update presence." }, { status: 500 });
  }
}

export async function HEAD() {
  const count = listOnlineChatUsers();
  return new NextResponse(null, { status: 200, headers: { "x-online-count": String(count) } });
}
