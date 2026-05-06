import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  canUserManageAllLeads,
  closeLeadDeal,
  createOrMergeLead,
  listLeads,
  saveLeadAccountManagementProfile,
  saveLeadBillingProfile,
} from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import { syncCheckoutSessionToLead, syncSubscriptionToLead } from "@/lib/stripe-sync";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

function normalizeEmail(value?: string | null) {
  const email = (value || "").trim().toLowerCase();
  return email.includes("@") ? email : "";
}

function buildManagedAccountProfile(lead: Lead, primaryClientEmail?: string | null): NonNullable<Lead["accountManagement"]> {
  return {
    serviceStatus: lead.accountManagement?.serviceStatus ?? "ONBOARDING",
    syncEnabled: true,
    primaryOwnerId: lead.accountManagement?.primaryOwnerId ?? lead.soldByUserId ?? lead.ownerId ?? null,
    primaryOwnerName: lead.accountManagement?.primaryOwnerName ?? lead.soldByName ?? null,
    startDate:
      lead.accountManagement?.startDate ??
      lead.billingProfile?.billingStartDate ??
      lead.closedAt?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
    renewalDate: lead.accountManagement?.renewalDate ?? null,
    seo: lead.accountManagement?.seo ?? null,
    seoTasks: lead.accountManagement?.seoTasks ?? [],
    ppc: lead.accountManagement?.ppc ?? null,
    social: lead.accountManagement?.social ?? null,
    analyticsConnections: lead.accountManagement?.analyticsConnections ?? null,
    clientHealth: lead.accountManagement?.clientHealth ?? null,
    successPlan: {
      primaryClientEmail:
        normalizeEmail(primaryClientEmail) ||
        normalizeEmail(lead.accountManagement?.successPlan?.primaryClientEmail) ||
        normalizeEmail(lead.email) ||
        null,
      ccEmails: (lead.accountManagement?.successPlan?.ccEmails || []).map((email) => normalizeEmail(email)).filter(Boolean),
      sendWeeklyReport: lead.accountManagement?.successPlan?.sendWeeklyReport ?? true,
      weeklyReportDay: lead.accountManagement?.successPlan?.weeklyReportDay ?? "MONDAY",
      weeklyReportTime: lead.accountManagement?.successPlan?.weeklyReportTime ?? "09:00",
      timeZone: lead.accountManagement?.successPlan?.timeZone ?? "America/New_York",
      communicationSummary: lead.accountManagement?.successPlan?.communicationSummary ?? "",
      currentFocus: lead.accountManagement?.successPlan?.currentFocus ?? "",
      recentWins: lead.accountManagement?.successPlan?.recentWins ?? "",
      currentRisks: lead.accountManagement?.successPlan?.currentRisks ?? "",
      nextSteps: lead.accountManagement?.successPlan?.nextSteps ?? "",
      lastWeeklyReportSentAt: lead.accountManagement?.successPlan?.lastWeeklyReportSentAt ?? null,
      nextWeeklyReportDueAt: lead.accountManagement?.successPlan?.nextWeeklyReportDueAt ?? null,
    },
  };
}

