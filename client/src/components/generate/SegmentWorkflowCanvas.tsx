import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Loader2, Play, RefreshCw, Trash2 } from "lucide-react";
import { api, type ScriptSegment, type ScriptSegments } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  STATUS_COLORS,
  btnPrimaryClass,
  btnSecondaryClass,
  formatTaskStatus,
} from "./console-ui";
import { WorkflowWires, WorkflowMinimap, buildWirePath, zoomAtPoint, type MinimapNode } from "./workflow-node-ui";
import { normalizeArtboardLayers } from "@/lib/artboard-types";
import {
  SegmentArtboard,
  getSegmentAspectRatio,
  type ArtboardAspectRatio,
} from "./SegmentArtboard";

const SEG_W = 220;
const SEG_H = 228;
const EXPORT_W = 248;
const EXPORT_H = 200;
const OUTPUT_W = 400;
const OUTPUT_H = 300;
const GAP = 88;
const PAD = 64;

type Props = {
  scriptId: number;
  data: ScriptSegments;
  order: number[];
  onOrderChange: (order: number[]) => void;
  selectedIndex: number | null;
  onSelectSegment: (index: number | null) => void;
  onRefresh: () => void;
  onGenerateSegment?: (index: number) => void;
  generatingIndex?: number | null;
  scriptTitle?: string;
  exportSelection: number[];
  onExportSelectionChange: (indices: number[]) => void;
  onDeleteSegment?: (index: number) => void;
  defaultAspectRatio?: ArtboardAspectRatio;
  onSegmentAspectChange?: (index: number, aspectRatio: ArtboardAspectRatio) => void;
};

type NodePos = { x: number; y: number; w: number; h: number; kind: "segment" | "combine" | "output"; index?: number };

function segmentReady(seg: ScriptSegment) {
  return seg.taskStatus === "completed" && Boolean(seg.videoUrl);
}

function statusColor(status?: string | null) {
  if (status === "completed") return "#00b894";
  if (status === "processing" || status === "pending") return "#74b9ff";
  if (status === "failed") return "#ff7675";
  return "#636e72";
}

