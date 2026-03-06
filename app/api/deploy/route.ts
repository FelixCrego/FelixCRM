import { NextResponse } from "next/server";
import { getLeadById, setLeadDeployment } from "@/lib/store";
import { getAuthenticatedUserId } from "@/lib/auth";
import { buildTemplateConfig, TEMPLATE_CONFIG_VERSION, type TemplateConfig } from "@/lib/template-config";

function normalizeRepoSlug(value: string | undefined): { owner: string; repo: string } | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/^git@github\.com:/i, "")
    .replace(/^ssh:\/\/git@github\.com\//i, "")
    .replace(/^https?:\/\/github.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
  const [owner, repo] = normalized.split("/").filter(Boolean);
  if (!owner || !repo) return null;
  return { owner, repo };
}


function normalizePhoneHref(phone: string): string {
  const digits = phone.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

function escapeForQuotedValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeSocialPlatform(label: string): "facebook" | "instagram" | "x" | "youtube" | "google" | "linkedin" {
  const lower = label.toLowerCase();
  if (lower.includes("facebook")) return "facebook";
  if (lower.includes("instagram")) return "instagram";
  if (lower.includes("youtube")) return "youtube";
  if (lower.includes("google")) return "google";
  if (lower.includes("linkedin")) return "linkedin";
  return "x";
}

function applySiteConfigOverrides(source: string, config: TemplateConfig): string {
  let updated = source;
  const businessName = config.business.name;
  const phoneDisplay = config.content.contact.phone;
  const phoneHref = normalizePhoneHref(phoneDisplay);
  const email = config.content.contact.email;

  updated = updated.replace(/businessName:\s*"[^"]*"/, `businessName: "${escapeForQuotedValue(businessName)}"`);
  updated = updated.replace(/text:\s*"[^"]*"/, `text: "${escapeForQuotedValue(businessName)}"`);
  updated = updated.replace(/shortText:\s*"[^"]*"/, `shortText: "${escapeForQuotedValue(businessName)}"`);

  if (phoneDisplay) {
    updated = updated.replace(/phoneDisplay:\s*"[^"]*"/, `phoneDisplay: "${escapeForQuotedValue(phoneDisplay)}"`);
  }
  if (phoneHref) {
    updated = updated.replace(/phoneHref:\s*"[^"]*"/, `phoneHref: "${escapeForQuotedValue(phoneHref)}"`);
  }
  if (email) {
    updated = updated.replace(/email:\s*"[^"]*"/, `email: "${escapeForQuotedValue(email)}"`);
  }

  if (config.links.socials.length > 0) {
    const firstSocial = config.links.socials[0];
    const firstLabel = firstSocial.label || "Social";
    const platform = normalizeSocialPlatform(firstSocial.label || firstSocial.url);
    updated = updated.replace(
      /\{\s*platform:\s*"[^"]+"\s*,\s*label:\s*"[^"]+"\s*,\s*url:\s*"[^"]+"\s*\}/,
      `{ platform: "${platform}", label: "${escapeForQuotedValue(firstLabel)}", url: "${escapeForQuotedValue(firstSocial.url)}" }`,
    );
  }

  return updated;
}

async function patchGeneratedRepoSiteConfig(params: {
  githubHeaders: Record<string, string>;
  repoFullName: string;
  branch: string;
  templateConfig: TemplateConfig;
}) {
  const candidatePaths = ["src/config/site.ts", "src/config/siteConfig.ts", "config/site.ts", "siteConfig.ts", "lib/siteConfig.ts"];

  const allPaths: string[] = [...candidatePaths];
  const treeResponse = await fetch(`https://api.github.com/repos/${params.repoFullName}/git/trees/${params.branch}?recursive=1`, {
    headers: params.githubHeaders,
  });

  if (treeResponse.ok) {
    const treePayload = (await treeResponse.json()) as { tree?: Array<{ path?: string; type?: string }> };
    for (const item of treePayload.tree ?? []) {
      const path = item.path ?? "";
      if (item.type !== "blob") continue;
      const lower = path.toLowerCase();
      if (!lower.endsWith(".ts") && !lower.endsWith(".tsx")) continue;
      if (!lower.includes("site") && !lower.includes("config")) continue;
      if (allPaths.includes(path)) continue;
      allPaths.push(path);
    }
  }

  const tryPatchPath = async (path: string): Promise<boolean> => {
    const getResponse = await fetch(`https://api.github.com/repos/${params.repoFullName}/contents/${path}?ref=${params.branch}`, {
      headers: params.githubHeaders,
    });

    if (!getResponse.ok) return false;

    const contentPayload = (await getResponse.json()) as { sha?: string; content?: string; encoding?: string };
    const sha = contentPayload.sha;
    const encodedContent = contentPayload.content;
    if (!sha || !encodedContent || contentPayload.encoding !== "base64") return false;

    const source = Buffer.from(encodedContent.replace(/\n/g, ""), "base64").toString("utf8");
    if (!source.includes("siteConfig") && !source.includes("businessName") && !source.includes("phoneDisplay")) {
      return false;
    }

    const updated = applySiteConfigOverrides(source, params.templateConfig);
    if (updated === source) {
      return true;
    }

    const putResponse = await fetch(`https://api.github.com/repos/${params.repoFullName}/contents/${path}`, {
      method: "PUT",
      headers: params.githubHeaders,
      body: JSON.stringify({
        message: "chore: customize site config from lead data",
        content: Buffer.from(updated, "utf8").toString("base64"),
        sha,
        branch: params.branch,
      }),
    });

    if (!putResponse.ok) {
      const errorText = await putResponse.text();
      throw new Error(`Failed to customize ${path}: ${errorText || putResponse.statusText}`);
    }

    return true;
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    for (const path of allPaths) {
      const patched = await tryPatchPath(path);
      if (patched) return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`Could not find a patchable site config file in ${params.repoFullName} on branch ${params.branch}.`);
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
    const vercelTeamId = process.env.VERCEL_TEAM_ID?.trim() || undefined;
    const vercelPublicDeployments = process.env.VERCEL_PUBLIC_DEPLOYMENTS === "true";
    const vercelBypassProtection = process.env.VERCEL_BYPASS_DEPLOYMENT_PROTECTION === "true";
    const templateRepo = normalizeRepoSlug(process.env.VERCEL_TEMPLATE_REPO);
    const githubToken = process.env.GITHUB_TOKEN;
    const githubOwner = process.env.GITHUB_OWNER || templateRepo?.owner;
    if (!token || !templateRepo || !githubToken || !githubOwner) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      return NextResponse.json(
        {
          error: "Missing deployment configuration. Required: VERCEL_TOKEN, VERCEL_TEMPLATE_REPO, GITHUB_TOKEN. Optional: GITHUB_OWNER (defaults to template repo owner), VERCEL_TEMPLATE_PROJECT.",
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
    const githubHeaders = {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };

    let createdRepo: { id?: number; full_name?: string; default_branch?: string } | null = null;
    let repoDefaultBranch = process.env.VERCEL_TEMPLATE_BRANCH || "main";

    const gitRepoCreateResponse = await fetch(`https://api.github.com/repos/${templateRepo.owner}/${templateRepo.repo}/generate`, {
      method: "POST",
      headers: githubHeaders,
      body: JSON.stringify({
        owner: githubOwner,
        name: repoName,
        description: `Felix CRM generated site for ${lead.businessName}`,
        include_all_branches: false,
        private: true,
      }),
    });

    if (gitRepoCreateResponse.ok) {
      createdRepo = (await gitRepoCreateResponse.json()) as { id?: number; full_name?: string; default_branch?: string };
      repoDefaultBranch = createdRepo.default_branch || repoDefaultBranch;
    } else if (gitRepoCreateResponse.status === 404) {
      let forkRepoResponse = await fetch(`https://api.github.com/repos/${templateRepo.owner}/${templateRepo.repo}/forks`, {
        method: "POST",
        headers: githubHeaders,
        body: JSON.stringify({
          name: repoName,
          organization: githubOwner,
          default_branch_only: true,
        }),
      });

      if (!forkRepoResponse.ok) {
        forkRepoResponse = await fetch(`https://api.github.com/repos/${templateRepo.owner}/${templateRepo.repo}/forks`, {
          method: "POST",
          headers: githubHeaders,
          body: JSON.stringify({
            name: repoName,
            default_branch_only: true,
          }),
        });
      }

      if (!forkRepoResponse.ok) {
        await setLeadDeployment(leadId, { siteStatus: "FAILED" });
        const templateError = await gitRepoCreateResponse.text();
        const forkError = await forkRepoResponse.text();
        return NextResponse.json(
          {
            error: `GitHub template clone failed and fork fallback failed: template=${templateError || gitRepoCreateResponse.statusText}; fork=${forkError || forkRepoResponse.statusText}`,
          },
          { status: 500 },
        );
      }

      createdRepo = (await forkRepoResponse.json()) as { id?: number; full_name?: string; default_branch?: string };
      repoDefaultBranch = createdRepo.default_branch || repoDefaultBranch;
    } else {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      const errorText = await gitRepoCreateResponse.text();
      return NextResponse.json({ error: `GitHub template clone failed: ${errorText || gitRepoCreateResponse.statusText}` }, { status: 500 });
    }

    const clonedRepoFullName = createdRepo.full_name;
    const clonedRepoId = createdRepo.id;

    if (!clonedRepoFullName || !clonedRepoId) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      return NextResponse.json({ error: "GitHub repository creation succeeded but did not return repository metadata (name/id)." }, { status: 500 });
    }

    await patchGeneratedRepoSiteConfig({
      githubHeaders,
      repoFullName: clonedRepoFullName,
      branch: repoDefaultBranch,
      templateConfig,
    });

    const deploymentEnv = {
      TEMPLATE_CONFIG_JSON: JSON.stringify(templateConfig),
      TEMPLATE_CONFIG_VERSION,
      BUSINESS_NAME: templateConfig.business.name,
      CONTACT_PHONE: templateConfig.content.contact.phone,
      CONTACT_EMAIL: templateConfig.content.contact.email,
      SOCIAL_LINKS: templateConfig.links.socials.map((social) => social.url).join(","),
    };

    const vercelProjectName = slugify(`felix-${lead.businessName}`, `felix-${lead.id.slice(0, 8)}`);

    if (vercelPublicDeployments && vercelBypassProtection) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      return NextResponse.json(
        {
          error:
            "Invalid deployment protection configuration: set only one of VERCEL_PUBLIC_DEPLOYMENTS=true or VERCEL_BYPASS_DEPLOYMENT_PROTECTION=true.",
        },
        { status: 500 },
      );
    }

    const scopeParams = new URLSearchParams();
    if (vercelTeamId) scopeParams.set("teamId", vercelTeamId);
    const scopeQuery = scopeParams.toString() ? `?${scopeParams.toString()}` : "";
    const envScopeParams = new URLSearchParams(scopeParams);
    envScopeParams.set("upsert", "true");
    const envScopeQuery = `?${envScopeParams.toString()}`;

    const createProjectResponse = await fetch(`https://api.vercel.com/v10/projects${scopeQuery}`, {
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

    const protectionMode = vercelPublicDeployments ? "public" : vercelBypassProtection ? "bypass-automation" : "private";
    const projectSettingsBody: Record<string, unknown> = {
      publicSource: vercelPublicDeployments,
    };

    if (vercelBypassProtection) {
      projectSettingsBody.deploymentProtectionSettings = {
        protectProduction: true,
        bypassForAutomation: true,
      };
    }

    const updateProjectSettingsResponse = await fetch(`https://api.vercel.com/v9/projects/${vercelProjectName}${scopeQuery}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(projectSettingsBody),
    });

    if (!updateProjectSettingsResponse.ok) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      const errorText = await updateProjectSettingsResponse.text();
      return NextResponse.json(
        {
          error: `Vercel project settings update failed for protection mode '${protectionMode}'. Check VERCEL_PUBLIC_DEPLOYMENTS / VERCEL_BYPASS_DEPLOYMENT_PROTECTION and token permissions. Details: ${errorText || updateProjectSettingsResponse.statusText}`,
        },
        { status: 500 },
      );
    }

    for (const [key, value] of Object.entries(deploymentEnv)) {
      const upsertEnvResponse = await fetch(`https://api.vercel.com/v10/projects/${vercelProjectName}/env${envScopeQuery}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          value,
          target: ["production"],
          type: "encrypted",
        }),
      });

      if (!upsertEnvResponse.ok) {
        await setLeadDeployment(leadId, { siteStatus: "FAILED" });
        const errorText = await upsertEnvResponse.text();
        return NextResponse.json({ error: `Vercel env upsert failed for ${key}: ${errorText || upsertEnvResponse.statusText}` }, { status: 500 });
      }
    }

    const response = await fetch(`https://api.vercel.com/v13/deployments${scopeQuery}`, {
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
          repoId: String(clonedRepoId),
          ref: repoDefaultBranch,
        },
        target: "production",
        env: deploymentEnv,
        public: vercelPublicDeployments,
      }),
    });

    if (!response.ok) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      const errorText = await response.text();
      return NextResponse.json({ error: `Deployment failed: ${errorText || response.statusText}` }, { status: 500 });
    }

    const payload = (await response.json()) as { id?: string; url?: string; alias?: string[] };
    const productionAlias = payload.alias?.find((entry) => typeof entry === "string" && entry.endsWith(".vercel.app"));
    const deploymentHostname = payload.url;
    const stableProjectHostname = `${vercelProjectName}.vercel.app`;
    const resolvedHostname = productionAlias || (vercelPublicDeployments ? stableProjectHostname : deploymentHostname);
    const url = resolvedHostname ? `https://${resolvedHostname}` : undefined;

    await setLeadDeployment(leadId, { siteStatus: url ? "LIVE" : "BUILDING", deployedUrl: url, vercelDeploymentId: payload.id });
    return NextResponse.json({
      url,
      deploymentId: payload.id,
      project: vercelProjectName,
      repository: clonedRepoFullName,
      templateProject: project ?? null,
      scope: {
        type: vercelTeamId ? "team" : "personal",
        teamId: vercelTeamId ?? null,
      },
      protectionMode,
      deploymentHostnames: {
        deployment: deploymentHostname ?? null,
        productionAlias: productionAlias ?? null,
        stableProject: stableProjectHostname,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 500 });
  }
}
