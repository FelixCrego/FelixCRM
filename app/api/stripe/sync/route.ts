import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserManageAllLeads, listLeads } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import { syncCheckoutSessionToLead, syncSubscriptionToLead } from "@/lib/stripe-sync";

export const dynamic = "force-dynamic";

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
      stripe.subscriptions.list({ limit: 100, status: "all" }),
    ]);

    const syncedLeadIds = new Set<string>();

    for (const session of sessions.data) {
      const syncedLeadId = await syncCheckoutSessionToLead(leads, session);
      if (syncedLeadId) syncedLeadIds.add(syncedLeadId);
    }

    for (const subscription of subscriptions.data) {
      const syncedLeadId = await syncSubscriptionToLead(leads, subscription);
      if (syncedLeadId) syncedLeadIds.add(syncedLeadId);
    }

    return NextResponse.json({ syncedLeadIds: [...syncedLeadIds], sessionsScanned: sessions.data.length, subscriptionsScanned: subscriptions.data.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to sync Stripe data." }, { status: 500 });
  }
}

