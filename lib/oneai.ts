import { ShortVideoScript, StoryboardScene } from "./types";

type VisualBible = NonNullable<ShortVideoScript["visualBible"]>;

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const match = cleaned.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : cleaned;

    return JSON.parse(jsonText) as T;
  } catch (error) {
    console.error("OneAI JSON parse failed:", {
      error,
      rawText: text
    });

    return fallback;
  }
}

function getOneAIModel() {
  return process.env.ONEAI_MODEL || "deepseek-chat";
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
  const hasConstructionOrigin = /工地|施工|建筑|安全帽|泥土|搬砖|construction|site/i.test(
    input.topic
  );
  const hasTradingSystem = /交易|量化|trade|trading|stock|crypto|forex/i.test(
    input.topic
  );

  const originZh = hasConstructionOrigin
    ? "真实工地环境，安全帽、灰尘、粗糙双手、汗水和钢筋混凝土，人物有明确面部表情"
    : "主题相关的真实工作现场，人物正在处理具体问题，桌面、工具、手机和环境细节清晰可见";
  const originEn = hasConstructionOrigin
    ? "real construction site, hard hat, dust, rough hands, sweat, concrete and steel, a clearly visible person with grounded emotion"
    : "a real work environment related to the topic, a person handling a concrete problem, visible desk, tools, phone and location details";
  const systemZh = hasTradingSystem
    ? "高质量交易系统界面、AI 决策节点、风险控制面板、实时曲线，但画面必须像真实软件产品演示"
    : "高质量软件系统界面、AI 自动化节点、任务状态面板、实时数据变化，但画面必须像真实产品演示";
  const systemEn = hasTradingSystem
    ? "high-quality trading system interface, AI decision nodes, risk-control panels, live curves, realistic software product demo"
    : "high-quality software system interface, AI automation nodes, task status panels, live data changes, realistic product demo";

  const beatsZh = [
    {
      label: "真实出身",
      visual: originZh,
      motion: "低机位跟拍，轻微手持，慢慢推近人物"
    },
    {
      label: "反差转折",
      visual:
        "夜晚小办公室或出租屋，人物坐在电脑前，屏幕上有代码编辑器、产品后台和自动化控制面板",
      motion: "从人物背影推到屏幕特写，再切到手指敲键盘"
    },
    {
      label: "系统能力",
      visual: systemZh,
      motion: "屏幕特写横移，数据面板层层展开"
    },
    {
      label: "人生反差",
      visual:
        "一半是过去的工作现场，一半是现在的科技工作台，人物从原来的工作状态切换到干净专注的创作者状态",
      motion: "匹配剪辑转场，快速推进后定格"
    },
    {
      label: "结果展示",
      visual:
        "人物面对镜头展示系统仪表盘，桌面有手机和笔记本，背景干净真实，不要虚构豪车豪宅",
      motion: "中景稳定镜头，最后轻微推近"
    }
  ];

  const beatsEn = [
    {
      label: "real origin",
      visual: originEn,
      motion: "low-angle handheld tracking shot, slow push toward the subject"
    },
    {
      label: "contrast turn",
      visual:
        "small night office or rented room, the same person at a computer, trading charts, code editor and automation dashboard on screen",
      motion: "push from the person's back to screen close-up, then fingers typing"
    },
    {
      label: "system capability",
      visual: systemEn,
      motion: "close-up lateral move across the screen as data panels reveal"
    },
    {
      label: "life contrast",
      visual:
        "split visual between the person's past work environment and current tech workstation, the person transforms from old work mode into a focused creator mode",
      motion: "match cut transition, quick push-in and hold"
    },
    {
      label: "result reveal",
      visual:
        "the person faces camera and shows the dashboard, phone and laptop on desk, clean realistic background, no luxury cliches",
      motion: "stable medium shot, subtle final push-in"
    }
  ];

  const beats = input.isChinese ? beatsZh : beatsEn;
  const beat = beats[Math.min(input.sceneIndex - 1, beats.length - 1)];
  const sceneLabel = input.isChinese
    ? `第 ${input.sceneIndex}/${input.totalScenes} 段：${beat.label}`
    : `Scene ${input.sceneIndex}/${input.totalScenes}: ${beat.label}`;

  return {
    sceneLabel,
    visual: beat.visual,
    motion: beat.motion,
    prompt: input.isChinese
      ? `${sceneLabel}。主题：${input.topic}。竖屏 ${input.aspectRatio} 写实短视频镜头，${beat.visual}。镜头：${beat.motion}。电影级自然光，真实人物，真实地点，细节清晰，短视频爆款节奏。避免抽象科技背景，避免空泛城市航拍，避免假大空宣传片。`
      : `${sceneLabel}. Topic: ${input.topic}. Vertical ${input.aspectRatio} realistic short-video shot, ${beat.visual}. Camera: ${beat.motion}. Cinematic natural light, real person, real location, clear details, strong short-video pacing. Avoid abstract tech backgrounds, generic city aerials and corporate stock footage.`
  };
}

