import { ShortVideoScript, StoryboardScene } from "./types";

type VisualBible = NonNullable<ShortVideoScript["visualBible"]>;

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // Try object first, then array
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    const jsonText = match ? match[0] : cleaned;

    return JSON.parse(jsonText) as T;
  } catch (error) {
    console.error("[OneAI] JSON parse failed:", { error, rawText: text.slice(0, 200) });
    return fallback;
  }
}

function getOneAIModel() {
  if (process.env.ONEAI_MODEL) return process.env.ONEAI_MODEL;
  // 没有自定义 LLM 代理时，用 OPENAI_API_KEY → gpt-4o-mini (快/便宜)
  if (!process.env.ONEAI_API_KEY && process.env.OPENAI_API_KEY) return "gpt-4o-mini";
  return "deepseek-chat";
}

function getKlingSceneMaxSeconds() {
  return Number(process.env.KLING_SCENE_MAX_SECONDS || 10);
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => String(item || "").trim()).filter(Boolean);
    if (normalized.length > 0) return normalized;
  }

  return fallback;
}

function joinList(items: string[]) {
  return items.filter(Boolean).join("; ");
}

function buildFallbackVisualBible(input: {
  topic: string;
  aspectRatio?: string;
  isChinese: boolean;
}): VisualBible {
  const hasConstructionOrigin = /工地|施工|建筑|安全帽|泥土|搬砖|construction|site/i.test(
    input.topic
  );
  const hasTradingSystem = /交易|量化|trade|trading|stock|crypto|forex/i.test(
    input.topic
  );

  if (input.isChinese) {
    return {
      protagonist: hasConstructionOrigin
        ? "同一个 30 岁左右的中国男性主角，皮肤被晒黑，手上有灰尘和老茧，眼神疲惫但坚定"
        : "同一个真实普通人主角，表情有压力到坚定的变化，脸部特征和发型全片保持一致",
      wardrobe: hasConstructionOrigin
        ? "前半段穿旧工装、反光背心和安全帽；转折后仍保留同一件深色内搭，外面换成干净外套"
        : "朴素日常衣服，全片颜色和款式保持一致，不要每段换不同造型",
      coreSetting: hasConstructionOrigin
        ? "从尘土飞扬的真实工地，过渡到狭小出租屋或小工作室里的电脑桌"
        : "从真实工作现场，过渡到同一个小房间电脑桌和产品后台",
      propAnchors: hasTradingSystem
        ? ["旧安全帽或工作手套", "同一台笔记本电脑", "交易系统仪表盘", "手机上的收益和风控提醒"]
        : ["同一个手机", "同一台笔记本电脑", "代码编辑器", "自动化系统仪表盘"],
      visualStyle: "写实纪实短视频，不像广告片，不要过度科幻，人物和环境都要可信",
      cameraLanguage: `竖屏 ${input.aspectRatio || "9:16"}，手持纪实感，近景和中景为主，偶尔屏幕特写，动作连续`,
      colorAndLight: "前半段尘土暖光和汗水质感，后半段室内冷暖混合光，整体电影级但真实",
      continuityRules: [
        "每一段都必须是同一个主角，不要换脸、换年龄、换性别",
        "服装、发型、关键道具必须连续",
        "每段开头要承接上一段结尾的情绪或动作",
        "不要突然切到无关城市航拍、豪车豪宅或抽象科技背景"
      ],
      negativePrompt:
        "不同人物，随机群演作为主角，空泛城市航拍，豪车豪宅，抽象 AI 光效，企业宣传片，科幻蓝色全息界面，夸张成功学画面"
    };
  }

  return {
    protagonist: hasConstructionOrigin
      ? "the same Chinese male protagonist in his early 30s, sun-tanned skin, dusty rough hands, tired but determined eyes"
      : "the same grounded everyday protagonist, consistent face and haircut, moving from stress to focused confidence",
    wardrobe: hasConstructionOrigin
      ? "old workwear, reflective vest and hard hat in the origin scenes; the same dark inner shirt with a cleaner jacket after the turning point"
      : "simple everyday clothes with consistent color and silhouette across the whole video",
    coreSetting: hasConstructionOrigin
      ? "from a dusty real construction site to a small rented room or compact home office computer desk"
      : "from a real work environment to the same small computer desk and product dashboard",
    propAnchors: hasTradingSystem
      ? ["old hard hat or work gloves", "the same laptop", "trading system dashboard", "phone showing risk-control alerts"]
      : ["the same phone", "the same laptop", "code editor", "automation dashboard"],
    visualStyle: "realistic documentary short-video style, believable people and environments, not a glossy commercial",
    cameraLanguage: `vertical ${input.aspectRatio || "9:16"}, handheld documentary feel, mostly close and medium shots, occasional screen close-ups, continuous action`,
    colorAndLight: "dusty warm light and sweat texture at the beginning, mixed practical room lighting after the turning point, cinematic but grounded",
    continuityRules: [
      "Every scene must feature the same protagonist, never changing face, age, gender or hairstyle.",
      "Wardrobe, hair and key props must remain continuous.",
      "Each scene opening must continue the emotional or physical state from the previous scene ending.",
      "Avoid unrelated city aerials, luxury cliches and abstract technology backgrounds."
    ],
    negativePrompt:
      "different protagonist, random extras as main subject, generic city aerial, luxury cars, mansion, abstract AI glow, corporate stock footage, sci-fi blue holograms, motivational success imagery"
  };
}

