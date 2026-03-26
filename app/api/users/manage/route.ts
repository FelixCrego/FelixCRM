import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  canUserManageAllLeads,
  createManagedUser,
  inviteManagedUser,
  listManagedUsers,
  resendManagedUserInvite,
  resetManagedUserPassword,
  saveManagedUserSettings,
  setManagedUserActive,
} from "@/lib/store";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canUserManageAllLeads(user.id, user.email))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await listManagedUsers();
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load users." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canUserManageAllLeads(user.id, user.email))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      action?: "save" | "reset_password" | "resend_invite" | "toggle_active";
      userId?: string;
      name?: string;
      role?: UserRole;
      commissionRate?: number | null;
      password?: string;
      active?: boolean;
    };

    const action = body.action ?? "save";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const role = body.role === "SUPER_ADMIN" || body.role === "MANAGER" || body.role === "TEAM_LEAD" ? body.role : "REP";
    const commissionRate =
      body.commissionRate === null
        ? null
        : typeof body.commissionRate === "number" && Number.isFinite(body.commissionRate) && body.commissionRate >= 0
          ? body.commissionRate
          : null;

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

    if (action === "reset_password") {
      const password = typeof body.password === "string" ? body.password : "";
      if (!password) {
        return NextResponse.json({ error: "password is required." }, { status: 400 });
      }
      await resetManagedUserPassword(userId, password);
      return NextResponse.json({ ok: true });
    }

    if (action === "resend_invite") {
      await resendManagedUserInvite(userId);
      return NextResponse.json({ ok: true });
    }

    if (action === "toggle_active") {
      if (typeof body.active !== "boolean") {
        return NextResponse.json({ error: "active is required." }, { status: 400 });
      }
      await setManagedUserActive(userId, body.active);
      return NextResponse.json({ ok: true });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }

    await saveManagedUserSettings(userId, { name, role, commissionRate });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save user settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canUserManageAllLeads(user.id, user.email))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      email?: string;
      name?: string;
      role?: UserRole;
      commissionRate?: number | null;
    };

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const role = body.role === "SUPER_ADMIN" || body.role === "MANAGER" || body.role === "TEAM_LEAD" ? body.role : "REP";
    const commissionRate =
      body.commissionRate === null
        ? null
        : typeof body.commissionRate === "number" && Number.isFinite(body.commissionRate) && body.commissionRate >= 0
          ? body.commissionRate
          : null;

    if (!email || !name) {
      return NextResponse.json({ error: "email and name are required." }, { status: 400 });
    }

    await inviteManagedUser({ email, name, role, commissionRate });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to invite user." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canUserManageAllLeads(user.id, user.email))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
      role?: UserRole;
      commissionRate?: number | null;
    };

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const role = body.role === "SUPER_ADMIN" || body.role === "MANAGER" || body.role === "TEAM_LEAD" ? body.role : "REP";
    const commissionRate =
      body.commissionRate === null
        ? null
        : typeof body.commissionRate === "number" && Number.isFinite(body.commissionRate) && body.commissionRate >= 0
          ? body.commissionRate
          : null;

    if (!email || !name || !password) {
      return NextResponse.json({ error: "email, name, and password are required." }, { status: 400 });
    }

    await createManagedUser({ email, password, name, role, commissionRate });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create user." }, { status: 500 });
  }
}
