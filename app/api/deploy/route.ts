import { NextResponse } from "next/server";
import { getLeadById, setLeadDeployment } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const ownerId = getAuthenticatedUserId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const leadId = String(body.leadId ?? "");
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const lead = await getLeadById(leadId, ownerId);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    await setLeadDeployment(leadId, { siteStatus: "BUILDING" });

    const token = process.env.VERCEL_TOKEN;
    const project = process.env.VERCEL_TEMPLATE_PROJECT;
    if (!token || !project) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      return NextResponse.json({ error: "Missing Vercel configuration (VERCEL_TOKEN and VERCEL_TEMPLATE_PROJECT)." }, { status: 500 });
    }

    const response = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `felix-${lead.businessName.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 36)}`,
        project,
        gitSource: {
          type: "github",
          repo: process.env.VERCEL_TEMPLATE_REPO,
          ref: process.env.VERCEL_TEMPLATE_BRANCH ?? "main",
        },
        target: "production",
        env: [
          { key: "BUSINESS_NAME", value: lead.businessName, target: ["production"] },
          { key: "CONTACT_PHONE", value: lead.phone ?? "", target: ["production"] },
          { key: "CONTACT_EMAIL", value: lead.email ?? "", target: ["production"] },
          { key: "SOCIAL_LINKS", value: (lead.socialLinks ?? []).join(","), target: ["production"] },
        ],
      }),
    });

    if (!response.ok) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      const errorText = await response.text();
      return NextResponse.json({ error: `Deployment failed: ${errorText || response.statusText}` }, { status: 500 });
    }

    const payload = await response.json();
    const url = payload?.url ? `https://${payload.url}` : undefined;
    await setLeadDeployment(leadId, { siteStatus: url ? "LIVE" : "BUILDING", deployedUrl: url, vercelDeploymentId: payload.id });
    return NextResponse.json({ url, deploymentId: payload.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 500 });
  }
}