function getVisualBible(input: {
  script: ShortVideoScript;
  topic: string;
  aspectRatio: string;
  isChinese: boolean;
}) {
  const fallback = buildFallbackVisualBible({
    topic: input.topic,
    aspectRatio: input.aspectRatio,
    isChinese: input.isChinese
  });
  const visualBible = input.script.visualBible || fallback;

  return {
    protagonist: visualBible.protagonist || fallback.protagonist,
    wardrobe: visualBible.wardrobe || fallback.wardrobe,
    coreSetting: visualBible.coreSetting || fallback.coreSetting,
    propAnchors: normalizeStringList(visualBible.propAnchors, fallback.propAnchors),
    visualStyle: visualBible.visualStyle || fallback.visualStyle,
    cameraLanguage: visualBible.cameraLanguage || fallback.cameraLanguage,
    colorAndLight: visualBible.colorAndLight || fallback.colorAndLight,
    continuityRules: normalizeStringList(
      visualBible.continuityRules,
      fallback.continuityRules
    ),
    negativePrompt: visualBible.negativePrompt || fallback.negativePrompt
  } satisfies VisualBible;
}

function buildContinuityVideoPrompt(input: {
  scene: StoryboardScene;
  previousScene?: StoryboardScene;
  nextScene?: StoryboardScene;
  topic: string;
  aspectRatio: string;
  totalScenes: number;
  visualBible: VisualBible;
  isChinese: boolean;
}) {
  const scene = input.scene;
  const previousExit =
    input.previousScene?.exitState ||
    input.previousScene?.continuityNote ||
    input.previousScene?.storyBeat ||
    "";
  const nextEntry = input.nextScene?.entryState || input.nextScene?.storyBeat || "";

  if (input.isChinese) {
    return [
      `连续短视频第 ${scene.sceneIndex}/${input.totalScenes} 段，主题：${input.topic}。`,
      `全片视觉圣经：主角=${input.visualBible.protagonist}。服装=${input.visualBible.wardrobe}。核心场景=${input.visualBible.coreSetting}。关键道具=${joinList(input.visualBible.propAnchors)}。视觉风格=${input.visualBible.visualStyle}。摄影语言=${input.visualBible.cameraLanguage}。色彩光线=${input.visualBible.colorAndLight}。`,
      previousExit ? `承接上一段结尾：${previousExit}。` : "这是开场镜头，必须清楚建立主角和真实处境。",
      scene.transitionFromPrevious ? `转场方式：${scene.transitionFromPrevious}。` : "",
      scene.entryState ? `本段开头状态：${scene.entryState}。` : "",
      scene.storyBeat ? `本段剧情推进：${scene.storyBeat}。` : "",
      `本段画面：${scene.videoPrompt || scene.visualPrompt}。`,
      scene.exitState ? `本段结尾状态：${scene.exitState}。` : "",
      nextEntry ? `为下一段保留衔接：${nextEntry}。` : "这是结尾段，动作和情绪要收束。",
      `连续性规则：${joinList(input.visualBible.continuityRules)}。`,
      `硬性要求：竖屏 ${input.aspectRatio}，写实纪实，真实人物，真实环境，动作明确，画面细节清楚；同一个主角必须贯穿，不要把旁观群演当主角。`,
      `避免：${input.visualBible.negativePrompt}。`
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Continuous short-video scene ${scene.sceneIndex}/${input.totalScenes}. Topic: ${input.topic}.`,
    `Global visual bible: protagonist=${input.visualBible.protagonist}. Wardrobe=${input.visualBible.wardrobe}. Core setting=${input.visualBible.coreSetting}. Key props=${joinList(input.visualBible.propAnchors)}. Visual style=${input.visualBible.visualStyle}. Camera language=${input.visualBible.cameraLanguage}. Color and light=${input.visualBible.colorAndLight}.`,
    previousExit
      ? `Continue from previous scene ending: ${previousExit}.`
      : "Opening scene: clearly establish the protagonist and grounded real-world situation.",
    scene.transitionFromPrevious ? `Transition from previous: ${scene.transitionFromPrevious}.` : "",
    scene.entryState ? `Opening state: ${scene.entryState}.` : "",
    scene.storyBeat ? `Story beat: ${scene.storyBeat}.` : "",
    `Scene visual: ${scene.videoPrompt || scene.visualPrompt}.`,
    scene.exitState ? `Ending state: ${scene.exitState}.` : "",
    nextEntry ? `Prepare continuity for next scene: ${nextEntry}.` : "Final scene: resolve the motion and emotion.",
    `Continuity rules: ${joinList(input.visualBible.continuityRules)}.`,
    `Hard requirements: vertical ${input.aspectRatio}, realistic documentary style, real person, real environment, clear action and visible details; the same protagonist must carry the whole story.`,
    `Avoid: ${input.visualBible.negativePrompt}.`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSceneDurations(input: {
  durationSeconds: number;
  provider?: string;
}) {
  // Kling: 按最大允许时长切片
  if (input.provider === "kling") {
    const maxSceneSeconds = Math.max(5, getKlingSceneMaxSeconds());
    const durations: number[] = [];
    let remaining = input.durationSeconds;
    while (remaining > 0) {
      const nextDuration = remaining <= 5 ? 5 : Math.min(maxSceneSeconds, remaining);
      durations.push(nextDuration);
      remaining -= nextDuration;
    }
    return durations;
  }

  // Seedance / Runway：固定 5s 片段，场景数 = ceil(目标时长 / 5)
  // 每个场景的 durationSeconds 存 5，render 时 xfade 偏移正确
  if (input.provider === "seedance" || input.provider === "runway") {
    const clipLen = 5;
    const count = Math.max(1, Math.ceil(input.durationSeconds / clipLen));
    return Array.from({ length: count }, () => clipLen);
  }

  // 其他 provider：按 7s 均分，3~8 场景
  const count = Math.max(3, Math.min(8, Math.round(input.durationSeconds / 7)));
  const duration = Math.ceil(input.durationSeconds / count);

  return Array.from({ length: count }).map((_, index) =>
    index === count - 1
      ? input.durationSeconds - duration * (count - 1)
      : duration
  );
}

function buildFallbackBeat(input: {
  topic: string;
  sceneIndex: number;
  totalScenes: number;
  aspectRatio: string;
  isChinese: boolean;
}) {
  // Intentionally generic — just describe the topic directly for each scene position
  // so fallback scenes are at least on-topic instead of hardcoded 工地/交易 imagery
  const ratio = input.sceneIndex / input.totalScenes;
  const topicShort = input.topic.slice(0, 40);
  const sceneLabel = input.isChinese ? `第${input.sceneIndex}场` : `Scene ${input.sceneIndex}`;
  const phaseZh = ratio <= 0.25 ? "开场建立情境" : ratio <= 0.6 ? "情节发展推进" : ratio <= 0.85 ? "高潮关键时刻" : "收尾结果呈现";
  const phaseEn = ratio <= 0.25 ? "opening establishing shot" : ratio <= 0.6 ? "story development" : ratio <= 0.85 ? "climactic moment" : "resolution and reveal";
  const motionZh = ratio <= 0.25 ? "低机位缓慢推近，自然手持感" : ratio <= 0.6 ? "中景跟拍，稳定流畅" : ratio <= 0.85 ? "特写快切，情绪递进" : "回拉中景，主角面向镜头";
  const motionEn = ratio <= 0.25 ? "low-angle slow push, natural handheld feel" : ratio <= 0.6 ? "medium tracking shot, smooth" : ratio <= 0.85 ? "close-up quick cut, emotional escalation" : "pull back to medium, subject facing camera";
  return {
    prompt: input.isChinese
      ? `${sceneLabel}（${phaseZh}）。主题：${topicShort}。竖屏 ${input.aspectRatio} 写实镜头，真实还原主题场景，人物动作清晰，光线自然，细节丰富。镜头：${motionZh}。避免抽象背景和泛化宣传片风格。`
      : `${sceneLabel} (${phaseEn}). Topic: ${topicShort}. Vertical ${input.aspectRatio} realistic shot, faithfully recreating the topic scene, clear subject action, natural light, rich detail. Camera: ${motionEn}. No abstract backgrounds or generic corporate stock imagery.`,
    motion: input.isChinese ? motionZh : motionEn
  };
}

function buildFallbackContinuity(input: {
  sceneIndex: number;
  totalScenes: number;
  isChinese: boolean;
}) {
  const ratio = input.sceneIndex / input.totalScenes;
  if (input.isChinese) {
    const beat = ratio <= 0.25
      ? { storyBeat: "开场建立情境", entryState: "主角出现在主题场景中", exitState: "镜头推近，情绪建立", transitionFromPrevious: "开场直接进入" }
      : ratio <= 0.6
      ? { storyBeat: "情节推进", entryState: "延续上一场的情绪和场景", exitState: "行动或变化发生", transitionFromPrevious: "用主角动作或道具做匹配剪辑" }
      : ratio <= 0.85
      ? { storyBeat: "高潮关键时刻", entryState: "情绪和动作达到顶点", exitState: "主角完成关键动作，画面定格一瞬", transitionFromPrevious: "节奏加快，快切进入" }
      : { storyBeat: "收尾展示结果", entryState: "情绪回落，主角面向镜头", exitState: "画面结束，主角与环境同框", transitionFromPrevious: "从动作回到静止镜头" };
    return beat;
  }
  const beat = ratio <= 0.25
    ? { storyBeat: "opening establishing shot", entryState: "subject appears in the main scene", exitState: "camera pushes in, emotion established", transitionFromPrevious: "open directly" }
    : ratio <= 0.6
    ? { storyBeat: "story development", entryState: "continuing emotion and scene from previous", exitState: "action or change occurs", transitionFromPrevious: "match cut on subject action or prop" }
    : ratio <= 0.85
    ? { storyBeat: "climactic moment", entryState: "emotion and action peak", exitState: "subject completes key action, brief hold", transitionFromPrevious: "faster pacing, quick cut" }
    : { storyBeat: "resolution and reveal", entryState: "emotion settles, subject faces camera", exitState: "scene ends with subject and environment in frame", transitionFromPrevious: "cut from action back to still shot" };
  return beat;
}

export class OneAIClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    // 优先用 ONEAI_* (自定义 LLM 代理)，fallback 到 OPENAI_API_KEY (官方 OpenAI)
    const oneaiKey = process.env.ONEAI_API_KEY || "";
    const openaiKey = process.env.OPENAI_API_KEY || "";
    this.apiKey = oneaiKey || openaiKey;
    this.baseUrl = process.env.ONEAI_BASE_URL ||
      (openaiKey && !oneaiKey ? (process.env.OPENAI_BASE_URL || "https://api.openai.com") : "");
  }

  async chatJSON<T>(input: {
    model?: string;
    system: string;
    prompt: string;
    fallback: T;
  }): Promise<T> {
    const useMockAI = process.env.MOCK_AI === "true";

    if (useMockAI) {
      console.warn("OneAI skipped: MOCK_AI=true");
      return input.fallback;
    }

    if (!this.apiKey || !this.baseUrl) {
      console.error("[OneAI] CRITICAL: No API key configured — set ONEAI_API_KEY or OPENAI_API_KEY in Railway env vars", {
        hasApiKey: Boolean(this.apiKey),
        hasBaseUrl: Boolean(this.baseUrl)
      });
      // 静默 fallback，让流程继续（脚本生成失败时返回最基础内容）
      return input.fallback;
    }

    const model = input.model || getOneAIModel();
    const url = `${this.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

    console.log(`[OneAI] calling model=${model} url=${url} keyPrefix=${this.apiKey.slice(0, 10)}...`);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.prompt }
          ],
          temperature: 0.7
        }),
        signal: AbortSignal.timeout(60_000) // 60s timeout
      });

      if (!res.ok) {
        const errorText = await res.text();
        // 抛出而不是静默 fallback，让 Railway 日志可见
        throw new Error(`OneAI HTTP ${res.status} from ${url} model=${model}: ${errorText.slice(0, 300)}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content || "";

      console.log("[OneAI] response length:", content.length, "preview:", content.slice(0, 80));

      if (!content) {
        throw new Error(`OneAI returned empty content, model=${model}, data=${JSON.stringify(data).slice(0, 200)}`);
      }

      const parsed = safeJsonParse<T>(content, null as unknown as T);
      if (parsed === null) {
        throw new Error(`OneAI JSON parse failed, raw=${content.slice(0, 300)}`);
      }
      return parsed;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[OneAI] request failed (using fallback): ${msg}`);
      return input.fallback;
    }
  }
}

