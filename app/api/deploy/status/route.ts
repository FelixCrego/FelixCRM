import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getLeadById, setLeadDeployment } from "@/lib/store";

function toHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function firstDeploymentAlias(payload: Record<string, unknown>): string | undefined {
  const singleAlias = toHttpsUrl(payload.alias);
  if (singleAlias) return singleAlias;

  const aliases = payload.aliases;
  if (!Array.isArray(aliases)) return undefined;

  for (const aliasEntry of aliases) {
    if (typeof aliasEntry === "string") {
      const normalized = toHttpsUrl(aliasEntry);
      if (normalized) return normalized;
      continue;
    }

    if (!aliasEntry || typeof aliasEntry !== "object") continue;
    const objectAlias = aliasEntry as { alias?: unknown; domain?: unknown; url?: unknown };
    const normalized = toHttpsUrl(objectAlias.alias) ?? toHttpsUrl(objectAlias.domain) ?? toHttpsUrl(objectAlias.url);
    if (normalized) return normalized;
  }

  return undefined;
}

export async function GET(request: Request) {
  try {
    const ownerId = await getAuthenticatedUserId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("leadId")?.trim() || "";
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const lead = await getLeadById(leadId, ownerId);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    if (lead.siteStatus === "LIVE" || lead.siteStatus === "FAILED") {
      return NextResponse.json({ siteStatus: lead.siteStatus, deployedUrl: lead.deployedUrl ?? null, done: true });
    }

    if (!lead.vercelDeploymentId) {
      return NextResponse.json({ siteStatus: lead.siteStatus ?? "BUILDING", deployedUrl: lead.deployedUrl ?? null, done: false });
    }

    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      return NextResponse.json({ siteStatus: lead.siteStatus ?? "BUILDING", deployedUrl: lead.deployedUrl ?? null, done: false });
    }

    const vercelTeamId = process.env.VERCEL_TEAM_ID?.trim() || undefined;
    const scopeQuery = vercelTeamId ? `?teamId=${encodeURIComponent(vercelTeamId)}` : "";

    const response = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(lead.vercelDeploymentId)}${scopeQuery}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Unable to fetch deployment status: ${errorText || response.statusText}` }, { status: 500 });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const readyState = typeof payload.readyState === "string" ? payload.readyState : "";
    const aliasUrl = firstDeploymentAlias(payload);
    const deployedUrl = aliasUrl ?? toHttpsUrl(payload.url) ?? lead.deployedUrl ?? null;

    if (readyState === "READY") {
      await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: deployedUrl ?? undefined, vercelDeploymentId: lead.vercelDeploymentId });
      return NextResponse.json({ siteStatus: "LIVE", deployedUrl, done: true, readyState });
    }

    if (readyState === "ERROR" || readyState === "CANCELED") {
      await setLeadDeployment(leadId, { siteStatus: "FAILED", deployedUrl: deployedUrl ?? undefined, vercelDeploymentId: lead.vercelDeploymentId });
      return NextResponse.json({ siteStatus: "FAILED", deployedUrl, done: true, readyState });
    }

    return NextResponse.json({ siteStatus: "BUILDING", deployedUrl, done: false, readyState });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 500 });
  }
}
