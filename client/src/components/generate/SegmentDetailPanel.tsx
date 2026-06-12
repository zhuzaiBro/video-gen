import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Loader2, Maximize2, Play, Trash2, X } from "lucide-react";
import { api, type Persona, type PreparedFrameReview, type ScriptSegment, type SegmentPrepareFrameResult } from "@/lib/api";
import { normalizeArtboardLayers, type ArtboardLayer } from "@/lib/artboard-types";
import {
  firstFrameModeLabel,
  getPersonaImageRotation,
  parsePersonaImageRotations,
  resolveArtboardBaseImage,
  serializePersonaImageRotations,
  type FirstFrameMode,
  type PersonaImageRotations,
} from "@/lib/artboard-base";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  NodeCard,
  NodeField,
  STATUS_COLORS,
  formatTaskStatus,
  btnPrimaryClass,
  btnSecondaryClass,
  btnDangerClass,
  inputClass,
  selectClass,
} from "./console-ui";
import {
  ARTBOARD_PRESETS,
  SegmentArtboard,
  type ArtboardAspectRatio,
} from "./SegmentArtboard";
import SegmentArtboardEditor from "./SegmentArtboardEditor";

export type SegmentRegeneratePayload = {
  userPrompt: string;
  resolution: "720p" | "1080p" | "4K";
  aspectRatio: "16:9" | "9:16";
  sound: boolean;
  duration?: number;
  sceneCompose?: boolean;
};

type Props = {
  scriptId: number;
  segment: ScriptSegment;
  personaId: number | null;
  modelName?: string;
  fallbackResolution?: string;
  fallbackAspectRatio?: string;
  fallbackSound?: boolean;
  continuityEnabled?: boolean;
  isFirstInOrder?: boolean;
  maxKlingDuration?: number;
  minKlingDuration?: number;
  onClose: () => void;
  onRegenerate: (payload: SegmentRegeneratePayload) => void;
  onDelete?: () => void;
  onAspectRatioChange?: (aspectRatio: ArtboardAspectRatio) => void;
  onArtboardLayersChange?: (layers: ArtboardLayer[]) => void;
  onArtboardImported?: () => void;
  onFramePrepared?: () => void;
  isRegenerating?: boolean;
  isDeleting?: boolean;
};

