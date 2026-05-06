import type Stripe from "stripe";
import { closeLeadDeal, saveLeadAccountManagementProfile, saveLeadBillingProfile } from "@/lib/store";
import type { Lead } from "@/lib/types";
import { resolveLeadWorkspaceStatus } from "@/lib/lead-workspace-status";

function normalizePhone(value: string | null | undefined) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeEmail(value: string | null | undefined) {
  const email = normalizeText(value);
  return email.includes("@") ? email : "";
}

function isClosedWonLead(lead: Lead) {
  return (
    resolveLeadWorkspaceStatus(lead) === "CLOSED" ||
    (typeof lead.closedAt === "string" && lead.closedAt.trim().length > 0) ||
    (typeof lead.closedDealValue === "number" && lead.closedDealValue > 0)
  );
}

function resolveClosedDealValue(lead: Lead, amountHint: number) {
  if (typeof lead.closedDealValue === "number" && Number.isFinite(lead.closedDealValue) && lead.closedDealValue > 0) {
    return lead.closedDealValue;
  }
  if (Number.isFinite(amountHint) && amountHint > 0) return amountHint;
  if (typeof lead.billingProfile?.recurringAmount === "number" && lead.billingProfile.recurringAmount > 0) {
    return lead.billingProfile.recurringAmount;
  }
  if (typeof lead.billingProfile?.oneTimeAmount === "number" && lead.billingProfile.oneTimeAmount > 0) {
    return lead.billingProfile.oneTimeAmount;
  }
  return 0;
}

async function promotePayingLeadToManagedAccount(lead: Lead, amountHint: number, startDateHint: string | null) {
  const nextClosedDealValue = resolveClosedDealValue(lead, amountHint);
  if (!isClosedWonLead(lead) && nextClosedDealValue > 0) {
    await closeLeadDeal({
      leadId: lead.id,
      actingUserId: "stripe-system",
      closedDealValue: nextClosedDealValue,
      bypassOwnership: true,
    });
    lead.closedDealValue = nextClosedDealValue;
    lead.closedAt = new Date().toISOString();
    lead.workspaceStatus = "CLOSED";
  }

  const current = lead.accountManagement;
  const accountManagement = {
    serviceStatus: current?.serviceStatus ?? "ONBOARDING",
    syncEnabled: true,
    primaryOwnerId: current?.primaryOwnerId ?? lead.soldByUserId ?? lead.ownerId ?? null,
    primaryOwnerName: current?.primaryOwnerName ?? lead.soldByName ?? null,
    startDate: current?.startDate ?? lead.billingProfile?.billingStartDate ?? lead.closedAt?.slice(0, 10) ?? startDateHint,
    renewalDate: current?.renewalDate ?? null,
    seo: current?.seo ?? null,
    seoTasks: current?.seoTasks ?? [],
    ppc: current?.ppc ?? null,
    social: current?.social ?? null,
    analyticsConnections: current?.analyticsConnections ?? null,
    clientHealth: current?.clientHealth ?? null,
    successPlan: {
      primaryClientEmail:
        normalizeEmail(current?.successPlan?.primaryClientEmail) ||
        normalizeEmail(lead.email) ||
        null,
      ccEmails: (current?.successPlan?.ccEmails || []).map((email) => normalizeEmail(email)).filter(Boolean),
      sendWeeklyReport: current?.successPlan?.sendWeeklyReport ?? true,
      weeklyReportDay: current?.successPlan?.weeklyReportDay ?? "MONDAY",
      weeklyReportTime: current?.successPlan?.weeklyReportTime ?? "09:00",
      timeZone: current?.successPlan?.timeZone ?? "America/New_York",
      communicationSummary: current?.successPlan?.communicationSummary ?? "",
      currentFocus: current?.successPlan?.currentFocus ?? "",
      recentWins: current?.successPlan?.recentWins ?? "",
      currentRisks: current?.successPlan?.currentRisks ?? "",
      nextSteps: current?.successPlan?.nextSteps ?? "",
      lastWeeklyReportSentAt: current?.successPlan?.lastWeeklyReportSentAt ?? null,
      nextWeeklyReportDueAt: current?.successPlan?.nextWeeklyReportDueAt ?? null,
    },
  } satisfies NonNullable<Lead["accountManagement"]>;

  await saveLeadAccountManagementProfile(lead.id, accountManagement);
  lead.accountManagement = accountManagement;
}

function matchLead(
  leads: Lead[],
  input: { leadId?: string | null; email?: string | null; phone?: string | null; businessName?: string | null },
) {
  if (input.leadId) {
    const byId = leads.find((lead) => lead.id === input.leadId);
    if (byId) return byId;
  }

  const normalizedEmail = normalizeText(input.email);
  if (normalizedEmail) {
    const byEmail = leads.find((lead) => normalizeText(lead.email) === normalizedEmail);
    if (byEmail) return byEmail;
  }

  const normalizedPhone = normalizePhone(input.phone);
  if (normalizedPhone) {
    const byPhone = leads.find((lead) => normalizePhone(lead.phone) === normalizedPhone);
    if (byPhone) return byPhone;
  }

  const normalizedBusinessName = normalizeText(input.businessName);
  if (normalizedBusinessName) {
    const byBusinessName = leads.find((lead) => normalizeText(lead.businessName) === normalizedBusinessName);
    if (byBusinessName) return byBusinessName;
  }

  return null;
}

