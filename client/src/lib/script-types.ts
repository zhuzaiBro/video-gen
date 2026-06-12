/** 脚本信息编辑（不含分镜明细，分镜在生成工作室处理） */

export type ScriptInfoDraft = {
  title: string;
  summary: string;
  tone: string;
  targetAudience: string;
  tags: string;
  hook: string;
  body: string;
  cta: string;
  transcript: string;
};

export type ScriptOverlayDraft = {
  type: "slice" | "sticker" | "text" | "image";
  content: string;
  position: string;
  color?: string;
  notes?: string;
};

export type ScriptSegmentDraft = {
  index: number;
  startSec: number;
  endSec: number;
  spokenText: string;
  visualDescription: string;
  purpose: string;
  overlays: ScriptOverlayDraft[];
};

/** @deprecated 保留供分镜相关逻辑使用 */
export type ScriptEditorDraft = ScriptInfoDraft & {
  segments: ScriptSegmentDraft[];
};

export const SEGMENT_PURPOSES = [
  { value: "hook", label: "Hook · 开头钩子" },
  { value: "body", label: "Body · 主体" },
  { value: "cta", label: "CTA · 转化" },
  { value: "transition", label: "Transition · 过渡" },
] as const;

export const OVERLAY_TYPES = [
  { value: "slice", label: "切片标签" },
  { value: "sticker", label: "贴纸" },
  { value: "text", label: "花字" },
  { value: "image", label: "贴图" },
] as const;

export const OVERLAY_POSITIONS = [
  { value: "top-right", label: "右上" },
  { value: "top-left", label: "左上" },
  { value: "top-center", label: "顶部居中" },
  { value: "bottom-right", label: "右下" },
  { value: "bottom-left", label: "左下" },
  { value: "bottom-center", label: "底部居中" },
  { value: "lower-third", label: "下三分之一" },
  { value: "upper-third", label: "上三分之一" },
  { value: "center", label: "居中" },
] as const;

function readOverlay(raw: unknown): ScriptOverlayDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const content = String(row.content ?? row.text ?? row.label ?? "").trim();
  if (!content) return null;
  const typeRaw = String(row.type ?? "slice");
  const type = (["slice", "sticker", "text", "image"].includes(typeRaw) ? typeRaw : "slice") as ScriptOverlayDraft["type"];
  return {
    type,
    content,
    position: String(row.position ?? row.placement ?? "top-right"),
    color: typeof row.color === "string" ? row.color : undefined,
    notes: typeof row.notes === "string" ? row.notes : undefined,
  };
}

function readSegment(raw: unknown, fallbackIndex: number): ScriptSegmentDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const index = Number(row.index ?? fallbackIndex);
  const overlaysRaw = row.overlays ?? row.overlayElements;
  const overlays = Array.isArray(overlaysRaw)
    ? (overlaysRaw.map(readOverlay).filter(Boolean) as ScriptOverlayDraft[])
    : [];
  return {
    index: Number.isFinite(index) ? index : fallbackIndex,
    startSec: Number(row.startSec ?? row.start_sec ?? 0) || 0,
    endSec: Number(row.endSec ?? row.end_sec ?? 0) || 0,
    spokenText: String(row.spokenText ?? row.spoken_text ?? "").trim(),
    visualDescription: String(row.visualDescription ?? row.visual_description ?? "").trim(),
    purpose: String(row.purpose ?? "body").trim() || "body",
    overlays,
  };
}

export function scriptToInfoDraft(script: {
  title?: string | null;
  summary?: string | null;
  rawTranscript?: string | null;
  decomposedScript?: Record<string, unknown> | null;
}): ScriptInfoDraft {
  const d = script.decomposedScript ?? {};
  const tagsRaw = d.tags;
  return {
    title: String(script.title ?? d.title ?? "").trim(),
    summary: String(script.summary ?? d.summary ?? "").trim(),
    tone: String(d.tone ?? "").trim(),
    targetAudience: String(d.targetAudience ?? d.target_audience ?? "").trim(),
    tags: Array.isArray(tagsRaw) ? tagsRaw.map(String).join(", ") : "",
    hook: String(d.hook ?? "").trim(),
    body: String(d.body ?? "").trim(),
    cta: String(d.cta ?? "").trim(),
    transcript: String(script.rawTranscript ?? d.transcript ?? "").trim(),
  };
}

export function scriptToEditorDraft(script: {
  title?: string | null;
  summary?: string | null;
  rawTranscript?: string | null;
  decomposedScript?: Record<string, unknown> | null;
}): ScriptEditorDraft {
  const d = script.decomposedScript ?? {};
  const segmentsRaw = d.segments;
  const segments = Array.isArray(segmentsRaw)
    ? (segmentsRaw
        .map((seg, i) => readSegment(seg, i + 1))
        .filter(Boolean)
        .sort((a, b) => a!.index - b!.index) as ScriptSegmentDraft[])
    : [];
  return { ...scriptToInfoDraft(script), segments };
}

/** 仅更新脚本信息，保留原有分镜与 overlays */
export function scriptInfoToPayload(
  draft: ScriptInfoDraft,
  originalDecomposed?: Record<string, unknown> | null
) {
  const base = originalDecomposed ?? {};
  const tags = draft.tags
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    title: draft.title || null,
    summary: draft.summary || null,
    rawTranscript: draft.transcript || null,
    decomposedScript: {
      ...base,
      title: draft.title,
      summary: draft.summary,
      tone: draft.tone,
      targetAudience: draft.targetAudience,
      tags,
      hook: draft.hook,
      body: draft.body,
      cta: draft.cta,
      transcript: draft.transcript,
    },
  };
}

export function editorDraftToPayload(draft: ScriptEditorDraft) {
  const tags = draft.tags
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    title: draft.title || null,
    summary: draft.summary || null,
    rawTranscript: draft.transcript || null,
    decomposedScript: {
      title: draft.title,
      summary: draft.summary,
      tone: draft.tone,
      targetAudience: draft.targetAudience,
      tags,
      hook: draft.hook,
      body: draft.body,
      cta: draft.cta,
      transcript: draft.transcript,
      segments: draft.segments.map((seg) => ({
        index: seg.index,
        startSec: seg.startSec,
        endSec: seg.endSec,
        spokenText: seg.spokenText,
        visualDescription: seg.visualDescription,
        purpose: seg.purpose,
        overlays: seg.overlays.map((o) => ({
          type: o.type,
          content: o.content,
          position: o.position,
          ...(o.color ? { color: o.color } : {}),
          ...(o.notes ? { notes: o.notes } : {}),
        })),
      })),
    },
  };
}

export function createEmptySegment(index: number, startSec = 0): ScriptSegmentDraft {
  return {
    index,
    startSec,
    endSec: startSec + 5,
    spokenText: "",
    visualDescription: "",
    purpose: "body",
    overlays: [],
  };
}

export function createEmptyOverlay(): ScriptOverlayDraft {
  return { type: "slice", content: "", position: "top-right" };
}
