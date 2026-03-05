import { LeadsListView } from "@/components/leads/leads-list-view";
import { listLeads } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export default async function ClosedDealsPage() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return <LeadsListView leads={[]} errorMessage="Unauthorized" viewMode="closed" />;
    }

    const userLeads = await listLeads(userId);
    return <LeadsListView leads={userLeads} viewMode="closed" />;
  } catch (error) {
    return <LeadsListView leads={[]} errorMessage={error instanceof Error ? error.message : "Failed to load leads."} viewMode="closed" />;
  }
}