function isPayingSubscriptionStatus(status: string) {
  return !["canceled", "incomplete_expired", "unpaid"].includes(status);
}

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isSuperAdmin = await canUserManageAllLeads(user.id, user.email);
    if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const stripe = getStripeClient();
    const leads = await listLeads(user.id, { includeAll: true });

    const [sessions, subscriptions] = await Promise.all([
      stripe.checkout.sessions.list({ limit: 100 }),
      stripe.subscriptions.list({ limit: 100, status: "all", expand: ["data.customer"] }),
    ]);

    const syncedLeadIds = new Set<string>();
    const promotedManagedLeadIds = new Set<string>();
    const autoCreatedManagedLeadIds = new Set<string>();

    for (const session of sessions.data) {
      const syncedLeadId = await syncCheckoutSessionToLead(leads, session);
      if (syncedLeadId) {
        syncedLeadIds.add(syncedLeadId);
        const syncedLead = leads.find((lead) => lead.id === syncedLeadId);
        if (syncedLead?.accountManagement?.syncEnabled) promotedManagedLeadIds.add(syncedLeadId);
      }
    }

    for (const subscription of subscriptions.data) {
      const syncedLeadId = await syncSubscriptionToLead(leads, subscription);
      if (syncedLeadId) {
        syncedLeadIds.add(syncedLeadId);
        const syncedLead = leads.find((lead) => lead.id === syncedLeadId);
        if (syncedLead?.accountManagement?.syncEnabled) promotedManagedLeadIds.add(syncedLeadId);
        continue;
      }

      if (!isPayingSubscriptionStatus(subscription.status)) continue;
      const customer = typeof subscription.customer === "string" ? null : subscription.customer;
      if (!customer || ("deleted" in customer && customer.deleted)) continue;

      const customerName = typeof customer.name === "string" && customer.name.trim() ? customer.name.trim() : "";
      const customerEmail = typeof customer.email === "string" ? customer.email.trim().toLowerCase() : "";
      const customerPhone = typeof customer.phone === "string" ? customer.phone : null;
      const businessName = customerName || customerEmail || `Stripe Client ${customer.id}`;
      const recurringAmount =
        typeof subscription.items.data[0]?.price?.unit_amount === "number"
          ? subscription.items.data[0].price.unit_amount / 100
          : 0;

      const { lead } = await createOrMergeLead(user.id, {
        businessName,
        email: customerEmail || null,
        phone: customerPhone,
        sourceQuery: "stripe_subscription",
        sourceType: "ADDED",
        aiResearchSummary: "Auto-created from Stripe active subscription.",
      }, { mergeOnDuplicate: true });

      const billingProfile = {
        billingType: "RECURRING",
        recurringAmount: recurringAmount > 0 ? recurringAmount : lead.billingProfile?.recurringAmount ?? lead.closedDealValue ?? 0,
        oneTimeAmount: lead.billingProfile?.oneTimeAmount ?? null,
        autoRenew: true,
        billingStatus: subscription.status === "past_due" || subscription.status === "paused" ? "PAUSED" : "ACTIVE",
        billingStartDate: lead.billingProfile?.billingStartDate ?? new Date(subscription.created * 1000).toISOString(),
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        stripeCheckoutSessionId: lead.billingProfile?.stripeCheckoutSessionId ?? null,
        notes: lead.billingProfile?.notes ?? null,
      } satisfies NonNullable<Lead["billingProfile"]>;

      await saveLeadBillingProfile(lead.id, billingProfile);

      const closedDealValue = billingProfile.recurringAmount ?? 0;
      if ((lead.closedDealValue ?? 0) <= 0 && closedDealValue > 0) {
        await closeLeadDeal({
          leadId: lead.id,
          actingUserId: user.id,
          closedDealValue,
          bypassOwnership: true,
        });
      }

      const managedProfile = buildManagedAccountProfile(
        {
          ...lead,
          billingProfile,
          closedDealValue: (lead.closedDealValue ?? 0) > 0 ? lead.closedDealValue : closedDealValue,
          closedAt: lead.closedAt ?? new Date().toISOString(),
          accountManagement: lead.accountManagement ?? null,
        },
        customerEmail || null,
      );
      await saveLeadAccountManagementProfile(lead.id, managedProfile);

      syncedLeadIds.add(lead.id);
      promotedManagedLeadIds.add(lead.id);
      autoCreatedManagedLeadIds.add(lead.id);
    }

    return NextResponse.json({
      syncedLeadIds: [...syncedLeadIds],
      promotedManagedLeadIds: [...promotedManagedLeadIds],
      autoCreatedManagedLeadIds: [...autoCreatedManagedLeadIds],
      sessionsScanned: sessions.data.length,
      subscriptionsScanned: subscriptions.data.length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to sync Stripe data." }, { status: 500 });
  }
}
