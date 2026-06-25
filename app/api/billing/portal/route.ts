import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST() {
  const user = await getOrCreateUser();

  if (!user.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account found. Please subscribe first." }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl}/dashboard/billing`
  });

  return NextResponse.json({ url: session.url });
}
