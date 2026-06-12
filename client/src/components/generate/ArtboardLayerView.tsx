import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { ArtboardLayer } from "@/lib/artboard-types";

type Props = {
  layer: ArtboardLayer;
  boardWidth: number;
  selected?: boolean;
  editable?: boolean;
  onPointerDown?: (e: ReactPointerEvent, layerId: string) => void;
  onResizePointerDown?: (e: ReactPointerEvent, layerId: string) => void;
};

export function layerDisplayLabel(layer: ArtboardLayer): string {
  if (layer.type === "sticker") return layer.content;
  if (layer.type === "slice" || layer.type === "text") return layer.content;
  return "贴图";
}

export function ArtboardLayerView({
  layer,
  boardWidth,
  selected,
  editable,
  onPointerDown,
  onResizePointerDown,
}: Props) {
  const fontSize = Math.max(10, Math.round((layer.w / 100) * boardWidth * 0.85));
  const style: CSSProperties = {
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    transform: `translate(-50%, -50%)${layer.rotation ? ` rotate(${layer.rotation}deg)` : ""}`,
    zIndex: (layer.zIndex ?? 0) + 10,
  };

  return (
    <div className="absolute touch-none" style={style}>
      <div
        className={cn(
          "relative",
          editable ? "cursor-grab active:cursor-grabbing" : "pointer-events-none",
          selected && editable && "cursor-grab"
        )}
        onPointerDown={editable ? (e) => onPointerDown?.(e, layer.id) : undefined}
      >
        <div
          className={cn(
            "relative inline-flex items-center justify-center",
            editable && "min-w-[28px] min-h-[28px]",
            selected &&
              editable &&
              "ring-2 ring-[#f89443] ring-offset-1 ring-offset-[#0a0a0a] rounded-sm bg-[#f89443]/5"
          )}
        >
          {layer.type === "sticker" && (
            <span className="block leading-none select-none px-0.5" style={{ fontSize }}>
              {layer.content}
            </span>
          )}

          {layer.type === "slice" && (
            <span
              className="inline-block px-1.5 py-0.5 rounded text-white font-bold whitespace-nowrap shadow-md select-none"
              style={{
                fontSize: Math.max(8, fontSize * 0.45),
                backgroundColor: layer.color ?? "#ff4757",
              }}
            >
              {layer.content}
            </span>
          )}

          {layer.type === "text" && (
            <span
              className="inline-block text-white font-bold whitespace-nowrap select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] px-0.5"
              style={{ fontSize: Math.max(8, fontSize * 0.5) }}
            >
              {layer.content}
            </span>
          )}

          {layer.type === "image" && (
            <img
              src={layer.content}
              alt=""
              draggable={false}
              className="object-contain select-none pointer-events-none block"
              style={{ width: Math.max(24, boardWidth * (layer.w / 100)) }}
            />
          )}

          {selected && editable && (
            <div
              className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-sm border-2 border-[#f89443] bg-[#222] cursor-se-resize z-20 shadow"
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizePointerDown?.(e, layer.id);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
