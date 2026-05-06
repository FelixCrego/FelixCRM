import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

for (const fileName of [".env.local", ".env.vercel", ".env.production-check", ".env.example"]) {
  loadEnvFile(path.resolve(process.cwd(), fileName));
}

async function main() {
  const {
    closeLeadDeal,
    createOrMergeLead,
    listLeads,
    saveLeadAccountManagementProfile,
    saveLeadBillingProfile,
  } = await import("../lib/store");
  const { getStripeClient } = await import("../lib/stripe");
  const { syncCheckoutSessionToLead, syncSubscriptionToLead } = await import("../lib/stripe-sync");
  const { listAssignableUsers } = await import("../lib/store");

  const stripe = getStripeClient();
  const assignableUsers = await listAssignableUsers().catch(() => []);
  const defaultOwnerId = assignableUsers[0]?.id ?? "stripe-system";
  const leads = await listLeads(defaultOwnerId, { includeAll: true });
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

    if (["canceled", "incomplete_expired", "unpaid"].includes(subscription.status)) continue;
    const customer = typeof subscription.customer === "string" ? null : subscription.customer;
    if (!customer || ("deleted" in customer && customer.deleted)) continue;

    const customerEmail = typeof customer.email === "string" ? customer.email.trim().toLowerCase() : "";
    const customerName = typeof customer.name === "string" && customer.name.trim() ? customer.name.trim() : "";
    const customerPhone = typeof customer.phone === "string" ? customer.phone : null;
    const recurringAmount =
      typeof subscription.items.data[0]?.price?.unit_amount === "number"
        ? subscription.items.data[0].price.unit_amount / 100
        : 0;
    const businessName = customerName || customerEmail || `Stripe Client ${customer.id}`;

    const { lead } = await createOrMergeLead(
      defaultOwnerId,
      {
        businessName,
        email: customerEmail || null,
        phone: customerPhone,
        sourceQuery: "stripe_subscription",
        sourceType: "ADDED",
        aiResearchSummary: "Auto-created from Stripe active subscription.",
      },
      { mergeOnDuplicate: true },
    );

    const billingProfile = {
      billingType: "RECURRING" as const,
      recurringAmount: recurringAmount > 0 ? recurringAmount : lead.billingProfile?.recurringAmount ?? lead.closedDealValue ?? 0,
      oneTimeAmount: lead.billingProfile?.oneTimeAmount ?? null,
      autoRenew: true,
      billingStatus: subscription.status === "past_due" || subscription.status === "paused" ? "PAUSED" as const : "ACTIVE" as const,
      billingStartDate: lead.billingProfile?.billingStartDate ?? new Date(subscription.created * 1000).toISOString(),
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      stripeCheckoutSessionId: lead.billingProfile?.stripeCheckoutSessionId ?? null,
      notes: lead.billingProfile?.notes ?? null,
    };
    await saveLeadBillingProfile(lead.id, billingProfile);

    const closedDealValue = billingProfile.recurringAmount ?? 0;
    if ((lead.closedDealValue ?? 0) <= 0 && closedDealValue > 0) {
      await closeLeadDeal({
        leadId: lead.id,
        actingUserId: defaultOwnerId,
        closedDealValue,
        bypassOwnership: true,
      });
    }

    const managedProfile = {
      serviceStatus: lead.accountManagement?.serviceStatus ?? "ONBOARDING",
      syncEnabled: true,
      primaryOwnerId: lead.accountManagement?.primaryOwnerId ?? lead.soldByUserId ?? lead.ownerId ?? defaultOwnerId,
      primaryOwnerName: lead.accountManagement?.primaryOwnerName ?? lead.soldByName ?? null,
      startDate:
        lead.accountManagement?.startDate ??
        billingProfile.billingStartDate ??
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
        primaryClientEmail: customerEmail || lead.accountManagement?.successPlan?.primaryClientEmail || lead.email || null,
        ccEmails: (lead.accountManagement?.successPlan?.ccEmails || []).filter(Boolean),
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
    await saveLeadAccountManagementProfile(lead.id, managedProfile);

    syncedLeadIds.add(lead.id);
    promotedManagedLeadIds.add(lead.id);
    autoCreatedManagedLeadIds.add(lead.id);
  }

  console.log(
    JSON.stringify(
      {
        syncedLeadIds: [...syncedLeadIds],
        promotedManagedLeadIds: [...promotedManagedLeadIds],
        autoCreatedManagedLeadIds: [...autoCreatedManagedLeadIds],
        sessionsScanned: sessions.data.length,
        subscriptionsScanned: subscriptions.data.length,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
