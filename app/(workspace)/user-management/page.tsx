import { getAuthenticatedUser } from "@/lib/auth";
import { canUserManageAllLeads, listManagedUsers } from "@/lib/store";
import { getUserSessionDurationMs, listRecentUserSessions } from "@/lib/session-activity";
import UserManagementTable from "./user-management-table";

function formatSessionDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

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
  const sessionActivity = await listRecentUserSessions(40).catch(() => ({ sessions: [], tableMissing: false }));
  const userNames = new Map(users.map((managedUser) => [managedUser.id, managedUser.name]));

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Superadmin</p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">User Management</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Manage team names, roles, and commission defaults from the authenticated user directory.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Recent CRM Sessions</h2>
          <p className="mt-1 text-sm text-zinc-400">Track when users entered the CRM, how long they stayed, and the last page they touched.</p>
        </div>

        {sessionActivity.tableMissing ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            Session tracking is not installed yet. Run <code>supabase/user_sessions.sql</code> in Supabase to enable it.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950 text-zinc-400">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Last Seen</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Last Page</th>
                </tr>
              </thead>
              <tbody>
                {sessionActivity.sessions.length === 0 ? (
                  <tr className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-400">
                    <td className="px-4 py-4" colSpan={6}>No tracked sessions yet.</td>
                  </tr>
                ) : null}
                {sessionActivity.sessions.map((session) => {
                  const isActive = session.sessionStatus === "ACTIVE" && Date.now() - new Date(session.lastSeenAt).getTime() < 5 * 60 * 1000;
                  const displayStatus = isActive ? "ACTIVE" : session.sessionStatus === "ENDED" ? "ENDED" : "STALE";
                  const badgeClasses =
                    displayStatus === "ACTIVE"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : displayStatus === "STALE"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                        : "border-zinc-600/40 bg-zinc-700/20 text-zinc-200";

                  return (
                    <tr key={session.id} className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-200">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-white">{userNames.get(session.userId) ?? session.userEmail ?? session.userId}</p>
                          <p className="text-xs text-zinc-500">{session.userEmail ?? session.userId}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${badgeClasses}`}>
                          {displayStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{new Date(session.startedAt).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}</td>
                      <td className="px-4 py-3 text-zinc-400">{new Date(session.lastSeenAt).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}</td>
                      <td className="px-4 py-3 text-zinc-300">{formatSessionDuration(getUserSessionDurationMs(session))}</td>
                      <td className="px-4 py-3 text-zinc-400">{session.lastPath || "Unknown"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UserManagementTable initialUsers={users} />
    </div>
  );
}
