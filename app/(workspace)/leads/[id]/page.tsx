import Link from "next/link";
import { LeadExecutionWorkspace } from "@/components/leads/lead-execution-workspace";
import { getLeadById, listLeads } from "@/lib/store";

export default async function LeadExecutionPage({ params }: { params: { id: string } }) {
  const lead = await getLeadById(params.id);

  if (!lead) {
    const fallback = (await listLeads())[0];
    if (!fallback) {
      return (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-zinc-300">
          No leads found. Return to <Link className="text-indigo-300 underline" href="/leads">My Leads</Link> to claim one.
        </div>
      );
    }

    return <LeadExecutionWorkspace lead={fallback} />;
  }

  return <LeadExecutionWorkspace lead={lead} />;
}
