import type { Lead, LeadIntelligenceProfile, IntelligenceEvidence } from "@/lib/types";

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function numeric(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function evidence(id: string, category: IntelligenceEvidence["category"], label: string, detail: string, weight: number, source?: string): IntelligenceEvidence {
  return { id, category, label, detail, weight, source: source ?? null };
}

export function buildLeadIntelligence(lead: Omit<Lead, "intelligence"> | Lead): LeadIntelligenceProfile {
  const items: IntelligenceEvidence[] = [];
  const signals: string[] = [];
  const risks: string[] = [];
  const status = String(lead.workspaceStatus || lead.status || "NEW").toUpperCase();
  const reviews = numeric(lead.googleReviews) ?? 0;
  const rating = numeric(lead.googleRating);
  const hasWebsite = Boolean(lead.websiteUrl);
  const hasPhone = Boolean(lead.phone || lead.contacts?.some((contact) => contact.phones.length));
  const hasEmail = Boolean(lead.email || lead.contacts?.some((contact) => contact.emails.length));
  const hasResearch = Boolean(lead.aiResearchSummary || lead.enrichment?.summary);
  const socialCount = lead.socialLinks?.length ?? Object.values(lead.enrichment?.structured.socialLinks ?? {}).filter(Boolean).length;
  const serviceCount = lead.enrichment?.structured.services.length ?? 0;
  const trustCount = lead.enrichment?.structured.trustSignals.length ?? 0;
  const isClient = ["CLOSED", "WON", "ACTIVE", "ONBOARDING"].includes(status) || Boolean(lead.billingProfile);
  const demoBooked = status === "DEMO_BOOKED" || Boolean(lead.demoBooking);

  let websiteScore = 40;
  if (hasWebsite) {
    websiteScore += 25;
    signals.push("Active business website found");
    items.push(evidence("website-present", "website", "Website present", lead.websiteUrl || "Website found", 15, lead.websiteUrl || undefined));
  } else {
    websiteScore -= 25;
    risks.push("No website is recorded");
    items.push(evidence("website-missing", "website", "Website missing", "No public website is attached to this lead.", -25));
  }
  if (lead.deployedUrl || lead.siteStatus === "LIVE") websiteScore += 20;
  if (lead.websiteStatus && /down|error|broken|missing/i.test(lead.websiteStatus)) websiteScore -= 25;
  if (lead.enrichment?.structured.heroCopy) websiteScore += 5;
  websiteScore = clamp(websiteScore);

  let marketingScore = 30 + Math.min(20, socialCount * 5) + Math.min(20, trustCount * 4);
  if (reviews >= 100) marketingScore += 20;
  else if (reviews >= 25) marketingScore += 12;
  else if (reviews > 0) marketingScore += 5;
  else risks.push("No review volume is recorded");
  if (rating && rating >= 4.5) {
    marketingScore += 10;
    signals.push(`Strong ${rating.toFixed(1)} star reputation`);
  }
  if (serviceCount > 0) marketingScore += Math.min(10, serviceCount * 2);
  marketingScore = clamp(marketingScore);

  let automationScore = 35;
  if (hasEmail) automationScore += 10;
  else risks.push("No email contact is available");
  if (hasPhone) automationScore += 10;
  else risks.push("No phone contact is available");
  if (lead.marketingAttribution?.gclid || lead.marketingAttribution?.utmSource) automationScore += 15;
  if (lead.accountManagement?.analyticsConnections?.ga4Connected) automationScore += 15;
  if (lead.accountManagement?.analyticsConnections?.gscConnected) automationScore += 15;
  automationScore = clamp(automationScore);

  let salesProcessScore = 30;
  if (hasPhone) salesProcessScore += 10;
  if (hasEmail) salesProcessScore += 10;
  if (hasResearch) salesProcessScore += 10;
  if (["CONTACTED", "IN_PROGRESS", "AWAITING_APPROVAL", "PAYMENT_PENDING"].includes(status)) salesProcessScore += 20;
  if (demoBooked) salesProcessScore += 25;
  if (isClient) salesProcessScore += 30;
  salesProcessScore = clamp(salesProcessScore);

  let aiAdoptionScore = 20;
  if (hasResearch) aiAdoptionScore += 20;
  if (lead.enrichment?.structured.confidence) aiAdoptionScore += Math.round(lead.enrichment.structured.confidence * 20);
  if (lead.accountManagement?.analyticsConnections?.aiSuggestions) aiAdoptionScore += 20;
  aiAdoptionScore = clamp(aiAdoptionScore);

  if (hasResearch) {
    signals.push("Research profile is available");
    items.push(evidence("research-present", "research", "Research completed", lead.aiResearchSummary || lead.enrichment?.summary || "Research available", 12));
  } else {
    items.push(evidence("research-missing", "research", "Research incomplete", "Run lead research to improve confidence and personalization.", -15));
  }
  if (hasPhone) items.push(evidence("phone-present", "contact", "Phone available", "The lead can be called directly.", 8));
  if (hasEmail) items.push(evidence("email-present", "contact", "Email available", "The lead can enter an email sequence.", 8));
  if (demoBooked) {
    signals.push("Demo is booked");
    items.push(evidence("demo-booked", "sales", "Demo booked", "This lead has reached a high-intent sales stage.", 25));
  }
  if (reviews > 0) items.push(evidence("reviews", "reputation", "Review footprint", `${reviews} public reviews recorded.`, Math.min(15, Math.round(reviews / 10))));

  const opportunityScore = clamp(
    websiteScore * 0.2 +
      marketingScore * 0.2 +
      automationScore * 0.2 +
      salesProcessScore * 0.3 +
      aiAdoptionScore * 0.1,
  );

  let recommendedService = "AI-powered CRM and follow-up automation";
  if (websiteScore < 45) recommendedService = "Website rebuild and conversion optimization";
  else if (marketingScore < 45) recommendedService = "SEO, reviews, and demand generation";
  else if (automationScore < 50) recommendedService = "CRM automation and lead nurture";
  else if (isClient) recommendedService = "Account expansion and performance optimization";

  let actionType: LeadIntelligenceProfile["nextBestAction"]["type"] = "RESEARCH";
  let actionTitle = "Complete business research";
  let actionReason = "More evidence is needed before personalized outreach.";
  let href = `/leads/${lead.id}`;
  if (demoBooked) {
    actionType = "PREPARE_DEMO";
    actionTitle = "Prepare a tailored demo";
    actionReason = "The lead has booked a demo and should receive a diagnosis-led presentation.";
  } else if (status === "PAYMENT_PENDING" || status === "AWAITING_APPROVAL") {
    actionType = "FOLLOW_UP";
    actionTitle = "Follow up on the pending decision";
    actionReason = "This opportunity is near the bottom of the funnel and needs active follow-up.";
  } else if (hasPhone && opportunityScore >= 60) {
    actionType = "CALL";
    actionTitle = "Call this high-priority lead";
    actionReason = "The lead has reachable contact information and a strong opportunity score.";
  } else if (hasEmail) {
    actionType = "EMAIL";
    actionTitle = "Send a personalized opportunity audit";
    actionReason = "Email is available and the intelligence profile supports tailored outreach.";
  } else if (hasPhone) {
    actionType = "CALL";
    actionTitle = "Call to identify the decision maker";
    actionReason = "A phone number is available, but additional contact details are missing.";
  }

  const estimatedLow = Math.max(500, Math.round((opportunityScore / 100) * 2500 / 100) * 100);
  const estimatedHigh = Math.max(estimatedLow + 1000, Math.round((opportunityScore / 100) * 12000 / 500) * 500);
  const confidence = clamp(30 + (hasResearch ? 25 : 0) + (hasWebsite ? 10 : 0) + (hasPhone ? 10 : 0) + (hasEmail ? 10 : 0) + Math.min(15, items.length * 2));

  return {
    generatedAt: new Date().toISOString(),
    opportunityScore,
    websiteScore,
    marketingScore,
    automationScore,
    salesProcessScore,
    aiAdoptionScore,
    confidence,
    estimatedRevenueOpportunity: { low: estimatedLow, high: estimatedHigh, currency: "USD" },
    buyingSignals: signals.slice(0, 6),
    riskFactors: risks.slice(0, 6),
    recommendedService,
    recommendedSalesAngle: `Lead with ${recommendedService.toLowerCase()} and connect the recommendation to measurable revenue or time savings.`,
    nextBestAction: { type: actionType, title: actionTitle, reason: actionReason, priority: opportunityScore >= 75 ? "URGENT" : opportunityScore >= 55 ? "HIGH" : opportunityScore >= 35 ? "MEDIUM" : "LOW", href },
    evidence: items,
  };
}

export function buildDailyPriorities(leads: Lead[], limit = 10) {
  return leads
    .map((lead) => ({ lead, intelligence: lead.intelligence ?? buildLeadIntelligence(lead) }))
    .filter(({ lead }) => !["DISQUALIFIED", "CLOSED", "WON"].includes(String(lead.workspaceStatus || lead.status || "").toUpperCase()))
    .sort((a, b) => b.intelligence.opportunityScore - a.intelligence.opportunityScore || b.intelligence.confidence - a.intelligence.confidence)
    .slice(0, limit)
    .map(({ lead, intelligence }) => ({
      leadId: lead.id,
      businessName: lead.businessName,
      city: lead.city,
      businessType: lead.businessType,
      opportunityScore: intelligence.opportunityScore,
      confidence: intelligence.confidence,
      estimatedRevenueOpportunity: intelligence.estimatedRevenueOpportunity,
      nextBestAction: intelligence.nextBestAction,
      recommendedService: intelligence.recommendedService,
    }));
}
