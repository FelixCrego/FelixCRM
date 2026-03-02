export type ToneOfVoice = "PROFESSIONAL" | "AGGRESSIVE" | "CONSULTATIVE" | "FRIENDLY";
export type UserRole = "REP" | "MANAGER" | "TEAM_LEAD" | "SUPER_ADMIN";

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
  sourceQuery?: string | null;
  status: "NEW" | "CONTACTED" | "IN_PROGRESS" | "CLOSED" | "DISQUALIFIED";
  deployedUrl?: string | null;
  siteStatus?: "UNBUILT" | "BUILDING" | "LIVE" | "FAILED" | null;
  ownerId?: string | null;
  updatedAt: string;
};

export type Script = {
  id: string;
  content: string;
  type: "EMAIL" | "SMS" | "OBJECTION_RESPONSE" | "TIP";
  upvoteCount: number;
  leadId?: string;
};
