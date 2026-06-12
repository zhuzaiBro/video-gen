import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Search, Trash2, Video, Merge, Loader2, ExternalLink, PenLine, Sparkles, TrendingUp, Flame, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { api, type Persona, type ScriptSegments, type TechTopic, type TechTopicSearchRecord, type VideoScript, type VideoTask } from "@/lib/api";
import { toast } from "sonner";
import {
  ComfyPage,
  ComfyPageHeader,
  ComfyEmpty,
  ComfyDrawer,
  ComfyModal,
  ComfyAlert,
  ComfySpinner,
  NodeCard,
  NodeField,
  StatusBadge,
  inputClass,
  selectClass,
  btnPrimaryClass,
  btnPrimaryBlockClass,
  btnSecondaryClass,
  btnGhostClass,
  btnDangerClass,
} from "@/components/comfy-ui";
import { cn } from "@/lib/utils";

type GenParams = {
  duration: number;
  resolution: "720p" | "1080p" | "4K";
  aspectRatio: "16:9" | "9:16";
  sound: boolean;
};

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function formatPlatform(platform: string) {
  if (platform === "tech-topic") return "技术选题";
  if (platform === "markdown") return "Markdown";
  return platform;
}

function formatSourceUrl(sourceUrl: string) {
  if (sourceUrl.startsWith("markdown://")) return "Markdown 导入";
  return sourceUrl;
}

function estimateMinutes(params: GenParams): { low: number; high: number } {
  let low = params.duration <= 5 ? 3 : params.duration <= 10 ? 5 : 6;
  let high = params.duration <= 5 ? 6 : params.duration <= 10 ? 10 : 12;
  if (params.resolution === "1080p" || params.resolution === "4K") {
    low += 2;
    high += 4;
  }
  if (params.sound) {
    low += 1;
    high += 2;
  }
  return { low, high };
}

function buildEstimateMessage(params: GenParams) {
  const { low, high } = estimateMinutes(params);
  return `预计 ${low}–${high} 分钟完成。视频由可灵 API 生成，提交后可在「生成工作室」查看进度。`;
}

