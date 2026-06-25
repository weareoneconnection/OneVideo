import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function getOrCreateUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!email) throw new Error("No email on Clerk user");

  return db.user.upsert({
    where: { email },
    update: { name: clerkUser.fullName ?? undefined },
    create: {
      email,
      name: clerkUser.fullName ?? undefined,
      credits: { create: { balance: 1000 } }
    },
    include: { credits: true }
  });
}
