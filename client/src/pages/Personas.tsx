import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Link, Image, Upload, Loader2, Mic, Smile, ScanFace } from "lucide-react";
import { api, type Persona, type PhotoExpression, type PhotoShotType, type ReferenceImage } from "@/lib/api";
import { uploadPersonaImageDirect } from "@/lib/persona-upload";
import {
  PHOTO_EXPRESSIONS,
  PHOTO_SHOT_TYPES,
  PERSONA_EXPRESSION_TONES,
  getExpressionToneLabel,
} from "@/lib/persona-photo";
import { VOICE_TONE_PRESETS, getVoiceToneLabel } from "@/lib/voice-tones";
import VoiceSamplePanel from "@/components/VoiceSamplePanel";
import { toast } from "sonner";
import {
  ComfyPage,
  ComfyPageHeader,
  ComfyEmpty,
  ComfyDrawer,
  ComfySpinner,
  NodeCard,
  NodeField,
  inputClass,
  selectClass,
  btnPrimaryClass,
  btnPrimaryBlockClass,
  btnSecondaryClass,
  btnDangerClass,
} from "@/components/comfy-ui";
import { cn } from "@/lib/utils";

interface PersonaFormData {
  name: string;
  selfIntroduction?: string;
  douyinProfileUrl?: string;
  description?: string;
  personality?: string;
  voiceTone?: string;
  voiceStyle?: string;
  voiceSampleDescription?: string;
  backgroundStory?: string;
  expressionTone?: string;
  expressionNotes?: string;
  heightCm?: number | null;
  weightKg?: number | null;
}

type VoiceMode = "preset" | "sample";

function VoiceToneSelector({
  value,
  onChange,
  voiceStyle,
  onVoiceStyleChange,
  voiceSampleDescription,
  onVoiceSampleDescriptionChange,
  personaId,
  sampleUrl,
  onSampleUpdated,
}: {
  value: string;
  onChange: (toneId: string) => void;
  voiceStyle: string;
  onVoiceStyleChange: (v: string) => void;
  voiceSampleDescription?: string;
  onVoiceSampleDescriptionChange: (v: string) => void;
  personaId?: number | null;
  sampleUrl?: string | null;
  onSampleUpdated?: () => void;
}) {
  const [mode, setMode] = useState<VoiceMode>(value === "custom_sample" || sampleUrl ? "sample" : "preset");

  return (
    <NodeCard title="音色设置" accent="#a29bfe">
      <p className="text-[10px] text-gray-500 mb-3 leading-relaxed">
        选择预设音色，或上传/录制声音样本提取音色特征（生成视频时写入可灵提示词，需开启同步音效）。
      </p>

      <div className="flex gap-1 mb-3 p-0.5 rounded-lg bg-[#222] border border-[#444]">
        {(
          [
            ["preset", "预设音色"],
            ["sample", "样本提取"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors",
              mode === id ? "bg-[#a29bfe] text-white" : "text-gray-400 hover:text-gray-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "preset" ? (
        <div className="grid grid-cols-2 gap-2">
          {VOICE_TONE_PRESETS.filter((p) => p.id !== "custom_sample").map((preset) => {
            const active = value === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange(preset.id)}
                className={cn(
                  "text-left rounded-lg border px-2.5 py-2 transition-colors",
                  active
                    ? "border-[#a29bfe] bg-[#a29bfe]/15 ring-1 ring-[#a29bfe]/30"
                    : "border-[#444] bg-[#2a2a2a] hover:border-[#666]"
                )}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Mic className={cn("w-3 h-3 shrink-0", active ? "text-[#a29bfe]" : "text-gray-500")} />
                  <span className={cn("text-xs font-semibold", active ? "text-[#a29bfe]" : "text-gray-200")}>
                    {preset.label}
                  </span>
                </div>
                <p className="text-[9px] text-gray-500 leading-snug pl-[18px]">{preset.description}</p>
              </button>
            );
          })}
        </div>
      ) : personaId ? (
        <VoiceSamplePanel
          personaId={personaId}
          sampleUrl={sampleUrl}
          sampleDescription={voiceSampleDescription}
          onSampleChange={({ description, toneId }) => {
            onChange(toneId);
            onVoiceSampleDescriptionChange(description);
            onSampleUpdated?.();
          }}
          onSampleRemove={async () => {
            await api.delete(`/personas/${personaId}/voice-sample`);
            onChange("douyin_host");
            onVoiceSampleDescriptionChange("");
            toast.success("已移除音色样本");
            onSampleUpdated?.();
          }}
          onDescriptionChange={onVoiceSampleDescriptionChange}
        />
      ) : (
        <div className="rounded-lg border border-[#a29bfe]/30 bg-[#a29bfe]/10 px-3 py-2.5 text-xs text-[#a29bfe]">
          请先保存人设基本信息，再上传或录制声音样本。
        </div>
      )}

      <NodeField label="音色微调（可选）">
        <input
          className={inputClass}
          value={voiceStyle}
          onChange={(e) => onVoiceStyleChange(e.target.value)}
          placeholder="如：语速稍快、带一点东北口音、更像直播带货…"
        />
      </NodeField>
    </NodeCard>
  );
}