export default function SegmentDetailPanel({
  scriptId,
  segment,
  personaId,
  modelName = "kling-v3",
  fallbackResolution = "720p",
  fallbackAspectRatio = "16:9",
  fallbackSound = true,
  continuityEnabled = true,
  isFirstInOrder = false,
  maxKlingDuration = 15,
  minKlingDuration = 3,
  onClose,
  onRegenerate,
  onDelete,
  onAspectRatioChange,
  onArtboardLayersChange,
  onArtboardImported,
  onFramePrepared,
  isRegenerating,
  isDeleting,
}: Props) {
  const gen = segment.generationParams ?? {};
  const [userPrompt, setUserPrompt] = useState(segment.userPrompt ?? "");
  const [artboardLayers, setArtboardLayers] = useState<ArtboardLayer[]>(() =>
    normalizeArtboardLayers(segment.artboardLayers)
  );
  const saveLayersTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [resolution, setResolution] = useState<SegmentRegeneratePayload["resolution"]>(
    (gen.resolution as SegmentRegeneratePayload["resolution"]) ||
      (fallbackResolution as SegmentRegeneratePayload["resolution"])
  );
  const [aspectRatio, setAspectRatio] = useState<SegmentRegeneratePayload["aspectRatio"]>(
    (gen.aspectRatio as SegmentRegeneratePayload["aspectRatio"]) ||
      (fallbackAspectRatio as SegmentRegeneratePayload["aspectRatio"])
  );
  const [sound, setSound] = useState(Boolean(gen.sound ?? fallbackSound));
  const [duration, setDuration] = useState(gen.duration ?? segment.klingDurationSec);
  const [firstFrameMode, setFirstFrameMode] = useState<FirstFrameMode>(
    (gen.firstFrameMode as FirstFrameMode) ?? "prepared"
  );
  const [personaImageIndexes, setPersonaImageIndexes] = useState<number[]>(
    gen.personaImageIndexes?.length
      ? gen.personaImageIndexes
      : [gen.personaImageIndex ?? 0]
  );
  const [personaImageRotations, setPersonaImageRotations] = useState<PersonaImageRotations>(
    parsePersonaImageRotations(gen.personaImageRotations)
  );
  const [showExpanded, setShowExpanded] = useState(false);
  const [artboardDialogOpen, setArtboardDialogOpen] = useState(false);
  const [localPreparedFrame, setLocalPreparedFrame] = useState<{
    url: string | null;
    review: PreparedFrameReview | null;
  }>({ url: null, review: null });

  const preparedFrameUrl = localPreparedFrame.url ?? gen.preparedFrameUrl ?? gen.sceneFrameUrl ?? null;
  const preparedReview = localPreparedFrame.review ?? gen.preparedFrameReview ?? null;
  const sceneCompose = firstFrameMode === "prepared";

  const updateFirstFrameMutation = useMutation({
    mutationFn: (payload: {
      firstFrameMode?: FirstFrameMode;
      personaImageIndexes?: number[];
      personaImageRotations?: PersonaImageRotations;
    }) =>
      api.patch(`/scripts/${scriptId}/segments/${segment.index}`, {
        firstFrameMode: payload.firstFrameMode,
        personaImageIndexes: payload.personaImageIndexes,
        personaImageRotations:
          payload.personaImageRotations !== undefined
            ? serializePersonaImageRotations(payload.personaImageRotations)
            : undefined,
      }),
    onSuccess: () => onFramePrepared?.(),
    onError: (err: Error) => toast.error(err.message),
  });

  const prepareFrameMutation = useMutation({
    mutationFn: (opts?: { applyReviewFeedback?: boolean }) => {
      const applyReviewFeedback = opts?.applyReviewFeedback ?? false;
      return api.post<SegmentPrepareFrameResult>(
        `/scripts/${scriptId}/segments/${segment.index}/prepare-frame`,
        {
          personaId,
          aspectRatio,
          force: applyReviewFeedback || Boolean(preparedFrameUrl),
          applyReviewFeedback,
          reviewIssues: applyReviewFeedback ? preparedReview?.issues ?? [] : [],
          reviewSummary: applyReviewFeedback ? preparedReview?.summary ?? "" : undefined,
          fixSuggestions: applyReviewFeedback ? preparedReview?.fixSuggestions ?? [] : [],
        }
      );
    },
    onSuccess: (result, vars) => {
      setLocalPreparedFrame({
        url: result.frameUrl,
        review: {
          passed: result.reviewPassed,
          score: result.reviewScore,
          issues: result.reviewIssues,
          summary: result.reviewSummary,
          fixSuggestions: result.reviewFixSuggestions,
        },
      });
      if (firstFrameMode !== "prepared") {
        setFirstFrameMode("prepared");
        updateFirstFrameMutation.mutate({ firstFrameMode: "prepared" });
      }
      if (result.reviewPassed) {
        toast.success(
          vars?.applyReviewFeedback
            ? `已按质检意见重新生成 · ${result.reviewScore} 分`
            : `首帧已准备 · 质检 ${result.reviewScore} 分`
        );
      } else {
        toast.warning(
          vars?.applyReviewFeedback
            ? `已重新生成但仍未通过（${result.reviewScore} 分）：${result.reviewSummary}`
            : `首帧已生成但质检未通过（${result.reviewScore} 分）：${result.reviewSummary}`
        );
      }
      onFramePrepared?.();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleFirstFrameModeChange = (mode: FirstFrameMode) => {
    setFirstFrameMode(mode);
    updateFirstFrameMutation.mutate({ firstFrameMode: mode });
  };

  const handlePersonaImageIndexesChange = (indexes: number[]) => {
    setPersonaImageIndexes(indexes);
    updateFirstFrameMutation.mutate({ personaImageIndexes: indexes, personaImageRotations });
  };

  const handlePersonaImageRotationsChange = (rotations: PersonaImageRotations) => {
    setPersonaImageRotations(rotations);
    updateFirstFrameMutation.mutate({ personaImageRotations: rotations, personaImageIndexes });
  };

  const effectiveMinDuration = minKlingDuration ?? (maxKlingDuration >= 15 ? 3 : 5);

  const naturalSec = segment.naturalDurationSec ?? Math.max(0, segment.endSec - segment.startSec);

  useEffect(() => {
    setUserPrompt(segment.userPrompt ?? "");
    const p = segment.generationParams ?? {};
    setResolution((p.resolution as SegmentRegeneratePayload["resolution"]) || fallbackResolution);
    setAspectRatio((p.aspectRatio as SegmentRegeneratePayload["aspectRatio"]) || fallbackAspectRatio);
    setSound(Boolean(p.sound ?? fallbackSound));
    setDuration(p.duration ?? segment.klingDurationSec);
    setFirstFrameMode((p.firstFrameMode as FirstFrameMode) ?? "prepared");
    setPersonaImageIndexes(
      p.personaImageIndexes?.length ? p.personaImageIndexes : [p.personaImageIndex ?? 0]
    );
    setPersonaImageRotations(parsePersonaImageRotations(p.personaImageRotations));
    setLocalPreparedFrame({ url: null, review: null });
    setArtboardLayers(normalizeArtboardLayers(segment.artboardLayers));
  }, [segment.index, fallbackResolution, fallbackAspectRatio, fallbackSound]);

  useEffect(() => {
    setArtboardLayers(normalizeArtboardLayers(segment.artboardLayers));
  }, [segment.index, segment.artboardLayers]);

  useEffect(() => {
    const url = gen.preparedFrameUrl ?? gen.sceneFrameUrl ?? null;
    if (!url) return;
    setLocalPreparedFrame((prev) => ({
      url,
      review: gen.preparedFrameReview ?? prev.review,
    }));
  }, [gen.preparedFrameUrl, gen.sceneFrameUrl, gen.preparedFrameReview]);

  useEffect(() => {
    return () => {
      if (saveLayersTimer.current) clearTimeout(saveLayersTimer.current);
    };
  }, []);

  const handleArtboardLayersChange = (layers: ArtboardLayer[]) => {
    setArtboardLayers(layers);
    if (saveLayersTimer.current) clearTimeout(saveLayersTimer.current);
    saveLayersTimer.current = setTimeout(() => {
      onArtboardLayersChange?.(layers);
    }, 600);
  };

  const { data: persona } = useQuery({
    queryKey: ["persona", personaId],
    queryFn: () => api.get<Persona>(`/personas/${personaId}`),
    enabled: personaId != null,
  });

  const personaImages = useMemo(
    () =>
      persona?.referenceImages?.map((img) => ({
        url: img.imageUrl,
        shotType: img.shotType,
        faceCropUrl: img.faceCropUrl,
      })) ??
      (segment.referenceImageUrls ?? []).map((url) => ({ url })),
    [persona?.referenceImages, segment.referenceImageUrls]
  );

  const personaImageUrls = useMemo(
    () => personaImages.map((img) => img.url),
    [personaImages]
  );

  const personaFaceCropUrls = useMemo(
    () => personaImages.map((img) => img.faceCropUrl),
    [personaImages]
  );

  const usingPreparedFrameOnArtboard =
    firstFrameMode === "prepared" && Boolean(preparedFrameUrl) && !segment.videoUrl;

  const artboardBaseRotation = useMemo(
    () =>
      usingPreparedFrameOnArtboard
        ? 0
        : getPersonaImageRotation(personaImageRotations, personaImageIndexes[0] ?? 0),
    [usingPreparedFrameOnArtboard, personaImageRotations, personaImageIndexes]
  );

  const artboardBaseUrl = useMemo(
    () =>
      resolveArtboardBaseImage({
        videoUrl: segment.videoUrl,
        continuityFrameUrl: segment.continuityFrameUrl,
        firstFrameMode,
        personaImageUrls,
        personaFaceCropUrls,
        personaImageIndex: personaImageIndexes[0] ?? 0,
        personaImageIndexes,
        preparedFrameUrl,
      }),
    [
      segment.videoUrl,
      segment.continuityFrameUrl,
      firstFrameMode,
      personaImageUrls,
      personaFaceCropUrls,
      personaImageIndexes,
      preparedFrameUrl,
    ]
  );

  const artboardBaseImageKey = usingPreparedFrameOnArtboard
    ? `prepared-${preparedFrameUrl}`
    : `ref-${personaImageIndexes[0] ?? 0}`;

  const referenceImages = useMemo(() => {
    if (segment.continuityFrameUrl) {
      return [{ url: segment.continuityFrameUrl, label: `连贯首帧 · 来自分镜 #${segment.continuityFromSegment}` }];
    }
    if (segment.referenceImageUrls?.length) {
      return segment.referenceImageUrls.map((url) => ({ url, label: "人设参考图" }));
    }
    return (persona?.referenceImages?.map((img) => ({ url: img.imageUrl, label: "人设参考图" })) ?? []);
  }, [segment.continuityFrameUrl, segment.continuityFromSegment, segment.referenceImageUrls, persona?.referenceImages]);

  const displayModel = gen.modelName ?? modelName;
  const isBusy =
    segment.taskStatus === "processing" ||
    segment.taskStatus === "pending" ||
    prepareFrameMutation.isPending;
  const recommendedDuration = segment.klingDurationSec;
  const aspectPreset = ARTBOARD_PRESETS.find((p) => p.id === aspectRatio);
  const suggestedLayers = useMemo(
    () => normalizeArtboardLayers(segment.suggestedArtboardLayers),
    [segment.suggestedArtboardLayers]
  );

  const importArtboardMutation = useMutation({
    mutationFn: () =>
      api.post(`/scripts/${scriptId}/segments/${segment.index}/artboard-from-script`),
    onSuccess: () => {
      toast.success("已从脚本导入贴图布局");
      onArtboardImported?.();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <aside className="w-[320px] shrink-0 flex flex-col border-l border-[#333] bg-[#222] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#333]">
        <div>
          <p className="text-xs font-bold text-[#f89443] tracking-wider">分镜 #{segment.index}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {segment.startSec}s–{segment.endSec}s · 可灵 {duration}s
          </p>
        </div>
        <button type="button" className={btnSecondaryClass} onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {segment.taskStatus && (
          <span
            className={cn(
              "inline-flex text-[10px] px-2 py-0.5 rounded border font-bold",
              STATUS_COLORS[segment.taskStatus] ?? STATUS_COLORS.pending
            )}
          >
            {formatTaskStatus(segment.taskStatus)}
          </span>
        )}

        <div className="rounded-lg border border-[#4a4a4a] bg-[#353535] shadow-lg overflow-hidden">
          <button
            type="button"
            disabled={isBusy}
            className="w-full p-3 flex items-center gap-3 hover:bg-[#3a3a3a]/50 transition-colors text-left disabled:opacity-50"
            onClick={() => setArtboardDialogOpen(true)}
          >
            <div className="shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#fd79a8]" />
                <span className="text-xs font-semibold tracking-wide text-gray-200">
                  画板 · DIY 编辑
                </span>
              </div>
              <SegmentArtboard
                aspectRatio={aspectRatio}
                videoUrl={segment.videoUrl}
                baseImageUrl={artboardBaseUrl}
                baseImageKey={artboardBaseImageKey}
                baseImageRotation={artboardBaseRotation}
                layers={artboardLayers}
                size="sm"
                showLabel={false}
                showSafeZone={false}
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[11px] text-gray-300 font-medium">
                {aspectPreset?.label} · {aspectRatio}
              </p>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                {artboardLayers.length > 0
                  ? `${artboardLayers.length} 个叠加元素 · 首帧：${firstFrameModeLabel(firstFrameMode)}`
                  : suggestedLayers.length > 0
                    ? `脚本识别 ${suggestedLayers.length} 个贴图 · 首帧：${firstFrameModeLabel(firstFrameMode)}`
                    : `首帧：${firstFrameModeLabel(firstFrameMode)} · 贴纸 / 标签 / 比例`}
              </p>
              {aspectPreset && (
                <p className="text-[9px] text-gray-600 truncate">{aspectPreset.platforms}</p>
              )}
              <span className="inline-flex items-center gap-1 text-[10px] text-[#f89443] mt-1">
                <Maximize2 className="w-3 h-3" />
                点击打开画板
              </span>
            </div>
          </button>
        </div>

        <SegmentArtboardEditor
          scriptId={scriptId}
          segmentIndex={segment.index}
          aspectRatio={aspectRatio}
          onAspectRatioChange={(v) => {
            setAspectRatio(v);
            onAspectRatioChange?.(v);
          }}
          videoUrl={segment.videoUrl}
          baseImageUrl={artboardBaseUrl}
          baseImageKey={artboardBaseImageKey}
          firstFrameMode={firstFrameMode}
          personaImageIndexes={personaImageIndexes}
          personaImageRotations={personaImageRotations}
          personaImages={personaImages}
          baseImageRotation={artboardBaseRotation}
          preparedFrameUrl={preparedFrameUrl}
          preparedFrameReview={preparedReview}
          preparingFrame={prepareFrameMutation.isPending}
          onFirstFrameModeChange={handleFirstFrameModeChange}
          onPersonaImageIndexesChange={handlePersonaImageIndexesChange}
          onPersonaImageRotationsChange={handlePersonaImageRotationsChange}
          onPrepareFrame={(opts) => prepareFrameMutation.mutate(opts)}
          layers={artboardLayers}
          onChange={handleArtboardLayersChange}
          open={artboardDialogOpen}
          onOpenChange={setArtboardDialogOpen}
          disabled={isBusy}
          continuityEnabled={continuityEnabled}
          continuityFromSegment={segment.continuityFromSegment}
          isFirstInOrder={isFirstInOrder}
          visualDescription={segment.visualDescription}
          suggestedLayers={suggestedLayers}
          onImportFromScript={() => importArtboardMutation.mutate()}
          importingFromScript={importArtboardMutation.isPending}
        />

        {segment.videoUrl && (
          <NodeCard title="片段预览" accent="#74b9ff">
            <video src={segment.videoUrl} controls className="w-full rounded border border-[#444] bg-black" />
          </NodeCard>
        )}

        <NodeCard title="用户提示词" accent="#f89443">
          <NodeField label="可编辑 · 提交后用于重新生成">
            <textarea
              className={cn(inputClass, "min-h-[140px] resize-y font-mono text-xs leading-relaxed")}
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="分镜口播、画面描述、结构说明..."
            />
          </NodeField>
          {segment.spokenText && (
            <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
              <span className="text-gray-600">原始口播：</span>
              {segment.spokenText}
            </p>
          )}
          {segment.visualDescription && (
            <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
              <span className="text-gray-600">画面：</span>
              {segment.visualDescription}
            </p>
          )}
        </NodeCard>

        {segment.expandedPrompt && (
          <NodeCard title="Agent 扩写提示词" accent="#a29bfe">
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] text-gray-400 mb-2 hover:text-gray-300"
              onClick={() => setShowExpanded((v) => !v)}
            >
              {showExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showExpanded ? "收起" : "展开查看完整扩写"}
            </button>
            {showExpanded && (
              <pre className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto rounded border border-[#444] bg-[#1a1a1a] p-2">
                {segment.expandedPrompt}
              </pre>
            )}
          </NodeCard>
        )}

        <NodeCard title="参考图" accent="#00cec9">
          {continuityEnabled && isFirstInOrder && (
            <p className="text-[10px] text-[#00cec9] mb-2 leading-relaxed">
              连贯性已开启：首段仍使用人设参考图
            </p>
          )}
          {continuityEnabled && !isFirstInOrder && !segment.continuityFrameUrl && (
            <p className="text-[10px] text-amber-500/90 mb-2 leading-relaxed">
              连贯性已开启：需先完成上一段生成，再提交本分镜
            </p>
          )}
          {referenceImages.length === 0 ? (
            <p className="text-[11px] text-gray-500">未关联人设参考图，请先在左侧选择人设</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {referenceImages.map((item, i) => (
                <div key={item.url + i} className="space-y-1">
                  <div className="aspect-square rounded border border-[#555] overflow-hidden">
                    <img src={item.url} alt={`参考图 ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                  <p className="text-[9px] text-gray-500 text-center leading-tight">{item.label}</p>
                </div>
              ))}
            </div>
          )}
        </NodeCard>

        <NodeCard title="生成参数" accent="#74b9ff">
          <div className="space-y-2">
            <NodeField label="模型">
              <div className="text-xs text-gray-300 font-mono px-2 py-1.5 rounded bg-[#2a2a2a] border border-[#444]">
                {displayModel}
              </div>
            </NodeField>
            <NodeField label={`可灵生成时长：${duration} 秒`}>
              <input
                type="range"
                className="w-full accent-[#74b9ff]"
                min={effectiveMinDuration}
                max={maxKlingDuration}
                step={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
              <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                脚本本分镜约 {naturalSec.toFixed(1)}s，推荐 {recommendedDuration}s。
                可灵 v3 支持 {effectiveMinDuration}–{maxKlingDuration} 秒，按 1 秒递增。
              </p>
            </NodeField>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              首帧底图请在上方「画板」中配置：{firstFrameModeLabel(firstFrameMode)}
              {firstFrameMode === "prepared" && !preparedFrameUrl ? "（需先生成首屏）" : ""}
            </p>
            <NodeField label="分辨率">
              <select
                className={selectClass}
                value={resolution}
                onChange={(e) => setResolution(e.target.value as SegmentRegeneratePayload["resolution"])}
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="4K">4K</option>
              </select>
            </NodeField>
            <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={sound}
                onChange={(e) => setSound(e.target.checked)}
                className="accent-[#f89443]"
              />
              同步音效
            </label>
            {(gen.continuity || segment.continuityFromSegment) && (
              <p className="text-[10px] text-[#00cec9] leading-relaxed">
                {segment.continuityFromSegment
                  ? `连贯性 · 首帧来自分镜 #${segment.continuityFromSegment}`
                  : "连贯性模式（首段仍用人设参考图）"}
              </p>
            )}
            {gen.sceneComposeWarning && (
              <p className="text-[10px] text-amber-400 leading-relaxed">
                场景合成失败：{gen.sceneComposeWarning}
              </p>
            )}
            {segment.taskId && (
              <p className="text-[10px] text-gray-600 font-mono">任务 #{segment.taskId}</p>
            )}
          </div>
        </NodeCard>
      </div>

      <div className="p-3 border-t border-[#333] space-y-2">
        <button
          type="button"
          className={btnPrimaryClass + " w-full"}
          disabled={!personaId || !userPrompt.trim() || isBusy || isRegenerating}
          onClick={() =>
            onRegenerate({
              userPrompt: userPrompt.trim(),
              resolution,
              aspectRatio,
              sound,
              duration,
              sceneCompose,
            })
          }
        >
          {isRegenerating ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              提交中...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Play className="w-4 h-4 fill-current" />
              {segment.taskId ? "保存并重新生成" : "立即生成"}
            </span>
          )}
        </button>
        {onDelete && (
          <button
            type="button"
            className={btnDangerClass + " w-full py-2"}
            disabled={isBusy || isDeleting}
            onClick={onDelete}
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" /> 从工作流移除
              </>
            )}
          </button>
        )}
        {isBusy && (
          <p className="text-[10px] text-center text-gray-500">当前分镜正在生成，请稍后再微调</p>
        )}
      </div>
    </aside>
  );
}
