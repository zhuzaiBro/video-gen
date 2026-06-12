export type VoiceTonePreset = {
  id: string;
  label: string;
  description: string;
};

export const VOICE_TONE_PRESETS: VoiceTonePreset[] = [
  { id: "warm_female", label: "温柔女声", description: "亲切柔和，知识分享、情感类" },
  { id: "bright_female", label: "活泼女声", description: "轻快有感染力，种草、日常 vlog" },
  { id: "professional_female", label: "专业女声", description: "沉稳自信，商业讲解、课程" },
  { id: "magnetic_male", label: "磁性男声", description: "低沉有质感，品牌叙事、深度内容" },
  { id: "steady_male", label: "沉稳男声", description: "平稳可靠，财经、科技解说" },
  { id: "energetic_male", label: "活力男声", description: "节奏感强，促销、活动口播" },
  { id: "news_anchor", label: "新闻播报", description: "字正腔圆，信息传达准确" },
  { id: "douyin_host", label: "抖音口播", description: "接地气，短视频带货与解说" },
  { id: "custom_sample", label: "自定义样本", description: "上传或录制声音样本" },
];

export function getVoiceToneLabel(toneId: string | null | undefined): string | null {
  if (!toneId) return null;
  if (toneId === "custom_sample") return "自定义样本";
  return VOICE_TONE_PRESETS.find((p) => p.id === toneId)?.label ?? null;
}
