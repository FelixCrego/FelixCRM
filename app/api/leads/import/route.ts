import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserAssignLeads, createOrMergeLead, isValidLeadAssignmentUserId } from "@/lib/store";

type ImportLeadInput = {
  businessName?: unknown;
  phone?: unknown;
  email?: unknown;
  websiteUrl?: unknown;
  aiResearchSummary?: unknown;
  sourceQuery?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as { leads?: ImportLeadInput[]; mergeDuplicates?: boolean; assigneeId?: string };
    if (!Array.isArray(body?.leads) || !body.leads.length) {
      return NextResponse.json({ error: "Leads array is required." }, { status: 400 });
    }

    const rawAssigneeId =
      typeof body?.assigneeId === "string" && body.assigneeId.trim().length > 0
        ? body.assigneeId.trim()
        : undefined;

    let resolvedOwnerId = user.id;

    if (rawAssigneeId !== undefined) {
      const canAssign = await canUserAssignLeads(user.id, user.email);
      if (!canAssign) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const isValidAssignee = await isValidLeadAssignmentUserId(rawAssigneeId);
      if (!isValidAssignee) {
        return NextResponse.json({ error: "Invalid assignee." }, { status: 400 });
      }
      resolvedOwnerId = rawAssigneeId;
    }

    let createdCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;

    for (const lead of body.leads) {
      const businessName = typeof lead?.businessName === "string" ? lead.businessName.trim() : "";
      if (!businessName) {
        skippedCount += 1;
        continue;
      }

      const result = await createOrMergeLead(resolvedOwnerId, {
        businessName,
        phone: typeof lead?.phone === "string" ? lead.phone.trim() || null : null,
        email: typeof lead?.email === "string" ? lead.email.trim() || null : null,
        websiteUrl: typeof lead?.websiteUrl === "string" ? lead.websiteUrl.trim() || null : null,
        aiResearchSummary: typeof lead?.aiResearchSummary === "string" ? lead.aiResearchSummary.trim() || null : null,
        sourceQuery: typeof lead?.sourceQuery === "string" ? lead.sourceQuery.trim() || "csv_import" : "csv_import",
        sourceType: "ADDED",
      }, {
        mergeOnDuplicate: Boolean(body.mergeDuplicates),
      });
      if (result.merged) {
        mergedCount += 1;
      } else {
        createdCount += 1;
      }
    }

    return NextResponse.json({ createdCount, mergedCount, skippedCount }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "23505") {
      return NextResponse.json(
        {
          error: "Duplicate leads were found in your CSV. Do you want to merge duplicates and continue?",
          requiresMergeConfirmation: true,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import leads." },
      { status: 500 },
    );
  }
}
