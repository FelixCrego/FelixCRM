export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, getLeadById } from "@/lib/store";

type RouteContext = {
  params: {
    id?: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const leadId = typeof context.params?.id === "string" ? context.params.id.trim() : "";
    if (!leadId) {
      return NextResponse.json({ error: "Lead id is required." }, { status: 400 });
    }

    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const lead = await getLeadById(leadId, user.id, { includeAll });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    return NextResponse.json({ lead });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load lead." },
      { status: 500 },
    );
  }
}
