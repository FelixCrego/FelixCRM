import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getEffectiveUserRole, listLeads, saveManagedUserSettings } from "@/lib/store";
import { buildPayrollSummaries, type UserPayrollSummary } from "@/lib/payroll-utils";
import {
  clockInWorkforceUser,
  clockOutWorkforceUser,
  getUserDisplayName,
  getWorkforceUser,
  listWorkforceUsers,
  reviewTimeClockEditRequest,
  reviewWorkforceOvertime,
  saveTimeClockEntry,
  saveWorkforceSettings,
  submitTimeClockEditRequest,
  type PayType,
  type TimeEditRequestType,
  type WorkforceUser,
} from "@/lib/workforce-store";
import type { UserRole } from "@/lib/types";

const MANAGER_ROLES = new Set<UserRole>(["MANAGER", "SUPER_ADMIN"]);

type Snapshot = {
  viewerRole: UserRole;
  canManageWorkforce: boolean;
  canEditAssignments: boolean;
  self: WorkforceUser;
  team: WorkforceUser[];
  payroll: {
    self: UserPayrollSummary;
    team: UserPayrollSummary[];
  };
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
  pendingTimeEditRequests: Array<{
    employeeUserId: string;
    employeeName: string;
    employeeEmail: string | null;
    requestId: string;
    requestType: TimeEditRequestType;
    submittedAt: string;
    submittedByName: string;
    requestedClockInAt: string;
    requestedClockOutAt: string;
    note: string | null;
    targetEntryId: string | null;
    originalClockInAt: string | null;
    originalClockOutAt: string | null;
  }>;
};

function isManagerRole(role: UserRole) {
  return MANAGER_ROLES.has(role);
}

