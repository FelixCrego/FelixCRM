import { getAuthenticatedUser } from "@/lib/auth";
import AccountManagementDashboard from "./account-management-dashboard";
import { canUserAccessAccountManagement, listAssignableUsers, listLeads } from "@/lib/store";

export default async function AccountManagementPage() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">Unauthorized</div>;
    }

    if (!(await canUserAccessAccountManagement(user.id, user.email))) {
      return <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">Forbidden</div>;
    }

    const [leads, owners] = await Promise.all([
      listLeads(user.id, { includeAll: true }),
      listAssignableUsers(),
    ]);

    return <AccountManagementDashboard initialLeads={leads} owners={owners} />;
  } catch (error) {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">
        {error instanceof Error ? error.message : "Failed to load account management center."}
      </div>
    );
  }
}
