import { Nav } from "@/components/nav";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import { TemplateGrid } from "@/components/template-grid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await getOrCreateUser();

  const [publicTemplates, myTemplates] = await Promise.all([
    db.template.findMany({
      where: { isPublic: true },
      orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
      take: 30
    }),
    db.template.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">模板库</h1>
          <a href="/create" className="rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90">
            + 新建视频
          </a>
        </div>

        {myTemplates.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4">我的模板</h2>
            <TemplateGrid templates={myTemplates} mine />
          </section>
        )}

        <section>
          <h2 className="text-lg font-semibold mb-4">公开模板</h2>
          {publicTemplates.length === 0 ? (
            <div className="rounded-2xl border border-line bg-panel p-10 text-center text-muted">
              暂无公开模板。完成视频后可保存为模板供社区使用。
            </div>
          ) : (
            <TemplateGrid templates={publicTemplates} />
          )}
        </section>
      </main>
    </>
  );
}
