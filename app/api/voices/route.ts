import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import { uploadVoiceSample } from "@/lib/providers/elevenlabs";

export const runtime = "nodejs";

export async function GET() {
  const user = await getOrCreateUser();
  const voices = await db.voiceProfile.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ voices });
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null)?.trim();
  const language = (formData.get("language") as string | null) || "zh";

  if (!file) return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Missing voice name" }, { status: 400 });

  const allowedTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/x-m4a"];
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a)$/i)) {
    return NextResponse.json({ error: "Unsupported file format. Use mp3, wav, or m4a." }, { status: 400 });
  }

  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Max 10 MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let elevenLabsVoiceId: string;
  try {
    elevenLabsVoiceId = await uploadVoiceSample(buffer, name, file.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `ElevenLabs upload failed: ${message}` }, { status: 502 });
  }

  // 如果是第一个声音，设为默认
  const existingCount = await db.voiceProfile.count({ where: { userId: user.id } });

  const voice = await db.voiceProfile.create({
    data: {
      userId: user.id,
      name,
      elevenLabsVoiceId,
      language,
      isDefault: existingCount === 0
    }
  });

  return NextResponse.json({ voice }, { status: 201 });
}
