import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/templates?category=&platform=&mine=true
export async function GET(req: NextRequest) {
  const user = await getOrCreateUser();
  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "true";
  const category = url.searchParams.get("category") ?? undefined;
  const platform = url.searchParams.get("platform") ?? undefined;

  const templates = await db.template.findMany({
    where: {
      ...(mine ? { userId: user.id } : { isPublic: true }),
      ...(category ? { category } : {}),
      ...(platform ? { platform } : {})
    },
    orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
    take: 50
  });

  return NextResponse.json({ templates });
}

const saveSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  category: z.string().default("general"),
  isPublic: z.boolean().default(false),
  sourceProjectId: z.string().optional()
});

// POST /api/templates — 从项目保存为模板
export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  const body = saveSchema.parse(await req.json());

  let structure: object = {};
  let platform = "tiktok";
  let language = "zh";
  let duration = 60;
  let prompt = body.description || body.name;
  let thumbnailUrl: string | null = null;

  if (body.sourceProjectId) {
    const project = await db.project.findFirst({
      where: { id: body.sourceProjectId, userId: user.id }
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    structure = {
      style: project.style,
      hookStrategy: project.hookStrategy,
      aspectRatio: project.aspectRatio,
      scriptJson: project.scriptJson,
      subtitleStyle: project.subtitleStyle,
      musicPrompt: project.musicPrompt
    };
    platform = project.platform;
    language = project.language;
    duration = project.durationSeconds;
    prompt = project.topic;
    thumbnailUrl = project.thumbnailUrl;
  }

  const template = await db.template.create({
    data: {
      name: body.name,
      description: body.description || null,
      category: body.category,
      platform,
      language,
      duration,
      structure,
      prompt,
      isPublic: body.isPublic,
      userId: user.id,
      sourceProjectId: body.sourceProjectId || null,
      thumbnailUrl
    }
  });

  return NextResponse.json({ template });
}
