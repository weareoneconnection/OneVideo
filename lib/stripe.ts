import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

export type PlanId = "free" | "pro" | "team";

export const PLANS: Record<PlanId, { credits: number; priceId: string | null; label: string; price: string }> = {
  free: { credits: 100, priceId: null, label: "Free", price: "$0/月" },
  pro: { credits: 1000, priceId: process.env.STRIPE_PRO_PRICE_ID || null, label: "Pro", price: "$29/月" },
  team: { credits: 5000, priceId: process.env.STRIPE_TEAM_PRICE_ID || null, label: "Team", price: "$99/月" }
};

export const CREDIT_PACKS = [
  { credits: 500, priceId: process.env.STRIPE_PACK_500_PRICE_ID || null, label: "500 积分包", price: "$9" },
  { credits: 2000, priceId: process.env.STRIPE_PACK_2000_PRICE_ID || null, label: "2000 积分包", price: "$29" }
];

export function getPlanFromPriceId(priceId: string): PlanId {
  for (const [id, plan] of Object.entries(PLANS)) {
    if (plan.priceId === priceId) return id as PlanId;
  }
  return "free";
}
