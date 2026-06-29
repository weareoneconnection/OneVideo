import path from "node:path";
import type { WordTimestamp } from "./whisper";
import type { DialogueLine } from "./types";

export type SubtitleStyle = "none" | "classic" | "tiktok" | "karaoke" | "pill" | "dialogue";

// Group words into lines of max N words each, keeping timing
type SubtitleLine = { words: WordTimestamp[]; start: number; end: number };

function groupIntoLines(words: WordTimestamp[], wordsPerLine = 4): SubtitleLine[] {
  const lines: SubtitleLine[] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    const chunk = words.slice(i, i + wordsPerLine);
    lines.push({ words: chunk, start: chunk[0].start, end: chunk[chunk.length - 1].end });
  }
  return lines;
}

function toSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function toAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

// ── SRT (classic, simple burn) ──
export function buildSrt(words: WordTimestamp[], wordsPerLine = 4): string {
  const lines = groupIntoLines(words, wordsPerLine);
  return lines.map((line, i) => [
    String(i + 1),
    `${toSrtTime(line.start)} --> ${toSrtTime(line.end)}`,
    line.words.map(w => w.word).join(" ")
  ].join("\n")).join("\n\n") + "\n";
}

// Bundled CJK font file (committed to repo, works on all platforms)
const BUNDLED_FONT_PATH = path.resolve(__dirname, "../assets/fonts/wqy-microhei.ttc");

// Font name as declared inside the TTC file
function getCjkFont(): string {
  if (process.env.SUBTITLE_FONT) return process.env.SUBTITLE_FONT;
  return process.platform === "darwin" ? "PingFang SC" : "WenQuanYi Micro Hei";
}

// SUBTITLE_FONT_SCALE=0.7 缩小到70%，默认0.75适合720p竖屏
function fs(base: number): number {
  return Math.round(base * Number(process.env.SUBTITLE_FONT_SCALE || 0.75));
}

// Returns the fontsdir pointing to bundled font (used in FFmpeg filter)
export function getBundledFontsDir(): string {
  return path.dirname(BUNDLED_FONT_PATH);
}

