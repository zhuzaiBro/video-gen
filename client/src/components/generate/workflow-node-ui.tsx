import { useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function NodePort({
  side,
  active = false,
  className,
}: {
  side: "left" | "right";
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white z-20 shadow-sm",
        side === "left" ? "-left-[7px]" : "-right-[7px]",
        active ? "bg-[#4A9EFF] shadow-[0_0_8px_#4A9EFF]" : "bg-[#7EB8FF]",
        className
      )}
    />
  );
}

export function KlingNode({
  title,
  children,
  className,
  selected,
  onClick,
  width,
  style,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  selected?: boolean;
  onClick?: () => void;
  width?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      data-node
      onClick={onClick}
      className={cn(
        "absolute bg-white rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.35)] text-gray-800 overflow-visible transition-shadow relative",
        selected && "ring-2 ring-[#4A9EFF] ring-offset-2 ring-offset-[#0d1117]",
        onClick && "cursor-pointer",
        className
      )}
      style={{ width: width ?? 300, ...style }}
    >
      <div className="px-4 pt-3.5 pb-2">
        <h3 className="text-[15px] font-semibold text-gray-900 tracking-tight">{title}</h3>
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

export function NodeFieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-gray-400 mb-1.5 font-medium">{children}</p>;
}

export function NodeSelectLike({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-700">
      <span className="truncate">{value}</span>
      <span className="text-gray-400 text-xs ml-2">▾</span>
    </div>
  );
}

export function NodeParamTags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 font-medium"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function KlingGenerateButton({
  label = "立即生成",
  loading,
  disabled,
  onClick,
  hint,
}: {
  label?: string;
  loading?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={onClick}
        className={cn(
          "w-full rounded-xl py-2.5 text-[14px] font-semibold text-white transition-all",
          "bg-gradient-to-r from-[#3dd68c] to-[#2eb872] hover:from-[#35c87e] hover:to-[#28a866]",
          "disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
        )}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            生成中...
          </span>
        ) : (
          label
        )}
      </button>
      {hint && <p className="text-[10px] text-gray-400 text-center">{hint}</p>}
    </div>
  );
}

export function WorkflowWires({
  width,
  height,
  wires,
}: {
  width: number;
  height: number;
  wires: { d: string; active: boolean }[];
}) {
  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" width={width} height={height}>
      <defs>
        <filter id="wire-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {wires.map((wire, i) => (
        <g key={i}>
          <path
            d={wire.d}
            fill="none"
            stroke={wire.active ? "#4A9EFF" : "#3a4a5c"}
            strokeWidth={wire.active ? 3 : 2}
            strokeLinecap="round"
            filter={wire.active ? "url(#wire-glow)" : undefined}
            opacity={wire.active ? 1 : 0.55}
          />
        </g>
      ))}
    </svg>
  );
}

export function buildWirePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.42);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export type MinimapNode = {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
};

type WorkflowMinimapProps = {
  canvasSize: { width: number; height: number };
  viewportSize: { width: number; height: number };
  pan: { x: number; y: number };
  zoom: number;
  nodes: MinimapNode[];
  onPanChange: (pan: { x: number; y: number }) => void;
};

const MINIMAP_W = 168;
const MINIMAP_H = 112;
const MINIMAP_PAD = 8;

function clampPan(
  pan: { x: number; y: number },
  zoom: number,
  canvasSize: { width: number; height: number },
  viewportSize: { width: number; height: number }
) {
  const minX = Math.min(0, viewportSize.width - canvasSize.width * zoom);
  const minY = Math.min(0, viewportSize.height - canvasSize.height * zoom);
  return {
    x: Math.min(0, Math.max(minX, pan.x)),
    y: Math.min(0, Math.max(minY, pan.y)),
  };
}

export function zoomAtPoint(
  pan: { x: number; y: number },
  zoom: number,
  newZoom: number,
  anchorX: number,
  anchorY: number,
  canvasSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  zoomLimits: { min: number; max: number } = { min: 0.5, max: 1.3 }
) {
  const clamped = Math.min(zoomLimits.max, Math.max(zoomLimits.min, newZoom));
  const wx = (anchorX - pan.x) / zoom;
  const wy = (anchorY - pan.y) / zoom;
  return {
    zoom: clamped,
    pan: clampPan(
      { x: anchorX - wx * clamped, y: anchorY - wy * clamped },
      clamped,
      canvasSize,
      viewportSize
    ),
  };
}

