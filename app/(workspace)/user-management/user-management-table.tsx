"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/types";

type ManagedUser = {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
  commissionRate: number | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
};

type EditableUser = ManagedUser & {
  draftName: string;
  draftRole: UserRole;
  draftRate: string;
  draftPassword: string;
};

type AccessState = "ACTIVE" | "INACTIVE" | "INVITED" | "SUSPENDED";

function getAccessState(user: ManagedUser): AccessState {
  if (user.status === "SUSPENDED") return "SUSPENDED";
  if (user.status === "INVITED") return "INVITED";
  if (!user.lastSignInAt) return "INACTIVE";

  const lastSeen = new Date(user.lastSignInAt);
  if (Number.isNaN(lastSeen.getTime())) return "INACTIVE";

  const daysSinceLastSeen = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceLastSeen > 30 ? "INACTIVE" : "ACTIVE";
}

function formatLastSeen(lastSignInAt: string | null) {
  if (!lastSignInAt) return "Never";
  const date = new Date(lastSignInAt);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function accessStateClasses(state: AccessState) {
  switch (state) {
    case "SUSPENDED":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "INVITED":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "INACTIVE":
      return "border-zinc-500/40 bg-zinc-700/20 text-zinc-200";
    default:
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
}

function accessStateDetail(user: ManagedUser, state: AccessState) {
  switch (state) {
    case "SUSPENDED":
      return "Login blocked";
    case "INVITED":
      return "Invite pending";
    case "INACTIVE":
      return user.lastSignInAt ? `Last seen ${formatLastSeen(user.lastSignInAt)}` : "Never signed in";
    default:
      return `Last seen ${formatLastSeen(user.lastSignInAt)}`;
  }
}

export default function UserManagementTable({ initialUsers }: { initialUsers: ManagedUser[] }) {
  const router = useRouter();
  const [users, setUsers] = useState<EditableUser[]>(
    initialUsers.map((user) => ({
      ...user,
        draftName: user.name,
        draftRole: user.role,
        draftRate: user.commissionRate === null ? "" : String(Math.round(user.commissionRate * 100)),
        draftPassword: "",
      })),
  );
  const [message, setMessage] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("REP");
  const [inviteRate, setInviteRate] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<UserRole>("REP");
  const [createRate, setCreateRate] = useState("");
  const [createPassword, setCreatePassword] = useState("");

  const stats = useMemo(() => {
    return {
      total: users.length,
      superAdmins: users.filter((user) => user.role === "SUPER_ADMIN").length,
      managers: users.filter((user) => user.role === "MANAGER" || user.role === "TEAM_LEAD").length,
      reps: users.filter((user) => user.role === "REP").length,
      active: users.filter((user) => getAccessState(user) === "ACTIVE").length,
      inactive: users.filter((user) => getAccessState(user) === "INACTIVE").length,
      invited: users.filter((user) => getAccessState(user) === "INVITED").length,
      suspended: users.filter((user) => getAccessState(user) === "SUSPENDED").length,
    };
  }, [users]);

  const updateDraft = (userId: string, patch: Partial<EditableUser>) => {
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, ...patch } : user)));
  };

  const saveUser = (user: EditableUser) => {
    setMessage("");
    setPendingUserId(user.id);
    startTransition(() => {
      const trimmedName = user.draftName.trim();
      const parsedRate = user.draftRate.trim() ? Number(user.draftRate) / 100 : null;

      void fetch("/api/users/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          name: trimmedName,
          role: user.draftRole,
          commissionRate: parsedRate,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            throw new Error(payload?.error || "Failed to save user.");
          }
          setMessage(`Saved ${trimmedName}.`);
          router.refresh();
        })
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "Failed to save user.");
        })
        .finally(() => {
          setPendingUserId(null);
        });
    });
  };

  const runUserAction = (params: {
    userId: string;
    action: "reset_password" | "resend_invite" | "toggle_active";
    password?: string;
    active?: boolean;
    successMessage: string;
    errorMessage: string;
    clearPassword?: boolean;
  }) => {
    setMessage("");
    setPendingUserId(params.userId);
    startTransition(() => {
      void fetch("/api/users/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: params.userId,
          action: params.action,
          password: params.password,
          active: params.active,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            throw new Error(payload?.error || params.errorMessage);
          }
          if (params.clearPassword) {
            updateDraft(params.userId, { draftPassword: "" });
          }
          setMessage(params.successMessage);
          router.refresh();
        })
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : params.errorMessage);
        })
        .finally(() => {
          setPendingUserId(null);
        });
    });
  };

  const inviteUser = () => {
    setMessage("");
    setPendingUserId("invite");
    startTransition(() => {
      const parsedRate = inviteRate.trim() ? Number(inviteRate) / 100 : null;
      void fetch("/api/users/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim(),
          role: inviteRole,
          commissionRate: parsedRate,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            throw new Error(payload?.error || "Failed to invite user.");
          }
          setMessage(`Invite sent to ${inviteEmail.trim()}.`);
          setInviteEmail("");
          setInviteName("");
          setInviteRole("REP");
          setInviteRate("");
          router.refresh();
        })
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "Failed to invite user.");
        })
        .finally(() => {
          setPendingUserId(null);
        });
    });
  };

  const createUser = () => {
    setMessage("");
    setPendingUserId("create");
    startTransition(() => {
      const parsedRate = createRate.trim() ? Number(createRate) / 100 : null;
      void fetch("/api/users/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createEmail.trim(),
          name: createName.trim(),
          role: createRole,
          commissionRate: parsedRate,
          password: createPassword,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            throw new Error(payload?.error || "Failed to create user.");
          }
          setMessage(`Created user ${createEmail.trim()}.`);
          setCreateEmail("");
          setCreateName("");
          setCreateRole("REP");
          setCreateRate("");
          setCreatePassword("");
          router.refresh();
        })
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "Failed to create user.");
        })
        .finally(() => {
          setPendingUserId(null);
        });
    });
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-8">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Total Users</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats.total}</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Superadmins</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats.superAdmins}</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Managers</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats.managers}</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Reps</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats.reps}</p>
        </article>
        <article className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-emerald-300">Active</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats.active}</p>
        </article>
        <article className="rounded-2xl border border-zinc-600/40 bg-zinc-800/30 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Inactive</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats.inactive}</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Invited</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats.invited}</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Suspended</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats.suspended}</p>
        </article>
      </section>

      {message ? <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-300">{message}</div> : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Invite User</h2>
          <p className="mt-1 text-sm text-zinc-400">Create a new rep, manager, or superadmin invite from the CRM.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <input
            value={inviteName}
            onChange={(event) => setInviteName(event.target.value)}
            placeholder="Full name"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
          />
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="Email"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
          />
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as UserRole)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="REP">Rep</option>
            <option value="TEAM_LEAD">Team Lead</option>
            <option value="MANAGER">Manager</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
          <div className="flex items-center gap-2">
            <input
              value={inviteRate}
              onChange={(event) => setInviteRate(event.target.value)}
              placeholder="Commission %"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
            />
            <button
              type="button"
              onClick={inviteUser}
              disabled={(pendingUserId === "invite" && isPending) || !inviteEmail.trim() || !inviteName.trim()}
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 disabled:opacity-60"
            >
              {pendingUserId === "invite" && isPending ? "Inviting..." : "Send Invite"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Create User Directly</h2>
          <p className="mt-1 text-sm text-zinc-400">Create an account immediately, set a password, and hand the credentials to the user manually.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <input
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            placeholder="Full name"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
          />
          <input
            value={createEmail}
            onChange={(event) => setCreateEmail(event.target.value)}
            placeholder="Email"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
          />
          <input
            value={createPassword}
            onChange={(event) => setCreatePassword(event.target.value)}
            placeholder="Temporary password"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
          />
          <select
            value={createRole}
            onChange={(event) => setCreateRole(event.target.value as UserRole)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="REP">Rep</option>
            <option value="TEAM_LEAD">Team Lead</option>
            <option value="MANAGER">Manager</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
          <div className="flex items-center gap-2">
            <input
              value={createRate}
              onChange={(event) => setCreateRate(event.target.value)}
              placeholder="Commission %"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
            />
            <button
              type="button"
              onClick={createUser}
              disabled={(pendingUserId === "create" && isPending) || !createEmail.trim() || !createName.trim() || createPassword.length < 8}
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 disabled:opacity-60"
            >
              {pendingUserId === "create" && isPending ? "Creating..." : "Create User"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Team Directory</h2>
          <p className="mt-1 text-sm text-zinc-400">Manage identity, permissions, password resets, and access state from one place.</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Last Sign In</th>
                <th className="px-4 py-3">Lifecycle</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const rowPending = pendingUserId === user.id && isPending;
                const accessState = getAccessState(user);
                return (
                  <tr key={user.id} className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-200">
                    <td className="px-4 py-3">
                      <input
                        value={user.draftName}
                        onChange={(event) => updateDraft(user.id, { draftName: event.target.value })}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
                      />
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{user.email ?? "No email"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${accessStateClasses(accessState)}`}
                      >
                        {accessState}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.draftRole}
                        onChange={(event) => updateDraft(user.id, { draftRole: event.target.value as UserRole })}
                        className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
                      >
                        <option value="REP">Rep</option>
                        <option value="TEAM_LEAD">Team Lead</option>
                        <option value="MANAGER">Manager</option>
                        <option value="SUPER_ADMIN">Super Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={user.draftRate}
                          onChange={(event) => updateDraft(user.id, { draftRate: event.target.value })}
                          className="w-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
                        />
                        <span className="text-zinc-500">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      <div className="space-y-1">
                        <p>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"}</p>
                        <p className="text-[11px] text-zinc-500">{formatLastSeen(user.lastSignInAt)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <div className="rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-[11px] text-zinc-400">
                          {accessStateDetail(user, accessState)}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            value={user.draftPassword}
                            onChange={(event) => updateDraft(user.id, { draftPassword: event.target.value })}
                            placeholder="New temp password"
                            className="w-36 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              runUserAction({
                                userId: user.id,
                                action: "reset_password",
                                password: user.draftPassword,
                                successMessage: `Reset password for ${user.draftName.trim() || user.name}.`,
                                errorMessage: "Failed to reset password.",
                                clearPassword: true,
                              })
                            }
                            disabled={rowPending || user.draftPassword.length < 8}
                            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 disabled:opacity-60"
                          >
                            Reset Password
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              runUserAction({
                                userId: user.id,
                                action: "toggle_active",
                                active: user.status === "SUSPENDED",
                                successMessage: user.status === "SUSPENDED" ? `Reactivated ${user.name}.` : `Suspended ${user.name}.`,
                                errorMessage: `Failed to ${user.status === "SUSPENDED" ? "reactivate" : "suspend"} user.`,
                              })
                            }
                            disabled={rowPending}
                            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 disabled:opacity-60"
                          >
                            {user.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              runUserAction({
                                userId: user.id,
                                action: "resend_invite",
                                successMessage: `Resent invite to ${user.email ?? user.name}.`,
                                errorMessage: "Failed to resend invite.",
                              })
                            }
                            disabled={rowPending || !user.email}
                            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 disabled:opacity-60"
                          >
                            Resend Invite
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => saveUser(user)}
                        disabled={rowPending}
                        className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 disabled:opacity-60"
                      >
                        {rowPending ? "Saving..." : "Save Settings"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
