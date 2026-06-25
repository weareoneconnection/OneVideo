import { Nav } from "@/components/nav";
import { SocialAccountsSection } from "@/components/social-accounts-section";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getOrCreateUser();
  const rawAccounts = await db.socialAccount.findMany({
    where: { userId: user.id, isActive: true },
    select: { id: true, platform: true, platformUserId: true, platformUsername: true, tokenExpiresAt: true, createdAt: true }
  });
  const accounts = rawAccounts.map(a => ({
    ...a,
    tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString()
  }));

  const tiktokConfigured = !!process.env.TIKTOK_CLIENT_KEY;
  const youtubeConfigured = !!process.env.YOUTUBE_CLIENT_ID;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-12">
        <h1 className="text-3xl font-bold mb-8">设置</h1>
        <SocialAccountsSection
          initialAccounts={accounts}
          tiktokConfigured={tiktokConfigured}
          youtubeConfigured={youtubeConfigured}
        />
      </main>
    </>
  );
}