// ─── Hook 引擎类型 ────────────────────────────────────────────────────────────

export type HookOption = {
  id: string;
  text: string;
  strategy: string;
  reasoning: string;
  estimatedRetention: number;
};

export type VariantConfig = {
  variantIndex: number;
  variantLabel: string;
  style: string;
  selectedHook?: string;
  durationSeconds?: number;
  reasoning: string;
};

// ─── generateHookOptions ─────────────────────────────────────────────────────

export async function generateHookOptions(input: {
  topic: string;
  platform: string;
  language: string;
  style?: string;
  durationSeconds: number;
}): Promise<HookOption[]> {
  const isChinese = input.language === "zh";
  const client = new OneAIClient();
  const fallback: HookOption[] = [
    { id: "hook_1", text: isChinese ? "你知道吗，90%的人都做错了这件事？" : "Did you know 90% of people get this wrong?", strategy: isChinese ? "好奇缺口" : "Curiosity Gap", reasoning: isChinese ? "触发好奇心，驱动完播" : "Triggers curiosity to boost retention", estimatedRetention: 72 },
    { id: "hook_2", text: isChinese ? `我曾经一无所有，现在靠${input.topic}月入六位数` : `I went from nothing to six figures with ${input.topic}`, strategy: isChinese ? "反差对比" : "Contrast", reasoning: isChinese ? "强反差制造张力" : "Strong contrast creates tension", estimatedRetention: 68 },
    { id: "hook_3", text: isChinese ? "如果你还没试过这个方法，你正在浪费时间" : "If you haven't tried this method, you're wasting time", strategy: isChinese ? "痛点共鸣" : "Pain Point", reasoning: isChinese ? "直击痛点，引发共鸣" : "Resonates with audience pain", estimatedRetention: 65 }
  ];

  return client.chatJSON<HookOption[]>({
    model: getOneAIModel(),
    system: `You are a viral short-video hook specialist who analyzes TikTok/Douyin algorithm data.
Return strict valid JSON array only. No markdown. No explanations.
Array of 3 objects, each: { "id": "hook_1"|"hook_2"|"hook_3", "text": string, "strategy": string, "reasoning": string, "estimatedRetention": number(0-100) }`,
    prompt: `Generate 3 viral hook options for a short video.
Topic: ${input.topic}
Platform: ${input.platform}
Language: ${isChinese ? "Chinese (Mandarin)" : "English"}
Style: ${input.style || "authentic, relatable"}
Duration: ${input.durationSeconds}s

Rules:
- Each hook must be ≤15 words, spoken in first 3 seconds
- 3 different strategies: one "好奇缺口/Curiosity Gap", one "反差对比/Contrast", one "痛点共鸣/Pain Point"
- strategy field: use Chinese label if language=zh, else English
- reasoning: explain WHY this hook retains viewers (1 sentence)
- estimatedRetention: realistic score based on platform data
- text must be in ${isChinese ? "Chinese" : "English"}
Return JSON array only.`,
    fallback
  });
}

