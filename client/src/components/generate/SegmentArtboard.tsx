import { cn } from "@/lib/utils";
import { rotationTransformStyle } from "@/lib/artboard-base";
import type { ArtboardLayer } from "@/lib/artboard-types";
import { ArtboardLayerView } from "./ArtboardLayerView";

export type ArtboardAspectRatio = "16:9" | "9:16";

export const ARTBOARD_PRESETS: {
  id: ArtboardAspectRatio;
  label: string;
  platforms: string;
}[] = [
  { id: "9:16", label: "竖屏", platforms: "抖音 · 快手 · 小红书" },
  { id: "16:9", label: "横屏", platforms: "B站 · YouTube" },
];

export function getSegmentAspectRatio(
  segment: { generationParams?: { aspectRatio?: string } | null },
  fallback: ArtboardAspectRatio = "16:9"
): ArtboardAspectRatio {
  const raw = segment.generationParams?.aspectRatio;
  return raw === "9:16" || raw === "16:9" ? raw : fallback;
}

export function artboardSize(aspect: ArtboardAspectRatio, maxWidth: number) {
  if (aspect === "9:16") {
    return { width: maxWidth, height: Math.round((maxWidth * 16) / 9) };
  }
  return { width: maxWidth, height: Math.round((maxWidth * 9) / 16) };
}

type ArtboardProps = {
  aspectRatio: ArtboardAspectRatio;
  videoUrl?: string | null;
  baseImageUrl?: string | null;
  baseImageKey?: string;
  baseImageRotation?: number;
  layers?: ArtboardLayer[];
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showSafeZone?: boolean;
  className?: string;
};

const SIZE_MAX: Record<NonNullable<ArtboardProps["size"]>, number> = {
  sm: 68,
  md: 120,
  lg: 180,
};

export function SegmentArtboard({
  aspectRatio,
  videoUrl,
  baseImageUrl,
  baseImageKey,
  baseImageRotation = 0,
  layers = [],
  size = "md",
  showLabel = true,
  showSafeZone = true,
  className,
}: ArtboardProps) {
  const isPortrait = aspectRatio === "9:16";
  const { width, height } = artboardSize(aspectRatio, SIZE_MAX[size]);
  const preset = ARTBOARD_PRESETS.find((p) => p.id === aspectRatio);
  const sortedLayers = [...layers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        className={cn(
          "relative rounded-md border-2 bg-[#0a0a0a] shadow-inner overflow-hidden",
          isPortrait ? "border-[#fd79a8]/50" : "border-[#74b9ff]/50"
        )}
        style={{ width, height }}
      >
        {videoUrl ? (
          <video src={videoUrl} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        ) : baseImageUrl ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <img
              key={baseImageKey ?? baseImageUrl}
              src={baseImageUrl}
              alt="画板首帧"
              className="max-w-full max-h-full object-contain"
              style={rotationTransformStyle(baseImageRotation)}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-gray-600">
            <span className="text-lg opacity-40">{isPortrait ? "📱" : "🖥"}</span>
            <span className="text-[8px] font-mono opacity-60">{aspectRatio}</span>
          </div>
        )}

        {showSafeZone && isPortrait && (
          <>
            <div className="absolute top-0 left-0 right-0 h-[12%] bg-gradient-to-b from-black/35 to-transparent pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-[18%] bg-gradient-to-t from-black/35 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 top-[12%] bottom-[18%] border border-dashed border-white/10 pointer-events-none rounded-sm m-0.5" />
          </>
        )}

        {sortedLayers.map((layer) => (
          <ArtboardLayerView key={layer.id} layer={layer} boardWidth={width} />
        ))}

        <div
          className={cn(
            "absolute top-1 left-1 text-[7px] font-bold px-1 py-0.5 rounded pointer-events-none",
            isPortrait ? "bg-[#fd79a8]/25 text-[#fd79a8]" : "bg-[#74b9ff]/25 text-[#74b9ff]"
          )}
        >
          {preset?.label ?? aspectRatio}
        </div>
      </div>

      {showLabel && preset && size !== "sm" && (
        <p className="text-[9px] text-gray-500 text-center leading-tight">{preset.platforms}</p>
      )}
    </div>
  );
}

type PickerProps = {
  value: ArtboardAspectRatio;
  onChange: (value: ArtboardAspectRatio) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function AspectRatioPicker({ value, onChange, disabled, compact }: PickerProps) {
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}>
      {ARTBOARD_PRESETS.map((preset) => {
        const active = value === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset.id)}
            className={cn(
              "rounded-lg border p-2 transition-colors text-left flex items-center gap-2",
              active
                ? preset.id === "9:16"
                  ? "border-[#fd79a8] bg-[#fd79a8]/10 ring-1 ring-[#fd79a8]/30"
                  : "border-[#74b9ff] bg-[#74b9ff]/10 ring-1 ring-[#74b9ff]/30"
                : "border-[#444] bg-[#2a2a2a] hover:border-[#666] disabled:opacity-50"
            )}
          >
            <SegmentArtboard aspectRatio={preset.id} size="sm" showLabel={false} showSafeZone={false} />
            <div className="min-w-0">
              <p className={cn("text-xs font-semibold", active ? "text-gray-100" : "text-gray-300")}>
                {preset.label} · {preset.id}
              </p>
              <p className="text-[9px] text-gray-500 mt-0.5">{preset.platforms}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
