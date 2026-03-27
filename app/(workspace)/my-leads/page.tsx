import { LeadsListView } from "@/components/leads/leads-list-view";
import { listLeads } from "@/lib/store";
import { getAuthenticatedUser } from "@/lib/auth";

export default async function MyLeadsPage() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return <LeadsListView leads={[]} errorMessage="Unauthorized" />;
    }

    const userLeads = await listLeads(user.id, { includeAll: false });
    return <LeadsListView leads={userLeads} openTitle="My Leads" />;
  } catch (error) {
    return <LeadsListView leads={[]} errorMessage={error instanceof Error ? error.message : "Failed to load leads."} openTitle="My Leads" />;
  }
}