// ─── generateVariants ─────────────────────────────────────────────────────────

export async function generateVariants(input: {
  topic: string;
  platform: string;
  language: string;
  baseStyle: string;
  durationSeconds: number;
  variantCount: number;
  dimension: "style" | "hook" | "duration";
}): Promise<VariantConfig[]> {
  const isChinese = input.language === "zh";
  const client = new OneAIClient();

  const styleLabels = isChinese
    ? ["激情励志风", "冷静干货风", "故事叙述风", "悬疑反转风", "幽默吐槽风"]
    : ["Motivational", "Educational", "Storytelling", "Mystery", "Humor"];
  const hookExamples = isChinese
    ? ["你敢相信吗？", "这个方法改变了我的人生", "我犯了一个大错误", "90%的人都不知道", "停！先看这个"]
    : ["You won't believe this", "This changed my life", "I made a huge mistake", "90% don't know this", "Stop! Watch this first"];
  const durations = [15, 30, 45, 60].filter((d) => d !== input.durationSeconds).slice(0, input.variantCount - 1);

  const fallback: VariantConfig[] = Array.from({ length: input.variantCount }, (_, i) => ({
    variantIndex: i + 1,
    variantLabel: input.dimension === "style" ? styleLabels[i] || `Variant ${i + 1}` : input.dimension === "hook" ? (hookExamples[i] || `Hook ${i + 1}`) : `${i === 0 ? input.durationSeconds : durations[i - 1]}s`,
    style: input.dimension === "style" ? `${styleLabels[i]}, ${input.baseStyle}` : input.baseStyle,
    selectedHook: input.dimension === "hook" ? hookExamples[i] : undefined,
    durationSeconds: input.dimension === "duration" ? (i === 0 ? input.durationSeconds : durations[i - 1]) : undefined,
    reasoning: `Variant ${i + 1} tests a different ${input.dimension}`
  }));

  return client.chatJSON<VariantConfig[]>({
    model: getOneAIModel(),
    system: `You are an A/B testing expert for short-form video content.
Return strict valid JSON array only. No markdown.
Array of ${input.variantCount} objects: { "variantIndex": number, "variantLabel": string, "style": string, "selectedHook"?: string, "durationSeconds"?: number, "reasoning": string }`,
    prompt: `Create ${input.variantCount} A/B test variants for a short video.
Topic: ${input.topic}
Platform: ${input.platform}
Language: ${isChinese ? "Chinese" : "English"}
Base style: ${input.baseStyle}
Base duration: ${input.durationSeconds}s
Test dimension: ${input.dimension}

Rules:
- variantLabel: short memorable name for this variant (≤4 words, in ${isChinese ? "Chinese" : "English"})
- style: full style description for this variant (keep topic and platform in mind)
- selectedHook: only include if dimension="hook", must be ≤15 words in target language
- durationSeconds: only include if dimension="duration", pick from [15, 30, 45, 60]
- reasoning: one sentence why this variant is worth testing
- Make variants genuinely different from each other
Return JSON array only.`,
    fallback
  });
}

