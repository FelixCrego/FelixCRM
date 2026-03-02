import { PrismaClient } from "@prisma/client";
import { dedupeKey, fakeUserId } from "@/lib/utils";
import type { Lead, Script, ToneOfVoice, UserRole } from "@/lib/types";

if (!process.env.DATABASE_URL && process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

let memory = {
  profile: { niche: "Local Services", toneOfVoice: "CONSULTATIVE" as ToneOfVoice, calendarLink: "", onboardingCompleted: false, role: "REP" as UserRole },
  leads: [] as Lead[],
  scripts: [] as Script[],
};

const hasDb = Boolean(process.env.DATABASE_URL);


function shouldUseMemoryFallback(error: unknown) {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("does not exist") || msg.includes("p2021") || msg.includes("p2022");
}

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
  if (!hasDb) return memory.profile;
  const user = await prisma.user.upsert({
    where: { email: "demo@felixcrm.ai" },
    create: { email: "demo@felixcrm.ai", name: "Demo Rep" },
    update: {},
  });
  return {
    niche: user.niche ?? "",
    toneOfVoice: (user.toneOfVoice ?? "CONSULTATIVE") as ToneOfVoice,
    calendarLink: user.calendarLink ?? "",
    onboardingCompleted: user.onboardingCompleted,
    role: (user.role ?? "REP") as UserRole,
  };
}

export async function saveProfile(profile: { niche: string; toneOfVoice: ToneOfVoice; calendarLink: string; onboardingCompleted: boolean; role: UserRole }) {
  if (!hasDb) {
    memory.profile = profile;
    return;
  }
  await prisma.user.upsert({
    where: { email: "demo@felixcrm.ai" },
    create: { email: "demo@felixcrm.ai", ...profile, name: "Demo Rep" },
    update: profile,
  });
}

export async function listLeads() {
  if (!hasDb) return memory.leads;
  try {
    const leads = await prisma.lead.findMany({ orderBy: { updatedAt: "desc" } });
    return leads.map(leadToMemory);
  } catch (error) {
    if (shouldUseMemoryFallback(error)) return memory.leads;
    throw error;
  }
}

export async function insertLeads(leads: Omit<Lead, "id" | "updatedAt" | "status">[]) {
  if (!hasDb) {
    const existing = new Set(memory.leads.map((lead) => dedupeKey(lead.businessName, lead.city, lead.businessType, lead.phone ?? "", lead.websiteUrl ?? "")));
    const newLeads = leads.filter((lead) => !existing.has(dedupeKey(lead.businessName, lead.city, lead.businessType, lead.phone ?? "", lead.websiteUrl ?? ""))).map((lead, idx) => ({
      ...lead,
      id: `lead-${Date.now()}-${idx}`,
      status: "NEW" as const,
      siteStatus: "UNBUILT" as const,
      updatedAt: new Date().toISOString(),
      ownerId: null,
    }));
    memory.leads.unshift(...newLeads);
    return newLeads.length;
  }

  let inserted = 0;
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
    } catch {
      // dedupe conflict ignored
    }
  }
  return inserted;
}

export async function setLeadDeployment(leadId: string, deployment: { deployedUrl?: string; siteStatus: "BUILDING" | "LIVE" | "FAILED"; vercelDeploymentId?: string }) {
  if (!hasDb) {
    memory.leads = memory.leads.map((lead) => (lead.id === leadId ? { ...lead, ...deployment, updatedAt: new Date().toISOString() } : lead));
    return;
  }
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
  if (!hasDb) {
    const row = { ...script, id: `script-${Date.now()}`, upvoteCount: 0 };
    memory.scripts.unshift(row);
    return row;
  }
  const row = await prisma.script.create({
    data: {
      content: script.content,
      type: script.type,
      ...(script.leadId ? { lead: { connect: { id: script.leadId } } } : {}),
      author: { connectOrCreate: { where: { email: "demo@felixcrm.ai" }, create: { email: "demo@felixcrm.ai" } } },
      toneUsed: (await getProfile()).toneOfVoice,
      modelName: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      promptVersion: "v1",
    },
  });
  return { id: row.id, content: row.content, type: row.type as Script["type"], upvoteCount: row.upvoteCount, leadId: row.leadId ?? undefined };
}

export async function listScripts() {
  if (!hasDb) return memory.scripts;
  try {
    const rows = await prisma.script.findMany({ where: { isShared: true }, orderBy: [{ upvoteCount: "desc" }, { createdAt: "desc" }] });
    return rows.map((row) => ({ id: row.id, content: row.content, type: row.type as Script["type"], upvoteCount: row.upvoteCount, leadId: row.leadId ?? undefined }));
  } catch (error) {
    if (shouldUseMemoryFallback(error)) return memory.scripts;
    throw error;
  }
}

export async function upvoteScript(scriptId: string) {
  if (!hasDb) {
    memory.scripts = memory.scripts.map((script) => (script.id === scriptId ? { ...script, upvoteCount: script.upvoteCount + 1 } : script));
    return;
  }
  await prisma.script.update({ where: { id: scriptId }, data: { upvoteCount: { increment: 1 } } });
}

export async function releaseStaleLeads() {
  if (!hasDb) {
    memory.leads = memory.leads.map((lead) => {
      const stale = new Date(lead.updatedAt).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000;
      if (stale && !["IN_PROGRESS", "CLOSED"].includes(lead.status)) return { ...lead, ownerId: null };
      return lead;
    });
    return;
  }
  try {
    await prisma.lead.updateMany({
      where: {
        ownerId: { not: null },
        status: { notIn: ["IN_PROGRESS", "CLOSED"] },
        updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      data: { ownerId: null },
    });
  } catch (error) {
    if (shouldUseMemoryFallback(error)) return;
    throw error;
  }
}

export async function getLeadById(leadId: string) {
  const leads = await listLeads();
  return leads.find((lead) => lead.id === leadId);
}

export function demoOwnerId() {
  return fakeUserId;
}
