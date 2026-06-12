import { useCallback, useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
  Type,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SLICE_PRESETS,
  STICKER_PRESETS,
  clampLayerWidth,
  createArtboardLayer,
  layerTypeLabel,
  normalizeArtboardLayers,
  type ArtboardLayer,
} from "@/lib/artboard-types";
import { uploadArtboardImage } from "@/lib/artboard-upload";
import { toast } from "sonner";
import { artboardSize, AspectRatioPicker, type ArtboardAspectRatio } from "./SegmentArtboard";
import { ArtboardLayerView, layerDisplayLabel } from "./ArtboardLayerView";
import ArtboardFirstFramePanel from "./ArtboardFirstFramePanel";
import type { FirstFrameMode, PersonaImageOption, PersonaImageRotations } from "@/lib/artboard-base";
import {
  getPersonaImageRotation,
  normalizeRotation,
  PERSONA_BASE_REF_ID,
  rotationTransformStyle,
} from "@/lib/artboard-base";
import type { PreparedFrameReview } from "@/lib/api";

type Props = {
  scriptId: number;
  segmentIndex: number;
  aspectRatio: ArtboardAspectRatio;
  onAspectRatioChange?: (value: ArtboardAspectRatio) => void;
  videoUrl?: string | null;
  layers: ArtboardLayer[];
  onChange: (layers: ArtboardLayer[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  continuityEnabled?: boolean;
  continuityFromSegment?: number | null;
  isFirstInOrder?: boolean;
  visualDescription?: string | null;
  suggestedLayers?: ArtboardLayer[];
  onImportFromScript?: () => void;
  importingFromScript?: boolean;
  baseImageUrl?: string | null;
  baseImageKey?: string;
  baseImageRotation?: number;
  firstFrameMode?: FirstFrameMode;
  personaImageIndexes?: number[];
  personaImageRotations?: PersonaImageRotations;
  personaImages?: PersonaImageOption[];
  preparedFrameUrl?: string | null;
  preparedFrameReview?: PreparedFrameReview | null;
  preparingFrame?: boolean;
  onFirstFrameModeChange?: (mode: FirstFrameMode) => void;
  onPersonaImageIndexesChange?: (indexes: number[]) => void;
  onPersonaImageRotationsChange?: (rotations: PersonaImageRotations) => void;
  onPrepareFrame?: (opts?: { applyReviewFeedback?: boolean }) => void;
};

type DragState = {
  id: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  rect: DOMRect;
};

type ResizeState = {
  id: string;
  startX: number;
  origW: number;
  rect: DOMRect;
};

const EXPANDED_BOARD_W = 300;

function useArtboardEditorState(
  scriptId: number,
  segmentIndex: number,
  layers: ArtboardLayer[],
  onChange: (layers: ArtboardLayer[]) => void,
  disabled?: boolean
) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [textDraft, setTextDraft] = useState("");

  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !layers.some((l) => l.id === selectedId)) {
      setSelectedId(null);
    }
  }, [layers, selectedId]);

  const updateLayer = useCallback(
    (id: string, patch: Partial<ArtboardLayer>) => {
      onChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    },
    [layers, onChange]
  );

  const selectLayer = useCallback(
    (id: string) => {
      setSelectedId(id);
      const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex ?? 0), 0);
      const target = layers.find((l) => l.id === id);
      if (target && (target.zIndex ?? 0) < maxZ) {
        onChange(layers.map((l) => (l.id === id ? { ...l, zIndex: maxZ + 1 } : l)));
      }
    },
    [layers, onChange]
  );

  const addLayer = useCallback(
    (partial: Omit<ArtboardLayer, "id">) => {
      const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex ?? 0), 0);
      const newLayer = createArtboardLayer({ ...partial, zIndex: maxZ + 1 });
      onChange([...layers, newLayer]);
      setSelectedId(newLayer.id);
      return newLayer;
    },
    [layers, onChange]
  );

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    onChange(layers.filter((l) => l.id !== selectedId));
    setSelectedId(null);
  }, [layers, onChange, selectedId]);

  const scaleSelected = useCallback(
    (delta: number) => {
      if (!selectedId) return;
      const layer = layers.find((l) => l.id === selectedId);
      if (!layer) return;
      updateLayer(selectedId, { w: clampLayerWidth(layer.w + delta) });
    },
    [layers, selectedId, updateLayer]
  );

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadArtboardImage(scriptId, segmentIndex, file);
      addLayer({ type: "image", content: url, x: 50, y: 50, w: 28 });
      toast.success("贴图已添加");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return {
    fileRef,
    selectedId,
    selectedLayer,
    setSelectedId,
    selectLayer,
    uploading,
    textDraft,
    setTextDraft,
    updateLayer,
    addLayer,
    removeSelected,
    scaleSelected,
    handleUpload,
    disabled,
  };
}

