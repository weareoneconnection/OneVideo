import Link from "next/link";
import { Nav } from "@/components/nav";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-20">
        <section className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="mb-5 inline-flex rounded-full border border-line bg-panel px-4 py-2 text-sm text-muted">AI-Native Short Video Generation OS</div>
            <h1 className="text-5xl font-black leading-tight tracking-tight md:text-7xl">From idea to publish-ready video.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">OneVideo Studio turns ideas, products and websites into scripts, storyboards, AI scenes, captions and finished short videos.</p>
            <div className="mt-8 flex gap-4">
              <Link href="/create" className="rounded-2xl bg-white px-6 py-4 font-semibold text-black">Create Video</Link>
              <Link href="/dashboard/projects" className="rounded-2xl border border-line px-6 py-4 font-semibold">View Projects</Link>
            </div>
          </div>
          <div className="rounded-3xl border border-line bg-panel p-5 shadow-2xl">
            <div className="aspect-[9/12] overflow-hidden rounded-2xl bg-soft">
              <video className="h-full w-full object-cover" src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" autoPlay muted loop playsInline />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-xl bg-soft p-3">Script</div>
              <div className="rounded-xl bg-soft p-3">Scenes</div>
              <div className="rounded-xl bg-soft p-3">Render</div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