function SegmentGenPanel({
  scriptDuration,
  segments,
  segmentEstimate,
  continuityEnabled,
  setContinuityEnabled,
  bottomBarrageEnabled,
  setBottomBarrageEnabled,
  genPersonaId,
  setGenPersonaId,
  genParams,
  setGenParams,
  personas,
  canGenerate,
  onGenerateAll,
  onAssemble,
  assemblePending,
  allSegmentsReady,
  assembledVideoUrl,
  onOpenStudio,
}: {
  scriptDuration: number | null;
  segments: ScriptSegments["segments"];
  segmentEstimate: { totalSec: number; count: number; low: number; high: number } | null;
  continuityEnabled: boolean;
  setContinuityEnabled: (v: boolean) => void;
  bottomBarrageEnabled: boolean;
  setBottomBarrageEnabled: (v: boolean) => void;
  genPersonaId: number | undefined;
  setGenPersonaId: (v: number) => void;
  genParams: GenParams;
  setGenParams: React.Dispatch<React.SetStateAction<GenParams>>;
  personas: Persona[];
  canGenerate: boolean;
  onGenerateAll: () => void;
  onAssemble: () => void;
  assemblePending: boolean;
  allSegmentsReady: boolean;
  assembledVideoUrl?: string | null;
  onOpenStudio: () => void;
}) {
  return (
    <NodeCard title="分镜生成 · 完整还原" accent="#00cec9">
      <div className="space-y-3">
        {scriptDuration != null && (
          <ComfyAlert
            type="info"
            message={`原脚本约 ${scriptDuration} 秒，共 ${segments.length} 个分镜`}
            description={`按分镜逐段生成（每段按脚本时长映射为 3–15 秒整数），全部完成后整合为完整成片。预计总可生成约 ${segmentEstimate?.totalSec ?? "—"} 秒。`}
          />
        )}
        <NodeField label="选择人设">
          <select className={selectClass} value={genPersonaId ?? ""} onChange={(e) => setGenPersonaId(Number(e.target.value))}>
            <option value="" disabled>
              选择人设
            </option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </NodeField>
        <div className="grid grid-cols-2 gap-2">
          <NodeField label="分辨率">
            <select
              className={selectClass}
              value={genParams.resolution}
              onChange={(e) => setGenParams({ ...genParams, resolution: e.target.value as GenParams["resolution"] })}
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="4K">4K</option>
            </select>
          </NodeField>
          <NodeField label="宽高比">
            <select
              className={selectClass}
              value={genParams.aspectRatio}
              onChange={(e) => setGenParams({ ...genParams, aspectRatio: e.target.value as GenParams["aspectRatio"] })}
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
            </select>
          </NodeField>
          <NodeField label="音效">
            <select
              className={selectClass}
              value={genParams.sound ? "on" : "off"}
              onChange={(e) => setGenParams({ ...genParams, sound: e.target.value === "on" })}
            >
              <option value="on">开启</option>
              <option value="off">关闭</option>
            </select>
          </NodeField>
        </div>
        <label className="flex items-start gap-2 cursor-pointer text-xs text-gray-400">
          <input
            type="checkbox"
            checked={continuityEnabled}
            onChange={(e) => setContinuityEnabled(e.target.checked)}
            className="accent-[#00cec9] mt-0.5"
          />
          <span>
            <span className="text-gray-300">镜头连贯性</span>
            <span className="block text-[10px] text-gray-500 mt-0.5">
              第 2 段起用上一段片尾帧作首帧；开启后批量生成将按顺序等待
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer text-xs text-gray-400">
          <input
            type="checkbox"
            checked={bottomBarrageEnabled}
            onChange={(e) => setBottomBarrageEnabled(e.target.checked)}
            className="accent-[#55efc4] mt-0.5"
          />
          <span>
            <span className="text-gray-300">底部弹幕</span>
            <span className="block text-[10px] text-gray-500 mt-0.5">
              整合成片时按口播分页轮播字幕（自动换行缩字），距底约 80px，长文案可完整看完
            </span>
          </span>
        </label>
        {segmentEstimate && (
          <p className="text-[10px] text-gray-500">
            待生成 {segmentEstimate.count} 段
            {continuityEnabled
              ? " · 连贯模式按顺序生成，总耗时更长"
              : ` · 预计 ${segmentEstimate.low}–${segmentEstimate.high} 分钟`}
          </p>
        )}
        <button type="button" className={btnPrimaryBlockClass} disabled={!canGenerate} onClick={onGenerateAll}>
          <Video className="w-4 h-4" /> 全部生成分镜
        </button>
        <button
          type="button"
          className={btnSecondaryClass + " w-full py-2.5"}
          disabled={!allSegmentsReady || assemblePending}
          onClick={onAssemble}
        >
          {assemblePending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
          整合成片
        </button>
        {assembledVideoUrl && (
          <ComfyAlert
            type="success"
            message="已整合成片"
            description={
              <a href={assembledVideoUrl} target="_blank" rel="noreferrer" className="underline">
                打开完整视频
              </a>
            }
          />
        )}
        <button type="button" className={cn(btnGhostClass, "w-full py-2")} onClick={onOpenStudio}>
          <ExternalLink className="w-3.5 h-3.5" /> 在生成工作室编辑连接并导出
        </button>
      </div>
    </NodeCard>
  );
}

export default function Scripts() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [sourceUrl, setSourceUrl] = useState("");
  const [personaId, setPersonaId] = useState<number | undefined>();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [genPersonaId, setGenPersonaId] = useState<number | undefined>();
  const [genParams, setGenParams] = useState<GenParams>({
    duration: 5,
    resolution: "720p",
    aspectRatio: "16:9",
    sound: true,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [generatingSegmentIndex, setGeneratingSegmentIndex] = useState<number | null>(null);
  const [continuityEnabled, setContinuityEnabled] = useState(true);
  const [bottomBarrageEnabled, setBottomBarrageEnabled] = useState(false);
  const [techQuery, setTechQuery] = useState("");
  const [techTopics, setTechTopics] = useState<TechTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [techPersonaId, setTechPersonaId] = useState<number | undefined>();
  const [techExtraQuery, setTechExtraQuery] = useState("");
  const [techTargetDuration, setTechTargetDuration] = useState(90);
  const [activeSearchRecordId, setActiveSearchRecordId] = useState<number | null>(null);
  const [mdContent, setMdContent] = useState("");
  const [mdTitle, setMdTitle] = useState("");
  const [mdPersonaId, setMdPersonaId] = useState<number | undefined>();
  const [mdTargetDuration, setMdTargetDuration] = useState(90);
  const [mdExtraNotes, setMdExtraNotes] = useState("");

  const selectedTopic = techTopics.find((t) => t.id === selectedTopicId) ?? null;

  const updateContinuityMutation = useMutation({
    mutationFn: ({ scriptId, enabled }: { scriptId: number; enabled: boolean }) =>
      api.patch<VideoScript>(`/scripts/${scriptId}`, { continuityEnabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
      if (selectedId != null) {
        queryClient.invalidateQueries({ queryKey: ["script-segments", selectedId] });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateBottomBarrageMutation = useMutation({
    mutationFn: ({ scriptId, enabled }: { scriptId: number; enabled: boolean }) =>
      api.patch<VideoScript>(`/scripts/${scriptId}`, { bottomBarrageEnabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
      if (selectedId != null) {
        queryClient.invalidateQueries({ queryKey: ["script-segments", selectedId] });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateGenPersonaMutation = useMutation({
    mutationFn: ({ scriptId, personaId }: { scriptId: number; personaId: number }) =>
      api.patch<VideoScript>(`/scripts/${scriptId}`, { personaId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const polishMutation = useMutation({
    mutationFn: (scriptId: number) => api.post<VideoScript>(`/scripts/${scriptId}/polish`),
    onSuccess: () => {
      toast.success("脚本已润色");
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
      if (selectedId != null) {
        queryClient.invalidateQueries({ queryKey: ["script-segments", selectedId] });
      }
    },
    onError: (err: Error) => toast.error(err.message || "润色失败"),
  });

  const handleContinuityChange = (enabled: boolean) => {
    setContinuityEnabled(enabled);
    if (selectedId != null) {
      updateContinuityMutation.mutate({ scriptId: selectedId, enabled });
    }
  };

  const handleBottomBarrageChange = (enabled: boolean) => {
    setBottomBarrageEnabled(enabled);
    if (selectedId != null) {
      updateBottomBarrageMutation.mutate({ scriptId: selectedId, enabled });
    }
  };

  const handleGenPersonaChange = (personaId: number) => {
    setGenPersonaId(personaId);
    if (selectedId != null) {
      updateGenPersonaMutation.mutate({ scriptId: selectedId, personaId });
    }
  };

  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: () => api.get<Persona[]>("/personas"),
  });

  const { data: techSearchHistory = [] } = useQuery({
    queryKey: ["tech-topic-search-history"],
    queryFn: () => api.get<TechTopicSearchRecord[]>("/scripts/tech-topics/history"),
  });

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ["video-scripts"],
    queryFn: () => api.get<VideoScript[]>("/scripts"),
    refetchInterval: (query) => {
      const list = query.state.data as VideoScript[] | undefined;
      const hasActive = list?.some((item) => item.status === "pending" || item.status === "processing");
      return hasActive ? 3000 : false;
    },
  });

  const selected = scripts.find((item) => item.id === selectedId) ?? null;

  const { data: segmentData, refetch: refetchSegments } = useQuery({
    queryKey: ["script-segments", selectedId],
    queryFn: () => api.get<ScriptSegments>(`/scripts/${selectedId}/segments`),
    enabled: Boolean(selectedId && selected?.status === "completed"),
    refetchInterval: (query) => {
      const data = query.state.data as ScriptSegments | undefined;
      return data && data.processingCount > 0 ? 3000 : false;
    },
  });

  useEffect(() => {
    if (!selected || selected.status !== "completed") return;
    if (selected.personaId != null) {
      setGenPersonaId(selected.personaId);
    } else {
      setGenPersonaId(undefined);
    }
    const recommended = (selected.recommendedDurationSec ?? 10) as GenParams["duration"];
    setGenParams((prev) => ({ ...prev, duration: recommended }));
  }, [selected?.id, selected?.status, selected?.personaId, selected?.recommendedDurationSec]);

  useEffect(() => {
    const value = segmentData?.continuityEnabled ?? selected?.continuityEnabled;
    if (value != null) setContinuityEnabled(value);
  }, [selected?.id, selected?.continuityEnabled, segmentData?.continuityEnabled]);

  useEffect(() => {
    const value = segmentData?.bottomBarrageEnabled ?? selected?.bottomBarrageEnabled;
    if (value != null) setBottomBarrageEnabled(value);
  }, [selected?.id, selected?.bottomBarrageEnabled, segmentData?.bottomBarrageEnabled]);

  const analyzeMutation = useMutation({
    mutationFn: () =>
      api.post<VideoScript>("/scripts/analyze", {
        sourceUrl: sourceUrl.trim(),
        personaId,
      }),
    onSuccess: (data) => {
      toast.success("已开始拆解脚本");
      setSourceUrl("");
      setSelectedId(data.id);
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const techSearchMutation = useMutation({
    mutationFn: () =>
      api.post<{ searchRecordId?: number; topics: TechTopic[] }>("/scripts/tech-topics/search", {
        query: techQuery.trim() || undefined,
        limit: 8,
      }),
    onSuccess: (data) => {
      setTechTopics(data.topics);
      setSelectedTopicId(data.topics[0]?.id ?? null);
      setActiveSearchRecordId(data.searchRecordId ?? null);
      toast.success(`找到 ${data.topics.length} 个热门话题`);
      queryClient.invalidateQueries({ queryKey: ["tech-topic-search-history"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteTechSearchMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/scripts/tech-topics/history/${id}`),
    onSuccess: (_data, id) => {
      if (activeSearchRecordId === id) setActiveSearchRecordId(null);
      toast.success("已删除搜索记录");
      queryClient.invalidateQueries({ queryKey: ["tech-topic-search-history"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const loadTechSearchRecord = (record: TechTopicSearchRecord) => {
    setTechQuery(record.query ?? "");
    setTechTopics(record.topics);
    setSelectedTopicId(record.topics[0]?.id ?? null);
    setActiveSearchRecordId(record.id);
  };

  const mdScriptMutation = useMutation({
    mutationFn: () =>
      api.post<VideoScript>("/scripts/from-markdown", {
        markdown: mdContent.trim(),
        title: mdTitle.trim() || undefined,
        personaId: mdPersonaId,
        targetDurationSec: mdTargetDuration,
        extraNotes: mdExtraNotes.trim() || undefined,
      }),
    onSuccess: (data) => {
      toast.success("已开始将 Markdown 拆解为分镜脚本");
      setMdContent("");
      setMdTitle("");
      setMdExtraNotes("");
      setSelectedId(data.id);
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const techScriptMutation = useMutation({
    mutationFn: () =>
      api.post<VideoScript>("/scripts/from-tech-topic", {
        topic: selectedTopic,
        personaId: techPersonaId,
        targetDurationSec: techTargetDuration,
        extraQuery: techExtraQuery.trim() || undefined,
      }),
    onSuccess: (data) => {
      toast.success("已开始生成讲解脚本");
      setSelectedId(data.id);
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/scripts/${id}`),
    onSuccess: () => {
      toast.success("已删除");
      if (selectedId) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post<VideoTask>(`/scripts/${selected!.id}/generate-video`, {
        personaId: genPersonaId,
        ...genParams,
      }),
    onSuccess: (task) => {
      toast.success(`任务 #${task.id} 已加入队列`);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["video-tasks"] });
      navigate("/generate");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const segmentGenParams = useMemo(
    () => ({
      personaId: genPersonaId,
      resolution: genParams.resolution,
      aspectRatio: genParams.aspectRatio,
      sound: genParams.sound,
      continuity: continuityEnabled,
      sceneCompose: true,
    }),
    [genPersonaId, genParams.resolution, genParams.aspectRatio, genParams.sound, continuityEnabled]
  );

  const generateSegmentMutation = useMutation({
    mutationFn: (segmentIndex: number) =>
      api.post<VideoTask>(`/scripts/${selected!.id}/segments/${segmentIndex}/generate`, segmentGenParams),
    onMutate: (segmentIndex) => setGeneratingSegmentIndex(segmentIndex),
    onSettled: () => setGeneratingSegmentIndex(null),
    onSuccess: (task) => {
      toast.success(`分镜任务 #${task.id} 已加入队列`);
      if (task.videoParams?.sceneComposeWarning) {
        toast.warning(`场景背景合成失败，已回退人设原图：${task.videoParams.sceneComposeWarning}`);
      }
      refetchSegments();
      queryClient.invalidateQueries({ queryKey: ["video-tasks"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generateAllMutation = useMutation({
    mutationFn: () =>
      api.post<{ createdCount: number; skippedCount: number; taskIds: number[] }>(
        `/scripts/${selected!.id}/segments/generate-all`,
        segmentGenParams
      ),
    onSuccess: (result) => {
      toast.success(`已提交 ${result.createdCount} 个分镜任务`);
      setConfirmAllOpen(false);
      refetchSegments();
      queryClient.invalidateQueries({ queryKey: ["video-tasks"] });
      navigate(`/generate?scriptId=${selected!.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const assembleMutation = useMutation({
    mutationFn: () =>
      api.post<{ videoUrl: string }>(`/scripts/${selected!.id}/assemble`, {
        segmentOrder: segmentData?.assemblyOrder ?? segmentData?.segments.map((s) => s.index),
      }),
    onSuccess: () => {
      toast.success("成片整合完成");
      refetchSegments();
      navigate(`/generate?scriptId=${selected!.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const decomposed = selected?.decomposedScript as Record<string, unknown> | null | undefined;
  const segments = segmentData?.segments ?? [];
  const hasSegmentWorkflow = segments.length > 0;
  const estimateText = useMemo(() => buildEstimateMessage(genParams), [genParams]);
  const canGenerate = selected?.status === "completed" && Boolean(genPersonaId);
  const scriptDuration = selected?.scriptDurationSec ?? null;
  const maxKlingDuration = selected?.maxKlingDurationSec ?? 15;
  const minKlingDuration = selected?.minKlingDurationSec ?? (maxKlingDuration >= 15 ? 3 : 5);
  const durationTruncated = scriptDuration != null && scriptDuration > genParams.duration;
  const segmentEstimate = useMemo(() => {
    if (!hasSegmentWorkflow) return null;
    const totalSec = segments.reduce((sum, s) => sum + s.klingDurationSec, 0);
    const { low, high } = estimateMinutes({ ...genParams, duration: 10 });
    const count = segments.filter((s) => s.taskStatus !== "completed").length || segments.length;
    return { totalSec, count, low: low * count, high: high * count };
  }, [hasSegmentWorkflow, segments, genParams]);

  return (
    <ComfyPage>
      <ComfyPageHeader
        title="脚本拆解"
        subtitle="从视频 URL 拆解口播、Markdown 转分镜脚本，或搜索热门技术话题生成讲解稿"
      />

      <div className="grid lg:grid-cols-2 gap-4">
      <NodeCard title="新建拆解" accent="#a29bfe">
        <div className="space-y-3">
          <NodeField label="视频直链 URL">
            <div className="relative">
              <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                className={cn(inputClass, "pl-8")}
                placeholder="MP4 或 COS 公开地址，≤20MB"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </div>
          </NodeField>
          <NodeField label="关联人设（可选）">
            <select
              className={selectClass}
              value={personaId ?? ""}
              onChange={(e) => setPersonaId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">不关联</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </NodeField>
          <button
            type="button"
            className={btnPrimaryBlockClass}
            disabled={!sourceUrl.trim().startsWith("http") || analyzeMutation.isPending}
            onClick={() => analyzeMutation.mutate()}
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            开始拆解
          </button>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            需配置 DASHSCOPE_API_KEY（百炼通义千问）。公开视频 URL 可直接分析；否则需 MP4 直链（≤20MB）。
          </p>
        </div>
      </NodeCard>

      <NodeCard title="热门技术选题" accent="#fd79a8">
        <div className="space-y-3">
          <NodeField label="聚焦方向（可选）">
            <div className="relative">
              <TrendingUp className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                className={cn(inputClass, "pl-8")}
                placeholder="如 AI Agent、Rust、K8s、Cursor…"
                value={techQuery}
                onChange={(e) => setTechQuery(e.target.value)}
              />
            </div>
          </NodeField>
          <button
            type="button"
            className={btnPrimaryBlockClass}
            disabled={techSearchMutation.isPending}
            onClick={() => techSearchMutation.mutate()}
          >
            {techSearchMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Flame className="w-4 h-4" />
            )}
            搜索热门话题
          </button>

          {techSearchHistory.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-500">搜索记录（已保存）</p>
              <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                {techSearchHistory.map((record) => (
                  <div
                    key={record.id}
                    className={cn(
                      "flex items-center gap-1 rounded border px-2 py-1.5",
                      activeSearchRecordId === record.id
                        ? "border-[#fd79a8]/50 bg-[#fd79a8]/5"
                        : "border-[#444] bg-[#252525]"
                    )}
                  >
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => loadTechSearchRecord(record)}
                    >
                      <span className="text-[10px] text-gray-300 truncate block">
                        {record.query?.trim() || "综合热门"}
                      </span>
                      <span className="text-[9px] text-gray-500">
                        {record.topicCount} 个话题 · {formatTime(record.createdAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={cn(btnGhostClass, "px-1.5 py-1 shrink-0")}
                      title="删除记录"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTechSearchMutation.mutate(record.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {techTopics.length > 0 && (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {techTopics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setSelectedTopicId(topic.id)}
                  className={cn(
                    "w-full text-left rounded-lg border p-2.5 transition-colors",
                    selectedTopicId === topic.id
                      ? "border-[#fd79a8]/60 bg-[#fd79a8]/10"
                      : "border-[#444] bg-[#2a2a2a] hover:border-[#666]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-gray-200 font-medium leading-snug">{topic.title}</span>
                    <span
                      className={cn(
                        "shrink-0 text-[10px] px-1.5 py-0.5 rounded",
                        topic.heat === "高" ? "bg-orange-500/20 text-orange-300" : "bg-gray-600/30 text-gray-400"
                      )}
                    >
                      {topic.heat}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 line-clamp-2">{topic.summary}</p>
                  {topic.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {topic.keywords.slice(0, 4).map((kw) => (
                        <span key={kw} className="text-[9px] px-1 py-0.5 rounded bg-[#333] text-gray-500">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {selectedTopic && (
            <>
              <ComfyAlert
                type="info"
                message={selectedTopic.title}
                description={
                  <span className="text-[10px]">
                    {selectedTopic.angles.length > 0 && (
                      <span className="block mb-1">角度：{selectedTopic.angles.join(" · ")}</span>
                    )}
                    {selectedTopic.sources.length > 0 && (
                      <span className="block text-gray-500">
                        参考 {selectedTopic.sources.length} 条资料（生成时将联网补充）
                      </span>
                    )}
                  </span>
                }
              />
              <NodeField label="补充要求（可选）">
                <textarea
                  className={cn(inputClass, "min-h-[52px] resize-y text-xs")}
                  placeholder="如：重点讲架构对比、面向后端、避免营销话术…"
                  value={techExtraQuery}
                  onChange={(e) => setTechExtraQuery(e.target.value)}
                />
              </NodeField>
              <div className="grid grid-cols-2 gap-2">
                <NodeField label="目标时长（秒）">
                  <input
                    type="number"
                    min={45}
                    max={180}
                    className={inputClass}
                    value={techTargetDuration}
                    onChange={(e) => setTechTargetDuration(Number(e.target.value) || 90)}
                  />
                </NodeField>
                <NodeField label="关联人设（可选）">
                  <select
                    className={selectClass}
                    value={techPersonaId ?? ""}
                    onChange={(e) => setTechPersonaId(e.target.value ? Number(e.target.value) : undefined)}
                  >
                    <option value="">不关联</option>
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </NodeField>
              </div>
              <button
                type="button"
                className={btnPrimaryBlockClass}
                disabled={techScriptMutation.isPending}
                onClick={() => techScriptMutation.mutate()}
              >
                {techScriptMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                生成讲解脚本
              </button>
            </>
          )}

          <p className="text-[10px] text-gray-500 leading-relaxed">
            通义千问联网检索程序员行业热点，搜索记录自动保存至 Supabase，刷新后可从历史恢复。
          </p>
        </div>
      </NodeCard>
      </div>

      <NodeCard title="Markdown 转脚本" accent="#55efc4">
        <div className="space-y-3">
          <p className="text-[10px] text-gray-500 leading-relaxed">
            粘贴口播稿、分镜大纲或讲解提纲（支持标题、列表、分段）。AI 将拆解为与视频拆解相同的分镜结构（口播 + 画面描述 + 贴图位）。
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <NodeField label="标题（可选）">
              <input
                className={inputClass}
                placeholder="如：空洞骑士手游测评"
                value={mdTitle}
                onChange={(e) => setMdTitle(e.target.value)}
              />
            </NodeField>
            <NodeField label="目标时长（秒）">
              <input
                className={inputClass}
                type="number"
                min={30}
                max={300}
                value={mdTargetDuration}
                onChange={(e) => setMdTargetDuration(Number(e.target.value) || 90)}
              />
            </NodeField>
            <NodeField label="关联人设（可选）">
              <select
                className={selectClass}
                value={mdPersonaId ?? ""}
                onChange={(e) => setMdPersonaId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">不关联</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </NodeField>
            <NodeField label="额外要求（可选）">
              <input
                className={inputClass}
                placeholder="如：语气更口语、多分几镜"
                value={mdExtraNotes}
                onChange={(e) => setMdExtraNotes(e.target.value)}
              />
            </NodeField>
          </div>
          <NodeField label="Markdown 内容">
            <textarea
              className={cn(inputClass, "min-h-[160px] resize-y font-mono text-xs leading-relaxed")}
              placeholder={`# 空洞骑士手游测评\n\n## 开场\n大家好，今天聊聊...\n\n## 分镜1\n- 口播：...\n- 画面：出镜者坐在书桌前，举起手机展示游戏界面`}
              value={mdContent}
              onChange={(e) => setMdContent(e.target.value)}
            />
          </NodeField>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-gray-600">{mdContent.trim().length} / 80000 字</p>
            <button
              type="button"
              className={btnPrimaryClass}
              disabled={mdContent.trim().length < 20 || mdScriptMutation.isPending}
              onClick={() => mdScriptMutation.mutate()}
            >
              {mdScriptMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              拆解 Markdown
            </button>
          </div>
        </div>
      </NodeCard>

      <NodeCard title="拆解记录" accent="#74b9ff">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <ComfySpinner />
          </div>
        ) : scripts.length === 0 ? (
          <ComfyEmpty message="暂无记录" />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {scripts.map((item) => (
              <div
                key={item.id}
                className="flex flex-col rounded-lg border border-[#444] bg-[#2a2a2a] hover:border-[#f89443]/40 cursor-pointer transition-colors overflow-hidden group"
                onClick={() => setSelectedId(item.id)}
              >
                <div className="px-3 pt-3 pb-2 border-b border-[#333] bg-[#252525]">
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <StatusBadge status={item.status} />
                    {item.platform && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#555] text-gray-500">
                        {formatPlatform(item.platform)}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-100 line-clamp-2 leading-snug min-h-[2.5rem]">
                    {item.title || `脚本 #${item.id}`}
                  </h3>
                </div>

                <div className="flex-1 p-3 space-y-2 min-h-0">
                  <p className="text-[10px] text-gray-600 truncate font-mono" title={item.sourceUrl}>
                    {formatSourceUrl(item.sourceUrl)}
                  </p>
                  {item.summary ? (
                    <p className="text-[11px] text-gray-400 line-clamp-3 leading-relaxed">{item.summary}</p>
                  ) : (
                    <p className="text-[11px] text-gray-600 italic">暂无摘要</p>
                  )}
                  {item.errorMessage && (
                    <p className="text-[10px] text-red-400 line-clamp-2 leading-relaxed">{item.errorMessage}</p>
                  )}
                </div>

                <div
                  className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[#333] bg-[#252525]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] text-gray-600 truncate">{formatTime(item.createdAt)}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.status === "completed" && (
                      <button type="button" className={btnGhostClass} onClick={() => setSelectedId(item.id)}>
                        <Video className="w-3.5 h-3.5" /> 生成
                      </button>
                    )}
                    <button
                      type="button"
                      className={btnDangerClass}
                      onClick={() => {
                        if (window.confirm("确定删除？")) deleteMutation.mutate(item.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </NodeCard>

      <ComfyDrawer
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.title || (selected ? `脚本 #${selected.id}` : "脚本详情")}
      >
        {selected && (
          <div className="space-y-3 pb-8">
            {selected.status === "completed" && (
              <>
                <Link
                  href={`/scripts/${selected.id}/edit`}
                  className={cn(btnPrimaryBlockClass, "flex items-center justify-center gap-2 no-underline")}
                >
                  <PenLine className="w-4 h-4" />
                  编辑脚本信息
                </Link>
                <button
                  type="button"
                  className={cn(btnSecondaryClass, "w-full py-2.5 flex items-center justify-center gap-2")}
                  disabled={polishMutation.isPending}
                  onClick={() => polishMutation.mutate(selected.id)}
                >
                  {polishMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  AI 润色脚本
                </button>
                <p className="text-[10px] text-gray-600 px-1 -mt-1 leading-relaxed">
                  优化口播与文案表达，不改变核心观点、分镜数量与时间轴。
                </p>
              </>
            )}

            <NodeCard title="脚本信息" accent="#a29bfe">
              <p className="text-sm text-gray-200 font-medium">{selected.title || `脚本 #${selected.id}`}</p>
              {selected.summary ? (
                <p className="text-xs text-gray-400 mt-2 leading-relaxed line-clamp-4">{selected.summary}</p>
              ) : (
                <p className="text-xs text-gray-600 mt-2">暂无摘要</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3 text-[10px] text-gray-500 font-mono">
                {Boolean(decomposed?.hook) && <span>Hook ✓</span>}
                {Boolean(decomposed?.body) && <span>Body ✓</span>}
                {Boolean(decomposed?.cta) && <span>CTA ✓</span>}
                {selected.rawTranscript && <span>口播 ✓</span>}
                {segments.length > 0 && <span>{segments.length} 分镜</span>}
              </div>
            </NodeCard>

            <NodeCard title="来源" accent="#6c5ce7">
              <p className="text-xs text-gray-400 break-all font-mono">{selected.sourceUrl}</p>
            </NodeCard>

            {segments.length > 0 && (
              <NodeCard title="分镜脚本" accent="#a29bfe">
                <div className="space-y-2">
                  {segments.map((seg) => (
                    <div key={seg.index} className="rounded border border-[#444] bg-[#2a2a2a] p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] text-gray-500 font-mono">
                          #{seg.index} · {seg.startSec}s–{seg.endSec}s · 可灵 {seg.klingDurationSec}s
                          {seg.purpose ? ` · ${seg.purpose}` : ""}
                        </span>
                        {seg.taskStatus && <StatusBadge status={seg.taskStatus} />}
                      </div>
                      {seg.spokenText && <p className="text-sm text-gray-300 mb-1">{seg.spokenText}</p>}
                      {seg.visualDescription && (
                        <p className="text-xs text-gray-500 mb-2">画面：{seg.visualDescription}</p>
                      )}
                      {selected.status === "completed" && hasSegmentWorkflow && (
                        <div className="flex flex-wrap gap-1.5">
                          {seg.videoUrl && (
                            <a href={seg.videoUrl} target="_blank" rel="noreferrer" className={btnSecondaryClass}>
                              预览片段
                            </a>
                          )}
                          {seg.taskStatus !== "completed" && seg.taskStatus !== "processing" && (
                            <button
                              type="button"
                              className={btnGhostClass}
                              disabled={!genPersonaId || generatingSegmentIndex === seg.index}
                              onClick={() => generateSegmentMutation.mutate(seg.index)}
                            >
                              {generatingSegmentIndex === seg.index ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Video className="w-3.5 h-3.5" />
                              )}
                              生成此片段
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </NodeCard>
            )}

            {selected.status === "completed" && hasSegmentWorkflow && (
              <SegmentGenPanel
                scriptDuration={scriptDuration}
                segments={segments}
                segmentEstimate={segmentEstimate}
                continuityEnabled={continuityEnabled}
                setContinuityEnabled={handleContinuityChange}
                bottomBarrageEnabled={bottomBarrageEnabled}
                setBottomBarrageEnabled={handleBottomBarrageChange}
                genPersonaId={genPersonaId}
                setGenPersonaId={handleGenPersonaChange}
                genParams={genParams}
                setGenParams={setGenParams}
                personas={personas}
                canGenerate={canGenerate}
                onGenerateAll={() => setConfirmAllOpen(true)}
                onAssemble={() => assembleMutation.mutate()}
                assemblePending={assembleMutation.isPending}
                allSegmentsReady={Boolean(segmentData?.allSegmentsReady)}
                assembledVideoUrl={segmentData?.assembledVideoUrl}
                onOpenStudio={() => navigate(`/generate?scriptId=${selected.id}`)}
              />
            )}

            {selected.status === "completed" && !hasSegmentWorkflow && (
              <NodeCard title="用人设生成视频" accent="#f89443">
                <div className="space-y-3">
                  {scriptDuration != null && (
                    <ComfyAlert
                      type={durationTruncated ? "warning" : "info"}
                      message={
                        durationTruncated
                          ? `原脚本约 ${scriptDuration} 秒，可灵单次最长 ${maxKlingDuration} 秒`
                          : `原脚本约 ${scriptDuration} 秒`
                      }
                      description={
                        durationTruncated
                          ? `已默认选择 ${genParams.duration} 秒成片；AI 会压缩脚本。`
                          : "脚本时长与可生成时长匹配，将尽量完整还原。"
                      }
                    />
                  )}
                  <NodeField label="选择人设">
                    <select className={selectClass} value={genPersonaId ?? ""} onChange={(e) => handleGenPersonaChange(Number(e.target.value))}>
                      <option value="" disabled>
                        选择人设
                      </option>
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </NodeField>
                  <div className="grid grid-cols-2 gap-2">
                    <NodeField label={`时长：${genParams.duration} 秒`}>
                      <input
                        type="range"
                        className="w-full accent-[#f89443]"
                        min={minKlingDuration}
                        max={maxKlingDuration}
                        step={1}
                        value={genParams.duration}
                        onChange={(e) => setGenParams({ ...genParams, duration: Number(e.target.value) })}
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        可灵 v3 支持 {minKlingDuration}–{maxKlingDuration} 秒，按 1 秒递增
                      </p>
                    </NodeField>
                    <NodeField label="分辨率">
                      <select
                        className={selectClass}
                        value={genParams.resolution}
                        onChange={(e) => setGenParams({ ...genParams, resolution: e.target.value as GenParams["resolution"] })}
                      >
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                        <option value="4K">4K</option>
                      </select>
                    </NodeField>
                    <NodeField label="宽高比">
                      <select
                        className={selectClass}
                        value={genParams.aspectRatio}
                        onChange={(e) => setGenParams({ ...genParams, aspectRatio: e.target.value as GenParams["aspectRatio"] })}
                      >
                        <option value="16:9">16:9</option>
                        <option value="9:16">9:16</option>
                      </select>
                    </NodeField>
                    <NodeField label="音效">
                      <select
                        className={selectClass}
                        value={genParams.sound ? "on" : "off"}
                        onChange={(e) => setGenParams({ ...genParams, sound: e.target.value === "on" })}
                      >
                        <option value="on">开启</option>
                        <option value="off">关闭</option>
                      </select>
                    </NodeField>
                  </div>
                  <p className="text-[10px] text-gray-500">{estimateText}</p>
                  <button type="button" className={btnPrimaryBlockClass} disabled={!canGenerate} onClick={() => setConfirmOpen(true)}>
                    <Video className="w-4 h-4" /> 确认生成视频
                  </button>
                </div>
              </NodeCard>
            )}
          </div>
        )}
      </ComfyDrawer>

      <ComfyModal
        open={confirmAllOpen}
        onClose={() => setConfirmAllOpen(false)}
        title="确认批量生成分镜"
        confirmText="开始生成"
        loading={generateAllMutation.isPending}
        onConfirm={() => generateAllMutation.mutate()}
      >
        <p className="mb-3">
          将为人设「{personas.find((p) => p.id === genPersonaId)?.name ?? "—"}」依次提交各分镜生成任务。
        </p>
        <ul className="text-xs text-gray-400 list-disc pl-4 space-y-1">
          <li>共 {segments.length} 个分镜，每段按脚本实际时长映射为 {minKlingDuration}–{maxKlingDuration} 秒整数</li>
          {continuityEnabled ? (
            <li>已开启镜头连贯性：将按成片顺序逐段生成，每段需等上一段完成后再提交</li>
          ) : (
            segmentEstimate && (
              <li>
                预计总耗时 {segmentEstimate.low}–{segmentEstimate.high} 分钟（各段并行排队）
              </li>
            )
          )}
          <li>全部完成后可点击「整合成片」，在生成工作室预览完整视频</li>
        </ul>
      </ComfyModal>

      <ComfyModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="确认生成视频"
        confirmText="开始生成"
        loading={generateMutation.isPending}
        onConfirm={() => generateMutation.mutate()}
      >
        <p className="mb-3">
          将使用人设「{personas.find((p) => p.id === genPersonaId)?.name ?? "—"}」结合当前脚本生成视频。
        </p>
        <ul className="text-xs text-gray-400 list-disc pl-4 space-y-1">
          {scriptDuration != null && (
            <li>
              原脚本约 {scriptDuration} 秒
              {durationTruncated ? `，本次生成 ${genParams.duration} 秒精简版` : ""}
            </li>
          )}
          <li>
            时长 {genParams.duration} 秒 · {genParams.resolution} · {genParams.aspectRatio}
            {genParams.sound ? " · 含音效" : ""}
          </li>
          <li>{estimateText}</li>
          <li>生成过程由可灵 API 执行，会消耗积分</li>
        </ul>
      </ComfyModal>
    </ComfyPage>
  );
}
