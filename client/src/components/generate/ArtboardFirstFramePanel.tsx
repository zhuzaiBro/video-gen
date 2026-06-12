import { Check, Loader2, RefreshCw, RotateCcw, RotateCw, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PreparedFrameReview } from "@/lib/api";
import { getShotTypeLabel } from "@/lib/persona-photo";
import {
  firstFrameModeLabel,
  getPersonaImageRotation,
  normalizeRotation,
  rotationTransformStyle,
  type FirstFrameMode,
  type PersonaImageOption,
  type PersonaImageRotations,
} from "@/lib/artboard-base";
import { btnSecondaryClass } from "./console-ui";

type Props = {
  firstFrameMode: FirstFrameMode;
  personaImageIndexes: number[];
  personaImageRotations: PersonaImageRotations;
  personaImages: PersonaImageOption[];
  preparedFrameUrl?: string | null;
  preparedReview?: PreparedFrameReview | null;
  disabled?: boolean;
  preparing?: boolean;
  canGeneratePrepared: boolean;
  onModeChange: (mode: FirstFrameMode) => void;
  onPersonaImageIndexesChange: (indexes: number[]) => void;
  onPersonaImageRotationsChange: (rotations: PersonaImageRotations) => void;
  onPrepareFrame: (opts?: { applyReviewFeedback?: boolean }) => void;
};

const MAX_PERSONA_REFS = 4;

