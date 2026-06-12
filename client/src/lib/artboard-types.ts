export type ArtboardLayerType = "sticker" | "image" | "slice" | "text";

export type ArtboardLayer = {
  id: string;
  type: ArtboardLayerType;
  content: string;
  x: number;
  y: number;
  w: number;
  h?: number;
  rotation?: number;
  color?: string;
  zIndex?: number;
};

export const STICKER_PRESETS = [
  "🔥", "⭐", "💯", "✨", "❤️", "👍", "🎁", "📢", "🛒", "👆",
  "💰", "🏷️", "🆕", "⚡", "🎯", "💎", "🎉", "📌", "🔔", "✅",
] as const;

export const SLICE_PRESETS: { label: string; color: string }[] = [
  { label: "热卖", color: "#ff4757" },
  { label: "限时", color: "#ffa502" },
  { label: "秒杀", color: "#e84393" },
  { label: "关注", color: "#3742fa" },
  { label: "新品", color: "#00b894" },
  { label: "包邮", color: "#0984e3" },
];

export function createArtboardLayer(
  partial: Omit<ArtboardLayer, "id"> & { id?: string }
): ArtboardLayer {
  return {
    id: partial.id ?? crypto.randomUUID(),
    ...partial,
  };
}

export function clampLayerWidth(w: number): number {
  return Math.max(4, Math.min(80, w));
}

export function layerTypeLabel(type: ArtboardLayerType): string {
  switch (type) {
    case "sticker":
      return "贴纸";
    case "slice":
      return "标签";
    case "text":
      return "文字";
    case "image":
      return "贴图";
  }
}

export function normalizeArtboardLayers(raw: unknown): ArtboardLayer[] {
  if (!Array.isArray(raw)) return [];
  const layers: ArtboardLayer[] = [];
  for (const item of raw.slice(0, 24)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = row.type;
    if (type !== "sticker" && type !== "image" && type !== "slice" && type !== "text") continue;
    const content = typeof row.content === "string" ? row.content.trim() : "";
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!content || !id) continue;
    layers.push({
      id,
      type,
      content,
      x: clampNum(row.x, 50, 0, 100),
      y: clampNum(row.y, 50, 0, 100),
      w: clampNum(row.w, 15, 4, 80),
      h: row.h != null ? clampNum(row.h, 10, 4, 80) : undefined,
      rotation: row.rotation != null ? Number(row.rotation) % 360 : undefined,
      color: typeof row.color === "string" ? row.color : undefined,
      zIndex: row.zIndex != null ? Number(row.zIndex) : undefined,
    });
  }
  return layers;
}

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
