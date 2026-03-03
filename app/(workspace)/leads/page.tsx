import { LeadsListView } from "@/components/leads/leads-list-view";
import { demoOwnerId, listLeads } from "@/lib/store";

export default async function LeadsPage() {
  const repId = demoOwnerId();

  try {
    const allLeads = await listLeads();
    const claimedLeads = (allLeads || []).filter((lead) => lead?.ownerId === repId);
    return <LeadsListView leads={claimedLeads} />;
  } catch {
    return <LeadsListView leads={[]} />;
  }
}
