export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  canUserAssignLeads,
  getShiftQueueSettings,
  isValidLeadAssignmentUserId,
  listLeads,
  saveShiftQueueSettings,
} from "@/lib/store";
import { getShiftQueueIndustryOptions, normalizeShiftQueueSettings, SHIFT_QUEUE_PRESETS } from "@/lib/shift-queue";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const targetUserId = new URL(request.url).searchParams.get("targetUserId")?.trim() || user.id;
    const canManage = await canUserAssignLeads(user.id, user.email);
    if (targetUserId !== user.id && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [settings, leads] = await Promise.all([
      getShiftQueueSettings(targetUserId),
      listLeads(targetUserId, { includeAll: false }).catch(() => []),
    ]);
    return NextResponse.json({
      settings,
      targetUserId,
      canManage,
      presets: SHIFT_QUEUE_PRESETS,
      industries: getShiftQueueIndustryOptions(leads),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load shift queue settings." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canManage = await canUserAssignLeads(user.id, user.email);
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      targetUserId?: string;
      settings?: unknown;
      clear?: boolean;
    } | null;

    const targetUserId = typeof body?.targetUserId === "string" && body.targetUserId.trim()
      ? body.targetUserId.trim()
      : user.id;

    const isValidAssignee = await isValidLeadAssignmentUserId(targetUserId);
    if (!isValidAssignee) {
      return NextResponse.json({ error: "Invalid target user." }, { status: 400 });
    }

    if (body?.clear) {
      await saveShiftQueueSettings(targetUserId, null, user.id);
      return NextResponse.json({ settings: null, cleared: true });
    }

    const normalizedSettings = normalizeShiftQueueSettings(body?.settings);
    if (!normalizedSettings) {
      return NextResponse.json({ error: "Valid shift queue settings are required." }, { status: 400 });
    }

    const settings = await saveShiftQueueSettings(targetUserId, normalizedSettings, user.id);
    return NextResponse.json({ settings, cleared: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save shift queue settings." },
      { status: 500 },
    );
  }
}
