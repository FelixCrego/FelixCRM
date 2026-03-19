import { getAuthenticatedUser } from "@/lib/auth";
import { canUserManageAllLeads, listManagedUsers } from "@/lib/store";
import UserManagementTable from "./user-management-table";

export default async function UserManagementPage() {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">Unauthorized</div>;
  }

  const isSuperAdmin = await canUserManageAllLeads(user.id, user.email);
  if (!isSuperAdmin) {
    return <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-200">Only superadmins can access user management.</div>;
  }

  const users = await listManagedUsers().catch(() => []);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Superadmin</p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">User Management</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Manage team names, roles, and commission defaults from the authenticated user directory.
        </p>
      </header>

      <UserManagementTable initialUsers={users} />
    </div>
  );
}
