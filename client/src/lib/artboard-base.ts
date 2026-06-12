import type { CSSProperties } from "react";

export type FirstFrameMode = "persona" | "prepared";

/** 画板内人设参考底图的可选中 ID */
export const PERSONA_BASE_REF_ID = "__persona_ref__";

export type PersonaImageOption = {
  url: string;
  shotType?: string;
  faceCropUrl?: string | null;
};

export type PersonaImageRotations = Record<number, number>;

export function normalizeRotation(degrees: number): number {
  const value = ((degrees % 360) + 360) % 360;
  return value === 90 || value === 180 || value === 270 ? value : 0;
}

export function parsePersonaImageRotations(
  raw?: Record<string, number> | null
): PersonaImageRotations {
  if (!raw) return {};
  const out: PersonaImageRotations = {};
  for (const [key, value] of Object.entries(raw)) {
    const idx = Number(key);
    if (!Number.isFinite(idx) || idx < 0) continue;
    const deg = normalizeRotation(Number(value));
    if (deg) out[idx] = deg;
  }
  return out;
}

export function serializePersonaImageRotations(
  rotations: PersonaImageRotations
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(rotations)) {
    const idx = Number(key);
    const deg = normalizeRotation(value);
    if (deg) out[String(idx)] = deg;
  }
  return out;
}

export function getPersonaImageRotation(
  rotations: PersonaImageRotations,
  index: number
): number {
  return normalizeRotation(rotations[index] ?? 0);
}

export function rotationTransformStyle(degrees: number): CSSProperties {
  const deg = normalizeRotation(degrees);
  if (!deg) return {};
  return { transform: `rotate(${deg}deg)` };
}

export function resolveArtboardBaseImage(params: {
  videoUrl?: string | null;
  continuityFrameUrl?: string | null;
  firstFrameMode: FirstFrameMode;
  personaImageUrls: string[];
  personaFaceCropUrls?: Array<string | null | undefined>;
  personaImageIndex: number;
  personaImageIndexes?: number[];
  preparedFrameUrl?: string | null;
}): string | null {
  if (params.videoUrl) return null;
  if (params.continuityFrameUrl) return params.continuityFrameUrl;
  // 已生成首屏时，画板底图必须与口播首屏预览一致，不再显示人脸参考
  if (params.preparedFrameUrl && params.firstFrameMode === "prepared") {
    return params.preparedFrameUrl;
  }
  if (params.personaImageUrls.length > 0) {
    const indexes =
      params.personaImageIndexes && params.personaImageIndexes.length > 0
        ? params.personaImageIndexes
        : [params.personaImageIndex];
    const idx = Math.min(
      Math.max(0, indexes[0] ?? params.personaImageIndex),
      params.personaImageUrls.length - 1
    );
    if (params.firstFrameMode === "prepared") {
      const faceUrl = params.personaFaceCropUrls?.[idx];
      if (faceUrl) return faceUrl;
    }
    return params.personaImageUrls[idx] ?? null;
  }
  return params.preparedFrameUrl ?? null;
}

export function firstFrameModeLabel(mode: FirstFrameMode): string {
  return mode === "prepared" ? "生成首屏" : "多图直传（高级）";
}
