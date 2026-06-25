import { NextRequest, NextResponse } from "next/server";
import { stripe, PLANS, getPlanFromPriceId } from "@/lib/stripe";
import { db } from "@/lib/db";
import { addCredits, resetMonthlyCredits } from "@/lib/credits";

export const runtime = "nodejs";

// Stripe webhook 需要 raw body，禁用 Next.js 自动解析
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function getUserByCustomerId(customerId: string) {
  return db.user.findFirst({ where: { stripeCustomerId: customerId } });
}

async function handleEvent(event: ReturnType<typeof stripe.webhooks.constructEvent>) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as any;
      const user = await getUserByCustomerId(session.customer);
      if (!user) return;

      if (session.mode === "subscription") {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = sub.items.data[0]?.price.id;
        const planId = getPlanFromPriceId(priceId);
        const plan = PLANS[planId];

        await db.user.update({
          where: { id: user.id },
          data: {
            stripePlanId: planId,
            stripeSubId: sub.id,
            planExpiresAt: new Date((sub as any).current_period_end * 1000)
          }
        });
        await resetMonthlyCredits(user.id, plan.credits);
      } else if (session.mode === "payment") {
        // 积分包购买
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        for (const item of lineItems.data) {
          const pack = findCreditPack(item.price?.id);
          if (pack) {
            await addCredits(user.id, pack.credits, "pack_purchase", `购买 ${pack.label}`);
          }
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as any;
      const user = await getUserByCustomerId(sub.customer);
      if (!user) return;

      const priceId = sub.items.data[0]?.price.id;
      const planId = getPlanFromPriceId(priceId);

      await db.user.update({
        where: { id: user.id },
        data: {
          stripePlanId: planId,
          stripeSubId: sub.id,
          planExpiresAt: new Date(sub.current_period_end * 1000)
        }
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as any;
      const user = await getUserByCustomerId(sub.customer);
      if (!user) return;

      await db.user.update({
        where: { id: user.id },
        data: { stripePlanId: "free", stripeSubId: null, planExpiresAt: null }
      });
      await resetMonthlyCredits(user.id, PLANS.free.credits);
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as any;
      // 仅处理续费（非首次，首次已在 checkout.session.completed 处理）
      if (invoice.billing_reason !== "subscription_cycle") return;

      const user = await getUserByCustomerId(invoice.customer);
      if (!user || !user.stripePlanId) return;

      const plan = PLANS[user.stripePlanId as keyof typeof PLANS];
      if (plan) await resetMonthlyCredits(user.id, plan.credits);
      break;
    }
  }
}

function findCreditPack(priceId?: string | null) {
  if (!priceId) return null;
  const { CREDIT_PACKS } = require("@/lib/stripe");
  return CREDIT_PACKS.find((p: any) => p.priceId === priceId) || null;
}