function ExpressionToneSelector({
  value,
  onChange,
  notes,
  onNotesChange,
}: {
  value: string;
  onChange: (toneId: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
}) {
  return (
    <NodeCard title="表情管理" accent="#ffeaa7">
      <p className="text-[10px] text-gray-500 mb-3 leading-relaxed">
        控制生成视频时的面部与肢体幅度：默认「微微的」微表情，避免夸张大笑或大幅度动作。
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PERSONA_EXPRESSION_TONES.map((preset) => {
          const active = value === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.id)}
              className={cn(
                "text-left rounded-lg border px-2.5 py-2 transition-colors",
                active
                  ? "border-[#ffeaa7] bg-[#ffeaa7]/15 ring-1 ring-[#ffeaa7]/30"
                  : "border-[#444] bg-[#2a2a2a] hover:border-[#666]"
              )}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <Smile className={cn("w-3 h-3 shrink-0", active ? "text-[#ffeaa7]" : "text-gray-500")} />
                <span className={cn("text-xs font-semibold", active ? "text-[#ffeaa7]" : "text-gray-200")}>
                  {preset.label}
                </span>
              </div>
              <p className="text-[9px] text-gray-500 leading-snug pl-[18px]">{preset.description}</p>
            </button>
          );
        })}
      </div>
      <NodeField label="表情微调（可选）">
        <input
          className={inputClass}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="如：眉眼再柔和一点、手势再小一些…"
        />
      </NodeField>
    </NodeCard>
  );
}

