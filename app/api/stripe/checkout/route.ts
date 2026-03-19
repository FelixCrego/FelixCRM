import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, listLeads } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";

function sanitizeEmail(value: string | null | undefined) {
  if (typeof value !== "string") return undefined;
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as {
      leadId?: string;
      amount?: number;
      mode?: "payment" | "subscription";
    };

    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const amount = typeof body.amount === "number" && Number.isFinite(body.amount) && body.amount > 0 ? body.amount : 0;
    const mode = body.mode === "subscription" ? "subscription" : "payment";

    if (!leadId || amount <= 0) {
      return NextResponse.json({ error: "leadId and amount are required." }, { status: 400 });
    }

    const includeAll = await canUserViewAllLeads(user.id, user.email);
    const lead = (await listLeads(user.id, { includeAll })).find((candidate) => candidate.id === leadId);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const stripe = getStripeClient();
    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://felix-crm-xi.vercel.app";
    const customerEmail = sanitizeEmail(lead.email);
    const productName = `${lead.businessName || "Client"} ${mode === "subscription" ? "Monthly Subscription" : "Website Package"}`;

    const session = await stripe.checkout.sessions.create({
      mode,
      customer_email: customerEmail,
      success_url: `${origin}/leads/${leadId}?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/leads/${leadId}?stripe=cancelled`,
      metadata: {
        leadId,
        businessName: lead.businessName || "Client",
        soldByUserId: lead.soldByUserId ?? lead.ownerId ?? "",
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: productName,
            },
            unit_amount: Math.round(amount * 100),
            ...(mode === "subscription" ? { recurring: { interval: "month" as const } } : {}),
          },
          quantity: 1,
        },
      ],
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create Stripe checkout session." }, { status: 500 });
  }
}
