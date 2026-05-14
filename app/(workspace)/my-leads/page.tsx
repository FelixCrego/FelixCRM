import { LeadsListView } from "@/components/leads/leads-list-view";
import { canUserAssignLeads, listLeads } from "@/lib/store";
import { getAuthenticatedUser } from "@/lib/auth";

export default async function MyLeadsPage() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return <LeadsListView leads={[]} errorMessage="Unauthorized" />;
    }

    const userLeads = await listLeads(user.id, { includeAll: false });
    const canAssign = await canUserAssignLeads(user.id, user.email);
    return (
      <LeadsListView
        leads={userLeads}
        canAssignLeads={canAssign}
        currentUserId={user.id}
        openTitle="My Leads"
        openDescription="Owned leads, follow-up history, and completed same-day work after it drops out of Shift Queue."
      />
    );
  } catch (error) {
    return (
      <LeadsListView
        leads={[]}
        errorMessage={error instanceof Error ? error.message : "Failed to load leads."}
        openTitle="My Leads"
        openDescription="Owned leads, follow-up history, and completed same-day work after it drops out of Shift Queue."
      />
    );
  }
}