// ─── scoreProjectVariant ─────────────────────────────────────────────────────

export async function scoreProjectVariant(input: {
  projectId: string;
  topic: string;
  hook: string;
  body: string;
  variantLabel?: string;
  platform: string;
  language: string;
}): Promise<number> {
  const client = new OneAIClient();
  const result = await client.chatJSON<{ score: number; reasoning: string }>({
    model: getOneAIModel(),
    system: `You are a short-video quality scorer. Return JSON only: { "score": number(0-100), "reasoning": string }`,
    prompt: `Score this short video script for viral potential on ${input.platform}.
Topic: ${input.topic}
Hook (first 3s): ${input.hook}
Body: ${input.body}
Variant: ${input.variantLabel || "default"}
Language: ${input.language}

Scoring criteria (0-100):
- Hook strength (40%): curiosity, contrast, emotional pull
- Story arc (30%): tension, transformation, resolution
- Platform fit (20%): style matches ${input.platform} algorithm preferences
- CTA effectiveness (10%): comment/share invitation

Return JSON only.`,
    fallback: { score: 60, reasoning: "Default score" }
  });
  return Math.max(0, Math.min(100, Math.round(result.score)));
}

// ─── generateScript ───────────────────────────────────────────────────────────

export async function generateScript(input: {
  topic: string;
  platform: string;
  language: string;
  durationSeconds: number;
  aspectRatio: string;
  style?: string;
  selectedHook?: string;
}): Promise<ShortVideoScript> {
  const isChinese = input.language === "zh" || input.language === "Chinese";

  const fallback: ShortVideoScript = {
    title: isChinese ? input.topic.slice(0, 20) : input.topic.slice(0, 30),
    hook: isChinese
      ? `你没想到吧？${input.topic.slice(0, 30)}`
      : `Nobody told you this about: ${input.topic.slice(0, 40)}`,
    body: isChinese
      ? `${input.topic}。这件事改变了我对一切的看法，细节决定成败，坚持才能走到最后。`
      : `${input.topic}. This changed everything I thought I knew. The details matter, and persistence is the key.`,
    cta: isChinese
      ? "你有同感吗？评论告诉我。"
      : "Can you relate? Tell me in the comments.",
    fullVoiceover: isChinese
      ? `你没想到吧？${input.topic}。这件事改变了我对一切的看法，细节决定成败，坚持才能走到最后。你有同感吗？评论告诉我。`
      : `Nobody told you this about: ${input.topic}. This changed everything I thought I knew. The details matter, and persistence is the key. Can you relate? Tell me in the comments.`,
    visualBible: buildFallbackVisualBible({
      topic: input.topic,
      aspectRatio: input.aspectRatio,
      isChinese
    })
  };

  const client = new OneAIClient();

  return client.chatJSON<ShortVideoScript>({
    model: getOneAIModel(),
    system: `
You are a top short-video strategist.

You must return strict valid JSON only.
Do not return Markdown.
Do not wrap the JSON in code fences.
Do not add explanations.

The JSON must have exactly these fields:
{
  "title": "string",
  "hook": "string",
  "body": "string",
  "cta": "string",
  "fullVoiceover": "string",
  "visualBible": {
    "protagonist": "string",
    "wardrobe": "string",
    "coreSetting": "string",
    "propAnchors": ["string"],
    "visualStyle": "string",
    "cameraLanguage": "string",
    "colorAndLight": "string",
    "continuityRules": ["string"],
    "negativePrompt": "string"
  }
}
`.trim(),
    prompt: `
Create a viral short video script.

Requirements:
- Duration: ${input.durationSeconds} seconds
- Language: ${isChinese ? "Chinese" : "English"}
- Platform: ${input.platform}
- Aspect ratio: ${input.aspectRatio}
- Style: ${input.style || "cinematic commercial short video"}
- Topic: ${input.topic}
${input.selectedHook ? `\nIMPORTANT: The video MUST open with this EXACT hook in the first 3 seconds (put it in the "hook" field verbatim):\n"${input.selectedHook}"\nDo NOT change or paraphrase it.\n` : ""}
Writing rules:
- The first 3 seconds must have a strong hook.
- The script must have contrast, tension and transformation.
- The CTA should invite comments.
- The tone should fit short-video platforms.
- The fullVoiceover should combine hook, body and CTA into one complete narration.
- Make the story concrete and visual, with a real person, a real environment, and a clear before-after contrast.
- Create a visualBible that can be reused by every AI video scene to keep the same protagonist, wardrobe, props, locations, color, camera language and continuity.
- The visualBible must be specific enough that separate text-to-video calls still feel like the same story.
- Avoid vague AI marketing language, empty success claims, and generic city/technology slogans.

Return strict JSON only.
`.trim(),
    fallback
  });
}