export default function ArtboardFirstFramePanel({
  firstFrameMode,
  personaImageIndexes,
  personaImageRotations,
  personaImages,
  preparedFrameUrl,
  preparedReview,
  disabled,
  preparing,
  canGeneratePrepared,
  onModeChange,
  onPersonaImageIndexesChange,
  onPersonaImageRotationsChange,
  onPrepareFrame,
}: Props) {
  const showReviewRegenerate =
    Boolean(preparedFrameUrl) &&
    (preparedReview?.passed === false ||
      (preparedReview?.issues && preparedReview.issues.length > 0));

  const togglePersonaIndex = (index: number) => {
    const selected = new Set(personaImageIndexes);
    if (selected.has(index)) {
      if (selected.size <= 1) return;
      selected.delete(index);
    } else {
      if (selected.size >= MAX_PERSONA_REFS) {
        return;
      }
      selected.add(index);
    }
    onPersonaImageIndexesChange(Array.from(selected).sort((a, b) => a - b));
  };

  const selectAllPersona = () => {
    const all = personaImages.map((_, i) => i).slice(0, MAX_PERSONA_REFS);
    onPersonaImageIndexesChange(all);
  };

  const rotatePersonaIndex = (index: number, delta: number) => {
    const current = getPersonaImageRotation(personaImageRotations, index);
    const next = normalizeRotation(current + delta);
    const updated = { ...personaImageRotations };
    if (next) updated[index] = next;
    else delete updated[index];
    onPersonaImageRotationsChange(updated);
  };

  const previewItems = personaImageIndexes
    .map((i) => ({
      url: personaImages[i]?.url,
      rotation: getPersonaImageRotation(personaImageRotations, i),
    }))
    .filter((item) => Boolean(item.url));

  return (
    <div className="rounded-lg border border-[#00cec9]/35 bg-[#00cec9]/8 p-3 space-y-3">
      <div>
        <p className="text-[10px] font-semibold text-[#00cec9] flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          口播首屏
        </p>
        <p className="text-[9px] text-gray-500 mt-1 leading-relaxed">
          推荐流程：人设提取人脸 → 在此生成<strong className="text-gray-400 font-medium">正常首屏</strong>（直立上半身+场景）→ 视频从首屏延续生成
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["persona", "prepared"] as const).map((mode) => {
          const active = firstFrameMode === mode;
          return (
            <button
              key={mode}
              type="button"
              disabled={disabled || preparing}
              onClick={() => onModeChange(mode)}
              className={cn(
                "rounded-lg border p-2 text-left transition-colors",
                active
                  ? "border-[#00cec9] bg-[#00cec9]/15 ring-1 ring-[#00cec9]/30"
                  : "border-[#444] bg-[#2a2a2a] hover:border-[#666] disabled:opacity-50"
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {mode === "persona" ? (
                  <User className="w-3 h-3 text-[#74b9ff]" />
                ) : (
                  <Sparkles className="w-3 h-3 text-[#00cec9]" />
                )}
                <span className={cn("text-[11px] font-semibold", active ? "text-gray-100" : "text-gray-300")}>
                  {firstFrameModeLabel(mode)}
                </span>
              </div>
              <p className="text-[9px] text-gray-500 leading-relaxed">
                {mode === "persona"
                  ? "高级：多图直传可灵（易出现身体残缺，不推荐）"
                  : "以人脸为身份参考，一体生成完整人物与场景融合的口播首屏"}
              </p>
            </button>
          );
        })}
      </div>

      {firstFrameMode === "persona" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-gray-500">选择主角参考图（可多选）</p>
            {personaImages.length > 1 && (
              <button
                type="button"
                className="text-[10px] text-[#74b9ff] hover:underline disabled:opacity-50"
                disabled={disabled || preparing}
                onClick={selectAllPersona}
              >
                全选
              </button>
            )}
          </div>
          {personaImages.length === 0 ? (
            <p className="text-[10px] text-amber-400/90">请先在左侧选择带参考图的人设</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {personaImages.map((img, i) => {
                const active = personaImageIndexes.includes(i);
                const rotation = getPersonaImageRotation(personaImageRotations, i);
                return (
                  <div key={img.url + i} className="space-y-1">
                    <button
                      type="button"
                      disabled={disabled || preparing}
                      onClick={() => togglePersonaIndex(i)}
                      className={cn(
                        "relative rounded border overflow-hidden aspect-square transition-colors w-full",
                        active
                          ? "border-[#74b9ff] ring-2 ring-[#74b9ff]/40"
                          : "border-[#444] hover:border-[#666]"
                      )}
                    >
                      <div className="w-full h-full flex items-center justify-center overflow-hidden bg-[#111]">
                        <img
                          src={img.url}
                          alt={`人设 ${i + 1}`}
                          className="max-w-full max-h-full object-contain"
                          style={rotationTransformStyle(rotation)}
                        />
                      </div>
                      {img.shotType && (
                        <span className="absolute left-1 bottom-1 text-[8px] px-1 py-0.5 rounded bg-black/60 text-gray-200">
                          {getShotTypeLabel(img.shotType)}
                        </span>
                      )}
                      {rotation > 0 && (
                        <span className="absolute left-1 top-1 text-[8px] px-1 py-0.5 rounded bg-[#ffeaa7]/20 text-[#ffeaa7] border border-[#ffeaa7]/30">
                          {rotation}°
                        </span>
                      )}
                      {active && (
                        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#74b9ff] flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                    </button>
                    {active && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={disabled || preparing}
                          className="flex-1 flex items-center justify-center gap-0.5 py-0.5 rounded border border-[#444] bg-[#2a2a2a] text-[9px] text-gray-400 hover:border-[#666] disabled:opacity-50"
                          onClick={() => rotatePersonaIndex(i, -90)}
                        >
                          <RotateCcw className="w-3 h-3" />
                          左转
                        </button>
                        <button
                          type="button"
                          disabled={disabled || preparing}
                          className="flex-1 flex items-center justify-center gap-0.5 py-0.5 rounded border border-[#444] bg-[#2a2a2a] text-[9px] text-gray-400 hover:border-[#666] disabled:opacity-50"
                          onClick={() => rotatePersonaIndex(i, 90)}
                        >
                          <RotateCw className="w-3 h-3" />
                          右转
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {personaImageIndexes.length > 0 && (
            <p className="text-[9px] text-[#74b9ff]/90">
              已选 {personaImageIndexes.length} 张 · 生成时将标注为同一主角形象
            </p>
          )}
        </div>
      )}

      {firstFrameMode === "persona" && previewItems.length > 0 && (
        <div
          className={cn(
            "rounded-md border border-[#444] overflow-hidden bg-[#0a0a0a]",
            previewItems.length > 1 ? "grid grid-cols-2 gap-0.5" : ""
          )}
        >
          {previewItems.map((item) => (
            <div key={item.url} className="flex items-center justify-center min-h-[120px] p-2">
              <img
                src={item.url!}
                alt="人设首帧预览"
                className="max-w-full max-h-40 object-contain"
                style={rotationTransformStyle(item.rotation)}
              />
            </div>
          ))}
        </div>
      )}

      {firstFrameMode === "prepared" && canGeneratePrepared && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <p className="text-[10px] text-gray-500">选择人脸来源（须已在人设页提取）</p>
            <div className="flex flex-wrap gap-2">
              {personaImages.map((img, index) => {
                const selected = personaImageIndexes[0] === index;
                const hasFace = Boolean(img.faceCropUrl);
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={disabled || preparing || !hasFace}
                    onClick={() => onPersonaImageIndexesChange([index])}
                    className={cn(
                      "relative rounded-md border overflow-hidden w-16 h-20 shrink-0 transition-colors",
                      selected
                        ? "border-[#00cec9] ring-1 ring-[#00cec9]/40"
                        : hasFace
                          ? "border-[#444] hover:border-[#666]"
                          : "border-[#444]/60 opacity-50"
                    )}
                  >
                    {img.faceCropUrl ? (
                      <img
                        src={img.faceCropUrl}
                        alt={`人脸 ${index + 1}`}
                        className="w-full h-full object-contain bg-[#1a1a1a]"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#333] flex items-center justify-center px-1">
                        <span className="text-[8px] text-gray-500 text-center leading-tight">未提取</span>
                      </div>
                    )}
                    {selected && (
                      <span className="absolute top-0.5 right-0.5 bg-[#00cec9] rounded-full p-0.5">
                        <Check className="w-2.5 h-2.5 text-[#111]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] text-gray-600 leading-relaxed">
              人脸仅作五官参考；首屏由大模型<strong className="text-gray-400 font-medium">一体生成</strong>完整上半身与脚本场景，非抠图粘贴
            </p>
          </div>
          <button
            type="button"
            className={btnSecondaryClass + " w-full py-2 text-xs"}
            disabled={
              disabled ||
              preparing ||
              personaImages.length === 0 ||
              !personaImages[personaImageIndexes[0] ?? 0]?.faceCropUrl
            }
            onClick={() => onPrepareFrame()}
          >
            {preparing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                图像处理与质检中...
              </span>
            ) : preparedFrameUrl ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5" />
                重新生成首屏
              </span>
            ) : (
              "生成口播首屏（一体生成 + 质检）"
            )}
          </button>

          {preparedFrameUrl && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-[#00cec9]">
                已生成首屏
                {preparedReview?.score != null ? ` · 质检 ${preparedReview.score} 分` : ""}
                {preparedReview?.passed === false ? " · 未完全通过" : ""}
              </p>
              <div className="rounded-md border border-[#444] overflow-hidden bg-[#0a0a0a]">
                <img
                  src={preparedFrameUrl}
                  alt="生成首屏预览"
                  className="w-full max-h-52 object-contain"
                />
              </div>
              {preparedReview?.summary && (
                <p className="text-[10px] text-gray-500 leading-relaxed">{preparedReview.summary}</p>
              )}
              {preparedReview?.issues && preparedReview.issues.length > 0 && (
                <ul className="text-[10px] text-amber-400/90 list-disc pl-4 space-y-0.5">
                  {preparedReview.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
              {preparedReview?.fixSuggestions && preparedReview.fixSuggestions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-[#00cec9]">改进方向（将用于下次生成）</p>
                  <ul className="text-[10px] text-[#00cec9]/90 list-disc pl-4 space-y-0.5">
                    {preparedReview.fixSuggestions.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
              {showReviewRegenerate && (
                <button
                  type="button"
                  className={
                    btnSecondaryClass +
                    " w-full py-2 text-xs border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                  }
                  disabled={disabled || preparing}
                  onClick={() => onPrepareFrame({ applyReviewFeedback: true })}
                >
                  {preparing ? "按意见调整中..." : "按质检意见重新生成"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {firstFrameMode === "prepared" && !canGeneratePrepared && (
        <p className="text-[10px] text-gray-500 leading-relaxed">
          连贯性模式下非首段使用上一镜尾帧，无需在此生成首屏
        </p>
      )}
    </div>
  );
}