function canEditAssignments(role: UserRole) {
  return role === "SUPER_ADMIN";
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

function parseNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsePayType(value: unknown): PayType {
  if (value === "HOURLY") return "HOURLY";
  if (value === "HOURLY_PLUS_COMMISSION") return "HOURLY_PLUS_COMMISSION";
  return "COMMISSION";
}

function parseUserRole(value: unknown): UserRole | null {
  if (value === "SUPER_ADMIN" || value === "MANAGER" || value === "TEAM_LEAD" || value === "REP") {
    return value;
  }
  return null;
}

async function buildSnapshot(userId: string, role: UserRole): Promise<Snapshot> {
  const canManageWorkforce = isManagerRole(role);
  const [self, team, leads] = await Promise.all([
    getWorkforceUser(userId),
    canManageWorkforce ? listWorkforceUsers() : Promise.resolve([] as WorkforceUser[]),
    listLeads(userId, { includeAll: canManageWorkforce }).catch(() => []),
  ]);
  const payrollUsers = canManageWorkforce ? team : [self];
  const payrollSummaries = buildPayrollSummaries(payrollUsers, leads);
  const payrollSelf = payrollSummaries.find((summary) => summary.userId === userId) ?? buildPayrollSummaries([self], leads)[0];

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

  const pendingTimeEditRequests = canManageWorkforce
    ? team
        .flatMap((employee) =>
          employee.editRequests
            .filter((request) => request.status === "PENDING")
            .map((request) => {
              const originalEntry = request.targetEntryId ? employee.entries.find((entry) => entry.id === request.targetEntryId) ?? null : null;
              return {
                employeeUserId: employee.id,
                employeeName: employee.name,
                employeeEmail: employee.email,
                requestId: request.id,
                requestType: request.requestType,
                submittedAt: request.submittedAt,
                submittedByName: request.submittedByName,
                requestedClockInAt: request.requestedClockInAt,
                requestedClockOutAt: request.requestedClockOutAt,
                note: request.note,
                targetEntryId: request.targetEntryId,
                originalClockInAt: originalEntry?.clockInAt ?? null,
                originalClockOutAt: originalEntry?.clockOutAt ?? null,
              };
            }),
        )
        .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())
    : [];

  return {
    viewerRole: role,
    canManageWorkforce,
    canEditAssignments: canEditAssignments(role),
    self,
    team,
    payroll: {
      self: payrollSelf,
      team: canManageWorkforce ? payrollSummaries : [],
    },
    pendingApprovals,
    pendingTimeEditRequests,
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

    const body = (await request.json().catch(() => null)) as
      | {
          action?: string;
          targetEntryId?: unknown;
          requestedClockInAt?: unknown;
          requestedClockOutAt?: unknown;
          note?: unknown;
        }
      | null;
    if (!body?.action) {
      return NextResponse.json({ error: "Missing action." }, { status: 400 });
    }

    if (body.action === "CLOCK_IN") {
      await clockInWorkforceUser(viewer.user.id);
    } else if (body.action === "CLOCK_OUT") {
      await clockOutWorkforceUser(viewer.user.id);
    } else if (body.action === "SUBMIT_EDIT_REQUEST") {
      const submitterName = await getUserDisplayName(viewer.user.id, viewer.user.email).catch(() => "Team Member");
      await submitTimeClockEditRequest({
        employeeUserId: viewer.user.id,
        targetEntryId: parseNullableString(body.targetEntryId),
        requestedClockInAt: typeof body.requestedClockInAt === "string" ? body.requestedClockInAt : "",
        requestedClockOutAt: typeof body.requestedClockOutAt === "string" ? body.requestedClockOutAt : "",
        note: parseNullableString(body.note),
        submittedByUserId: viewer.user.id,
        submittedByName: submitterName,
      });
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
          commissionRate?: unknown;
          role?: unknown;
          maxWeeklyHours?: unknown;
          requireOvertimeApproval?: unknown;
          managerUserId?: unknown;
          teamLeadUserId?: unknown;
          managerOverrideRate?: unknown;
          teamLeadOverrideRate?: unknown;
          entryId?: unknown;
          clockInAt?: unknown;
          clockOutAt?: unknown;
          requestId?: unknown;
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
      const commissionRate = parseNullableNumber(body.commissionRate);
      const requestedRole = parseUserRole(body.role);
      const targetUser = await getWorkforceUser(body.userId.trim());

      if (canEditAssignments(viewer.viewerRole) && requestedRole && requestedRole !== targetUser.role) {
        await saveManagedUserSettings(body.userId.trim(), {
          name: targetUser.name,
          role: requestedRole,
          commissionRate,
        });
      }

      await saveWorkforceSettings(body.userId.trim(), {
        payType,
        hourlyRate: payType === "COMMISSION" ? null : parseNullableNumber(body.hourlyRate),
        commissionRate,
        maxWeeklyHours: payType === "COMMISSION" ? null : parseNullableNumber(body.maxWeeklyHours),
        requireOvertimeApproval: typeof body.requireOvertimeApproval === "boolean" ? body.requireOvertimeApproval : true,
        managerUserId: canEditAssignments(viewer.viewerRole) ? parseNullableString(body.managerUserId) : undefined,
        teamLeadUserId: canEditAssignments(viewer.viewerRole) ? parseNullableString(body.teamLeadUserId) : undefined,
        managerOverrideRate: canEditAssignments(viewer.viewerRole) ? parseNullableNumber(body.managerOverrideRate) : undefined,
        teamLeadOverrideRate: canEditAssignments(viewer.viewerRole) ? parseNullableNumber(body.teamLeadOverrideRate) : undefined,
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
    } else if (body.action === "REVIEW_TIME_EDIT") {
      if (typeof body.userId !== "string" || !body.userId.trim() || typeof body.requestId !== "string" || !body.requestId.trim()) {
        return NextResponse.json({ error: "Employee and request are required." }, { status: 400 });
      }

      const managerName = await getUserDisplayName(viewer.user.id, viewer.user.email).catch(() => "Manager");
      await reviewTimeClockEditRequest({
        employeeUserId: body.userId.trim(),
        requestId: body.requestId.trim(),
        approved: body.approved !== false,
        managerUserId: viewer.user.id,
        managerName,
      });
    } else if (body.action === "SAVE_TIME_ENTRY") {
      if (typeof body.userId !== "string" || !body.userId.trim()) {
        return NextResponse.json({ error: "Employee is required." }, { status: 400 });
      }
      if (typeof body.clockInAt !== "string" || typeof body.clockOutAt !== "string") {
        return NextResponse.json({ error: "Clock in and clock out are required." }, { status: 400 });
      }

      const managerName = await getUserDisplayName(viewer.user.id, viewer.user.email).catch(() => "Manager");
      await saveTimeClockEntry({
        employeeUserId: body.userId.trim(),
        entryId: parseNullableString(body.entryId),
        clockInAt: body.clockInAt,
        clockOutAt: body.clockOutAt,
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
