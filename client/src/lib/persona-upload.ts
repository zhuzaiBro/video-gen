import { api, type PersonaImagePresign, type PhotoExpression, type PhotoShotType, type ReferenceImage } from "@/lib/api";

export async function uploadPersonaImageDirect(
  personaId: number,
  file: File,
  options?: { shotType?: PhotoShotType; expression?: PhotoExpression }
): Promise<ReferenceImage> {
  const presign = await api.post<PersonaImagePresign>(`/personas/${personaId}/reference-images/presign`, {
    filename: file.name,
    contentType: file.type || undefined,
  });

  const uploadRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": presign.contentType,
    },
  });

  if (!uploadRes.ok) {
    throw new Error(`COS 直传失败 (${uploadRes.status})`);
  }

  return api.post<ReferenceImage>(`/personas/${personaId}/reference-images/confirm`, {
    key: presign.key,
    shotType: options?.shotType ?? "other",
    expression: options?.expression ?? "neutral",
  });
}
