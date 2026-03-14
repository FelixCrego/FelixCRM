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


const TEMPLATE_REPO_MAP: Record<string, string> = {
  "garage-door": process.env.VERCEL_TEMPLATE_REPO || "FelixCrego/TemplateDetailer",
  "new-template": process.env.VERCEL_TEMPLATE_REPO_NEW_TEMPLATE || "FelixCrego/TemplateDetailer",
};

function resolveTemplateRepo(templateId: string | undefined): { templateId: string; repo: { owner: string; repo: string } | null } {
  const normalizedTemplateId = typeof templateId === "string" && templateId.trim() ? templateId.trim().toLowerCase() : "garage-door";
  const repoSlug = TEMPLATE_REPO_MAP[normalizedTemplateId] || TEMPLATE_REPO_MAP["garage-door"];
  return {
    templateId: normalizedTemplateId,
    repo: normalizeRepoSlug(repoSlug),
  };
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

function escapeForSingleQuotedValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function replaceQuotedKeyValue(source: string, key: string, nextValue: string): string {
  let updated = source;

  updated = updated.replace(new RegExp(`(["']?${key}["']?\\s*:\\s*)"[^"]*"`, "g"), `$1"${escapeForQuotedValue(nextValue)}"`);
  updated = updated.replace(new RegExp(`(["']?${key}["']?\\s*:\\s*)'[^']*'`, "g"), `$1'${escapeForSingleQuotedValue(nextValue)}'`);

  return updated;
}

function applySiteConfigOverrides(source: string, config: TemplateConfig): string {
  let updated = source;
  const businessName = config.business.name;
  const phoneDisplay = config.content.contact.phone;
  const phoneHref = normalizePhoneHref(phoneDisplay);
  const email = config.content.contact.email;

  const stringOverrides: Array<[string, string]> = [
    ["businessName", businessName],
    ["text", businessName],
    ["shortText", businessName],
    ["headline", config.content.hero.headline],
    ["subheadline", config.content.hero.subheadline],
    ["ctaLabel", config.content.hero.ctaLabel],
    ["logoUrl", config.branding.logoUrl],
    ["logo", config.branding.logoUrl],
    ["heroImageUrl", config.branding.heroImageUrl],
    ["heroUrl", config.branding.heroImageUrl],
    ["featureImageUrl", config.branding.heroImageUrl],
    ["primaryColor", config.branding.primaryColor],
    ["secondaryColor", config.branding.secondaryColor],
  ];

  for (const [key, value] of stringOverrides) {
    if (!value) continue;
    updated = replaceQuotedKeyValue(updated, key, value);
  }

  if (phoneDisplay) {
    updated = replaceQuotedKeyValue(updated, "phoneDisplay", phoneDisplay);
  }
  if (phoneHref) {
    updated = replaceQuotedKeyValue(updated, "phoneHref", phoneHref);
  }
  if (email) {
    updated = replaceQuotedKeyValue(updated, "email", email);
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

  const primaryLocation = config.geo.primaryLocation || config.business.city;
  if (primaryLocation) {
    updated = replaceQuotedKeyValue(updated, "city", primaryLocation);
    updated = replaceQuotedKeyValue(updated, "location", primaryLocation);
    updated = replaceQuotedKeyValue(updated, "primaryLocation", primaryLocation);
  }

  if (config.geo.serviceAreas.length > 0) {
    const serializedAreasDouble = config.geo.serviceAreas.map((area) => `"${escapeForQuotedValue(area)}"`).join(", ");
    const serializedAreasSingle = config.geo.serviceAreas.map((area) => `'${escapeForSingleQuotedValue(area)}'`).join(", ");

    updated = updated.replace(/(["']?serviceAreas["']?\s*:\s*)\[[\s\S]*?\]/g, `$1[${serializedAreasDouble}]`);
    updated = updated.replace(/(["']?areas["']?\s*:\s*)\[[\s\S]*?\]/g, `$1[${serializedAreasDouble}]`);
    updated = updated.replace(/(serviceAreas\s*=\s*)\[[\s\S]*?\]/g, `$1[${serializedAreasSingle}]`);
    updated = updated.replace(/(areas\s*=\s*)\[[\s\S]*?\]/g, `$1[${serializedAreasSingle}]`);
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
      if (!lower.endsWith(".ts") && !lower.endsWith(".tsx") && !lower.endsWith(".js") && !lower.endsWith(".jsx") && !lower.endsWith(".mjs") && !lower.endsWith(".cjs") && !lower.endsWith(".json")) continue;
      if (!lower.includes("site") && !lower.includes("config") && !lower.includes("area") && !lower.includes("location") && !lower.includes("geo")) continue;
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
    if (!source.includes("siteConfig") && !source.includes("businessName") && !source.includes("phoneDisplay") && !source.includes("serviceAreas") && !source.includes("areas") && !source.includes("primaryLocation") && !source.includes("location") && !source.includes("city") && !source.includes("serviceArea")) {
      return false;
    }

    const updated = applySiteConfigOverrides(source, params.templateConfig);
    if (updated === source) {
      return false;
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
    let patchedAny = false;

    for (const path of allPaths) {
      const patched = await tryPatchPath(path);
      if (patched) patchedAny = true;
    }

    if (patchedAny) return null;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return `Could not find any patchable site or area config files in ${params.repoFullName} on branch ${params.branch}.`;
}


function slugify(input: string, fallback: string): string {
  const clean = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return clean || fallback;
}

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
    const vercelBypassProtection = process.env.VERCEL_BYPASS_DEPLOYMENT_PROTECTION === "true";
    const vercelPublicDeployments = process.env.VERCEL_PUBLIC_DEPLOYMENTS
      ? process.env.VERCEL_PUBLIC_DEPLOYMENTS === "true"
      : !vercelBypassProtection;
    const requestedTemplateId = typeof body.templateId === "string" ? body.templateId : undefined;
    const { templateId, repo: templateRepo } = resolveTemplateRepo(requestedTemplateId);
    const githubToken = process.env.GITHUB_TOKEN;
    const githubOwner = process.env.GITHUB_OWNER || templateRepo?.owner;
    if (!token || !templateRepo || !githubToken || !githubOwner) {
      await setLeadDeployment(leadId, { siteStatus: "FAILED" });
      return NextResponse.json(
        {
          error: "Missing deployment configuration. Required: VERCEL_TOKEN, GITHUB_TOKEN, and a valid template repo (VERCEL_TEMPLATE_REPO / VERCEL_TEMPLATE_REPO_NEW_TEMPLATE). Optional: GITHUB_OWNER (defaults to template repo owner), VERCEL_TEMPLATE_PROJECT.",
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

    let siteConfigPatchWarning: string | null = null;
    try {
      siteConfigPatchWarning = await patchGeneratedRepoSiteConfig({
        githubHeaders,
        repoFullName: clonedRepoFullName,
        branch: repoDefaultBranch,
        templateConfig,
      });
    } catch (error) {
      siteConfigPatchWarning = error instanceof Error ? error.message : "Unable to patch generated repo site config.";
      console.warn("[deploy] continuing without direct site-config patch", {
        leadId,
        repo: clonedRepoFullName,
        warning: siteConfigPatchWarning,
      });
    }

    const frontendEnv = body && typeof body.env === "object" && body.env !== null ? (body.env as Record<string, unknown>) : {};

    const deploymentEnv = {
      TEMPLATE_CONFIG_JSON: JSON.stringify(templateConfig),
      TEMPLATE_CONFIG_VERSION,
      BUSINESS_NAME: templateConfig.business.name,
      CONTACT_PHONE: templateConfig.content.contact.phone,
      CONTACT_EMAIL: templateConfig.content.contact.email,
      SOCIAL_LINKS: templateConfig.links.socials.map((social) => social.url).join(","),
      NEXT_PUBLIC_BUSINESS_NAME: typeof frontendEnv.NEXT_PUBLIC_BUSINESS_NAME === "string" && frontendEnv.NEXT_PUBLIC_BUSINESS_NAME.trim()
        ? frontendEnv.NEXT_PUBLIC_BUSINESS_NAME.trim()
        : templateConfig.business.name,
      NEXT_PUBLIC_CITY: templateConfig.business.city,
      NEXT_PUBLIC_BUSINESS_CATEGORY: templateConfig.business.category,
      NEXT_PUBLIC_WEBSITE_URL: templateConfig.business.websiteUrl,
      NEXT_PUBLIC_CONTACT_PHONE: templateConfig.content.contact.phone,
      NEXT_PUBLIC_CONTACT_EMAIL: templateConfig.content.contact.email,
      NEXT_PUBLIC_PRIMARY_LOCATION: templateConfig.geo.primaryLocation,
      NEXT_PUBLIC_SERVICE_AREAS: templateConfig.geo.serviceAreas.join(","),
      NEXT_PUBLIC_HERO_HEADLINE: templateConfig.content.hero.headline,
      NEXT_PUBLIC_HERO_SUBHEADLINE: templateConfig.content.hero.subheadline,
      NEXT_PUBLIC_HERO_CTA_LABEL: templateConfig.content.hero.ctaLabel,
      NEXT_PUBLIC_GOOGLE_BUSINESS_PROFILE: templateConfig.links.googleBusinessProfile,
      NEXT_PUBLIC_SOCIAL_LINKS: templateConfig.links.socials.map((social) => social.url).join(","),
      NEXT_PUBLIC_PRIMARY_COLOR:
        typeof frontendEnv.NEXT_PUBLIC_PRIMARY_COLOR === "string" && frontendEnv.NEXT_PUBLIC_PRIMARY_COLOR.trim()
          ? frontendEnv.NEXT_PUBLIC_PRIMARY_COLOR.trim()
          : templateConfig.branding.primaryColor,
      NEXT_PUBLIC_SECONDARY_COLOR:
        typeof frontendEnv.NEXT_PUBLIC_SECONDARY_COLOR === "string" && frontendEnv.NEXT_PUBLIC_SECONDARY_COLOR.trim()
          ? frontendEnv.NEXT_PUBLIC_SECONDARY_COLOR.trim()
          : templateConfig.branding.secondaryColor,
      NEXT_PUBLIC_LOGO_URL:
        typeof frontendEnv.NEXT_PUBLIC_LOGO_URL === "string" && frontendEnv.NEXT_PUBLIC_LOGO_URL.trim()
          ? frontendEnv.NEXT_PUBLIC_LOGO_URL.trim()
          : templateConfig.branding.logoUrl,
      NEXT_PUBLIC_HERO_URL:
        typeof frontendEnv.NEXT_PUBLIC_HERO_URL === "string" && frontendEnv.NEXT_PUBLIC_HERO_URL.trim()
          ? frontendEnv.NEXT_PUBLIC_HERO_URL.trim()
          : typeof frontendEnv.NEXT_PUBLIC_FEATURE_IMAGE_URL === "string" && frontendEnv.NEXT_PUBLIC_FEATURE_IMAGE_URL.trim()
            ? frontendEnv.NEXT_PUBLIC_FEATURE_IMAGE_URL.trim()
            : templateConfig.branding.heroImageUrl,
      NEXT_PUBLIC_FEATURE_IMAGE_URL:
        typeof frontendEnv.NEXT_PUBLIC_FEATURE_IMAGE_URL === "string" && frontendEnv.NEXT_PUBLIC_FEATURE_IMAGE_URL.trim()
          ? frontendEnv.NEXT_PUBLIC_FEATURE_IMAGE_URL.trim()
          : typeof frontendEnv.NEXT_PUBLIC_HERO_URL === "string" && frontendEnv.NEXT_PUBLIC_HERO_URL.trim()
            ? frontendEnv.NEXT_PUBLIC_HERO_URL.trim()
            : templateConfig.branding.heroImageUrl,
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
        },
      );

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

    const payload = (await response.json()) as Record<string, unknown>;
    const deploymentId = typeof payload.id === "string" ? payload.id : undefined;
    const deploymentAliasUrl = firstDeploymentAlias(payload);
    const projectAliasUrl = toHttpsUrl(`${vercelProjectName}.vercel.app`);
    const fallbackDeploymentUrl = toHttpsUrl(payload.url);
    const deployedUrl = deploymentAliasUrl ?? projectAliasUrl ?? fallbackDeploymentUrl;

    await setLeadDeployment(leadId, { siteStatus: "BUILDING", deployedUrl, vercelDeploymentId: deploymentId });
    return NextResponse.json({
      url: deployedUrl,
      deployedUrl,
      liveUrl: deploymentAliasUrl ?? projectAliasUrl,
      deploymentId,
      project: vercelProjectName,
      repository: clonedRepoFullName,
      templateId,
      templateProject: project ?? null,
      scope: {
        type: vercelTeamId ? "team" : "personal",
        teamId: vercelTeamId ?? null,
      },
      protectionMode,
      siteConfigPatchWarning,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 500 });
  }
}
