import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import { PLANS } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getOrCreateUser();
  const credits = await db.creditAccount.findUnique({ where: { userId: user.id } });
  const planId = (user.stripePlanId as keyof typeof PLANS) || "free";
  const plan = PLANS[planId] || PLANS.free;

  return NextResponse.json({
    balance: credits?.balance ?? 0,
    planId,
    planCredits: plan.credits,
    planLabel: plan.label
  });
}
