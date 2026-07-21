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

export type ManagedServiceLine = {
  enabled?: boolean;
  status?: "NOT_STARTED" | "ON_TRACK" | "NEEDS_ATTENTION" | "PAUSED";
  cadence?: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  deliverables?: string | null;
  kpiSummary?: string | null;
  nextReportDate?: string | null;
  notes?: string | null;
};

export type SeoTaskChecklistItem = {
  id: string;
  title: string;
  instruction: string;
  completed?: boolean;
};

export type LeadAccountManagementProfile = {
  serviceStatus?: "ONBOARDING" | "ACTIVE" | "AT_RISK" | "PAUSED";
  syncEnabled?: boolean;
  primaryOwnerId?: string | null;
  primaryOwnerName?: string | null;
  startDate?: string | null;
  renewalDate?: string | null;
  seo?: ManagedServiceLine | null;
  seoTasks?: SeoTaskChecklistItem[] | null;
  ppc?: ManagedServiceLine | null;
  social?: ManagedServiceLine | null;
  analyticsConnections?: {
    gscConnected?: boolean;
    gscPropertyUrl?: string | null;
    ga4Connected?: boolean;
    ga4PropertyId?: string | null;
    lastAiReviewAt?: string | null;
    aiSuggestions?: string | null;
  } | null;
  clientHealth?: {
    lastTouchAt?: string | null;
    nextMeetingAt?: string | null;
    satisfaction?: "STRONG" | "STABLE" | "WATCH" | "AT_RISK";
    blockers?: string | null;
    expansionOpportunity?: string | null;
  } | null;
  successPlan?: {
    primaryClientEmail?: string | null;
    ccEmails?: string[] | null;
    sendWeeklyReport?: boolean;
    weeklyReportDay?: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
    weeklyReportTime?: string | null;
    timeZone?: string | null;
    communicationSummary?: string | null;
    currentFocus?: string | null;
    recentWins?: string | null;
    currentRisks?: string | null;
    nextSteps?: string | null;
    lastWeeklyReportSentAt?: string | null;
    nextWeeklyReportDueAt?: string | null;
  } | null;
};

export type ServiceTicketCategory =
  | "WEBSITE"
  | "CRM"
  | "SOCIAL_MEDIA"
  | "GOOGLE_ADS"
  | "SEO"
  | "AUTOMATION"
  | "BILLING"
  | "OTHER";

export type ServiceTicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ServiceTicketStatus =
  | "NEW"
  | "TRIAGED"
  | "IN_PROGRESS"
  | "WAITING_ON_CLIENT"
  | "COMPLETED"
  | "CANCELLED";

export type ServiceTicketSource = "CLIENT_PORTAL" | "INTERNAL";

export type ServiceTicket = {
  id: string;
  leadId: string;
  businessName?: string | null;
  category: ServiceTicketCategory;
  priority: ServiceTicketPriority;
  status: ServiceTicketStatus;
  source: ServiceTicketSource;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string | null;
  createdByUserId?: string | null;
  createdByName?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
};

export type LeadMarketingAttribution = {
  clientId?: string | null;
  customerId?: string | null;
  gclid?: string | null;
  service?: string | null;
  leadValue?: number | null;
  landingPage?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
};


export type IntelligenceEvidence = {
  id: string;
  category: "website" | "marketing" | "automation" | "sales" | "research" | "contact" | "reputation" | "client";
  label: string;
  detail: string;
  weight: number;
  source: string | null;
};

export type LeadIntelligenceProfile = {
  generatedAt: string;
  opportunityScore: number;
  websiteScore: number;
  marketingScore: number;
  automationScore: number;
  salesProcessScore: number;
  aiAdoptionScore: number;
  confidence: number;
  estimatedRevenueOpportunity: { low: number; high: number; currency: "USD" };
  buyingSignals: string[];
  riskFactors: string[];
  recommendedService: string;
  recommendedSalesAngle: string;
  nextBestAction: {
    type: "RESEARCH" | "CALL" | "EMAIL" | "FOLLOW_UP" | "PREPARE_DEMO" | "ESCALATE" | "BUILD_AUDIT";
    title: string;
    reason: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    href: string;
  };
  evidence: IntelligenceEvidence[];
};

export type Lead = {
  id: string;
  businessName: string;
  city: string;
  businessType: string;
  createdAt?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  websiteStatus?: string | null;
  socialLinks?: string[];
  aiResearchSummary?: string | null;
  leadQuality?: string | null;
  googleRating?: string | null;
  googleReviews?: string | null;
  importedFields?: Record<string, string> | null;
  csvImportBatchId?: string | null;
  csvImportedAt?: string | null;
  enrichment?: LeadEnrichmentPayload | null;
  sourceQuery?: string | null;
  sourceType?: "SCRAPED" | "ADDED" | null;
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
  status: string;
  workspaceStatus?: string | null;
  deployedUrl?: string | null;
  siteStatus?: "UNBUILT" | "BUILDING" | "LIVE" | "FAILED" | null;
  vercelDeploymentId?: string | null;
  ownerId?: string | null;
  soldByUserId?: string | null;
  soldByName?: string | null;
  soldByEmail?: string | null;
  billingProfile?: {
    billingType?: "ONE_TIME" | "RECURRING";
    recurringAmount?: number | null;
    oneTimeAmount?: number | null;
    autoRenew?: boolean;
    billingStatus?: "ACTIVE" | "PAUSED" | "CANCELLED" | "PAID";
    billingStartDate?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripeCheckoutSessionId?: string | null;
    notes?: string | null;
  } | null;
  commissionPayout?: {
    status?: "UNPAID" | "PAID";
    paidAt?: string | null;
    paidAmount?: number | null;
    paidByUserId?: string | null;
    paidByName?: string | null;
    note?: string | null;
  } | null;
  closedDealValue?: number | null;
  closedAt?: string | null;
  stripeCheckoutLink?: string | null;
  accountManagement?: LeadAccountManagementProfile | null;
  marketingAttribution?: LeadMarketingAttribution | null;
  transferRequests?: { requesterId: string; requestedAt: string; status: "PENDING" | "APPROVED" | "REJECTED" }[];
  intelligence?: LeadIntelligenceProfile;
  updatedAt: string;
};

export type Script = {
  id: string;
  content: string;
  type: "EMAIL" | "SMS" | "OBJECTION_RESPONSE" | "TIP";
  upvoteCount: number;
  leadId?: string;
};