type CanvasProps = {
  aspectRatio: ArtboardAspectRatio;
  videoUrl?: string | null;
  baseImageUrl?: string | null;
  baseImageKey?: string;
  baseImageRotation?: number;
  layers: ArtboardLayer[];
  boardMaxWidth: number;
  boardRef: React.RefObject<HTMLDivElement | null>;
  selectedId: string | null;
  disabled?: boolean;
  onSelectClear: () => void;
  onPointerDown: (e: React.PointerEvent, layerId: string) => void;
  onResizePointerDown: (e: React.PointerEvent, layerId: string) => void;
  baseImageEditable?: boolean;
  baseImageSelected?: boolean;
  onBaseImageSelect?: () => void;
  onBaseImageRotate?: (delta: number) => void;
  className?: string;
};

function ArtboardCanvas({
  aspectRatio,
  videoUrl,
  baseImageUrl,
  baseImageKey,
  baseImageRotation = 0,
  layers,
  boardMaxWidth,
  boardRef,
  selectedId,
  disabled,
  onSelectClear,
  onPointerDown,
  onResizePointerDown,
  baseImageEditable,
  baseImageSelected,
  onBaseImageSelect,
  onBaseImageRotate,
  className,
}: CanvasProps) {
  const { width, height } = artboardSize(aspectRatio, boardMaxWidth);
  const isPortrait = aspectRatio === "9:16";
  const sortedLayers = [...layers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  return (
    <div
      ref={boardRef}
      className={cn(
        "relative rounded-md border-2 bg-[#0a0a0a] shadow-inner overflow-hidden shrink-0",
        isPortrait ? "border-[#fd79a8]/50" : "border-[#74b9ff]/50",
        disabled && "opacity-60",
        className
      )}
      style={{ width, height }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onSelectClear();
      }}
    >
      {videoUrl ? (
        <video
          src={videoUrl}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          muted
          playsInline
        />
      ) : baseImageUrl ? (
        <div
          className={cn(
            "absolute inset-0 z-[2] flex items-center justify-center overflow-visible",
            baseImageEditable ? "cursor-pointer" : "pointer-events-none"
          )}
          onPointerDown={
            baseImageEditable
              ? (e) => {
                  e.stopPropagation();
                  onBaseImageSelect?.();
                }
              : undefined
          }
        >
          <div
            className={cn(
              "relative inline-flex items-center justify-center max-w-[92%] max-h-[92%]",
              baseImageSelected &&
                baseImageEditable &&
                "ring-2 ring-[#74b9ff] ring-offset-2 ring-offset-[#0a0a0a] rounded-sm bg-[#74b9ff]/5"
            )}
          >
            <img
              key={baseImageKey ?? baseImageUrl}
              src={baseImageUrl}
              alt="画板首帧"
              className="max-w-full max-h-full object-contain select-none"
              style={rotationTransformStyle(baseImageRotation)}
              draggable={false}
            />
            {baseImageSelected && baseImageEditable && !disabled && (
              <div
                className="absolute -bottom-9 left-1/2 -translate-x-1/2 flex items-center gap-1 z-30"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="flex items-center gap-0.5 px-2 py-1 rounded border border-[#74b9ff]/50 bg-[#1a1a1a]/95 text-[10px] text-[#74b9ff] hover:bg-[#74b9ff]/15 shadow-lg"
                  onClick={() => onBaseImageRotate?.(-90)}
                >
                  <RotateCcw className="w-3 h-3" />
                  左转
                </button>
                {baseImageRotation > 0 && (
                  <span className="text-[9px] text-gray-400 px-1">{baseImageRotation}°</span>
                )}
                <button
                  type="button"
                  className="flex items-center gap-0.5 px-2 py-1 rounded border border-[#74b9ff]/50 bg-[#1a1a1a]/95 text-[10px] text-[#74b9ff] hover:bg-[#74b9ff]/15 shadow-lg"
                  onClick={() => onBaseImageRotate?.(90)}
                >
                  <RotateCw className="w-3 h-3" />
                  右转
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-gray-600 pointer-events-none">
          <span className="text-lg opacity-40">{isPortrait ? "📱" : "🖥"}</span>
          <span className="text-[8px] font-mono opacity-60">{aspectRatio}</span>
        </div>
      )}

      {isPortrait && (
        <>
          <div className="absolute top-0 left-0 right-0 h-[12%] bg-gradient-to-b from-black/35 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-[18%] bg-gradient-to-t from-black/35 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 top-[12%] bottom-[18%] border border-dashed border-white/10 pointer-events-none rounded-sm m-0.5" />
        </>
      )}

      {sortedLayers.map((layer) => (
        <ArtboardLayerView
          key={layer.id}
          layer={layer}
          boardWidth={width}
          selected={selectedId === layer.id}
          editable={!disabled}
          onPointerDown={onPointerDown}
          onResizePointerDown={onResizePointerDown}
        />
      ))}
    </div>
  );
}

type ToolbarProps = {
  layers: ArtboardLayer[];
  selectedId: string | null;
  selectedLayer: ArtboardLayer | null;
  disabled?: boolean;
  uploading: boolean;
  textDraft: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onTextDraftChange: (value: string) => void;
  onAddLayer: (partial: Omit<ArtboardLayer, "id">) => void;
  onSelectLayer: (id: string) => void;
  onRemoveSelected: () => void;
  onScaleSelected: (delta: number) => void;
  onUpdateLayer: (id: string, patch: Partial<ArtboardLayer>) => void;
  onUpload: (file: File) => void;
  compact?: boolean;
  baseRefSelected?: boolean;
  baseImageRotation?: number;
  onSelectBaseRef?: () => void;
  onRotateBaseRef?: (delta: number) => void;
  showBaseRefInList?: boolean;
};

function ArtboardToolbar({
  layers,
  selectedId,
  selectedLayer,
  disabled,
  uploading,
  textDraft,
  fileRef,
  onTextDraftChange,
  onAddLayer,
  onSelectLayer,
  onRemoveSelected,
  onScaleSelected,
  onUpdateLayer,
  onUpload,
  compact,
  baseRefSelected,
  baseImageRotation = 0,
  onSelectBaseRef,
  onRotateBaseRef,
  showBaseRefInList,
}: ToolbarProps) {
  const sortedForList = [...layers].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));

  return (
    <div className={cn("space-y-2", compact ? "" : "min-w-0")}>
      {(showBaseRefInList || layers.length > 0) && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-gray-500 font-semibold">画板元素 · 点击选中</p>
          <div className="flex flex-col gap-1 max-h-28 overflow-y-auto pr-0.5">
            {showBaseRefInList && (
              <button
                type="button"
                disabled={disabled}
                onClick={onSelectBaseRef}
                className={cn(
                  "flex items-center gap-2 w-full text-left text-[10px] px-2 py-1.5 rounded border transition-colors",
                  baseRefSelected
                    ? "border-[#74b9ff] bg-[#74b9ff]/10 text-gray-100"
                    : "border-[#444] bg-[#2a2a2a] text-gray-400 hover:border-[#666]"
                )}
              >
                <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-[#333] text-[#74b9ff] font-mono flex items-center gap-0.5">
                  <User className="w-2.5 h-2.5" />
                  参考
                </span>
                <span className="truncate flex-1">人设参考图</span>
                <span className="shrink-0 text-gray-600 font-mono">
                  {baseImageRotation > 0 ? `${baseImageRotation}°` : "底图"}
                </span>
              </button>
            )}
            {sortedForList.map((layer) => {
              const active = selectedId === layer.id;
              return (
                <button
                  key={layer.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectLayer(layer.id)}
                  className={cn(
                    "flex items-center gap-2 w-full text-left text-[10px] px-2 py-1.5 rounded border transition-colors",
                    active
                      ? "border-[#f89443] bg-[#f89443]/10 text-gray-100"
                      : "border-[#444] bg-[#2a2a2a] text-gray-400 hover:border-[#666]"
                  )}
                >
                  <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-[#333] text-gray-500 font-mono">
                    {layerTypeLabel(layer.type)}
                  </span>
                  <span className="truncate flex-1">{layerDisplayLabel(layer)}</span>
                  <span className="shrink-0 text-gray-600 font-mono">{Math.round(layer.w)}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {baseRefSelected && !disabled && (
        <div className="rounded-lg border border-[#74b9ff]/40 bg-[#74b9ff]/5 p-2 space-y-2">
          <span className="text-[10px] text-[#74b9ff] font-semibold">已选中 · 人设参考图</span>
          <p className="text-[9px] text-gray-500">点击画板中的人像或下方按钮旋转朝向</p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] px-3 py-1.5 rounded border border-[#74b9ff]/50 bg-[#333] text-[#74b9ff] hover:bg-[#74b9ff]/15"
              onClick={() => onRotateBaseRef?.(-90)}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              左转 90°
            </button>
            <span className="text-[10px] text-gray-500 font-mono w-8 text-center">
              {baseImageRotation}°
            </span>
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] px-3 py-1.5 rounded border border-[#74b9ff]/50 bg-[#333] text-[#74b9ff] hover:bg-[#74b9ff]/15"
              onClick={() => onRotateBaseRef?.(90)}
            >
              <RotateCw className="w-3.5 h-3.5" />
              右转 90°
            </button>
          </div>
        </div>
      )}

      {selectedLayer && !disabled && (
        <div className="rounded-lg border border-[#f89443]/40 bg-[#f89443]/5 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-[#f89443] font-semibold">
              已选中 · {layerTypeLabel(selectedLayer.type)}
            </span>
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] text-[#ff7675] hover:text-[#ff5252]"
              onClick={onRemoveSelected}
            >
              <Trash2 className="w-3 h-3" />
              删除
            </button>
          </div>
          <p className="text-[9px] text-gray-500">拖拽移动 · 右下角手柄缩放 · 或使用下方控件</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1 rounded border border-[#555] bg-[#333] text-gray-300 hover:border-[#777] disabled:opacity-40"
              onClick={() => onScaleSelected(-3)}
              title="缩小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={4}
              max={80}
              step={1}
              value={Math.round(selectedLayer.w)}
              onChange={(e) =>
                onUpdateLayer(selectedLayer.id, { w: clampLayerWidth(Number(e.target.value)) })
              }
              className="flex-1 min-w-0 h-1 accent-[#f89443]"
            />
            <button
              type="button"
              className="p-1 rounded border border-[#555] bg-[#333] text-gray-300 hover:border-[#777] disabled:opacity-40"
              onClick={() => onScaleSelected(3)}
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded border border-[#555] bg-[#333] text-gray-300"
              onClick={() => onScaleSelected(-1)}
            >
              <Minus className="w-3 h-3" />
              微调
            </button>
            <span className="text-[10px] text-gray-500 font-mono w-10 text-center">
              {Math.round(selectedLayer.w)}%
            </span>
            <button
              type="button"
              className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded border border-[#555] bg-[#333] text-gray-300"
              onClick={() => onScaleSelected(1)}
            >
              <Plus className="w-3 h-3" />
              微调
            </button>
          </div>
        </div>
      )}

      {!selectedLayer && !baseRefSelected && (layers.length > 0 || showBaseRefInList) && !disabled && (
        <p className="text-[9px] text-gray-600 text-center">点击画板中的人像或贴图进行选中</p>
      )}

      <div className="space-y-2">
        <p className="text-[10px] text-gray-500 font-semibold">贴纸</p>
        <div className="flex flex-wrap gap-1">
          {STICKER_PRESETS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={disabled || layers.length >= 24}
              className="w-7 h-7 rounded border border-[#444] bg-[#2a2a2a] hover:border-[#666] text-base disabled:opacity-40"
              onClick={() => onAddLayer({ type: "sticker", content: emoji, x: 50, y: 50, w: 18 })}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] text-gray-500 font-semibold">切片标签</p>
        <div className="flex flex-wrap gap-1">
          {SLICE_PRESETS.map((slice) => (
            <button
              key={slice.label}
              type="button"
              disabled={disabled || layers.length >= 24}
              className="text-[10px] px-2 py-0.5 rounded text-white font-bold disabled:opacity-40"
              style={{ backgroundColor: slice.color }}
              onClick={() =>
                onAddLayer({
                  type: "slice",
                  content: slice.label,
                  color: slice.color,
                  x: 72,
                  y: 18,
                  w: 22,
                })
              }
            >
              {slice.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] text-gray-500 font-semibold flex items-center gap-1">
          <Type className="w-3 h-3" />
          自定义文字
        </p>
        <div className="flex gap-1">
          <input
            value={textDraft}
            onChange={(e) => onTextDraftChange(e.target.value)}
            disabled={disabled}
            placeholder="输入文案…"
            maxLength={20}
            className="flex-1 min-w-0 text-xs px-2 py-1 rounded border border-[#444] bg-[#1a1a1a] text-gray-200"
          />
          <button
            type="button"
            disabled={disabled || !textDraft.trim() || layers.length >= 24}
            className="text-[10px] px-2 py-1 rounded border border-[#555] bg-[#333] text-gray-200 disabled:opacity-40"
            onClick={() => {
              onAddLayer({ type: "text", content: textDraft.trim(), x: 50, y: 82, w: 30 });
              onTextDraftChange("");
            }}
          >
            添加
          </button>
        </div>
      </div>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onUpload(file);
          }}
        />
        <button
          type="button"
          disabled={disabled || uploading || layers.length >= 24}
          className="w-full flex items-center justify-center gap-1.5 text-[10px] py-1.5 rounded border border-[#555] bg-[#2a2a2a] text-gray-300 hover:border-[#777] disabled:opacity-40"
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
          上传 DIY 贴图
        </button>
      </div>

      {layers.length > 0 && (
        <p className="text-[9px] text-gray-600 text-center leading-relaxed">
          {layers.length} 个叠加元素 · 生成时仅输出干净主画面，贴图由画板负责
        </p>
      )}
    </div>
  );
}

type EditorSurfaceProps = {
  aspectRatio: ArtboardAspectRatio;
  videoUrl?: string | null;
  baseImageUrl?: string | null;
  baseImageKey?: string;
  baseImageRotation?: number;
  firstFrameMode?: FirstFrameMode;
  personaImageIndexes?: number[];
  personaImageRotations?: PersonaImageRotations;
  onPersonaImageRotationsChange?: (rotations: PersonaImageRotations) => void;
  layers: ArtboardLayer[];
  boardMaxWidth: number;
  disabled?: boolean;
  editor: ReturnType<typeof useArtboardEditorState>;
  layout?: "stack" | "split";
};

function ArtboardEditorSurface({
  aspectRatio,
  videoUrl,
  baseImageUrl,
  baseImageKey,
  baseImageRotation = 0,
  firstFrameMode = "prepared",
  personaImageIndexes = [0],
  personaImageRotations = {},
  onPersonaImageRotationsChange,
  layers,
  boardMaxWidth,
  disabled,
  editor,
  layout = "stack",
}: EditorSurfaceProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const baseImageEditable = firstFrameMode === "persona" && Boolean(baseImageUrl) && !videoUrl;
  const baseRefSelected = editor.selectedId === PERSONA_BASE_REF_ID;

  const handleRotateBase = useCallback(
    (delta: number) => {
      const idx = personaImageIndexes[0] ?? 0;
      const current = getPersonaImageRotation(personaImageRotations, idx);
      const next = normalizeRotation(current + delta);
      const updated = { ...personaImageRotations };
      if (next) updated[idx] = next;
      else delete updated[idx];
      onPersonaImageRotationsChange?.(updated);
    },
    [personaImageIndexes, personaImageRotations, onPersonaImageRotationsChange]
  );
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, layerId: string) => {
      if (disabled) return;
      e.stopPropagation();
      const layer = layers.find((l) => l.id === layerId);
      const rect = boardRef.current?.getBoundingClientRect();
      if (!layer || !rect) return;
      editor.selectLayer(layerId);
      dragRef.current = {
        id: layerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: layer.x,
        origY: layer.y,
        rect,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [disabled, editor, layers]
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, layerId: string) => {
      if (disabled) return;
      e.stopPropagation();
      const layer = layers.find((l) => l.id === layerId);
      const rect = boardRef.current?.getBoundingClientRect();
      if (!layer || !rect) return;
      editor.selectLayer(layerId);
      resizeRef.current = {
        id: layerId,
        startX: e.clientX,
        origW: layer.w,
        rect,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [disabled, editor, layers]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const dx = ((e.clientX - drag.startX) / drag.rect.width) * 100;
        const dy = ((e.clientY - drag.startY) / drag.rect.height) * 100;
        editor.updateLayer(drag.id, {
          x: Math.max(2, Math.min(98, drag.origX + dx)),
          y: Math.max(2, Math.min(98, drag.origY + dy)),
        });
        return;
      }
      const resize = resizeRef.current;
      if (resize) {
        const dx = ((e.clientX - resize.startX) / resize.rect.width) * 100;
        editor.updateLayer(resize.id, {
          w: clampLayerWidth(resize.origW + dx * 2),
        });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [editor]);

  const canvas = (
    <div className={cn("flex justify-center", layout === "split" && "items-start")}>
      <ArtboardCanvas
        aspectRatio={aspectRatio}
        videoUrl={videoUrl}
        baseImageUrl={baseImageUrl}
        baseImageKey={baseImageKey}
        baseImageRotation={baseImageRotation}
        baseImageEditable={baseImageEditable}
        baseImageSelected={baseRefSelected}
        onBaseImageSelect={() => editor.selectLayer(PERSONA_BASE_REF_ID)}
        onBaseImageRotate={handleRotateBase}
        layers={layers}
        boardMaxWidth={boardMaxWidth}
        boardRef={boardRef}
        selectedId={editor.selectedId}
        disabled={disabled}
        onSelectClear={() => editor.setSelectedId(null)}
        onPointerDown={handlePointerDown}
        onResizePointerDown={handleResizePointerDown}
      />
    </div>
  );

  const toolbar = (
    <ArtboardToolbar
      layers={layers}
      selectedId={editor.selectedId}
      selectedLayer={editor.selectedLayer}
      disabled={disabled}
      uploading={editor.uploading}
      textDraft={editor.textDraft}
      fileRef={editor.fileRef}
      onTextDraftChange={editor.setTextDraft}
      onAddLayer={editor.addLayer}
      onSelectLayer={editor.selectLayer}
      onRemoveSelected={editor.removeSelected}
      onScaleSelected={editor.scaleSelected}
      onUpdateLayer={editor.updateLayer}
      onUpload={editor.handleUpload}
      compact={layout === "split"}
      baseRefSelected={baseRefSelected}
      baseImageRotation={baseImageRotation}
      onSelectBaseRef={() => editor.selectLayer(PERSONA_BASE_REF_ID)}
      onRotateBaseRef={handleRotateBase}
      showBaseRefInList={baseImageEditable}
    />
  );

  if (layout === "split") {
    return (
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {canvas}
        <div className="flex-1 min-w-0 w-full lg:max-h-[70vh] overflow-y-auto pr-1">{toolbar}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {canvas}
      {toolbar}
    </div>
  );
}

export default function SegmentArtboardEditor({
  scriptId,
  segmentIndex,
  aspectRatio,
  onAspectRatioChange,
  videoUrl,
  layers,
  onChange,
  open,
  onOpenChange,
  disabled,
  continuityEnabled,
  continuityFromSegment,
  isFirstInOrder,
  visualDescription,
  suggestedLayers = [],
  onImportFromScript,
  importingFromScript,
  baseImageUrl,
  baseImageKey,
  baseImageRotation = 0,
  firstFrameMode = "prepared",
  personaImageIndexes = [0],
  personaImageRotations = {},
  personaImages = [],
  preparedFrameUrl,
  preparedFrameReview,
  preparingFrame,
  onFirstFrameModeChange,
  onPersonaImageIndexesChange,
  onPersonaImageRotationsChange,
  onPrepareFrame,
}: Props) {
  const suggested = normalizeArtboardLayers(suggestedLayers);
  const editor = useArtboardEditorState(scriptId, segmentIndex, layers, onChange, disabled);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const canGeneratePrepared = isFirstInOrder || !continuityEnabled;

  if (!open) return null;

  const displayBaseUrl =
    firstFrameMode === "prepared" && preparedFrameUrl && !videoUrl
      ? preparedFrameUrl
      : baseImageUrl;
  const displayBaseKey =
    firstFrameMode === "prepared" && preparedFrameUrl && !videoUrl
      ? `prepared-${preparedFrameUrl}`
      : baseImageKey;
  const displayBaseRotation =
    firstFrameMode === "prepared" && preparedFrameUrl && !videoUrl ? 0 : baseImageRotation;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75" onClick={() => onOpenChange(false)} aria-hidden />
      <div className="relative z-10 w-full max-w-4xl max-h-[92vh] flex flex-col rounded-lg border border-[#444] bg-[#222] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] bg-[#1a1a1a] shrink-0">
          <div>
            <p className="text-sm font-semibold text-gray-100">画板 · DIY 编辑</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              分镜 #{segmentIndex} · {aspectRatio} · 选中后可缩放 · Esc 关闭
            </p>
          </div>
          <button
            type="button"
            className="p-1.5 rounded border border-[#555] bg-[#333] text-gray-300 hover:border-[#777]"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {continuityEnabled && (
            <p className="text-[10px] leading-relaxed rounded border px-2.5 py-2 bg-[#74b9ff]/10 border-[#74b9ff]/30 text-[#74b9ff]">
              {isFirstInOrder
                ? "镜头连贯性已开启：首段先生成口播首屏再生成视频；画板贴图按脚本布局配置，主画面由 AI 生成。"
                : continuityFromSegment != null
                  ? `镜头连贯性已开启：主画面从分镜 #${continuityFromSegment} 尾帧延续；贴图按脚本/画板布局独立叠加。`
                  : "镜头连贯性已开启：需先完成上一段生成；贴图布局与镜头连贯可同时使用。"}
            </p>
          )}
          {(visualDescription || suggested.length > 0) && (
            <div className="rounded-lg border border-[#a29bfe]/35 bg-[#a29bfe]/8 p-3 space-y-2">
              <p className="text-[10px] font-semibold text-[#a29bfe] flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                脚本拆解 · 贴图说明
              </p>
              {visualDescription && (
                <p className="text-[10px] text-gray-400 leading-relaxed">{visualDescription}</p>
              )}
              {suggested.length > 0 ? (
                <>
                  <p className="text-[10px] text-gray-500">
                    已从脚本识别 {suggested.length} 个贴图位：
                    {suggested.map((l) => layerDisplayLabel(l)).join(" · ")}
                  </p>
                  <button
                    type="button"
                    disabled={disabled || importingFromScript}
                    className="w-full text-[10px] py-1.5 rounded border border-[#a29bfe]/50 bg-[#a29bfe]/15 text-[#a29bfe] hover:bg-[#a29bfe]/25 disabled:opacity-40 flex items-center justify-center gap-1"
                    onClick={onImportFromScript}
                  >
                    {importingFromScript ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    从脚本导入贴图布局
                  </button>
                  <p className="text-[9px] text-gray-600 leading-relaxed">
                    导入后生成 prompt 会按布局预留贴图区域，提高主画面与目标视频的匹配度
                  </p>
                </>
              ) : (
                <p className="text-[9px] text-gray-600">
                  未识别到结构化贴图。重新拆解脚本时可输出 overlays 字段，或手动添加贴图。
                </p>
              )}
            </div>
          )}
          {!continuityEnabled || isFirstInOrder ? (
            <ArtboardFirstFramePanel
              firstFrameMode={firstFrameMode}
              personaImageIndexes={personaImageIndexes}
              personaImageRotations={personaImageRotations}
              personaImages={personaImages}
              preparedFrameUrl={preparedFrameUrl}
              preparedReview={preparedFrameReview}
              disabled={disabled}
              preparing={preparingFrame}
              canGeneratePrepared={canGeneratePrepared}
              onModeChange={(mode) => onFirstFrameModeChange?.(mode)}
              onPersonaImageIndexesChange={(indexes) => onPersonaImageIndexesChange?.(indexes)}
              onPersonaImageRotationsChange={(rotations) => onPersonaImageRotationsChange?.(rotations)}
              onPrepareFrame={(opts) => onPrepareFrame?.(opts)}
            />
          ) : null}
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500 font-semibold">画板预览 · 首帧 + 贴图</p>
            {baseImageUrl && !videoUrl && firstFrameMode === "persona" && (
              <p className="text-[9px] text-[#74b9ff]/80">点击人像可选中，使用左转/右转校正朝向</p>
            )}
            {displayBaseUrl && !videoUrl && firstFrameMode === "prepared" && !preparedFrameUrl && (
              <p className="text-[9px] text-[#74b9ff]/80">预览为已提取人脸，生成时将以人脸为参考一体生成完整人物与场景</p>
            )}
            {displayBaseUrl && !videoUrl && firstFrameMode === "prepared" && preparedFrameUrl && (
              <p className="text-[9px] text-[#00cec9]/90">画板底图已同步为已生成口播首屏，贴图将叠加在此画面上</p>
            )}
            <ArtboardEditorSurface
            aspectRatio={aspectRatio}
            videoUrl={videoUrl}
            baseImageUrl={displayBaseUrl}
            baseImageKey={displayBaseKey}
            baseImageRotation={displayBaseRotation}
            firstFrameMode={firstFrameMode}
            personaImageIndexes={personaImageIndexes}
            personaImageRotations={personaImageRotations}
            onPersonaImageRotationsChange={onPersonaImageRotationsChange}
            layers={layers}
            boardMaxWidth={EXPANDED_BOARD_W}
            disabled={disabled}
            editor={editor}
            layout="split"
          />
          </div>
          {onAspectRatioChange && (
            <div className="pt-2 border-t border-[#333]">
              <p className="text-[10px] text-gray-500 mb-2">成片比例</p>
              <AspectRatioPicker
                value={aspectRatio}
                onChange={onAspectRatioChange}
                disabled={disabled}
                compact
              />
            </div>
          )}
        </div>
        <div className="flex justify-end px-4 py-3 border-t border-[#333] bg-[#1a1a1a] shrink-0">
          <button
            type="button"
            className="text-xs px-4 py-1.5 rounded border border-[#f89443] bg-[#f89443]/15 text-[#f89443] hover:bg-[#f89443]/25"
            onClick={() => onOpenChange(false)}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
