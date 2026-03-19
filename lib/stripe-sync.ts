import type Stripe from "stripe";
import { saveLeadBillingProfile } from "@/lib/store";
import type { Lead } from "@/lib/types";

function normalizePhone(value: string | null | undefined) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
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
  const lead = matchLead(leads, {
    leadId: typeof session.metadata?.leadId === "string" ? session.metadata.leadId : null,
    email: session.customer_details?.email ?? null,
    phone: session.customer_details?.phone ?? null,
    businessName: typeof session.metadata?.businessName === "string" ? session.metadata.businessName : session.customer_details?.name ?? null,
  });
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
  return lead.id;
}

export async function syncSubscriptionToLead(leads: Lead[], subscription: Stripe.Subscription) {
  const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;
  const amount = subscription.items.data[0]?.price?.unit_amount ? subscription.items.data[0].price.unit_amount / 100 : 0;

  const lead =
    matchLead(leads, {
      leadId: typeof subscription.metadata?.leadId === "string" ? subscription.metadata.leadId : null,
      businessName: typeof subscription.metadata?.businessName === "string" ? subscription.metadata.businessName : null,
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
  return lead.id;
}
