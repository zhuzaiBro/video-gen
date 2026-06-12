import { api, type PersonaImagePresign } from "@/lib/api";

export async function uploadArtboardImage(
  scriptId: number,
  segmentIndex: number,
  file: File
): Promise<string> {
  const presign = await api.post<PersonaImagePresign>(
    `/scripts/${scriptId}/segments/${segmentIndex}/artboard-assets/presign`,
    {
      filename: file.name,
      contentType: file.type || undefined,
    }
  );

  const uploadRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": presign.contentType,
    },
  });

  if (!uploadRes.ok) {
    throw new Error(`贴图上传失败 (${uploadRes.status})`);
  }

  return presign.publicUrl;
}