function PhotoGallery({
  personaId,
  images,
  onPersonaChange,
}: {
  personaId: number;
  images: ReferenceImage[];
  onPersonaChange: (updater: (prev: Persona) => Persona) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadShotType, setUploadShotType] = useState<PhotoShotType>("front_face");
  const [uploadExpression, setUploadExpression] = useState<PhotoExpression>("neutral");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [extractingId, setExtractingId] = useState<number | null>(null);
  const [extractingAll, setExtractingAll] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (images.length + files.length > 12) {
      toast.error("最多 12 张照片");
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadPersonaImageDirect(personaId, file, {
          shotType: uploadShotType,
          expression: uploadExpression,
        });
      }
      toast.success("照片上传成功");
      const refreshed = await api.get<Persona>(`/personas/${personaId}`);
      onPersonaChange(() => refreshed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (imageId: number) => {
    if (!window.confirm("删除这张照片？")) return;
    try {
      await api.delete(`/personas/reference-images/${imageId}`);
      toast.success("照片已删除");
      onPersonaChange((prev) => ({
        ...prev,
        referenceImages: (prev.referenceImages ?? []).filter((img) => img.id !== imageId),
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleExtractOne = async (imageId: number) => {
    setExtractingId(imageId);
    try {
      const updated = await api.post<ReferenceImage>(
        `/personas/${personaId}/reference-images/${imageId}/extract-digital-assets`
      );
      toast.success("人脸已提取");
      onPersonaChange((prev) => ({
        ...prev,
        referenceImages: (prev.referenceImages ?? []).map((img) =>
          img.id === updated.id ? updated : img
        ),
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "提取失败");
    } finally {
      setExtractingId(null);
    }
  };

  const handleExtractAll = async () => {
    setExtractingAll(true);
    try {
      const result = await api.post<ReferenceImage[]>(`/personas/${personaId}/extract-all-digital-assets`);
      toast.success(`已提取 ${result.length} 张照片的人脸`);
      const byId = new Map(result.map((img) => [img.id, img]));
      onPersonaChange((prev) => ({
        ...prev,
        referenceImages: (prev.referenceImages ?? []).map((img) => byId.get(img.id) ?? img),
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量提取失败");
    } finally {
      setExtractingAll(false);
    }
  };

  const handleUpdateImage = async (
    imageId: number,
    patch: { shotType?: PhotoShotType; expression?: PhotoExpression }
  ) => {
    setUpdatingId(imageId);
    try {
      const updated = await api.patch<ReferenceImage>(`/personas/reference-images/${imageId}`, patch);
      onPersonaChange((prev) => ({
        ...prev,
        referenceImages: (prev.referenceImages ?? []).map((img) =>
          img.id === updated.id ? updated : img
        ),
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新失败");
    } finally {
      setUpdatingId(null);
    }
  };

  const grouped = PHOTO_SHOT_TYPES.map((shot) => ({
    ...shot,
    items: images.filter((img) => (img.shotType || "other") === shot.id),
  }));

  return (
    <NodeCard title={`照片集合 (${images.length}/12)`} accent="#00cec9">
      <p className="text-[10px] text-gray-500 mb-3 leading-relaxed">
        数字人只需<strong className="text-gray-400 font-medium">脸 + 身高体重</strong>。提取人脸锁定五官；画板生成首屏时由图像编辑模型<strong className="text-gray-400 font-medium">一体生成</strong>完整人物与场景。
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <NodeField label="本次上传类型">
          <select
            className={selectClass}
            value={uploadShotType}
            onChange={(e) => setUploadShotType(e.target.value as PhotoShotType)}
          >
            {PHOTO_SHOT_TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </NodeField>
        <NodeField label="照片中表情">
          <select
            className={selectClass}
            value={uploadExpression}
            onChange={(e) => setUploadExpression(e.target.value as PhotoExpression)}
          >
            {PHOTO_EXPRESSIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </NodeField>
      </div>

      <div className="flex justify-end gap-2 mb-2">
        {images.length > 0 && (
          <button
            type="button"
            className={btnSecondaryClass}
            disabled={extractingAll || extractingId !== null}
            onClick={() => void handleExtractAll()}
          >
            {extractingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanFace className="w-3.5 h-3.5" />}
            一键提取全部
          </button>
        )}
        <button
          type="button"
          className={btnSecondaryClass}
          disabled={uploading || images.length >= 12}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          上传照片
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
      </div>

      {images.length === 0 ? (
        <button
          type="button"
          className="w-full border border-dashed border-[#555] rounded-lg p-8 text-center text-gray-500 hover:border-[#f89443] hover:text-[#f89443] transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Image className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">点击上传人设照片，支持多张</p>
        </button>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) =>
            group.items.length > 0 ? (
              <div key={group.id}>
                <p className="text-[10px] text-gray-500 mb-1.5">
                  {group.label}
                  <span className="text-gray-600 ml-1">· {group.hint}</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {group.items.map((img) => (
                    <div key={img.id} className="rounded border border-[#555] overflow-hidden bg-[#252525]">
                      <div className="relative aspect-square">
                        <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          className={cn(btnDangerClass, "absolute top-1 right-1 !py-1 !px-1.5 opacity-90")}
                          onClick={() => handleDelete(img.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="p-1.5 space-y-1">
                        <select
                          className={cn(selectClass, "text-[10px] py-1")}
                          value={(img.shotType as PhotoShotType) || "other"}
                          disabled={updatingId === img.id}
                          onChange={(e) =>
                            void handleUpdateImage(img.id, { shotType: e.target.value as PhotoShotType })
                          }
                        >
                          {PHOTO_SHOT_TYPES.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        <select
                          className={cn(selectClass, "text-[10px] py-1")}
                          value={(img.expression as PhotoExpression) || "neutral"}
                          disabled={updatingId === img.id}
                          onChange={(e) =>
                            void handleUpdateImage(img.id, { expression: e.target.value as PhotoExpression })
                          }
                        >
                          {PHOTO_EXPRESSIONS.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={cn(btnSecondaryClass, "w-full !text-[10px] !py-1")}
                          disabled={extractingId === img.id || extractingAll}
                          onClick={() => void handleExtractOne(img.id)}
                        >
                          {extractingId === img.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <ScanFace className="w-3 h-3" />
                          )}
                          {img.faceCropUrl ? "重新提取" : "提取人脸"}
                        </button>
                        {img.faceCropUrl && (
                          <div
                            className="rounded overflow-hidden border border-[#00cec9]/30 pt-0.5"
                            style={{
                              backgroundImage:
                                "linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)",
                              backgroundSize: "10px 10px",
                              backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0",
                              backgroundColor: "#1a1a1a",
                            }}
                          >
                            <img src={img.faceCropUrl} alt="人脸抠图" className="w-full aspect-square object-contain" />
                            <p className="text-[8px] text-center text-[#00cec9] py-0.5">人脸参考</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )}
          {images.length < 12 && (
            <button
              type="button"
              className="w-full py-2 rounded border border-dashed border-[#555] text-gray-500 hover:border-[#f89443] hover:text-[#f89443] transition-colors text-xs"
              onClick={() => fileRef.current?.click()}
            >
              <Plus className="w-4 h-4 inline mr-1" />
              继续添加（{PHOTO_SHOT_TYPES.find((s) => s.id === uploadShotType)?.label}）
            </button>
          )}
        </div>
      )}
    </NodeCard>
  );
}

function PersonaCard({
  persona,
  onEdit,
  onDelete,
}: {
  persona: Persona;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const photos = persona.referenceImages ?? [];
  const cover = photos[0]?.imageUrl ?? persona.referenceImageUrl;

  return (
    <div className="rounded-lg border border-[#4a4a4a] bg-[#353535] overflow-hidden hover:border-[#f89443]/40 transition-colors flex flex-col h-full">
      {cover ? (
        <div className="relative h-40 bg-[#252525]">
          <img src={cover} alt={persona.name} className="w-full h-full object-cover" />
          {photos.length > 1 && (
            <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-[#74b9ff]/20 text-[#74b9ff] border border-[#74b9ff]/40">
              {photos.length} 张
            </span>
          )}
        </div>
      ) : (
        <div className="h-40 bg-[#252525] flex items-center justify-center text-gray-600">
          <Image className="w-10 h-10 opacity-30" />
        </div>
      )}
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="text-sm font-bold text-gray-100 mb-1">{persona.name}</h3>
        <p className="text-[11px] text-gray-500 line-clamp-2 flex-1">
          {persona.selfIntroduction || "暂无自我介绍"}
        </p>
        <div className="flex flex-wrap gap-1 mt-2">
          {(getVoiceToneLabel(persona.voiceTone) || persona.voiceSampleUrl) && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-[#a29bfe]/40 bg-[#a29bfe]/10 text-[#a29bfe]">
              <Mic className="w-2.5 h-2.5" />
              {persona.voiceSampleUrl ? "自定义音色样本" : getVoiceToneLabel(persona.voiceTone)}
            </span>
          )}
          {getExpressionToneLabel(persona.expressionTone) && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-[#ffeaa7]/40 bg-[#ffeaa7]/10 text-[#ffeaa7]">
              <Smile className="w-2.5 h-2.5" />
              {getExpressionToneLabel(persona.expressionTone)}
            </span>
          )}
          {photos.some((p) => p.shotType === "front_face") && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#00cec9]/40 bg-[#00cec9]/10 text-[#00cec9]">
              正脸
            </span>
          )}
          {photos.some((p) => p.faceCropUrl) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#55efc4]/40 bg-[#55efc4]/10 text-[#55efc4]">
              已抠脸
            </span>
          )}
          {(persona.heightCm || persona.weightKg) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#81ecec]/40 bg-[#81ecec]/10 text-[#81ecec]">
              {persona.heightCm ? `${persona.heightCm}cm` : ""}
              {persona.heightCm && persona.weightKg ? " · " : ""}
              {persona.weightKg ? `${persona.weightKg}kg` : ""}
            </span>
          )}
        </div>
        {persona.douyinProfileUrl && (
          <a
            href={persona.douyinProfileUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-[#fd79a8] hover:underline inline-flex items-center gap-1 mt-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Link className="w-3 h-3" /> 抖音主页
          </a>
        )}
        <div className="flex gap-1.5 mt-3 pt-2 border-t border-[#444]">
          <button type="button" className={cn(btnSecondaryClass, "flex-1")} onClick={onEdit}>
            <Edit className="w-3 h-3" /> 编辑
          </button>
          <button type="button" className={btnDangerClass} onClick={onDelete}>
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

const emptyForm: PersonaFormData = {
  name: "",
  selfIntroduction: "",
  douyinProfileUrl: "",
  description: "",
  personality: "",
  voiceTone: "douyin_host",
  voiceStyle: "",
  voiceSampleDescription: "",
  backgroundStory: "",
  expressionTone: "subtle_natural",
  expressionNotes: "",
  heightCm: null,
  weightKg: null,
};

export default function Personas() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [form, setForm] = useState<PersonaFormData>(emptyForm);
  const queryClient = useQueryClient();

  const { data: personas = [], isLoading } = useQuery({
    queryKey: ["personas"],
    queryFn: () => api.get<Persona[]>("/personas"),
    staleTime: 60_000,
  });

  const syncPersonaCache = useCallback(
    (persona: Persona) => {
      queryClient.setQueryData<Persona[]>(["personas"], (old) =>
        old?.map((item) => (item.id === persona.id ? persona : item)) ?? old
      );
    },
    [queryClient]
  );

  const applyPersonaChange = useCallback(
    (updater: (prev: Persona) => Persona) => {
      setEditingPersona((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        syncPersonaCache(next);
        return next;
      });
    },
    [syncPersonaCache]
  );

  const createPersona = useMutation({
    mutationFn: (values: PersonaFormData) => api.post<Persona>("/personas", values),
    onError: (error: Error) => toast.error(error.message || "创建失败"),
  });

  const updatePersona = useMutation({
    mutationFn: ({ personaId, ...values }: PersonaFormData & { personaId: number }) =>
      api.patch<Persona>(`/personas/${personaId}`, values),
    onError: (error: Error) => toast.error(error.message || "保存失败"),
  });

  const deletePersona = useMutation({
    mutationFn: (personaId: number) => api.delete(`/personas/${personaId}`),
    onSuccess: () => {
      toast.success("人设已删除");
      queryClient.invalidateQueries({ queryKey: ["personas"] });
    },
    onError: (error: Error) => toast.error(error.message || "删除失败"),
  });

  const openCreate = () => {
    setEditingPersona(null);
    setForm(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = (persona: Persona) => {
    setEditingPersona(persona);
    setForm({
      name: persona.name,
      selfIntroduction: persona.selfIntroduction ?? "",
      douyinProfileUrl: persona.douyinProfileUrl ?? "",
      description: persona.description ?? "",
      personality: persona.personality ?? "",
      voiceTone: persona.voiceTone ?? "douyin_host",
      voiceStyle: persona.voiceStyle ?? "",
      voiceSampleDescription: persona.voiceSampleDescription ?? "",
      backgroundStory: persona.backgroundStory ?? "",
      expressionTone: persona.expressionTone ?? "subtle_natural",
      expressionNotes: persona.expressionNotes ?? "",
      heightCm: persona.heightCm ?? null,
      weightKg: persona.weightKg ?? null,
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingPersona(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("请输入名称");
      return;
    }
    if (!form.selfIntroduction?.trim()) {
      toast.error("请填写自我介绍");
      return;
    }
    if (editingPersona) {
      const saved = await updatePersona.mutateAsync({ personaId: editingPersona.id, ...form });
      toast.success("保存成功");
      const refreshed = await api.get<Persona>(`/personas/${saved.id}`);
      setEditingPersona(refreshed);
      syncPersonaCache(refreshed);
    } else {
      const created = await createPersona.mutateAsync(form);
      toast.success("人设已创建，可继续上传照片");
      const detail = await api.get<Persona>(`/personas/${created.id}`);
      setEditingPersona(detail);
      queryClient.setQueryData<Persona[]>(["personas"], (old) => [...(old ?? []), detail]);
    }
  };

  const saving = createPersona.isPending || updatePersona.isPending;

  const setField = (key: keyof PersonaFormData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setNumberField = (key: "heightCm" | "weightKg", raw: string) => {
    const trimmed = raw.trim();
    setForm((prev) => ({
      ...prev,
      [key]: trimmed === "" ? null : Number(trimmed),
    }));
  };

  return (
    <ComfyPage>
      <ComfyPageHeader
        title="人设管理"
        subtitle="管理数字人设的照片集合、自我介绍与抖音主页"
        action={
          <button type="button" className={btnPrimaryClass} onClick={openCreate}>
            <Plus className="w-4 h-4" /> 新建人设
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <ComfySpinner />
        </div>
      ) : personas.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {personas.map((persona) => (
            <PersonaCard
              key={persona.id}
              persona={persona}
              onEdit={() => openEdit(persona)}
              onDelete={() => {
                if (window.confirm("删除此人设？关联照片也会一并删除")) {
                  deletePersona.mutate(persona.id);
                }
              }}
            />
          ))}
        </div>
      ) : (
        <NodeCard title="人设列表" accent="#fd79a8">
          <ComfyEmpty
            message="暂无人设"
            action={
              <button type="button" className={btnPrimaryClass} onClick={openCreate}>
                <Plus className="w-4 h-4" /> 创建第一个人设
              </button>
            }
          />
        </NodeCard>
      )}

      <ComfyDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingPersona ? `编辑 · ${editingPersona.name}` : "新建人设"}
        footer={
          <>
            <button type="button" className={btnSecondaryClass} onClick={closeDrawer}>
              取消
            </button>
            <button type="button" className={btnPrimaryClass} disabled={saving} onClick={handleSave}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingPersona ? "保存" : "创建"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <NodeCard title="基本信息" accent="#fd79a8">
            <div className="space-y-3">
              <NodeField label="名称 *">
                <input className={inputClass} value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="人设名称，如：小智" />
              </NodeField>
              <NodeField label="自我介绍 *">
                <textarea
                  className={cn(inputClass, "min-h-[100px] resize-y")}
                  value={form.selfIntroduction}
                  onChange={(e) => setField("selfIntroduction", e.target.value)}
                  placeholder="介绍你是谁、做什么、风格特点…"
                  maxLength={500}
                />
              </NodeField>
              <NodeField label="抖音主页 URL">
                <input className={inputClass} value={form.douyinProfileUrl} onChange={(e) => setField("douyinProfileUrl", e.target.value)} placeholder="https://www.douyin.com/user/..." />
              </NodeField>
              <div className="grid grid-cols-2 gap-2">
                <NodeField label="身高 (cm)">
                  <input
                    className={inputClass}
                    type="number"
                    min={100}
                    max={250}
                    value={form.heightCm ?? ""}
                    onChange={(e) => setNumberField("heightCm", e.target.value)}
                    placeholder="如 172"
                  />
                </NodeField>
                <NodeField label="体重 (kg)">
                  <input
                    className={inputClass}
                    type="number"
                    min={30}
                    max={200}
                    value={form.weightKg ?? ""}
                    onChange={(e) => setNumberField("weightKg", e.target.value)}
                    placeholder="如 65"
                  />
                </NodeField>
              </div>
              <p className="text-[10px] text-gray-500 -mt-1">
                数字人生成时会写入体态参数，配合人脸抠图参考使用。
              </p>
              <NodeField label="外观描述">
                <textarea className={cn(inputClass, "min-h-[60px] resize-y")} value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="外貌、穿着、气质…" />
              </NodeField>
              <NodeField label="性格特点">
                <input className={inputClass} value={form.personality} onChange={(e) => setField("personality", e.target.value)} placeholder="如：活泼、专业、幽默" />
              </NodeField>
              <NodeField label="背景故事">
                <textarea className={cn(inputClass, "min-h-[60px] resize-y")} value={form.backgroundStory} onChange={(e) => setField("backgroundStory", e.target.value)} placeholder="可选：人设背景故事" />
              </NodeField>
            </div>
          </NodeCard>

          <ExpressionToneSelector
            value={form.expressionTone ?? "subtle_natural"}
            onChange={(toneId) => setField("expressionTone", toneId)}
            notes={form.expressionNotes ?? ""}
            onNotesChange={(v) => setField("expressionNotes", v)}
          />

          <VoiceToneSelector
            value={form.voiceTone ?? ""}
            onChange={(toneId) => setField("voiceTone", toneId)}
            voiceStyle={form.voiceStyle ?? ""}
            onVoiceStyleChange={(v) => setField("voiceStyle", v)}
            voiceSampleDescription={form.voiceSampleDescription}
            onVoiceSampleDescriptionChange={(v) => setField("voiceSampleDescription", v)}
            personaId={editingPersona?.id}
            sampleUrl={editingPersona?.voiceSampleUrl}
            onSampleUpdated={async () => {
              if (!editingPersona) return;
              const refreshed = await api.get<Persona>(`/personas/${editingPersona.id}`);
              setEditingPersona(refreshed);
              syncPersonaCache(refreshed);
              setField("voiceTone", refreshed.voiceTone ?? "custom_sample");
              setField("voiceSampleDescription", refreshed.voiceSampleDescription ?? "");
            }}
          />

          {editingPersona ? (
            <PhotoGallery
              personaId={editingPersona.id}
              images={editingPersona.referenceImages ?? []}
              onPersonaChange={applyPersonaChange}
            />
          ) : (
            <div className="rounded-lg border border-[#74b9ff]/30 bg-[#74b9ff]/10 px-3 py-2.5 text-xs text-[#74b9ff]">
              先点击「创建」保存基本信息，然后即可上传照片集合。
            </div>
          )}
        </div>
      </ComfyDrawer>
    </ComfyPage>
  );
}
