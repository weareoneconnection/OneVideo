import { db } from "./db";

export async function checkBalance(userId: string, required: number): Promise<boolean> {
  const account = await db.creditAccount.findUnique({ where: { userId } });
  return (account?.balance ?? 0) >= required;
}

export async function deductCredits(
  userId: string,
  projectId: string,
  amount: number,
  description: string
): Promise<void> {
  await db.$transaction([
    db.creditAccount.update({
      where: { userId },
      data: { balance: { decrement: amount } }
    }),
    db.creditLedger.create({
      data: {
        userId,
        projectId,
        amount: -amount,
        type: "spend",
        status: "completed",
        description
      }
    })
  ]);
}

export async function addCredits(
  userId: string,
  amount: number,
  type: string,
  description: string
): Promise<void> {
  await db.$transaction([
    db.creditAccount.upsert({
      where: { userId },
      update: { balance: { increment: amount } },
      create: { userId, balance: amount }
    }),
    db.creditLedger.create({
      data: {
        userId,
        amount,
        type,
        status: "completed",
        description
      }
    })
  ]);
}

export async function resetMonthlyCredits(userId: string, credits: number): Promise<void> {
  await db.$transaction([
    db.creditAccount.upsert({
      where: { userId },
      update: { balance: credits },
      create: { userId, balance: credits }
    }),
    db.creditLedger.create({
      data: {
        userId,
        amount: credits,
        type: "subscription_reset",
        status: "completed",
        description: `月度积分重置 (${credits} 分)`
      }
    })
  ]);
}
