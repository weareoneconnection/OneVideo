import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-line bg-black/40 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">OneVideo Studio</Link>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <Link href="/create">Create</Link>
          <Link href="/dashboard/projects">Projects</Link>
          <Link href="/templates">Templates</Link>
        </nav>
      </div>
    </header>
  );
}