export async function syncCheckoutSessionToLead(leads: Lead[], session: Stripe.Checkout.Session) {
  const lead =
    matchLead(leads, {
      leadId:
        typeof session.metadata?.leadId === "string"
          ? session.metadata.leadId
          : typeof session.metadata?.lead_id === "string"
            ? session.metadata.lead_id
            : null,
      email:
        typeof session.metadata?.email === "string"
          ? session.metadata.email
          : session.customer_details?.email ?? session.customer_email ?? null,
      phone:
        typeof session.metadata?.phone === "string"
          ? session.metadata.phone
          : session.customer_details?.phone ?? null,
      businessName:
        typeof session.metadata?.businessName === "string"
          ? session.metadata.businessName
          : typeof session.metadata?.business_name === "string"
            ? session.metadata.business_name
            : session.customer_details?.name ?? null,
    }) ??
    (typeof session.customer === "string"
      ? leads.find((candidate) => candidate.billingProfile?.stripeCustomerId === session.customer)
      : null);
  if (!lead) return null;

  const billingType = session.mode === "subscription" ? "RECURRING" : "ONE_TIME";
  const amount = typeof session.amount_total === "number" ? session.amount_total / 100 : lead.closedDealValue ?? 0;
  const existingProfile = lead.billingProfile ?? {};

  const billingProfile = {
    ...existingProfile,
    billingType,
    oneTimeAmount: billingType === "ONE_TIME" ? amount : existingProfile.oneTimeAmount ?? lead.closedDealValue ?? null,
    recurringAmount: billingType === "RECURRING" ? amount : existingProfile.recurringAmount ?? null,
    autoRenew: billingType === "RECURRING",
    billingStatus: session.payment_status === "paid" ? "PAID" : "ACTIVE",
    billingStartDate: existingProfile.billingStartDate ?? lead.closedAt ?? new Date(session.created * 1000).toISOString(),
    stripeCustomerId: typeof session.customer === "string" ? session.customer : existingProfile.stripeCustomerId ?? null,
    stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : existingProfile.stripeSubscriptionId ?? null,
    stripeCheckoutSessionId: session.id,
    notes: existingProfile.notes ?? null,
  } satisfies NonNullable<Lead["billingProfile"]>;

  await saveLeadBillingProfile(lead.id, billingProfile);
  const startDate = new Date(session.created * 1000).toISOString().slice(0, 10);
  if (session.payment_status === "paid") {
    await promotePayingLeadToManagedAccount(lead, amount, startDate);
  }
  lead.billingProfile = billingProfile;
  return lead.id;
}

export async function syncSubscriptionToLead(leads: Lead[], subscription: Stripe.Subscription) {
  const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;
  const customerObject = typeof subscription.customer === "string" ? null : subscription.customer;
  const customerEmail =
    customerObject && !("deleted" in customerObject && customerObject.deleted) && typeof customerObject.email === "string"
      ? customerObject.email
      : null;
  const customerPhone =
    customerObject && !("deleted" in customerObject && customerObject.deleted) && typeof customerObject.phone === "string"
      ? customerObject.phone
      : null;
  const customerName =
    customerObject && !("deleted" in customerObject && customerObject.deleted) && typeof customerObject.name === "string"
      ? customerObject.name
      : null;
  const amount = subscription.items.data[0]?.price?.unit_amount ? subscription.items.data[0].price.unit_amount / 100 : 0;

  const lead =
    matchLead(leads, {
      leadId:
        typeof subscription.metadata?.leadId === "string"
          ? subscription.metadata.leadId
          : typeof subscription.metadata?.lead_id === "string"
            ? subscription.metadata.lead_id
            : null,
      email:
        typeof subscription.metadata?.email === "string"
          ? subscription.metadata.email
          : customerEmail,
      phone:
        typeof subscription.metadata?.phone === "string"
          ? subscription.metadata.phone
          : customerPhone,
      businessName:
        typeof subscription.metadata?.businessName === "string"
          ? subscription.metadata.businessName
          : typeof subscription.metadata?.business_name === "string"
            ? subscription.metadata.business_name
            : customerName,
    }) ??
    leads.find((candidate) => candidate.billingProfile?.stripeCustomerId === customer);

  if (!lead) return null;

  const existingProfile = lead.billingProfile ?? {};
  const billingProfile = {
    ...existingProfile,
    billingType: "RECURRING",
    recurringAmount: amount || (existingProfile.recurringAmount ?? lead.closedDealValue ?? 0),
    autoRenew: !["canceled", "unpaid", "incomplete_expired"].includes(subscription.status),
    billingStatus:
      subscription.status === "canceled"
        ? "CANCELLED"
        : subscription.status === "past_due" || subscription.status === "paused"
          ? "PAUSED"
          : "ACTIVE",
    billingStartDate: existingProfile.billingStartDate ?? new Date(subscription.created * 1000).toISOString(),
    stripeCustomerId: customer,
    stripeSubscriptionId: subscription.id,
    notes: existingProfile.notes ?? null,
  } satisfies NonNullable<Lead["billingProfile"]>;

  await saveLeadBillingProfile(lead.id, billingProfile);
  const isPayingSubscription = !["canceled", "incomplete_expired", "unpaid"].includes(subscription.status);
  if (isPayingSubscription) {
    const startDate = new Date(subscription.created * 1000).toISOString().slice(0, 10);
    await promotePayingLeadToManagedAccount(lead, amount, startDate);
  }
  lead.billingProfile = billingProfile;
  return lead.id;
}
