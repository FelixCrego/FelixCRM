"use client";

import { useEffect, useMemo, useState } from "react";
import { LeadExecutionWorkspace } from "@/components/leads/lead-execution-workspace";
import type { Lead } from "@/lib/types";

type LeadExecutionPageProps = {
  params: {
    id?: string;
  };
};

const CLAIMED_LEADS_STORAGE_KEY = "claimedLeads";

const FALLBACK_LEAD: Lead = {
  id: "mock-eustis-garage-door-repair",
  businessName: "Eustis Garage Door Repair",
  city: "Eustis",
  businessType: "Garage Door Repair",
  phone: "(352) 555-0147",
  email: "service@eustisgaragedoorrepair.example",
  websiteUrl: null,
  websiteStatus: "MISSING",
  status: "IN_PROGRESS",
  siteStatus: "UNBUILT",
  ownerId: "demo-user",
  aiResearchSummary:
    "Analyzed 14 Google Reviews and local SEO. Weakness: No mobile booking. Competitors rank higher for 'emergency repair'.",
  deployedUrl: "https://eustis-garage-door-repair.vercel.app",
  updatedAt: new Date().toISOString(),
};

function normalizeLead(raw: unknown): Lead | null {
  if (!raw || typeof raw !== "object") return null;

  const lead = raw as Partial<Lead> & Record<string, unknown>;
  if (typeof lead.id !== "string" || typeof lead.businessName !== "string") return null;

  const validStatus = ["NEW", "CONTACTED", "IN_PROGRESS", "CLOSED", "DISQUALIFIED"] as const;
  const validSiteStatus = ["UNBUILT", "BUILDING", "LIVE", "FAILED"] as const;

  return {
    id: lead.id,
    businessName: lead.businessName,
    city: typeof lead.city === "string" ? lead.city : "Unknown",
    businessType: typeof lead.businessType === "string" ? lead.businessType : "Local Services",
    phone: typeof lead.phone === "string" ? lead.phone : null,
    email: typeof lead.email === "string" ? lead.email : null,
    websiteUrl: typeof lead.websiteUrl === "string" ? lead.websiteUrl : null,
    websiteStatus: typeof lead.websiteStatus === "string" ? lead.websiteStatus : null,
    socialLinks: Array.isArray(lead.socialLinks) ? (lead.socialLinks.filter((link) => typeof link === "string") as string[]) : [],
    aiResearchSummary: typeof lead.aiResearchSummary === "string" ? lead.aiResearchSummary : null,
    sourceQuery: typeof lead.sourceQuery === "string" ? lead.sourceQuery : null,
    status: validStatus.includes(lead.status as (typeof validStatus)[number]) ? (lead.status as Lead["status"]) : "NEW",
    deployedUrl: typeof lead.deployedUrl === "string" ? lead.deployedUrl : null,
    siteStatus: validSiteStatus.includes(lead.siteStatus as (typeof validSiteStatus)[number]) ? (lead.siteStatus as Lead["siteStatus"]) : "UNBUILT",
    ownerId: typeof lead.ownerId === "string" ? lead.ownerId : null,
    updatedAt: typeof lead.updatedAt === "string" ? lead.updatedAt : new Date().toISOString(),
  };
}

export default function LeadExecutionPage({ params }: LeadExecutionPageProps) {
  const [resolvedLead, setResolvedLead] = useState<Lead>(FALLBACK_LEAD);

  const leadId = useMemo(() => params?.id?.trim() ?? "", [params?.id]);

  useEffect(() => {
    const hydrateLead = () => {
      if (!leadId) {
        setResolvedLead(FALLBACK_LEAD);
        return;
      }

      try {
        const raw = window.localStorage.getItem(CLAIMED_LEADS_STORAGE_KEY);
        if (!raw) {
          setResolvedLead({ ...FALLBACK_LEAD, id: leadId });
          return;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          setResolvedLead({ ...FALLBACK_LEAD, id: leadId });
          return;
        }

        const foundLead = parsed
          .map(normalizeLead)
          .find((lead): lead is Lead => Boolean(lead) && lead.id === leadId);

        if (foundLead) {
          setResolvedLead(foundLead);
          return;
        }

        setResolvedLead({ ...FALLBACK_LEAD, id: leadId });
      } catch {
        setResolvedLead({ ...FALLBACK_LEAD, id: leadId });
      }
    };

    hydrateLead();
  }, [leadId]);

  return <LeadExecutionWorkspace lead={resolvedLead} />;
}
