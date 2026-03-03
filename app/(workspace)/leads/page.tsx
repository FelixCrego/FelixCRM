import { LeadsListView } from "@/components/leads/leads-list-view";
import { listLeads } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export default async function LeadsPage() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return <LeadsListView leads={[]} errorMessage="Unauthorized" />;
    }

    const userLeads = await listLeads(userId);
    return <LeadsListView leads={userLeads} />;
  } catch (error) {
    return <LeadsListView leads={[]} errorMessage={error instanceof Error ? error.message : "Failed to load leads."} />;
  }
}
