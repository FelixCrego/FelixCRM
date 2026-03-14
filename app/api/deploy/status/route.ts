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



async function isDeploymentReachable(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;

  try {
    const response = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
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

function deploymentProjectAlias(payload: Record<string, unknown>): string | undefined {
  const projectName = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!projectName) return undefined;
  return toHttpsUrl(`${projectName}.vercel.app`);
}

function resolveDeploymentState(payload: Record<string, unknown>): string {
  const candidate =
    (typeof payload.readyState === "string" && payload.readyState) ||
    (typeof payload.state === "string" && payload.state) ||
    (typeof payload.status === "string" && payload.status) ||
    "";

  return candidate.trim().toUpperCase();
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
      const reachableWithoutId = await isDeploymentReachable(lead.deployedUrl ?? null);
      if (reachableWithoutId) {
        await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: lead.deployedUrl ?? undefined });
        return NextResponse.json({ siteStatus: "LIVE", deployedUrl: lead.deployedUrl ?? null, done: true, readyState: "READY" });
      }
      return NextResponse.json({ siteStatus: lead.siteStatus ?? "BUILDING", deployedUrl: lead.deployedUrl ?? null, done: false });
    }

    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      const reachableWithoutToken = await isDeploymentReachable(lead.deployedUrl ?? null);
      if (reachableWithoutToken) {
        await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: lead.deployedUrl ?? undefined, vercelDeploymentId: lead.vercelDeploymentId });
        return NextResponse.json({ siteStatus: "LIVE", deployedUrl: lead.deployedUrl ?? null, done: true, readyState: "READY" });
      }
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
      const fallbackUrl = lead.deployedUrl ?? null;
      const reachableAfterStatusError = await isDeploymentReachable(fallbackUrl);
      if (reachableAfterStatusError) {
        await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: fallbackUrl ?? undefined, vercelDeploymentId: lead.vercelDeploymentId });
        return NextResponse.json({ siteStatus: "LIVE", deployedUrl: fallbackUrl, done: true, readyState: "READY" });
      }

      if (response.status === 404 || response.status === 410) {
        return NextResponse.json({ siteStatus: "BUILDING", deployedUrl: fallbackUrl, done: false, readyState: "BUILDING" });
      }

      const errorText = await response.text();
      return NextResponse.json({ error: `Unable to fetch deployment status: ${errorText || response.statusText}` }, { status: 500 });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const readyState = resolveDeploymentState(payload);
    const aliasUrl = firstDeploymentAlias(payload);
    const projectAliasUrl = deploymentProjectAlias(payload);
    const deployedUrl = aliasUrl ?? projectAliasUrl ?? lead.deployedUrl ?? toHttpsUrl(payload.url) ?? null;

    if (readyState === "READY" || readyState === "LIVE") {
      await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: deployedUrl ?? undefined, vercelDeploymentId: lead.vercelDeploymentId });
      return NextResponse.json({ siteStatus: "LIVE", deployedUrl, done: true, readyState });
    }

    if (readyState === "ERROR" || readyState === "CANCELED" || readyState === "CANCELLED") {
      await setLeadDeployment(leadId, { siteStatus: "FAILED", deployedUrl: deployedUrl ?? undefined, vercelDeploymentId: lead.vercelDeploymentId });
      return NextResponse.json({ siteStatus: "FAILED", deployedUrl, done: true, readyState });
    }

    const reachableWhileBuilding = await isDeploymentReachable(deployedUrl);
    if (reachableWhileBuilding) {
      await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: deployedUrl ?? undefined, vercelDeploymentId: lead.vercelDeploymentId });
      return NextResponse.json({ siteStatus: "LIVE", deployedUrl, done: true, readyState: readyState || "READY" });
    }

    return NextResponse.json({ siteStatus: "BUILDING", deployedUrl, done: false, readyState });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 500 });
  }
}