export async function generateStoryboard(input: {
  script: ShortVideoScript;
  topic: string;
  durationSeconds: number;
  aspectRatio: string;
  language: string;
}): Promise<StoryboardScene[]> {
  const isChinese = input.language === "zh" || input.language === "Chinese";
  const sceneDurations = buildSceneDurations({
    durationSeconds: input.durationSeconds,
    provider: process.env.VIDEO_PROVIDER
  });
  const count = sceneDurations.length;
  const visualBible = getVisualBible({
    script: input.script,
    topic: input.topic,
    aspectRatio: input.aspectRatio,
    isChinese
  });

  const lines = input.script.fullVoiceover
    .split(/[。.!?！？]/)
    .map((line) => line.trim())
    .filter(Boolean);

  const fallback: StoryboardScene[] = Array.from({ length: count }).map((_, i) => {
    const beat = buildFallbackBeat({
      topic: input.topic,
      sceneIndex: i + 1,
      totalScenes: count,
      aspectRatio: input.aspectRatio,
      isChinese
    });
    const continuity = buildFallbackContinuity({
      sceneIndex: i + 1,
      totalScenes: count,
      isChinese
    });

    return {
      sceneIndex: i + 1,
      durationSeconds: sceneDurations[i],
      voiceover: lines[i] || input.script.fullVoiceover.slice(0, 80),
      visualPrompt: beat.prompt,
      videoPrompt: beat.prompt,
      cameraMotion: beat.motion,
      mood: i === 0 ? "contrast hook" : i === count - 1 ? "call to action" : "progress",
      location: i === 0 ? visualBible.coreSetting : undefined,
      storyBeat: continuity.storyBeat,
      entryState: continuity.entryState,
      exitState: continuity.exitState,
      transitionFromPrevious: continuity.transitionFromPrevious,
      continuityNote: continuity.storyBeat
    };
  });

  const client = new OneAIClient();

  const result = await client.chatJSON<{ scenes: StoryboardScene[] }>({
    model: getOneAIModel(),
    system: `
You are a senior storyboard director for AI short videos.

You must return strict valid JSON only.
Do not return Markdown.
Do not wrap the JSON in code fences.
Do not add explanations.

The JSON must have exactly this structure:
{
  "scenes": [
    {
      "sceneIndex": 1,
      "durationSeconds": 5,
      "voiceover": "string",
      "visualPrompt": "string",
      "videoPrompt": "string",
      "cameraMotion": "string",
      "mood": "string",
      "location": "string",
      "storyBeat": "string",
      "entryState": "string",
      "exitState": "string",
      "continuityNote": "string",
      "transitionFromPrevious": "string"
    }
  ]
}
`.trim(),
    prompt: `
Split the following script into exactly ${count} short-video scenes.

Project:
- Topic: ${input.topic}
- Duration: ${input.durationSeconds} seconds
- Scene durations in seconds, in order: ${sceneDurations.join(", ")}
- Aspect ratio: ${input.aspectRatio}
- Language: ${isChinese ? "Chinese" : "English"}

Global visual bible that every scene must obey:
${JSON.stringify(visualBible, null, 2)}

Scene rules:
- Return exactly ${count} scenes.
- Scene durations must exactly match this sequence: ${sceneDurations.join(", ")}.
- Each scene should have a clear visual idea, a concrete location, a visible subject, and one primary action.
- Each videoPrompt should be written for text-to-video generation.
- Each videoPrompt should be detailed, cinematic, realistic and suitable for vertical short video.
- Keep the same protagonist, wardrobe, key props, locations, tone and visual style consistent across scenes.
- Treat this as one continuous narrative, not a list of unrelated stock clips.
- Every scene must define entryState and exitState so the next scene can continue from it.
- Use transitionFromPrevious to connect each scene to the previous scene through action, prop, camera motion, or emotion.
- Avoid abstract empty prompts, generic city skylines, vague AI glow, corporate stock footage, and empty luxury success imagery.
- Prefer documentary-like realism: real person, real room/site, real computer screen, real objects, believable lighting.
- Use strong camera direction.
- Mention camera framing and motion in every videoPrompt.

Script JSON:
${JSON.stringify(input.script, null, 2)}

Return strict JSON only.
`.trim(),
    fallback: { scenes: fallback }
  });

  if (!result.scenes?.length) {
    console.warn("OneAI storyboard empty. Using fallback scenes.");
    return fallback.map((scene, index) => ({
      ...scene,
      videoPrompt: buildContinuityVideoPrompt({
        scene,
        previousScene: fallback[index - 1],
        nextScene: fallback[index + 1],
        topic: input.topic,
        aspectRatio: input.aspectRatio,
        totalScenes: count,
        visualBible,
        isChinese
      })
    }));
  }

  const normalizedScenes = Array.from({ length: count }).map((_, index) => {
    const scene =
      result.scenes.find((item) => Number(item.sceneIndex) === index + 1) ||
      result.scenes[index] ||
      fallback[index];

    return {
      sceneIndex: index + 1,
      durationSeconds: sceneDurations[index],
      voiceover:
        scene.voiceover ||
        fallback[index]?.voiceover ||
        input.script.fullVoiceover.slice(0, 80),
      visualPrompt:
        scene.visualPrompt ||
        fallback[index]?.visualPrompt ||
        `AI short video scene about ${input.topic}`,
      videoPrompt:
        scene.videoPrompt ||
        scene.visualPrompt ||
        fallback[index]?.videoPrompt ||
        `A cinematic vertical video about ${input.topic}`,
      cameraMotion: scene.cameraMotion || fallback[index]?.cameraMotion || "slow push in",
      mood: scene.mood || fallback[index]?.mood || "momentum",
      location: scene.location || fallback[index]?.location,
      storyBeat: scene.storyBeat || fallback[index]?.storyBeat,
      entryState: scene.entryState || fallback[index]?.entryState,
      exitState: scene.exitState || fallback[index]?.exitState,
      continuityNote: scene.continuityNote || fallback[index]?.continuityNote,
      transitionFromPrevious:
        scene.transitionFromPrevious || fallback[index]?.transitionFromPrevious
    };
  });

  return normalizedScenes.map((scene, index) => ({
    ...scene,
    videoPrompt: buildContinuityVideoPrompt({
      scene,
      previousScene: normalizedScenes[index - 1],
      nextScene: normalizedScenes[index + 1],
      topic: input.topic,
      aspectRatio: input.aspectRatio,
      totalScenes: count,
      visualBible,
      isChinese
    })
  }));
}

