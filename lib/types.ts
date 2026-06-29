export type CreateProjectInput = {
  topic: string;
  platform: "tiktok" | "douyin" | "youtube_shorts" | "xiaohongshu";
  language: "zh" | "en";
  aspectRatio: "9:16" | "16:9" | "1:1";
  durationSeconds: 15 | 30 | 45 | 60;
  style?: string;
};

export type ShortVideoScript = {
  title: string;
  hook: string;
  body: string;
  cta: string;
  fullVoiceover: string;
  visualBible?: {
    protagonist: string;
    wardrobe: string;
    coreSetting: string;
    propAnchors: string[];
    visualStyle: string;
    cameraLanguage: string;
    colorAndLight: string;
    continuityRules: string[];
    negativePrompt: string;
  };
};

export type DialogueLine = {
  speaker: string;       // 角色名，e.g. "主角" | "女友" | "旁白" | "NARRATOR"
  text: string;          // 台词内容
  emotion: string;       // 情绪标签，e.g. "疲惫" | "坚定" | "惊喜"
  durationSeconds: number; // 该行台词时长估算
};

export type StoryboardScene = {
  sceneIndex: number;
  durationSeconds: number;
  voiceover: string;
  dialogues?: DialogueLine[];  // 短剧对话模式：角色台词列表
  visualPrompt: string;
  videoPrompt: string;
  cameraMotion: string;
  mood: string;
  location?: string;
  storyBeat?: string;
  entryState?: string;
  exitState?: string;
  continuityNote?: string;
  transitionFromPrevious?: string;
  continuityAnchor?: string;
  referenceImageUrl?: string;
  firstFrameUrl?: string;
  qualityScore?: number;
  reviewStatus?: string;
  qualityNotes?: string;
};
