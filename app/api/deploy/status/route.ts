import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, getLeadById, setLeadDeployment } from "@/lib/store";

function toHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function projectNameFromDeploymentUrl(url: string | null | undefined): string | null {
  const normalized = toHttpsUrl(url);
  if (!normalized) return null;

  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    if (!hostname.endsWith(".vercel.app")) return null;
    return hostname.replace(/\.vercel\.app$/i, "");
  } catch {
    return null;
  }
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

function preferredPreviewDeploymentUrl(input: {
  aliasUrl?: string;
  projectAliasUrl?: string;
  deploymentUrl?: string | null;
}): string | null {
  return input.deploymentUrl ?? input.aliasUrl ?? input.projectAliasUrl ?? null;
}

function preferredLiveDeploymentUrl(input: {
  aliasUrl?: string;
  projectAliasUrl?: string;
  deploymentUrl?: string | null;
}): string | null {
  return input.aliasUrl ?? input.projectAliasUrl ?? input.deploymentUrl ?? null;
}

function preferredCrmDeploymentUrl(input: {
  liveUrl?: string | null;
  storedUrl?: string | null;
  previewUrl?: string | null;
}): string | null {
  return input.liveUrl ?? input.storedUrl ?? input.previewUrl ?? null;
}

function latestProjectDeployment(payload: Record<string, unknown>): Record<string, unknown> | null {
  const targets = payload.targets;
  if (targets && typeof targets === "object") {
    const productionTarget = (targets as Record<string, unknown>).production;
    if (productionTarget && typeof productionTarget === "object") {
      return productionTarget as Record<string, unknown>;
    }
  }

  const latestDeployments = payload.latestDeployments;
  if (Array.isArray(latestDeployments) && latestDeployments[0] && typeof latestDeployments[0] === "object") {
    return latestDeployments[0] as Record<string, unknown>;
  }

  return null;
}

function resolveDeploymentState(payload: Record<string, unknown>): string {
  const candidate =
    (typeof payload.readyState === "string" && payload.readyState) ||
    (typeof payload.state === "string" && payload.state) ||
    (typeof payload.status === "string" && payload.status) ||
    "";

  return candidate.trim().toUpperCase();
}

