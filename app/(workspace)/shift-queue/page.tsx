import { ShiftQueueView } from "@/components/leads/shift-queue-view";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserAssignLeads, getShiftQueueSettings, listLeadAssignmentUsers, listLeads } from "@/lib/store";

type ShiftQueuePageProps = {
  searchParams?: {
    rep?: string;
    industry?: string;
  };
};

export default async function ShiftQueuePage({ searchParams }: ShiftQueuePageProps) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return <ShiftQueueView leads={[]} errorMessage="Unauthorized" />;
    }

    const canManageQueues = await canUserAssignLeads(user.id, user.email).catch(() => false);
    const selectableQueueOwners = canManageQueues ? await listLeadAssignmentUsers().catch(() => []) : [];
    const requestedQueueOwnerId = typeof searchParams?.rep === "string" ? searchParams.rep.trim() : "";
    const selectedQueueOwnerId =
      canManageQueues && requestedQueueOwnerId && selectableQueueOwners.some((candidate) => candidate.id === requestedQueueOwnerId)
        ? requestedQueueOwnerId
        : user.id;
    const selectedQueueOwner = selectableQueueOwners.find((candidate) => candidate.id === selectedQueueOwnerId) ?? null;

    const userLeads = await listLeads(selectedQueueOwnerId, { includeAll: false });
    const queueSettings = await getShiftQueueSettings(selectedQueueOwnerId).catch(() => null);
    const requestedIndustry = typeof searchParams?.industry === "string" ? searchParams.industry.trim() : "";
    const initialIndustry = requestedIndustry || queueSettings?.industry || null;

    return (
      <ShiftQueueView
        leads={userLeads}
        currentUserId={user.id}
        queueOwnerId={selectedQueueOwnerId}
        queueOwnerName={selectedQueueOwner?.name ?? null}
        queueSettings={queueSettings}
        canManageQueues={canManageQueues}
        selectableQueueOwners={selectableQueueOwners}
        initialIndustry={initialIndustry}
      />
    );
  } catch (error) {
    return <ShiftQueueView leads={[]} errorMessage={error instanceof Error ? error.message : "Failed to load shift queue."} />;
  }
}
