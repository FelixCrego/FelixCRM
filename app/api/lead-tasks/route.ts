export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createLeadTask, listLeadTasks, setLeadTaskCompleted } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

type TaskType = "CALLBACK" | "FOLLOW_UP" | "CHECK_IN" | "CUSTOM";

function isTaskType(value: string): value is TaskType {
  return value === "CALLBACK" || value === "FOLLOW_UP" || value === "CHECK_IN" || value === "CUSTOM";
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const leadId = new URL(request.url).searchParams.get("leadId")?.trim();
    if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

    const tasks = await listLeadTasks(leadId);
    return NextResponse.json({ tasks });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load tasks." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as {
      leadId?: string;
      title?: string;
      type?: string;
      reminderAt?: string;
    } | null;

    const leadId = body?.leadId?.trim();
    const title = body?.title?.trim();
    const typeRaw = body?.type?.trim() || "FOLLOW_UP";
    const reminderAt = body?.reminderAt?.trim();

    if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    if (!reminderAt) return NextResponse.json({ error: "reminderAt is required" }, { status: 400 });
    if (!isTaskType(typeRaw)) return NextResponse.json({ error: "Invalid task type" }, { status: 400 });

    const task = await createLeadTask(leadId, { title, type: typeRaw, reminderAt });
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create task." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as {
      leadId?: string;
      taskId?: string;
      completed?: boolean;
    } | null;

    const leadId = body?.leadId?.trim();
    const taskId = body?.taskId?.trim();

    if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

    const task = await setLeadTaskCompleted(leadId, taskId, Boolean(body?.completed));
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update task." }, { status: 500 });
  }
}
