import { Nav } from "@/components/nav";
import { CreateForm } from "@/components/create-form";
import { CreditsGuard } from "@/components/credits-guard";

export default function CreatePage() {
  return (
    <>
      <Nav />
      <CreditsGuard>
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-4xl font-bold">Create AI Short Video</h1>
        <p className="mt-3 text-muted">Input an idea. OneVideo generates the full production structure.</p>
        <div className="mt-8">
          <CreateForm />
        </div>
      </main>
      </CreditsGuard>
    </>
  );
}
