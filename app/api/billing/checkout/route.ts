import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

const schema = z.object({
  type: z.enum(["subscription", "pack"]),
  priceId: z.string()
});

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  const body = schema.parse(await req.json());

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // 获取或创建 Stripe Customer
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id }
    });
    customerId = customer.id;
    await db.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId }
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: body.type === "subscription" ? "subscription" : "payment",
    line_items: [{ price: body.priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard/billing?success=1`,
    cancel_url: `${appUrl}/dashboard/billing?canceled=1`,
    metadata: { userId: user.id, type: body.type }
  });

  return NextResponse.json({ url: session.url });
}
