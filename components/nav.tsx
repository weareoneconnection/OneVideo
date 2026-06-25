import Link from "next/link";
import { SignInButton, SignOutButton, UserButton, ClerkLoaded, ClerkLoading } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

export async function Nav() {
  const { userId } = await auth();

  return (
    <header className="border-b border-line bg-black/40 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">OneVideo Studio</Link>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <Link href="/create">Create</Link>
          <Link href="/dashboard/projects">Projects</Link>
          <Link href="/templates">Templates</Link>
          {userId ? (
            <div className="flex items-center gap-3">
              <UserButton />
              <SignOutButton redirectUrl="/">
                <button className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium">Sign Out</button>
              </SignOutButton>
            </div>
          ) : (
            <SignInButton mode="modal">
              <button className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium">Sign In</button>
            </SignInButton>
          )}
        </nav>
      </div>
    </header>
  );
}
