import { LeadsListView } from "@/components/leads/leads-list-view";
import { demoOwnerId, listLeads } from "@/lib/store";

export default async function LeadsPage() {
  const repId = demoOwnerId();
  const claimedLeads = (await listLeads()).filter((lead) => lead.ownerId === repId);

  return <LeadsListView leads={claimedLeads} />;
}
