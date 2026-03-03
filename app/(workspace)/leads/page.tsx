import { LeadsListView } from "@/components/leads/leads-list-view";
import { getCurrentUserId, listLeads } from "@/lib/store";

export default async function LeadsPage() {
  try {
    const repId = await getCurrentUserId();
    const allLeads = await listLeads();
    const claimedLeads = (allLeads || []).filter((lead) => lead?.ownerId === repId);
    return <LeadsListView leads={claimedLeads} />;
  } catch (error) {
    return <LeadsListView leads={[]} errorMessage={error instanceof Error ? error.message : "Failed to load leads."} />;
  }
}
