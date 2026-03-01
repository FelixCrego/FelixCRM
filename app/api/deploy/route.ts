import { NextResponse } from "next/server";
import { getLeadById, setLeadDeployment } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json();
  const leadId = String(body.leadId ?? "");
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  const lead = await getLeadById(leadId);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  await setLeadDeployment(leadId, { siteStatus: "BUILDING" });

  const token = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_TEMPLATE_PROJECT;
  if (!token || !project) {
    const mockUrl = `https://${lead.businessName.toLowerCase().replace(/[^a-z0-9]/g, "-")}.vercel.app`;
    await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: mockUrl, vercelDeploymentId: "mock-deployment" });
    return NextResponse.json({ url: mockUrl, mock: true });
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
    return NextResponse.json({ error: "Deployment failed" }, { status: 500 });
  }

  const payload = await response.json();
  const url = payload?.url ? `https://${payload.url}` : undefined;
  await setLeadDeployment(leadId, { siteStatus: url ? "LIVE" : "BUILDING", deployedUrl: url, vercelDeploymentId: payload.id });
  return NextResponse.json({ url, deploymentId: payload.id });
}
