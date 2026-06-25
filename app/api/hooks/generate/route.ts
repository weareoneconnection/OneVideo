import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateHookOptions } from "@/lib/oneai";
import { getOrCreateUser } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  topic: z.string().min(3),
  platform: z.enum(["tiktok", "douyin", "youtube_shorts", "xiaohongshu"]).default("douyin"),
  language: z.enum(["zh", "en"]).default("zh"),
  style: z.string().optional(),
  durationSeconds: z.coerce.number().int().min(15).max(60).default(45)
});

export async function POST(req: NextRequest) {
  await getOrCreateUser();
  const body = schema.parse(await req.json());
  const hooks = await generateHookOptions(body);
  return NextResponse.json({ hooks });
}