export default function SegmentWorkflowCanvas({
  scriptId,
  data,
  order,
  onOrderChange,
  selectedIndex,
  onSelectSegment,
  onRefresh,
  onGenerateSegment,
  generatingIndex,
  scriptTitle,
  exportSelection,
  onExportSelectionChange,
  onDeleteSegment,
  defaultAspectRatio = "16:9",
  onSegmentAspectChange,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 32, y: 24 });
  const [zoom, setZoom] = useState(0.88);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const segmentMap = useMemo(() => {
    const map = new Map<number, ScriptSegment>();
    for (const seg of data.segments) map.set(seg.index, seg);
    return map;
  }, [data.segments]);

  const orderedSegments = useMemo(
    () => order.map((idx) => segmentMap.get(idx)).filter(Boolean) as ScriptSegment[],
    [order, segmentMap]
  );

  const segmentNodes: NodePos[] = useMemo(
    () =>
      orderedSegments.map((seg, i) => ({
        x: PAD + i * (SEG_W + GAP),
        y: PAD + 48,
        w: SEG_W,
        h: SEG_H,
        kind: "segment" as const,
        index: seg.index,
      })),
    [orderedSegments]
  );

  const combineX = PAD + orderedSegments.length * (SEG_W + GAP);
  const combineY = PAD + 56;
  const outputX = combineX + EXPORT_W + GAP;
  const outputY = PAD + 20;

  const canvasSize = useMemo(
    () => ({
      width: Math.max(outputX + OUTPUT_W + PAD, 1000),
      height: PAD + SEG_H + 160,
    }),
    [outputX]
  );

  const viewRef = useRef({ pan, zoom, viewportSize, canvasSize });

  useEffect(() => {
    viewRef.current = { pan, zoom, viewportSize, canvasSize };
  }, [pan, zoom, viewportSize, canvasSize]);

  const applyZoom = useCallback((newZoom: number, anchorX: number, anchorY: number) => {
    const { pan: currentPan, zoom: currentZoom, viewportSize: vp, canvasSize: cs } = viewRef.current;
    const next = zoomAtPoint(currentPan, currentZoom, newZoom, anchorX, anchorY, cs, vp);
    setZoom(next.zoom);
    setPan(next.pan);
  }, []);

  const wires = useMemo(() => {
    const lines: { d: string; active: boolean }[] = [];
    segmentNodes.forEach((node, i) => {
      const seg = segmentMap.get(node.index!)!;
      const ready = segmentReady(seg);
      const next = segmentNodes[i + 1];
      const x1 = node.x + node.w;
      const y1 = node.y + node.h / 2;
      if (next) {
        lines.push({ d: buildWirePath(x1, y1, next.x, next.y + next.h / 2), active: ready });
      } else {
        lines.push({ d: buildWirePath(x1, y1, combineX, combineY + EXPORT_H / 2), active: ready && data.allSegmentsReady });
      }
    });
    lines.push({
      d: buildWirePath(combineX + EXPORT_W, combineY + EXPORT_H / 2, outputX, outputY + OUTPUT_H / 2),
      active: Boolean(data.assembledVideoUrl),
    });
    return lines;
  }, [segmentNodes, segmentMap, combineX, combineY, outputX, outputY, data.allSegmentsReady, data.assembledVideoUrl]);

  const activeOrder = useMemo(
    () => (exportSelection.length > 0 ? order.filter((idx) => exportSelection.includes(idx)) : order),
    [order, exportSelection]
  );

  const activeOrderReady = useMemo(
    () =>
      activeOrder.length > 0 &&
      activeOrder.every((idx) => {
        const seg = segmentMap.get(idx);
        return seg && segmentReady(seg);
      }),
    [activeOrder, segmentMap]
  );

  const assembleMutation = useMutation({
    mutationFn: (segmentOrder: number[]) =>
      api.post<{ videoUrl: string }>(`/scripts/${scriptId}/assemble`, { segmentOrder }),
    onSuccess: () => {
      toast.success("成片整合完成");
      onRefresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchorX = e.clientX - rect.left;
      const anchorY = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -0.04 : 0.04;
      const { pan: currentPan, zoom: currentZoom, viewportSize: vp, canvasSize: cs } = viewRef.current;
      const next = zoomAtPoint(currentPan, currentZoom, currentZoom + delta, anchorX, anchorY, cs, vp);
      setZoom(next.zoom);
      setPan(next.pan);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const minimapNodes = useMemo<MinimapNode[]>(() => {
    const nodes: MinimapNode[] = segmentNodes.map((node) => {
      const seg = segmentMap.get(node.index!);
      return {
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        color: statusColor(seg?.taskStatus),
      };
    });
    nodes.push({ x: combineX, y: combineY, w: EXPORT_W, h: EXPORT_H, color: "#a29bfe" });
    nodes.push({ x: outputX, y: outputY, w: OUTPUT_W, h: OUTPUT_H, color: "#f89443" });
    return nodes;
  }, [segmentNodes, segmentMap, combineX, combineY, outputX, outputY]);

  const completedCount = orderedSegments.filter(segmentReady).length;

  const toggleExport = (index: number) => {
    onExportSelectionChange(
      exportSelection.includes(index)
        ? exportSelection.filter((i) => i !== index)
        : [...exportSelection, index]
    );
  };

  const handleExportSelected = () => {
    const targetOrder = exportSelection.length > 0 ? activeOrder : order;
    if (targetOrder.length === 1) {
      const seg = segmentMap.get(targetOrder[0]!);
      if (seg?.videoUrl) {
        window.open(seg.videoUrl, "_blank");
        toast.success("已打开片段下载");
      }
      return;
    }
    const ready =
      targetOrder.length > 0 &&
      targetOrder.every((idx) => {
        const seg = segmentMap.get(idx);
        return seg && segmentReady(seg);
      });
    if (!ready) {
      toast.error("片段尚未全部生成完成");
      return;
    }
    assembleMutation.mutate(targetOrder);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#1a1a1a]">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[#333] bg-[#222]">
        <div>
          <p className="text-xs font-bold text-[#f89443] tracking-wider">
            {scriptTitle || `脚本 #${scriptId}`} · 分镜工作流
          </p>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
            {completedCount}/{orderedSegments.length} 段就绪
            {exportSelection.length > 0 ? ` · 已选 ${exportSelection.length} 段` : ""}
            {data.processingCount > 0 ? ` · ${data.processingCount} 段生成中` : ""}
            · 勾选片段后可整合 / 导出
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            className={btnSecondaryClass}
            onClick={() =>
              onExportSelectionChange(
                order.filter((idx) => {
                  const seg = segmentMap.get(idx);
                  return seg && segmentReady(seg);
                })
              )
            }
          >
            全选就绪
          </button>
          <button type="button" className={btnSecondaryClass} onClick={() => onExportSelectionChange([])}>
            清空选择
          </button>
          <button
            type="button"
            className={btnSecondaryClass}
            onClick={() => {
              const { viewportSize: vp } = viewRef.current;
              applyZoom(viewRef.current.zoom + 0.08, vp.width / 2, vp.height / 2);
            }}
          >
            +
          </button>
          <span className="text-[10px] text-gray-500 font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className={btnSecondaryClass}
            onClick={() => {
              const { viewportSize: vp } = viewRef.current;
              applyZoom(viewRef.current.zoom - 0.08, vp.width / 2, vp.height / 2);
            }}
          >
            −
          </button>
          <button
            type="button"
            className={btnSecondaryClass}
            onClick={() => {
              setPan({ x: 32, y: 24 });
              setZoom(0.88);
            }}
          >
            重置
          </button>
          <button type="button" className={btnSecondaryClass} onClick={onRefresh}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className={cn("flex-1 overflow-hidden relative", dragging ? "cursor-grabbing" : "cursor-grab")}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
      >
        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: canvasSize.width,
            height: canvasSize.height,
            backgroundImage:
              "linear-gradient(#2a2a2a 1px, transparent 1px), linear-gradient(90deg, #2a2a2a 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          <WorkflowWires width={canvasSize.width} height={canvasSize.height} wires={wires} />

          {segmentNodes.map((node) => {
            const seg = segmentMap.get(node.index!)!;
            const selected = selectedIndex === seg.index;
            const exportSelected = exportSelection.includes(seg.index);
            const accent = statusColor(seg.taskStatus);
            const busy = seg.taskStatus === "processing" || seg.taskStatus === "pending";

            return (
              <div
                key={seg.index}
                data-node
                className={cn(
                  "absolute rounded-lg border-2 bg-[#353535] shadow-2xl overflow-hidden transition-all cursor-pointer",
                  selected ? "border-[#f89443] ring-2 ring-[#f89443]/25" : exportSelected ? "border-[#00cec9] ring-1 ring-[#00cec9]/30" : "border-[#4a4a4a] hover:border-[#666]"
                )}
                style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
                onClick={() => onSelectSegment(seg.index)}
              >
                <div
                  className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-[#222] z-10"
                  style={{ backgroundColor: accent }}
                />
                <div
                  className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-[#222] z-10"
                  style={{ backgroundColor: accent }}
                />

                <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#4a4a4a] bg-[#2d2d2d]">
                  <input
                    type="checkbox"
                    checked={exportSelected}
                    className="accent-[#00cec9] shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleExport(seg.index)}
                  />
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                  <span className="text-[11px] font-semibold text-gray-200 truncate flex-1">
                    分镜 #{seg.index}
                  </span>
                  {onDeleteSegment && (
                    <button
                      type="button"
                      className="text-gray-500 hover:text-red-400 p-0.5"
                      title="从工作流移除"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSegment(seg.index);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                  {seg.taskStatus && (
                    <span
                      className={cn(
                        "text-[8px] px-1 py-0.5 rounded border font-bold shrink-0",
                        STATUS_COLORS[seg.taskStatus] ?? STATUS_COLORS.pending
                      )}
                    >
                      {formatTaskStatus(seg.taskStatus)}
                    </span>
                  )}
                </div>

                <div className="p-2 flex flex-col gap-1.5 h-[calc(100%-40px)]">
                  <div className="flex justify-center py-0.5">
                    <SegmentArtboard
                      aspectRatio={getSegmentAspectRatio(seg, defaultAspectRatio)}
                      videoUrl={seg.videoUrl}
                      layers={normalizeArtboardLayers(seg.artboardLayers)}
                      size="sm"
                      showLabel={false}
                      showSafeZone
                    />
                  </div>

                  <div
                    className="flex justify-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(["9:16", "16:9"] as const).map((ratio) => {
                      const active = getSegmentAspectRatio(seg, defaultAspectRatio) === ratio;
                      return (
                        <button
                          key={ratio}
                          type="button"
                          title={ratio === "9:16" ? "竖屏 · 抖音/快手" : "横屏 · B站/YouTube"}
                          disabled={busy}
                          className={cn(
                            "text-[8px] px-1.5 py-0.5 rounded border font-mono transition-colors",
                            active
                              ? ratio === "9:16"
                                ? "border-[#fd79a8] bg-[#fd79a8]/15 text-[#fd79a8]"
                                : "border-[#74b9ff] bg-[#74b9ff]/15 text-[#74b9ff]"
                              : "border-[#555] text-gray-500 hover:border-[#777]"
                          )}
                          onClick={() => onSegmentAspectChange?.(seg.index, ratio)}
                        >
                          {ratio === "9:16" ? "竖屏" : "横屏"}
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-[9px] text-gray-500 font-mono text-center">
                    {seg.klingDurationSec}s · {seg.purpose || "分镜"}
                  </p>
                  <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed text-center px-1">
                    {seg.userPrompt?.slice(0, 60) || seg.spokenText || "点击查看详情"}
                  </p>
                  {!busy && !segmentReady(seg) && onGenerateSegment && (
                    <button
                      type="button"
                      className="mt-auto text-[9px] text-[#f89443] hover:text-[#ffb366] flex items-center gap-0.5 self-center"
                      disabled={generatingIndex === seg.index}
                      onClick={(e) => {
                        e.stopPropagation();
                        onGenerateSegment(seg.index);
                      }}
                    >
                      {generatingIndex === seg.index ? (
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        <Play className="w-2.5 h-2.5 fill-current" />
                      )}
                      快速生成
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* 合并节点 */}
          <div
            data-node
            className="absolute rounded-lg border-2 border-[#a29bfe] bg-[#353535] shadow-2xl overflow-hidden"
            style={{ left: combineX, top: combineY, width: EXPORT_W, height: EXPORT_H }}
          >
            <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-[#222] bg-[#a29bfe] z-10" />
            <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-[#222] bg-[#a29bfe] z-10" />
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#4a4a4a] bg-[#2d2d2d]">
              <span className="w-2 h-2 rounded-full bg-[#a29bfe]" />
              <span className="text-xs font-semibold text-[#a29bfe]">视频合并</span>
            </div>
            <div className="p-3 space-y-2">
              <p className="text-[10px] text-gray-500">
                {activeOrder.length} 段
                {exportSelection.length > 0 ? "（已选）" : "（全部）"}
                · {activeOrder.map((i) => `#${i}`).join(" → ")}
              </p>
              <button
                type="button"
                className={cn(btnPrimaryClass, "!py-2 !text-xs w-full")}
                disabled={
                  assembleMutation.isPending ||
                  (exportSelection.length > 0 ? !activeOrderReady : !data.allSegmentsReady)
                }
                onClick={() =>
                  assembleMutation.mutate(exportSelection.length > 0 ? activeOrder : order)
                }
              >
                {assembleMutation.isPending
                  ? "整合中..."
                  : exportSelection.length > 0
                    ? `整合选中 (${activeOrder.length})`
                    : "整合全部"}
              </button>
              <button
                type="button"
                className={cn(btnSecondaryClass, "w-full !py-2")}
                disabled={
                  exportSelection.length === 0
                    ? !data.allSegmentsReady
                    : activeOrder.length === 1
                      ? !segmentReady(segmentMap.get(activeOrder[0]!)!)
                      : !activeOrderReady
                }
                onClick={handleExportSelected}
              >
                <Download className="w-3 h-3 inline mr-1" />
                {exportSelection.length === 0
                  ? "导出全部"
                  : activeOrder.length === 1
                    ? "导出选中片段"
                    : "导出选中合并"}
              </button>
            </div>
          </div>

          {/* 成片输出 */}
          <div
            className="absolute rounded-lg border-2 border-[#f89443] bg-[#252525] shadow-2xl overflow-hidden"
            style={{ left: outputX, top: outputY, width: OUTPUT_W, height: OUTPUT_H }}
          >
            <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-[#222] bg-[#f89443] z-10" />
            <div className="px-3 py-2 border-b border-[#444] bg-[#2d2d2d]">
              <span className="text-xs font-semibold text-[#f89443]">成片输出</span>
            </div>
            <div className="p-2 h-[calc(100%-36px)] flex flex-col gap-2">
              <div className="flex-1 rounded bg-black overflow-hidden min-h-0">
                {data.assembledVideoUrl ? (
                  <video src={data.assembledVideoUrl} controls className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                    合并后预览
                  </div>
                )}
              </div>
              {data.assembledVideoUrl && (
                <a
                  href={data.assembledVideoUrl}
                  download={`script-${scriptId}-final.mp4`}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    btnSecondaryClass,
                    "flex items-center justify-center gap-1 no-underline text-gray-200 !py-1.5"
                  )}
                >
                  <Download className="w-3 h-3" />
                  导出 MP4
                </a>
              )}
            </div>
          </div>
        </div>

        <WorkflowMinimap
          canvasSize={canvasSize}
          viewportSize={viewportSize}
          pan={pan}
          zoom={zoom}
          nodes={minimapNodes}
          onPanChange={setPan}
        />
      </div>
    </div>
  );
}