function buildFallbackContinuity(input: {
  sceneIndex: number;
  totalScenes: number;
  isChinese: boolean;
}) {
  const zh = [
    {
      storyBeat: "建立过去处境和反差起点",
      entryState: "主角在真实工作现场低头干活，身体疲惫",
      exitState: "主角停下动作，看向手里的手机或远处，露出想改变的表情",
      transitionFromPrevious: "开场直接进入真实环境"
    },
    {
      storyBeat: "从体力劳动切到夜晚学习和尝试",
      entryState: "延续上一段疲惫但不甘心的情绪，主角回到小房间坐到电脑前",
      exitState: "电脑屏幕亮起，代码和系统原型开始出现",
      transitionFromPrevious: "用手部动作或同一件道具做匹配剪辑"
    },
    {
      storyBeat: "展示系统开始运行并产生具体反馈",
      entryState: "主角盯着同一台电脑，继续调试刚刚出现的系统",
      exitState: "仪表盘出现结果提示，主角表情从紧张变成确认",
      transitionFromPrevious: "从屏幕亮光接到系统界面特写"
    },
    {
      storyBeat: "强化过去和现在的对比",
      entryState: "主角回想工地画面，同时手仍放在电脑旁",
      exitState: "主角把旧道具放到桌边，重新看向系统",
      transitionFromPrevious: "用相同姿势做匹配剪辑"
    },
    {
      storyBeat: "收束成结果展示和行动号召",
      entryState: "主角坐在同一个工作桌前，系统已经稳定运行",
      exitState: "主角看向镜头，画面停在系统和人物同框",
      transitionFromPrevious: "从桌面道具推到人物中景"
    }
  ];
  const en = [
    {
      storyBeat: "establish the old life and contrast",
      entryState: "the protagonist is doing physical work in a real environment, visibly tired",
      exitState: "the protagonist pauses, looks at the phone or into the distance, wanting change",
      transitionFromPrevious: "open directly inside the real environment"
    },
    {
      storyBeat: "cut from manual labor to late-night learning and building",
      entryState: "continuing the tired but determined emotion, the protagonist sits at a computer in a small room",
      exitState: "the computer screen lights up with code and an early system prototype",
      transitionFromPrevious: "match cut through a hand movement or the same prop"
    },
    {
      storyBeat: "show the system beginning to work with concrete feedback",
      entryState: "the protagonist keeps debugging on the same laptop",
      exitState: "the dashboard shows a result and the protagonist shifts from tension to confirmation",
      transitionFromPrevious: "cut from screen glow into a dashboard close-up"
    },
    {
      storyBeat: "strengthen the contrast between past and present",
      entryState: "the protagonist remembers the worksite while their hand remains near the computer",
      exitState: "the protagonist places the old prop beside the desk and looks back at the system",
      transitionFromPrevious: "match cut using the same body posture"
    },
    {
      storyBeat: "resolve into proof and call to action",
      entryState: "the protagonist sits at the same desk with the system now running steadily",
      exitState: "the protagonist looks toward camera with the system and person in the same frame",
      transitionFromPrevious: "push from desk props to a medium shot of the person"
    }
  ];
  const beats = input.isChinese ? zh : en;
  return beats[Math.min(input.sceneIndex - 1, beats.length - 1)];
}

export class OneAIClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.ONEAI_BASE_URL || "";
    this.apiKey = process.env.ONEAI_API_KEY || "";
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
      console.warn("OneAI skipped: missing ONEAI_API_KEY or ONEAI_BASE_URL", {
        hasApiKey: Boolean(this.apiKey),
        hasBaseUrl: Boolean(this.baseUrl)
      });

      return input.fallback;
    }

    const model = input.model || getOneAIModel();
    const url = `${this.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

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
            {
              role: "system",
              content: input.system
            },
            {
              role: "user",
              content: input.prompt
            }
          ],
          temperature: 0.7
        })
      });

      if (!res.ok) {
        const errorText = await res.text();

        console.error("OneAI request failed:", {
          status: res.status,
          statusText: res.statusText,
          body: errorText,
          url,
          model
        });

        return input.fallback;
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content || "";

      console.log("OneAI raw content:", content);

      if (!content) {
        console.error("OneAI returned empty content:", {
          data,
          model
        });

        return input.fallback;
      }

      return safeJsonParse<T>(content, input.fallback);
    } catch (error) {
      console.error("OneAI request crashed:", {
        error,
        url,
        model
      });

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
    title: isChinese ? "AI短视频生成计划" : "AI Video Launch Plan",
    hook: isChinese
      ? "你敢相信吗？一个想法，现在可以直接变成一条短视频。"
      : "What if one idea could become a finished short video?",
    body: isChinese
      ? `今天我们要把这个主题做成短视频：${input.topic}。系统会自动生成脚本、分镜、画面、配音和字幕，让内容生产像流水线一样运转。`
      : `Today we turn this idea into a short video: ${input.topic}. The system generates the script, storyboard, visuals, voiceover and captions automatically.`,
    cta: isChinese
      ? "想看我如何用代码做出来，评论区留言。"
      : "Comment if you want to see how this is built in code.",
    fullVoiceover: isChinese
      ? `你敢相信吗？一个想法，现在可以直接变成一条短视频。今天我们要把这个主题做成短视频：${input.topic}。系统会自动生成脚本、分镜、画面、配音和字幕，让内容生产像流水线一样运转。想看我如何用代码做出来，评论区留言。`
      : `What if one idea could become a finished short video? Today we turn this idea into a short video: ${input.topic}. The system generates the script, storyboard, visuals, voiceover and captions automatically. Comment if you want to see how this is built in code.`,
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
