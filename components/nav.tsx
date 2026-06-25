"use client";

import { useState } from "react";
import Link from "next/link";
import { SignInButton, SignOutButton, UserButton } from "@clerk/nextjs";
import { useAuth } from "@clerk/nextjs";
import { CreditsDisplay } from "./credits-guard";

const NAV_LINKS = [
  { href: "/create", label: "Create" },
  { href: "/dashboard/projects", label: "Projects" },
  { href: "/dashboard/templates", label: "模板库" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/workspace", label: "团队" },
  { href: "/pricing", label: "定价" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/settings", label: "设置" }
];

export function Nav() {
  const { userId } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-line bg-black/40 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight shrink-0">OneVideo Studio</Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4 text-sm text-muted">
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} className="hover:text-white transition-colors">{l.label}</Link>
          ))}
          {userId && <CreditsDisplay />}
          {userId ? (
            <div className="flex items-center gap-3">
              <UserButton />
              <SignOutButton redirectUrl="/">
                <button className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:border-white/40">Sign Out</button>
              </SignOutButton>
            </div>
          ) : (
            <SignInButton mode="modal">
              <button className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:border-white/40">Sign In</button>
            </SignInButton>
          )}
        </nav>

        {/* Mobile: credits + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          {userId && <CreditsDisplay />}
          <button
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Toggle menu"
            className="rounded-xl border border-line p-2 text-muted hover:border-white/40"
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-line bg-black/80 backdrop-blur px-4 pb-4">
          <nav className="flex flex-col gap-1 pt-2">
            {NAV_LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-white/5 hover:text-white transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-3 pt-3 border-t border-line flex items-center gap-3">
              {userId ? (
                <>
                  <UserButton />
                  <SignOutButton redirectUrl="/">
                    <button className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium">Sign Out</button>
                  </SignOutButton>
                </>
              ) : (
                <SignInButton mode="modal">
                  <button className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium">Sign In</button>
                </SignInButton>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
