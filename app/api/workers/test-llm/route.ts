import { NextResponse } from "next/server";

export const runtime = "nodejs";

// GET /api/workers/test-llm
// 直接测试 LLM 连通性，诊断 generateScript 为什么一直 fallback
export async function GET() {
  const oneaiKey = process.env.ONEAI_API_KEY || "";
  const openaiKey = process.env.OPENAI_API_KEY || "";
  const apiKey = oneaiKey || openaiKey;
  const baseUrl = process.env.ONEAI_BASE_URL ||
    (openaiKey && !oneaiKey ? (process.env.OPENAI_BASE_URL || "https://api.openai.com") : "");
  const model = process.env.ONEAI_MODEL ||
    (!oneaiKey && openaiKey ? "gpt-4o-mini" : "deepseek-chat");

  if (!apiKey || !baseUrl) {
    return NextResponse.json({
      ok: false,
      error: "No API key configured",
      env: {
        hasONEAI_API_KEY: Boolean(oneaiKey),
        hasOPENAI_API_KEY: Boolean(openaiKey),
        hasONEAI_BASE_URL: Boolean(process.env.ONEAI_BASE_URL),
        hasOPENAI_BASE_URL: Boolean(process.env.OPENAI_BASE_URL),
      }
    }, { status: 500 });
  }

  const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Say OK" }],
        max_tokens: 5
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({
        ok: false,
        status: res.status,
        error: body.slice(0, 500),
        url,
        model,
        keyPrefix: apiKey.slice(0, 10)
      }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json({
      ok: true,
      model,
      url,
      keyPrefix: apiKey.slice(0, 10),
      response: data?.choices?.[0]?.message?.content
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      url,
      model,
      keyPrefix: apiKey.slice(0, 10)
    }, { status: 200 });
  }
}
