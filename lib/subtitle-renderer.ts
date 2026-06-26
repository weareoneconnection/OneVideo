import path from "node:path";
import type { WordTimestamp } from "./whisper";

export type SubtitleStyle = "none" | "classic" | "tiktok" | "karaoke" | "pill";

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
  const styleLine = `Style: TikTok,${font},72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,2,2,20,20,60,1`;
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
  const styleDefault = `Style: KaraokeBase,${font},68,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,1,2,20,20,60,1`;
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
  const styleLine = `Style: Pill,${getCjkFont()},64,&H00FFFFFF,&H000000FF,&H00000000,&HAA000000,1,0,0,0,100,100,4,0,4,0,0,2,20,20,60,1`;
  const header = assHeader(styleLine);
  // Show one word at a time
  const events = words.map(w =>
    `Dialogue: 0,${toAssTime(w.start)},${toAssTime(w.end)},Pill,,0,0,0,,{\\an2} ${w.word} `
  ).join("\n");
  return header + events + "\n";
}

// ── Classic SRT-based simple style ──
function buildClassicAss(words: WordTimestamp[]): string {
  const styleLine = `Style: Classic,${getCjkFont()},52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,40,1`;
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
