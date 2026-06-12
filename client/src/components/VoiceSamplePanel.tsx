import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { btnDangerClass, btnPrimaryClass, btnSecondaryClass, inputClass } from "@/components/comfy-ui";
import { uploadPersonaVoiceSample } from "@/lib/persona-voice-upload";

const RECORD_HINT = "请用自然语气录制 5–30 秒纯净人声（仅一种人声、无背景杂音）。浏览器录音会自动转为 wav 再注册可灵；也可直接上传 mp3 / wav。";
const MAX_RECORD_SEC = 60;

type Props = {
  personaId: number;
  sampleUrl?: string | null;
  sampleDescription?: string | null;
  onSampleChange: (data: { url: string; description: string; toneId: string }) => void;
  onSampleRemove: () => void;
  onDescriptionChange: (description: string) => void;
};

export default function VoiceSamplePanel({
  personaId,
  sampleUrl,
  sampleDescription,
  onSampleChange,
  onSampleRemove,
  onDescriptionChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|m4a|webm|ogg)$/i)) {
      toast.error("请上传音频文件（mp3 / wav / m4a / webm）");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("音频不能超过 10MB");
      return;
    }
    setUploading(true);
    try {
      const result = await uploadPersonaVoiceSample(personaId, file);
      if (result.klingVoiceError) {
        toast.warning(`音色已保存，但可灵注册失败：${result.klingVoiceError}`);
      } else if (result.klingVoiceId) {
        toast.success("音色样本已上传并注册到可灵");
      } else {
        toast.success("音色样本已上传并分析");
      }
      onSampleChange({
        url: result.url,
        description: result.description ?? "",
        toneId: "custom_sample",
      });
      setPreviewUrl(result.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 512) {
          toast.error("录音太短，请至少说几秒");
          return;
        }
        const localUrl = URL.createObjectURL(blob);
        setPreviewUrl(localUrl);
        const file = new File([blob], `voice-record-${Date.now()}.webm`, { type: mimeType });
        await uploadFile(file);
      };
      recorder.start(200);
      setRecording(true);
      setRecordSec(0);
      timerRef.current = window.setInterval(() => {
        setRecordSec((s) => {
          if (s + 1 >= MAX_RECORD_SEC) {
            stopRecording();
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error("无法访问麦克风，请检查浏览器权限");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  const displayUrl = previewUrl ?? sampleUrl ?? null;

  return (
    <div className="space-y-3 rounded-lg border border-[#444] bg-[#2a2a2a] p-3">
      <p className="text-[10px] text-gray-500 leading-relaxed">{RECORD_HINT}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnSecondaryClass}
          disabled={uploading || recording}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          上传音频
        </button>
        {!recording ? (
          <button
            type="button"
            className={cn(btnPrimaryClass, "!py-2")}
            disabled={uploading}
            onClick={startRecording}
          >
            <Mic className="w-3.5 h-3.5" />
            开始录制
          </button>
        ) : (
          <button type="button" className={cn(btnDangerClass, "!py-2")} onClick={stopRecording}>
            <Square className="w-3.5 h-3.5 fill-current" />
            停止 ({recordSec}s)
          </button>
        )}
        {sampleUrl && (
          <button type="button" className={btnSecondaryClass} disabled={uploading} onClick={onSampleRemove}>
            <Trash2 className="w-3.5 h-3.5" />
            移除样本
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
        }}
      />

      {displayUrl && (
        <audio src={displayUrl} controls className="w-full h-9" preload="metadata" />
      )}

      {sampleDescription != null && sampleDescription !== "" && (
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">AI 提取的音色描述（可编辑）</label>
          <textarea
            className={cn(inputClass, "min-h-[72px] resize-y text-xs")}
            value={sampleDescription}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
