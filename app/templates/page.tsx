import { Nav } from "@/components/nav";

const templates = [
  "AI Product Launch", "Founder Story", "SaaS Demo", "Trading System Review", "Web3 Project Promo", "Digital Human Pitch"
];

export default function TemplatesPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-12">
        <h1 className="text-4xl font-bold">Templates</h1>
        <p className="mt-3 text-muted">Built-in commercial short-video structures.</p>
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((name) => (
            <div key={name} className="rounded-2xl border border-line bg-panel p-6">
              <h3 className="text-xl font-semibold">{name}</h3>
              <p className="mt-3 text-sm text-muted">Hook → Problem → Solution → Proof → CTA</p>
              <button className="mt-5 rounded-xl border border-line px-4 py-2 text-sm">Use Template</button>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
