import { api, type PersonaImagePresign } from "@/lib/api";

export type PersonaVoiceSample = {
  key: string;
  url: string;
  description?: string | null;
  klingVoiceId?: string | null;
  klingVoiceError?: string | null;
};

export async function uploadPersonaVoiceSample(personaId: number, file: File): Promise<PersonaVoiceSample> {
  const presign = await api.post<PersonaImagePresign>(`/personas/${personaId}/voice-sample/presign`, {
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

  return api.post<PersonaVoiceSample>(`/personas/${personaId}/voice-sample/confirm`, {
    key: presign.key,
  });
}
