import { LeadsListView } from "@/components/leads/leads-list-view";
import { canUserViewAllLeads, listLeads } from "@/lib/store";
import { getAuthenticatedUser } from "@/lib/auth";

export default async function ClosedDealsPage() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return <LeadsListView leads={[]} errorMessage="Unauthorized" viewMode="closed" />;
    }

    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const userLeads = await listLeads(user.id, { includeAll });
    return <LeadsListView leads={userLeads} viewMode="closed" />;
  } catch (error) {
    return <LeadsListView leads={[]} errorMessage={error instanceof Error ? error.message : "Failed to load leads."} viewMode="closed" />;
  }
}
