import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { syncCheckoutSessionToLead, syncSubscriptionToLead } from "@/lib/stripe-sync";
import { listLeads } from "@/lib/store";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is required." }, { status: 500 });
  }

  try {
    const stripe = getStripeClient();
    const signature = headers().get("stripe-signature");
    if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

    const payload = await request.text();
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    const leads = await listLeads("", { includeAll: true }).catch(() => []);

    if (event.type === "checkout.session.completed") {
      await syncCheckoutSessionToLead(leads, event.data.object as Stripe.Checkout.Session);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncSubscriptionToLead(leads, event.data.object as Stripe.Subscription);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to process Stripe webhook." }, { status: 400 });
  }
}
