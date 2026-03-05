export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { listChatUsers } from "@/lib/chat-store";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const users = await listChatUsers(userId);
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load chat users." }, { status: 500 });
  }
}
