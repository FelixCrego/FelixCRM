import { Prisma, PrismaClient } from "@prisma/client";
import { dedupeKey } from "@/lib/utils";
import type { Lead, Script, ToneOfVoice, UserRole } from "@/lib/types";

if (!process.env.DATABASE_URL && process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;


const hasDb = Boolean(process.env.DATABASE_URL);


function leadToMemory(lead: any): Lead {
  return {
    id: lead.id,
    businessName: lead.businessName,
    city: lead.city,
    businessType: lead.businessType,
    phone: lead.phone,
    email: lead.email,
    websiteUrl: lead.websiteUrl,
    websiteStatus: lead.websiteStatus,
    status: lead.status,
    deployedUrl: lead.deployedUrl,
    siteStatus: (lead.siteStatus ?? "UNBUILT") as Lead["siteStatus"],
    ownerId: lead.ownerId,
    updatedAt: lead.updatedAt.toISOString(),
    socialLinks: Array.isArray(lead.sourcePayload?.socialLinks) ? lead.sourcePayload.socialLinks : [],
    aiResearchSummary: typeof lead.sourcePayload?.aiResearchSummary === "string" ? lead.sourcePayload.aiResearchSummary : null,
    sourceQuery: typeof lead.sourcePayload?.sourceQuery === "string" ? lead.sourcePayload.sourceQuery : null,
  };
}

export async function getProfile() {
  if (!hasDb) throw new Error("DATABASE_URL is required to load profile data.");
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user profile found. Create a user record before using the app.");
  return {
    niche: user.niche ?? "",
    toneOfVoice: (user.toneOfVoice ?? "CONSULTATIVE") as ToneOfVoice,
    calendarLink: user.calendarLink ?? "",
    onboardingCompleted: user.onboardingCompleted,
    role: (user.role ?? "REP") as UserRole,
  };
}

export async function saveProfile(profile: { niche: string; toneOfVoice: ToneOfVoice; calendarLink: string; onboardingCompleted: boolean; role: UserRole }) {
  if (!hasDb) throw new Error("DATABASE_URL is required to save profile data.");
  const user = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user profile found. Create a user record before saving profile settings.");
  await prisma.user.update({
    where: { id: user.id },
    data: profile,
  });
}

export async function listLeads() {
  if (!hasDb) throw new Error("DATABASE_URL is required to load leads.");
  const leads = await prisma.lead.findMany({ orderBy: { updatedAt: "desc" } });
  return leads.map(leadToMemory);
}

export async function insertLeads(leads: Omit<Lead, "id" | "updatedAt" | "status">[]) {
  if (!hasDb) throw new Error("DATABASE_URL is required to insert leads.");

  let inserted = 0;
  let duplicatesSkipped = 0;
  for (const lead of leads) {
    const domain = lead.websiteUrl?.replace(/^https?:\/\//, "") ?? "";
    const key = dedupeKey(lead.businessName, lead.city, lead.businessType, lead.phone ?? "", domain);
    try {
      await prisma.lead.create({
        data: {
          businessName: lead.businessName,
          city: lead.city,
          businessType: lead.businessType,
          phone: lead.phone,
          email: lead.email,
          websiteUrl: lead.websiteUrl,
          websiteStatus: lead.websiteStatus,
          normalizedName: lead.businessName.toLowerCase(),
          normalizedPhone: lead.phone?.replace(/\D/g, "") ?? null,
          normalizedDomain: domain.toLowerCase(),
          dedupeKey: key,
          status: "NEW",
          siteStatus: "UNBUILT",
          ownerId: null,
          sourcePayload: {
            socialLinks: lead.socialLinks ?? [],
            aiResearchSummary: lead.aiResearchSummary ?? null,
            sourceQuery: lead.sourceQuery ?? null,
          },
        },
      });
      inserted++;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        duplicatesSkipped += 1;
        continue;
      }
      throw error;
    }
  }
  console.info("[insertLeads] db path used", { dbPathUsed: true, inserted, duplicatesSkipped });
  return inserted;
}

export async function setLeadDeployment(leadId: string, deployment: { deployedUrl?: string; siteStatus: "BUILDING" | "LIVE" | "FAILED"; vercelDeploymentId?: string }) {
  if (!hasDb) throw new Error("DATABASE_URL is required to update lead deployment.");
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      deployedUrl: deployment.deployedUrl,
      siteStatus: deployment.siteStatus,
      vercelDeploymentId: deployment.vercelDeploymentId,
    },
  });
}

export async function saveScript(script: Omit<Script, "id" | "upvoteCount">) {
  if (!hasDb) throw new Error("DATABASE_URL is required to save scripts.");
  const row = await prisma.script.create({
    data: {
      content: script.content,
      type: script.type,
      ...(script.leadId ? { lead: { connect: { id: script.leadId } } } : {}),
      author: { connect: { id: (await prisma.user.findFirstOrThrow({ select: { id: true }, orderBy: { createdAt: "asc" } })).id } },
      toneUsed: (await getProfile()).toneOfVoice,
      modelName: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      promptVersion: "v1",
    },
  });
  return { id: row.id, content: row.content, type: row.type as Script["type"], upvoteCount: row.upvoteCount, leadId: row.leadId ?? undefined };
}

export async function listScripts() {
  if (!hasDb) throw new Error("DATABASE_URL is required to list scripts.");
  const rows = await prisma.script.findMany({ where: { isShared: true }, orderBy: [{ upvoteCount: "desc" }, { createdAt: "desc" }] });
  return rows.map((row) => ({ id: row.id, content: row.content, type: row.type as Script["type"], upvoteCount: row.upvoteCount, leadId: row.leadId ?? undefined }));
}

export async function upvoteScript(scriptId: string) {
  if (!hasDb) throw new Error("DATABASE_URL is required to upvote scripts.");
  await prisma.script.update({ where: { id: scriptId }, data: { upvoteCount: { increment: 1 } } });
}

export async function releaseStaleLeads() {
  if (!hasDb) throw new Error("DATABASE_URL is required to release stale leads.");
  await prisma.lead.updateMany({
    where: {
      ownerId: { not: null },
      status: { notIn: ["IN_PROGRESS", "CLOSED"] },
      updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    data: { ownerId: null },
  });
}


export async function setLeadResearchSummary(leadId: string, summary: string) {
  if (!hasDb) throw new Error("DATABASE_URL is required to save lead research.");

  const existing = await prisma.lead.findUnique({ where: { id: leadId }, select: { sourcePayload: true } });
  const payload = existing?.sourcePayload && typeof existing.sourcePayload === "object" ? existing.sourcePayload as Record<string, unknown> : {};
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      sourcePayload: {
        ...payload,
        aiResearchSummary: summary,
      },
    },
  });
}

export async function claimLeads(leadIds: string[], ownerId: string) {
  if (!leadIds.length) return 0;

  if (!hasDb) throw new Error("DATABASE_URL is required to claim leads.");

  const result = await prisma.lead.updateMany({
    where: { id: { in: leadIds } },
    data: { ownerId, status: "IN_PROGRESS" },
  });
  return result.count;
}

export async function getLeadById(leadId: string) {
  const leads = await listLeads();
  return leads.find((lead) => lead.id === leadId);
}


export async function getCurrentUserId() {
  if (!hasDb) throw new Error("DATABASE_URL is required to resolve current user.");
  const user = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user found. Create a user record before claiming leads.");
  return user.id;
}
