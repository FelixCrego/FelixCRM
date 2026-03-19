import { getAuthenticatedUser } from "@/lib/auth";
import BillingDashboard from "./billing-dashboard";
import { canUserManageAllLeads, getUserFinanceSettings, listLeads } from "@/lib/store";

export default async function BillingPage() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">Unauthorized</div>;
    }

    const isSuperAdmin = await canUserManageAllLeads(user.id, user.email);
    if (!isSuperAdmin) {
      return <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">Forbidden</div>;
    }

    const [leads, settings] = await Promise.all([
      listLeads(user.id, { includeAll: true }),
      getUserFinanceSettings(user.id),
    ]);

    return <BillingDashboard initialLeads={leads} initialSettings={settings} />;
  } catch (error) {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">
        {error instanceof Error ? error.message : "Failed to load billing workspace."}
      </div>
    );
  }
}
