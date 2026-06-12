export type PhotoShotType = "front_face" | "side_face" | "body" | "other";

export type PhotoExpression = "neutral" | "slight_smile" | "calm" | "focused";

export type PersonaExpressionTone =
  | "subtle_natural"
  | "subtle_smile"
  | "calm_serious"
  | "focused_talk";

export const PHOTO_SHOT_TYPES: { id: PhotoShotType; label: string; hint: string }[] = [
  { id: "front_face", label: "正脸", hint: "正面免冠、五官清晰，口播首选" },
  { id: "side_face", label: "侧脸", hint: "左/右侧脸轮廓，辅助还原侧颜" },
  { id: "body", label: "身材", hint: "半身或全身，体态与穿搭" },
  { id: "other", label: "其他", hint: "特写、手势等补充素材" },
];

export const PHOTO_EXPRESSIONS: { id: PhotoExpression; label: string }[] = [
  { id: "neutral", label: "自然中性" },
  { id: "slight_smile", label: "淡淡微笑" },
  { id: "calm", label: "平静" },
  { id: "focused", label: "专注" },
];

export const PERSONA_EXPRESSION_TONES: {
  id: PersonaExpressionTone;
  label: string;
  description: string;
}[] = [
  {
    id: "subtle_natural",
    label: "自然微表情",
    description: "默认推荐：放松自然，仅轻微眉眼变化，避免夸张",
  },
  {
    id: "subtle_smile",
    label: "淡淡微笑",
    description: "嘴角微微上扬，亲和但不咧嘴大笑",
  },
  {
    id: "calm_serious",
    label: "平静偏严肃",
    description: "沉稳克制，适合财经/技术讲解",
  },
  {
    id: "focused_talk",
    label: "专注讲解",
    description: "认真倾听感，眼神稳定，动作幅度小",
  },
];

export function getShotTypeLabel(id: string | null | undefined): string {
  return PHOTO_SHOT_TYPES.find((item) => item.id === id)?.label ?? "其他";
}

export function getPhotoExpressionLabel(id: string | null | undefined): string {
  return PHOTO_EXPRESSIONS.find((item) => item.id === id)?.label ?? "自然中性";
}

export function getExpressionToneLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return PERSONA_EXPRESSION_TONES.find((item) => item.id === id)?.label ?? null;
}
