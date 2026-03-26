import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserAccessAccountManagement, listLeads } from "@/lib/store";

export const dynamic = "force-dynamic";

function normalizeEnvValue(value?: string | null) {
  if (!value) return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function isAuthorizedBySharedToken(request: NextRequest) {
  const expected = normalizeEnvValue(process.env.MARKETING_HUB_SYNC_TOKEN);
  if (!expected) return false;
  const provided = normalizeEnvValue(request.headers.get("x-marketing-hub-token"));
  const providedQuery = normalizeEnvValue(request.nextUrl.searchParams.get("token"));
  return Boolean((provided && provided === expected) || (providedQuery && providedQuery === expected));
}

export async function GET(request: NextRequest) {
  try {
    const tokenAuthorized = isAuthorizedBySharedToken(request);

    if (!tokenAuthorized) {
      const user = await getAuthenticatedUser();
      if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!(await canUserAccessAccountManagement(user.id, user.email))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const leads = await listLeads("shared-account-management", { includeAll: true });

    const accounts = leads
      .filter(
        (lead) =>
          lead.status === "CLOSED" &&
          lead.billingProfile?.billingType === "RECURRING" &&
          lead.billingProfile?.billingStatus !== "CANCELLED" &&
          (lead.billingProfile?.recurringAmount ?? 0) > 0,
      )
      .map((lead) => ({
        id: lead.id,
        businessName: lead.businessName,
        domain: lead.websiteUrl ?? "",
        city: lead.city,
        businessType: lead.businessType,
        recurringRevenue: lead.billingProfile?.recurringAmount ?? 0,
        serviceStatus: lead.accountManagement?.serviceStatus ?? "ONBOARDING",
        ppcEnabled: Boolean(lead.accountManagement?.ppc?.enabled),
        socialEnabled: Boolean(lead.accountManagement?.social?.enabled),
        seoEnabled: Boolean(lead.accountManagement?.seo?.enabled),
        ga4Connected: Boolean(lead.accountManagement?.analyticsConnections?.ga4Connected),
        gscConnected: Boolean(lead.accountManagement?.analyticsConnections?.gscConnected),
        primaryOwnerName: lead.accountManagement?.primaryOwnerName ?? lead.soldByName ?? null,
      }))
      .sort((a, b) => a.businessName.localeCompare(b.businessName));

    return NextResponse.json({ accounts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load account management clients." },
      { status: 500 },
    );
  }
}