// ─── generateDialogueScript ──────────────────────────────────────────────────
// 为每个分镜场景生成角色对话台词（短剧模式）
export async function generateDialogueScript(input: {
  scenes: import("./types").StoryboardScene[];
  topic: string;
  language: string;
  characters?: string[];   // 角色名列表，e.g. ["主角", "女友"]
}): Promise<import("./types").DialogueLine[][]> {
  const isChinese = input.language === "zh" || input.language === "Chinese";
  const client = new OneAIClient();

  const characterList = input.characters?.length
    ? input.characters
    : isChinese ? ["主角", "配角", "旁白"] : ["Protagonist", "Supporting", "Narrator"];

  const fallback = input.scenes.map(scene =>
    [{ speaker: isChinese ? "旁白" : "Narrator", text: scene.voiceover, emotion: scene.mood || "neutral", durationSeconds: scene.durationSeconds }]
  );

  const result = await client.chatJSON<{ scenes: Array<{ sceneIndex: number; dialogues: import("./types").DialogueLine[] }> }>({
    model: getOneAIModel(),
    system: `
You are a screenwriter for viral short dramas (短剧).
Write realistic, emotionally driven dialogue — not narration.
Each line should feel natural, spoken out loud, with tension or warmth.
Return strict JSON only. No markdown, no code fences.

JSON structure:
{
  "scenes": [
    {
      "sceneIndex": 1,
      "dialogues": [
        { "speaker": "角色名", "text": "台词内容", "emotion": "情绪", "durationSeconds": 2.5 }
      ]
    }
  ]
}

Rules:
- speaker must be one of: ${characterList.join(", ")}
- emotion: one word, e.g. ${isChinese ? "疲惫|坚定|惊喜|愤怒|温柔|绝望|希望" : "tired|determined|surprised|angry|gentle|desperate|hopeful"}
- durationSeconds: realistic speaking time (1 Chinese char ≈ 0.3s)
- Each scene should have 1-4 dialogue lines matching the scene duration
- Total dialogue durationSeconds per scene should ≈ scene durationSeconds
- Write in ${isChinese ? "Chinese (Mandarin)" : "English"}
- NO narration style — write as actual spoken lines between characters
`.trim(),
    prompt: `
Topic: ${input.topic}
Characters: ${characterList.join(", ")}

Scenes to write dialogue for:
${input.scenes.map(s => `Scene ${s.sceneIndex} (${s.durationSeconds}s): ${s.storyBeat || s.voiceover} | mood: ${s.mood}`).join("\n")}

Write short, punchy dialogue for each scene. Each line max 20 characters for Chinese, 15 words for English.
Return JSON only.
`.trim(),
    fallback: { scenes: input.scenes.map((s, i) => ({ sceneIndex: i + 1, dialogues: fallback[i] })) }
  });

  return input.scenes.map((scene, i) => {
    const found = result.scenes?.find(s => Number(s.sceneIndex) === scene.sceneIndex);
    return found?.dialogues?.length ? found.dialogues : fallback[i];
  });
}