function shouldTreatStatusLookupAsTransient(status: number): boolean {
  return status === 401 || status === 403 || status === 404 || status === 410 || status === 429;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("leadId")?.trim() || "";
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const lead = await getLeadById(leadId, user.id, { includeAll: await canUserViewAllLeads(user.id, user.email) });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    if ((lead.siteStatus === "LIVE" || lead.siteStatus === "FAILED") && !lead.vercelDeploymentId) {
      return NextResponse.json({ siteStatus: lead.siteStatus, deployedUrl: lead.deployedUrl ?? null, done: true });
    }

    const token = process.env.VERCEL_TOKEN;
    const vercelTeamId = process.env.VERCEL_TEAM_ID?.trim() || undefined;
    const scopeQuery = vercelTeamId ? `?teamId=${encodeURIComponent(vercelTeamId)}` : "";

    if (!lead.vercelDeploymentId) {
      if (token) {
        const projectName = projectNameFromDeploymentUrl(lead.deployedUrl ?? null);
        if (projectName) {
          const projectResponse = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}${scopeQuery}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            cache: "no-store",
          });

          if (projectResponse.ok) {
            const projectPayload = (await projectResponse.json()) as Record<string, unknown>;
            const latestDeployment = latestProjectDeployment(projectPayload);
            const readyState = latestDeployment ? resolveDeploymentState(latestDeployment) : "";
            const previewUrl = preferredPreviewDeploymentUrl({
              aliasUrl: latestDeployment ? firstDeploymentAlias(latestDeployment) : undefined,
              projectAliasUrl: deploymentProjectAlias(latestDeployment ?? projectPayload),
              deploymentUrl: (latestDeployment ? toHttpsUrl(latestDeployment.url) : undefined) ?? lead.deployedUrl ?? null,
            });
            const liveUrl = preferredLiveDeploymentUrl({
              aliasUrl: latestDeployment ? firstDeploymentAlias(latestDeployment) : undefined,
              projectAliasUrl: deploymentProjectAlias(latestDeployment ?? projectPayload),
              deploymentUrl: (latestDeployment ? toHttpsUrl(latestDeployment.url) : undefined) ?? lead.deployedUrl ?? null,
            });
            const deployedUrl = preferredCrmDeploymentUrl({
              liveUrl,
              storedUrl: lead.deployedUrl ?? null,
              previewUrl,
            });

            if (latestDeployment && (readyState === "READY" || readyState === "LIVE")) {
              await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: deployedUrl ?? undefined });
              return NextResponse.json({ siteStatus: "LIVE", deployedUrl, previewUrl, liveUrl, done: true, readyState });
            }

            if (latestDeployment && (readyState === "ERROR" || readyState === "CANCELED" || readyState === "CANCELLED")) {
              await setLeadDeployment(leadId, { siteStatus: "FAILED", deployedUrl: deployedUrl ?? undefined });
              return NextResponse.json({ siteStatus: "FAILED", deployedUrl, previewUrl, liveUrl, done: true, readyState });
            }

            if (deployedUrl && deployedUrl !== lead.deployedUrl) {
              await setLeadDeployment(leadId, { siteStatus: "BUILDING", deployedUrl });
            }

            return NextResponse.json({ siteStatus: lead.siteStatus ?? "BUILDING", deployedUrl, previewUrl, liveUrl, done: false, readyState });
          }
        }
      }

      const reachableWithoutId = await isDeploymentReachable(lead.deployedUrl ?? null);
      if (reachableWithoutId) {
        await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: lead.deployedUrl ?? undefined });
        return NextResponse.json({ siteStatus: "LIVE", deployedUrl: lead.deployedUrl ?? null, done: true, readyState: "READY" });
      }
      return NextResponse.json({ siteStatus: lead.siteStatus ?? "BUILDING", deployedUrl: lead.deployedUrl ?? null, previewUrl: lead.deployedUrl ?? null, done: false });
    }
    if (!token) {
      const reachableWithoutToken = await isDeploymentReachable(lead.deployedUrl ?? null);
      if (reachableWithoutToken) {
        await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: lead.deployedUrl ?? undefined, vercelDeploymentId: lead.vercelDeploymentId });
        return NextResponse.json({ siteStatus: "LIVE", deployedUrl: lead.deployedUrl ?? null, done: true, readyState: "READY" });
      }
      return NextResponse.json({ siteStatus: lead.siteStatus ?? "BUILDING", deployedUrl: lead.deployedUrl ?? null, previewUrl: lead.deployedUrl ?? null, done: false });
    }

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

      if (shouldTreatStatusLookupAsTransient(response.status)) {
        return NextResponse.json({ siteStatus: "BUILDING", deployedUrl: fallbackUrl, done: false, readyState: "BUILDING" });
      }

      const errorText = await response.text();
      return NextResponse.json({ error: `Unable to fetch deployment status: ${errorText || response.statusText}` }, { status: 500 });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const readyState = resolveDeploymentState(payload);
    const aliasUrl = firstDeploymentAlias(payload);
    const projectAliasUrl = deploymentProjectAlias(payload);
    const previewUrl = preferredPreviewDeploymentUrl({
      aliasUrl,
      projectAliasUrl,
      deploymentUrl: toHttpsUrl(payload.url) ?? lead.deployedUrl ?? null,
    });
    const liveUrl = preferredLiveDeploymentUrl({
      aliasUrl,
      projectAliasUrl,
      deploymentUrl: toHttpsUrl(payload.url) ?? lead.deployedUrl ?? null,
    });
    const deployedUrl = preferredCrmDeploymentUrl({
      liveUrl,
      storedUrl: lead.deployedUrl ?? null,
      previewUrl,
    });

    if (readyState === "READY" || readyState === "LIVE") {
      await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: deployedUrl ?? undefined, vercelDeploymentId: lead.vercelDeploymentId });
      return NextResponse.json({ siteStatus: "LIVE", deployedUrl, previewUrl, liveUrl, done: true, readyState });
    }

    if (readyState === "ERROR" || readyState === "CANCELED" || readyState === "CANCELLED") {
      await setLeadDeployment(leadId, { siteStatus: "FAILED", deployedUrl: deployedUrl ?? undefined, vercelDeploymentId: lead.vercelDeploymentId });
      return NextResponse.json({ siteStatus: "FAILED", deployedUrl, previewUrl, liveUrl, done: true, readyState });
    }

    const reachableLiveUrl = aliasUrl ?? projectAliasUrl ?? null;
    const reachableWhileBuilding = await isDeploymentReachable(reachableLiveUrl);
    if (reachableWhileBuilding) {
      const resolvedLiveUrl = preferredCrmDeploymentUrl({
        liveUrl,
        storedUrl: lead.deployedUrl ?? null,
        previewUrl,
      });
      await setLeadDeployment(leadId, { siteStatus: "LIVE", deployedUrl: resolvedLiveUrl ?? undefined, vercelDeploymentId: lead.vercelDeploymentId });
      return NextResponse.json({ siteStatus: "LIVE", deployedUrl: resolvedLiveUrl, previewUrl, liveUrl: resolvedLiveUrl, done: true, readyState: readyState || "READY" });
    }

    if (deployedUrl && deployedUrl !== lead.deployedUrl) {
      await setLeadDeployment(leadId, { siteStatus: "BUILDING", deployedUrl, vercelDeploymentId: lead.vercelDeploymentId });
    }

    return NextResponse.json({ siteStatus: "BUILDING", deployedUrl, previewUrl, liveUrl, done: false, readyState });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 500 });
  }
}
