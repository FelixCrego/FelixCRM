import { NextResponse } from "next/server";
import { getLeadById, setLeadDeployment } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";
import { buildTemplateConfig, TEMPLATE_CONFIG_VERSION } from "@/lib/template-config";

function normalizeRepoSlug(value: string | undefined): { owner: string; repo: string } | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^https?:\/\/github.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  const [owner, repo] = normalized.split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function slugify(input: string, fallback: string): string {
  const clean = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return clean || fallback;
}

export async function POST(request: Request) {
  try {
    const ownerId = await getAuthenticatedUserId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const leadId = String(body.leadId ?? "");
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const lead = await getLeadById(leadId, ownerId);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    await setLeadDeployment(leadId, { siteStatus: "BUILDING" });

    const token = process.env.VERCEL_TOKEN;
    const project = process.env.VERCEL_TEMPLATE_PROJECT;
    const templateRepo = normalizeRepoSlug(process.env.VERCEL_TEMPLATE_REPO);
    const githubToken = process.env.GITHUB_TOKEN;
    const githubOwner = process.env.GITHUB_OWNER;
    if (!token || !project || !templateRepo || !githubToken || !githubOwner) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      return NextResponse.json(
        {
          error:
            "Missing deployment configuration. Required: VERCEL_TOKEN, VERCEL_TEMPLATE_PROJECT, VERCEL_TEMPLATE_REPO, GITHUB_TOKEN, GITHUB_OWNER.",
        },
        { status: 500 },
      );
    }

    const researchOutput = typeof body.researchOutput === "string" ? body.researchOutput : undefined;
    const configOverrides = body.templateConfigOverrides;

    const templateConfig = buildTemplateConfig(
      {
        ...lead,
        aiResearchSummary: researchOutput || lead.aiResearchSummary,
      },
      configOverrides,
    );

    const repoName = slugify(lead.businessName, `felix-${lead.id.slice(0, 8)}`);
    const gitRepoCreateResponse = await fetch(
      `https://api.github.com/repos/${templateRepo.owner}/${templateRepo.repo}/generate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner: githubOwner,
          name: repoName,
          description: `Felix CRM generated site for ${lead.businessName}`,
          include_all_branches: false,
          private: true,
        }),
      },
    );

    if (!gitRepoCreateResponse.ok) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      const errorText = await gitRepoCreateResponse.text();
      return NextResponse.json({ error: `GitHub template clone failed: ${errorText || gitRepoCreateResponse.statusText}` }, { status: 500 });
    }

    const createdRepo = (await gitRepoCreateResponse.json()) as { full_name?: string; default_branch?: string };
    const clonedRepoFullName = createdRepo.full_name;
    const repoDefaultBranch = createdRepo.default_branch || process.env.VERCEL_TEMPLATE_BRANCH || "main";

    if (!clonedRepoFullName) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      return NextResponse.json({ error: "GitHub template clone succeeded but did not return a repository name." }, { status: 500 });
    }

    const vercelProjectName = slugify(`felix-${lead.businessName}`, `felix-${lead.id.slice(0, 8)}`);
    const createProjectResponse = await fetch("https://api.vercel.com/v10/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: vercelProjectName,
        framework: null,
        gitRepository: {
          type: "github",
          repo: clonedRepoFullName,
        },
      }),
    });

    if (!createProjectResponse.ok && createProjectResponse.status !== 409) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      const errorText = await createProjectResponse.text();
      return NextResponse.json({ error: `Vercel project creation failed: ${errorText || createProjectResponse.statusText}` }, { status: 500 });
    }

    const response = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: vercelProjectName,
        project: vercelProjectName,
        gitSource: {
          type: "github",
          repo: clonedRepoFullName,
          ref: repoDefaultBranch,
        },
        target: "production",
        env: [
          { key: "TEMPLATE_CONFIG_JSON", value: JSON.stringify(templateConfig), target: ["production"] },
          { key: "TEMPLATE_CONFIG_VERSION", value: TEMPLATE_CONFIG_VERSION, target: ["production"] },
          { key: "BUSINESS_NAME", value: templateConfig.business.name, target: ["production"] },
          { key: "CONTACT_PHONE", value: templateConfig.content.contact.phone, target: ["production"] },
          { key: "CONTACT_EMAIL", value: templateConfig.content.contact.email, target: ["production"] },
          { key: "SOCIAL_LINKS", value: templateConfig.links.socials.map((social) => social.url).join(","), target: ["production"] },
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
    return NextResponse.json({
      url,
      deploymentId: payload.id,
      project: vercelProjectName,
      repository: clonedRepoFullName,
      templateProject: project,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 500 });
  }
}