// ── ASS header ──
function assHeader(style: string): string {
  return `[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayDepth: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${style}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

// ── TikTok 大字幕 (白字黑描边，底部居中) ──
function buildTikTokAss(words: WordTimestamp[]): string {
  const font = getCjkFont();
  const styleLine = `Style: TikTok,${font},${fs(72)},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,2,2,20,20,60,1`;
  const header = assHeader(styleLine);
  const lines = groupIntoLines(words, 5);
  const events = lines.map(line => {
    const text = line.words.map(w => w.word).join(" ");
    return `Dialogue: 0,${toAssTime(line.start)},${toAssTime(line.end)},TikTok,,0,0,0,,{\\an2}${text}`;
  }).join("\n");
  return header + events + "\n";
}

// ── Karaoke 高亮 (每个词按时序高亮) ──
function buildKaraokeAss(words: WordTimestamp[]): string {
  const font = getCjkFont();
  const styleDefault = `Style: KaraokeBase,${font},${fs(68)},&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,1,2,20,20,60,1`;
  const header = assHeader(styleDefault);
  const lines = groupIntoLines(words, 4);
  const events = lines.map(line => {
    // Build karaoke tags: {\k<centisecs>}word
    const karaTags = line.words.map((w, i) => {
      const dur = Math.round((w.end - w.start) * 100); // centiseconds
      // First word in line gets lead-in silence from line start
      const leadIn = i === 0 ? Math.round((w.start - line.start) * 100) : 0;
      return (leadIn > 0 ? `{\\k${leadIn}}` : "") + `{\\kf${dur}}${w.word}`;
    }).join(" ");
    return `Dialogue: 0,${toAssTime(line.start)},${toAssTime(line.end)},KaraokeBase,,0,0,0,,{\\an2}${karaTags}`;
  }).join("\n");
  return header + events + "\n";
}

// ── Pill 胶囊 (每词独立显示，带圆角背景框) ──
function buildPillAss(words: WordTimestamp[]): string {
  // Use BorderStyle=4 (opaque box) for pill effect
  const styleLine = `Style: Pill,${getCjkFont()},${fs(64)},&H00FFFFFF,&H000000FF,&H00000000,&HAA000000,1,0,0,0,100,100,4,0,4,0,0,2,20,20,60,1`;
  const header = assHeader(styleLine);
  // Show one word at a time
  const events = words.map(w =>
    `Dialogue: 0,${toAssTime(w.start)},${toAssTime(w.end)},Pill,,0,0,0,,{\\an2} ${w.word} `
  ).join("\n");
  return header + events + "\n";
}

// ── Classic SRT-based simple style ──
function buildClassicAss(words: WordTimestamp[]): string {
  const styleLine = `Style: Classic,${getCjkFont()},${fs(52)},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,40,1`;
  const header = assHeader(styleLine);
  const lines = groupIntoLines(words, 6);
  const events = lines.map(line => {
    const text = line.words.map(w => w.word).join(" ");
    return `Dialogue: 0,${toAssTime(line.start)},${toAssTime(line.end)},Classic,,0,0,0,,{\\an2}${text}`;
  }).join("\n");
  return header + events + "\n";
}

export function buildSubtitleFile(words: WordTimestamp[], style: SubtitleStyle): { content: string; ext: "ass" | "srt" } {
  switch (style) {
    case "tiktok": return { content: buildTikTokAss(words), ext: "ass" };
    case "karaoke": return { content: buildKaraokeAss(words), ext: "ass" };
    case "pill": return { content: buildPillAss(words), ext: "ass" };
    case "classic": return { content: buildClassicAss(words), ext: "ass" };
    default: return { content: buildSrt(words), ext: "srt" };
  }
}

// ── 对话字幕 — 按说话人分色显示 ──────────────────────────────────────────────
// 调色板：最多6个角色，左右交替，颜色鲜明
const SPEAKER_COLORS = [
  "&H0000FFFF",   // 黄色 — 主角
  "&H00FF7043",   // 橙蓝 — 配角
  "&H0000FF00",   // 绿色 — 第三角色
  "&H00FF00FF",   // 洋红
  "&H0000FFFF",   // 青色
  "&H00FFFFFF",   // 白色兜底
];

function getSpeakerColor(speaker: string, speakerMap: Map<string, number>): string {
  if (!speakerMap.has(speaker)) {
    speakerMap.set(speaker, speakerMap.size);
  }
  return SPEAKER_COLORS[speakerMap.get(speaker)! % SPEAKER_COLORS.length];
}

export function buildDialogueSubtitle(dialogues: DialogueLine[]): string {
  const font = getCjkFont();
  const size = fs(46);
  const speakerMap = new Map<string, number>();

  // Build one ASS Style per unique speaker
  const uniqueSpeakers = [...new Set(dialogues.map(d => d.speaker))];
  const styles = uniqueSpeakers.map((spk, idx) => {
    const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
    // Alternate alignment: odd speakers bottom-left (an1), even bottom-right (an3)
    const align = idx % 2 === 0 ? 1 : 3;
    return `Style: ${spk},${font},${size},${color},&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,${align},30,30,50,1`;
  }).join("\n");

  const header = `[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayDepth: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Lay out dialogues sequentially from t=0
  let t = 0;
  const events = dialogues.map(line => {
    const start = t;
    const end = t + line.durationSeconds;
    t = end;
    const speakerLabel = `{\\b1}${line.speaker}：{\\b0}`;
    const event = `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},${line.speaker},,0,0,0,,${speakerLabel}${line.text}`;
    return event;
  }).join("\n");

  return header + events + "\n";
}

export function buildDialogueSubtitleFromScenes(
  allDialogues: DialogueLine[][],
  sceneDurations: number[]
): string {
  const font = getCjkFont();
  const size = fs(46);

  const allLines = allDialogues.flat();
  const uniqueSpeakers = [...new Set(allLines.map(d => d.speaker))];
  const styles = uniqueSpeakers.map((spk, idx) => {
    const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
    const align = idx % 2 === 0 ? 1 : 3;
    return `Style: ${spk},${font},${size},${color},&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,${align},30,30,50,1`;
  }).join("\n");

  const header = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let globalT = 0;
  const events: string[] = [];

  allDialogues.forEach((sceneDialogues, si) => {
    let localT = globalT;
    sceneDialogues.forEach(line => {
      const start = localT;
      const end = localT + line.durationSeconds;
      localT = end;
      const label = `{\\b1}${line.speaker}：{\\b0}`;
      events.push(`Dialogue: 0,${toAssTime(start)},${toAssTime(end)},${line.speaker},,0,0,0,,${label}${line.text}`);
    });
    globalT += sceneDurations[si] || 5;
  });

  return header + events.join("\n") + "\n";
}

// FFmpeg filter string for ASS/SRT burn-in
export function getSubtitleBurnFilter(subtitlePath: string, style: SubtitleStyle): string {
  const escaped = subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  // Always point libass at the bundled font directory so CJK renders on any platform
  const fontsDir = getBundledFontsDir().replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const fontsdirArg = `:fontsdir=${fontsDir}`;

  if (style === "classic" || style === "none") {
    return `subtitles='${escaped}'${fontsdirArg}`;
  }
  return `ass='${escaped}'${fontsdirArg}`;
}
