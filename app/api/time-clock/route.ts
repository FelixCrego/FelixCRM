import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getEffectiveUserRole } from "@/lib/store";
import {
  clockInWorkforceUser,
  clockOutWorkforceUser,
  getUserDisplayName,
  getWorkforceUser,
  listWorkforceUsers,
  reviewWorkforceOvertime,
  saveWorkforceSettings,
  type PayType,
  type WorkforceUser,
} from "@/lib/workforce-store";
import type { UserRole } from "@/lib/types";

const MANAGER_ROLES = new Set<UserRole>(["MANAGER", "SUPER_ADMIN"]);

type Snapshot = {
  viewerRole: UserRole;
  canManageWorkforce: boolean;
  self: WorkforceUser;
  team: WorkforceUser[];
  pendingApprovals: Array<{
    employeeUserId: string;
    employeeName: string;
    employeeEmail: string | null;
    entryId: string;
    clockInAt: string;
    clockOutAt: string | null;
    durationMinutes: number | null;
    overtimeMinutes: number;
    maxWeeklyHours: number | null;
  }>;
};

function isManagerRole(role: UserRole) {
  return MANAGER_ROLES.has(role);
}

function parseNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parsePayType(value: unknown): PayType {
  if (value === "HOURLY") return "HOURLY";
  if (value === "HOURLY_PLUS_COMMISSION") return "HOURLY_PLUS_COMMISSION";
  return "COMMISSION";
}

async function buildSnapshot(userId: string, role: UserRole): Promise<Snapshot> {
  const canManageWorkforce = isManagerRole(role);
  const [self, team] = await Promise.all([
    getWorkforceUser(userId),
    canManageWorkforce ? listWorkforceUsers() : Promise.resolve([] as WorkforceUser[]),
  ]);

  const pendingApprovals = canManageWorkforce
    ? team
        .flatMap((employee) =>
          employee.entries
            .filter((entry) => entry.overtimeStatus === "PENDING" && (entry.overtimeMinutes ?? 0) > 0)
            .map((entry) => ({
              employeeUserId: employee.id,
              employeeName: employee.name,
              employeeEmail: employee.email,
              entryId: entry.id,
              clockInAt: entry.clockInAt,
              clockOutAt: entry.clockOutAt,
              durationMinutes: entry.durationMinutes,
              overtimeMinutes: entry.overtimeMinutes ?? 0,
              maxWeeklyHours: employee.settings.maxWeeklyHours,
            })),
        )
        .sort((a, b) => new Date(a.clockInAt).getTime() - new Date(b.clockInAt).getTime())
    : [];

  return {
    viewerRole: role,
    canManageWorkforce,
    self,
    team,
    pendingApprovals,
  };
}

async function getViewer() {
  const user = await getAuthenticatedUser();
  if (!user?.id) return null;

  const viewerRole = await getEffectiveUserRole(user.id, user.email).catch(() => "REP" as UserRole);
  return { user, viewerRole };
}

export async function GET() {
  try {
    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const snapshot = await buildSnapshot(viewer.user.id, viewer.viewerRole);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load time clock." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as { action?: string } | null;
    if (!body?.action) {
      return NextResponse.json({ error: "Missing action." }, { status: 400 });
    }

    if (body.action === "CLOCK_IN") {
      await clockInWorkforceUser(viewer.user.id);
    } else if (body.action === "CLOCK_OUT") {
      await clockOutWorkforceUser(viewer.user.id);
    } else {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const snapshot = await buildSnapshot(viewer.user.id, viewer.viewerRole);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update time clock." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isManagerRole(viewer.viewerRole)) {
      return NextResponse.json({ error: "Only managers can update workforce settings." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          action?: string;
          userId?: string;
          payType?: unknown;
          hourlyRate?: unknown;
          maxWeeklyHours?: unknown;
          requireOvertimeApproval?: unknown;
          entryId?: string;
          approved?: boolean;
        }
      | null;

    if (!body?.action) {
      return NextResponse.json({ error: "Missing action." }, { status: 400 });
    }

    if (body.action === "SAVE_SETTINGS") {
      if (typeof body.userId !== "string" || !body.userId.trim()) {
        return NextResponse.json({ error: "User is required." }, { status: 400 });
      }

      const payType = parsePayType(body.payType);
      await saveWorkforceSettings(body.userId.trim(), {
        payType,
        hourlyRate: payType === "COMMISSION" ? null : parseNullableNumber(body.hourlyRate),
        maxWeeklyHours: payType === "COMMISSION" ? null : parseNullableNumber(body.maxWeeklyHours),
        requireOvertimeApproval: typeof body.requireOvertimeApproval === "boolean" ? body.requireOvertimeApproval : true,
      });
    } else if (body.action === "REVIEW_OVERTIME") {
      if (typeof body.userId !== "string" || !body.userId.trim() || typeof body.entryId !== "string" || !body.entryId.trim()) {
        return NextResponse.json({ error: "Employee and entry are required." }, { status: 400 });
      }

      const managerName = await getUserDisplayName(viewer.user.id, viewer.user.email).catch(() => "Manager");
      await reviewWorkforceOvertime({
        employeeUserId: body.userId.trim(),
        entryId: body.entryId.trim(),
        approved: body.approved !== false,
        managerUserId: viewer.user.id,
        managerName,
      });
    } else {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const snapshot = await buildSnapshot(viewer.user.id, viewer.viewerRole);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update workforce settings." },
      { status: 500 },
    );
  }
}
