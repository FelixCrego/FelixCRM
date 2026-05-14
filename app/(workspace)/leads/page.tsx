import { LeadsListView } from "@/components/leads/leads-list-view";
import { canUserAssignLeads, canUserViewAllLeads, listLeads } from "@/lib/store";
import { getAuthenticatedUser } from "@/lib/auth";

export default async function LeadsPage() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return (
        <LeadsListView
          leads={[]}
          errorMessage="Unauthorized"
          openTitle="Lead Directory"
          openDescription="Search, review, and manage leads across the workspace."
        />
      );
    }

    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const canAssign = await canUserAssignLeads(user.id, user.email);
    const userLeads = await listLeads(user.id, { includeAll });
    return (
      <LeadsListView
        leads={userLeads}
        canAssignLeads={canAssign}
        currentUserId={user.id}
        openTitle="Lead Directory"
        openDescription="Search, review, and manage leads across the workspace."
      />
    );
  } catch (error) {
    return (
      <LeadsListView
        leads={[]}
        errorMessage={error instanceof Error ? error.message : "Failed to load leads."}
        openTitle="Lead Directory"
        openDescription="Search, review, and manage leads across the workspace."
      />
    );
  }
}