export function WorkflowMinimap({
  canvasSize,
  viewportSize,
  pan,
  zoom,
  nodes,
  onPanChange,
}: WorkflowMinimapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: "pan" | "viewport"; startX: number; startY: number; panX: number; panY: number } | null>(
    null
  );

  const layout = useMemo(() => {
    const innerW = MINIMAP_W - MINIMAP_PAD * 2;
    const innerH = MINIMAP_H - MINIMAP_PAD * 2;
    const scale = Math.min(innerW / canvasSize.width, innerH / canvasSize.height);
    const contentW = canvasSize.width * scale;
    const contentH = canvasSize.height * scale;
    const offsetX = MINIMAP_PAD + (innerW - contentW) / 2;
    const offsetY = MINIMAP_PAD + (innerH - contentH) / 2;
    return { scale, offsetX, offsetY, contentW, contentH };
  }, [canvasSize.height, canvasSize.width]);

  const viewportRect = useMemo(() => {
    const vx = -pan.x / zoom;
    const vy = -pan.y / zoom;
    const vw = viewportSize.width / zoom;
    const vh = viewportSize.height / zoom;
    return {
      x: layout.offsetX + vx * layout.scale,
      y: layout.offsetY + vy * layout.scale,
      w: vw * layout.scale,
      h: vh * layout.scale,
    };
  }, [layout.offsetX, layout.offsetY, layout.scale, pan.x, pan.y, viewportSize.height, viewportSize.width, zoom]);

  const worldFromMinimap = (clientX: number, clientY: number) => {
    const rect = mapRef.current!.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    return {
      x: (mx - layout.offsetX) / layout.scale,
      y: (my - layout.offsetY) / layout.scale,
    };
  };

  const panToWorldCenter = (wx: number, wy: number) => {
    const next = clampPan(
      {
        x: viewportSize.width / 2 - wx * zoom,
        y: viewportSize.height / 2 - wy * zoom,
      },
      zoom,
      canvasSize,
      viewportSize
    );
    onPanChange(next);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!mapRef.current) return;

    const world = worldFromMinimap(e.clientX, e.clientY);
    const vx = -pan.x / zoom;
    const vy = -pan.y / zoom;
    const vw = viewportSize.width / zoom;
    const vh = viewportSize.height / zoom;
    const inViewport =
      world.x >= vx &&
      world.x <= vx + vw &&
      world.y >= vy &&
      world.y <= vy + vh;

    dragRef.current = {
      mode: inViewport ? "viewport" : "pan",
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    mapRef.current.setPointerCapture(e.pointerId);

    if (!inViewport) {
      panToWorldCenter(world.x, world.y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.stopPropagation();
    if (drag.mode === "viewport") {
      const dx = (e.clientX - drag.startX) / layout.scale;
      const dy = (e.clientY - drag.startY) / layout.scale;
      const next = clampPan(
        {
          x: drag.panX - dx * zoom,
          y: drag.panY - dy * zoom,
        },
        zoom,
        canvasSize,
        viewportSize
      );
      onPanChange(next);
      return;
    }
    const world = worldFromMinimap(e.clientX, e.clientY);
    panToWorldCenter(world.x, world.y);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    mapRef.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={mapRef}
      className="absolute bottom-3 right-3 z-20 rounded-lg border border-[#444] bg-[#222]/95 shadow-xl backdrop-blur-sm select-none touch-none cursor-crosshair"
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
      title="全局视野 · 点击或拖动定位"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="absolute inset-0 rounded-lg opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)",
          backgroundSize: "8px 8px",
        }}
      />
      <div
        className="absolute rounded-sm border border-[#555]/80 bg-[#1a1a1a]/60"
        style={{
          left: layout.offsetX,
          top: layout.offsetY,
          width: layout.contentW,
          height: layout.contentH,
        }}
      >
        {nodes.map((node, i) => (
          <div
            key={i}
            className="absolute rounded-[2px]"
            style={{
              left: node.x * layout.scale,
              top: node.y * layout.scale,
              width: Math.max(3, node.w * layout.scale),
              height: Math.max(3, node.h * layout.scale),
              backgroundColor: node.color ?? "#666",
              opacity: 0.85,
            }}
          />
        ))}
      </div>
      <div
        className="absolute rounded-sm border-2 border-white/90 bg-white/10 cursor-grab active:cursor-grabbing shadow-[0_0_0_1px_rgba(0,0,0,0.35)_inset]"
        style={{
          left: viewportRect.x,
          top: viewportRect.y,
          width: Math.max(12, viewportRect.w),
          height: Math.max(10, viewportRect.h),
        }}
      />
    </div>
  );
}
