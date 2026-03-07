export type ToneOfVoice = "PROFESSIONAL" | "AGGRESSIVE" | "CONSULTATIVE" | "FRIENDLY";
export type UserRole = "REP" | "MANAGER" | "TEAM_LEAD" | "SUPER_ADMIN";

export type LeadResearchSocialLinks = Partial<Record<"facebook" | "instagram" | "googleBusiness" | "linkedin" | "x" | "youtube" | "tiktok" | "yelp", string>> & Record<string, string | undefined>;

export type LeadResearchStructuredPayload = {
  businessName: string;
  primaryPhone: string | null;
  primaryEmail: string | null;
  logoUrl: string | null;
  brandColors: string[];
  socialLinks: LeadResearchSocialLinks;
  heroCopy: string | null;
  services: string[];
  trustSignals: string[];
  confidence: number;
  sources: string[];
};

export type LeadEnrichmentPayload = {
  summary: string;
  structured: LeadResearchStructuredPayload;
};

export type Lead = {
  id: string;
  businessName: string;
  city: string;
  businessType: string;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  websiteStatus?: string | null;
  socialLinks?: string[];
  aiResearchSummary?: string | null;
  enrichment?: LeadEnrichmentPayload | null;
  sourceQuery?: string | null;
  contacts?: Array<{
    id: string;
    name: string;
    role?: string;
    phones: string[];
    emails: string[];
  }>;
  demoBooking?: {
    date?: string;
    time?: string;
    timeZone?: string;
    meetLink?: string;
    bookedAt?: string;
  } | null;
  status: "NEW" | "CONTACTED" | "IN_PROGRESS" | "CLOSED" | "DISQUALIFIED";
  deployedUrl?: string | null;
  siteStatus?: "UNBUILT" | "BUILDING" | "LIVE" | "FAILED" | null;
  vercelDeploymentId?: string | null;
  ownerId?: string | null;
  closedDealValue?: number | null;
  closedAt?: string | null;
  stripeCheckoutLink?: string | null;
  transferRequests?: { requesterId: string; requestedAt: string; status: "PENDING" | "APPROVED" | "REJECTED" }[];
  updatedAt: string;
};

export type Script = {
  id: string;
  content: string;
  type: "EMAIL" | "SMS" | "OBJECTION_RESPONSE" | "TIP";
  upvoteCount: number;
  leadId?: string;
};
