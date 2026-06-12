import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Play,
  Square,
  RefreshCw,
  ImagePlus,
  X,
  Clapperboard,
  Layers,
} from "lucide-react";
import {
  api,
  type Persona,
  type ScriptSegments,
  type VideoScript,
  type VideoTask,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  NodeCard,
  NodeField,
  MODE_LABELS,
  STATUS_COLORS,
  formatTaskStatus,
  formatTaskTime,
  getTaskPreviewText,
  inputClass,
  selectClass,
  btnPrimaryClass,
  btnSecondaryClass,
} from "./console-ui";
import type { ArtboardLayer } from "@/lib/artboard-types";
import KlingSettingsPanel from "./KlingSettingsPanel";
import SegmentWorkflowCanvas from "./SegmentWorkflowCanvas";
import SegmentDetailPanel, { type SegmentRegeneratePayload } from "./SegmentDetailPanel";
import type { KlingSettings } from "@/lib/api";

type GenMode = "prompt" | "reference_image" | "persona_agent";
type ConsoleView = "single" | "segment";

type VideoParams = {
  duration: number;
  resolution: "720p" | "1080p" | "4K";
  aspectRatio: "16:9" | "9:16";
  sound: boolean;
};

type RefFile = { name: string; url: string; file: File };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("读取参考图失败"));
        return;
      }
      resolve(result.includes(",") ? result.split(",")[1]! : result);
    };
    reader.onerror = () => reject(new Error("读取参考图失败"));
    reader.readAsDataURL(file);
  });
}

function parseScriptIdFromUrl() {
  const raw = new URLSearchParams(window.location.search).get("scriptId");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

type SegmentGenerateInput = {
  index: number;
  userPrompt?: string;
  resolution?: SegmentRegeneratePayload["resolution"];
  aspectRatio?: SegmentRegeneratePayload["aspectRatio"];
  sound?: boolean;
  continuity?: boolean;
  duration?: number;
  sceneCompose?: boolean;
};

export default function GenerateConsole() {
  const queryClient = useQueryClient();
  const [consoleView, setConsoleView] = useState<ConsoleView>(() =>
    parseScriptIdFromUrl() != null ? "segment" : "single"
  );
  const [activeScriptId, setActiveScriptId] = useState<number | null>(() => parseScriptIdFromUrl());
  const [assemblyOrder, setAssemblyOrder] = useState<number[]>([]);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [generatingSegmentIndex, setGeneratingSegmentIndex] = useState<number | null>(null);

  const [mode, setMode] = useState<GenMode>("prompt");
  const [prompt, setPrompt] = useState("");
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null);
  const [referenceFiles, setReferenceFiles] = useState<RefFile[]>([]);
  const [params, setParams] = useState<VideoParams>({
    duration: 5,
    resolution: "720p",
    aspectRatio: "16:9",
    sound: true,
  });
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [queueTab, setQueueTab] = useState<"queue" | "history">("queue");
  const [klingSettings, setKlingSettings] = useState<KlingSettings | undefined>();
  const [continuityEnabled, setContinuityEnabled] = useState(true);
  const [bottomBarrageEnabled, setBottomBarrageEnabled] = useState(false);

  const updateContinuityMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch<VideoScript>(`/scripts/${activeScriptId}`, { continuityEnabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
      queryClient.invalidateQueries({ queryKey: ["script-segments", activeScriptId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateBottomBarrageMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch<VideoScript>(`/scripts/${activeScriptId}`, { bottomBarrageEnabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
      queryClient.invalidateQueries({ queryKey: ["script-segments", activeScriptId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updatePersonaMutation = useMutation({
    mutationFn: (personaId: number) =>
      api.patch<VideoScript>(`/scripts/${activeScriptId}`, { personaId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleContinuityChange = useCallback(
    (enabled: boolean) => {
      setContinuityEnabled(enabled);
      if (activeScriptId != null) {
        updateContinuityMutation.mutate(enabled);
      }
    },
    [activeScriptId, updateContinuityMutation]
  );

  const handleBottomBarrageChange = useCallback(
    (enabled: boolean) => {
      setBottomBarrageEnabled(enabled);
      if (activeScriptId != null) {
        updateBottomBarrageMutation.mutate(enabled);
      }
    },
    [activeScriptId, updateBottomBarrageMutation]
  );

  const handlePersonaChange = useCallback(
    (personaId: number | null) => {
      setSelectedPersonaId(personaId);
      if (activeScriptId != null && personaId != null) {
        updatePersonaMutation.mutate(personaId);
      }
    },
    [activeScriptId, updatePersonaMutation]
  );
  const [exportSelection, setExportSelection] = useState<number[]>([]);
  const [deletingSegmentIndex, setDeletingSegmentIndex] = useState<number | null>(null);

  const { data: scripts = [] } = useQuery({
    queryKey: ["video-scripts"],
    queryFn: () => api.get<VideoScript[]>("/scripts"),
    enabled: consoleView === "segment",
  });

  const completedScripts = useMemo(
    () => scripts.filter((s) => s.status === "completed" && s.decomposedScript),
    [scripts]
  );

  const activeScript = useMemo(
    () => completedScripts.find((s) => s.id === activeScriptId) ?? null,
    [completedScripts, activeScriptId]
  );

  const { data: scriptSegments, refetch: refetchScriptSegments } = useQuery({
    queryKey: ["script-segments", activeScriptId],
    queryFn: () => api.get<ScriptSegments>(`/scripts/${activeScriptId}/segments`),
    enabled: activeScriptId != null && consoleView === "segment",
    refetchInterval: (query) => {
      const data = query.state.data as ScriptSegments | undefined;
      return data && data.processingCount > 0 ? 3000 : false;
    },
  });

  useEffect(() => {
    if (!scriptSegments) return;
    const order =
      scriptSegments.assemblyOrder?.length
        ? scriptSegments.assemblyOrder
        : scriptSegments.segments.map((s) => s.index);
    setAssemblyOrder(order);
    setExportSelection((prev) => prev.filter((idx) => scriptSegments.segments.some((s) => s.index === idx)));
  }, [scriptSegments]);

  useEffect(() => {
    const value = scriptSegments?.continuityEnabled ?? activeScript?.continuityEnabled;
    if (value != null) setContinuityEnabled(value);
  }, [activeScript?.id, activeScript?.continuityEnabled, scriptSegments?.continuityEnabled]);

  useEffect(() => {
    const value = scriptSegments?.bottomBarrageEnabled ?? activeScript?.bottomBarrageEnabled;
    if (value != null) setBottomBarrageEnabled(value);
  }, [activeScript?.id, activeScript?.bottomBarrageEnabled, scriptSegments?.bottomBarrageEnabled]);

  useEffect(() => {
    if (activeScript?.personaId != null) {
      setSelectedPersonaId(activeScript.personaId);
    } else if (activeScript) {
      setSelectedPersonaId(null);
    }
  }, [activeScript?.id, activeScript?.personaId]);

  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: () => api.get<Persona[]>("/personas"),
  });

  const { data: tasks = [], isFetching: tasksFetching } = useQuery({
    queryKey: ["video-tasks"],
    queryFn: () => api.get<VideoTask[]>("/videos/tasks?limit=50"),
    refetchInterval: (query) => {
      const list = query.state.data as VideoTask[] | undefined;
      const hasActive = list?.some((t) => t.status === "pending" || t.status === "processing");
      return hasActive ? 3000 : false;
    },
  });

  const invalidateTasks = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["video-tasks"] });
    if (activeScriptId != null) {
      queryClient.invalidateQueries({ queryKey: ["script-segments", activeScriptId] });
    }
  }, [queryClient, activeScriptId]);

  const saveOrderMutation = useMutation({
    mutationFn: (order: number[]) =>
      api.patch(`/scripts/${activeScriptId}`, { assemblyOrder: order }),
    onError: (err: Error) => toast.error(err.message),
  });

  const updateSegmentAspectMutation = useMutation({
    mutationFn: ({ index, aspectRatio }: { index: number; aspectRatio: "16:9" | "9:16" }) =>
      api.patch(`/scripts/${activeScriptId}/segments/${index}`, { aspectRatio }),
    onSuccess: () => {
      refetchScriptSegments();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateArtboardLayersMutation = useMutation({
    mutationFn: ({ index, artboardLayers }: { index: number; artboardLayers: ArtboardLayer[] }) =>
      api.patch(`/scripts/${activeScriptId}/segments/${index}`, { artboardLayers }),
    onSuccess: () => {
      refetchScriptSegments();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSegmentAspectChange = useCallback(
    (index: number, aspectRatio: "16:9" | "9:16") => {
      if (activeScriptId == null) return;
      updateSegmentAspectMutation.mutate({ index, aspectRatio });
    },
    [activeScriptId, updateSegmentAspectMutation]
  );

  const handleArtboardLayersChange = useCallback(
    (index: number, artboardLayers: ArtboardLayer[]) => {
      if (activeScriptId == null) return;
      updateArtboardLayersMutation.mutate({ index, artboardLayers });
    },
    [activeScriptId, updateArtboardLayersMutation]
  );

  const handleOrderChange = useCallback(
    (order: number[]) => {
      setAssemblyOrder(order);
      if (activeScriptId != null) {
        saveOrderMutation.mutate(order);
      }
    },
    [activeScriptId, saveOrderMutation]
  );

  const segmentGenParams = useMemo(
    () => ({
      personaId: selectedPersonaId,
      resolution: params.resolution,
      aspectRatio: params.aspectRatio,
      sound: params.sound,
      continuity: continuityEnabled,
      sceneCompose: true,
    }),
    [selectedPersonaId, params.resolution, params.aspectRatio, params.sound, continuityEnabled]
  );

  const generateSegmentMutation = useMutation({
    mutationFn: (input: SegmentGenerateInput | number) => {
      const payload = typeof input === "number" ? { index: input } : input;
      if (!selectedPersonaId) throw new Error("请先选择人设");
      const seg = scriptSegments?.segments.find((s) => s.index === payload.index);
      const aspectRatio =
        payload.aspectRatio ??
        (seg?.generationParams?.aspectRatio as SegmentGenerateInput["aspectRatio"]) ??
        params.aspectRatio;
      return api.post<VideoTask>(`/scripts/${activeScriptId}/segments/${payload.index}/generate`, {
        personaId: selectedPersonaId,
        userPrompt: payload.userPrompt,
        resolution: payload.resolution ?? params.resolution,
        aspectRatio,
        sound: payload.sound ?? params.sound,
        continuity: payload.continuity ?? continuityEnabled,
        duration: payload.duration,
        sceneCompose: payload.sceneCompose ?? true,
      });
    },
    onMutate: (input) => {
      const index = typeof input === "number" ? input : input.index;
      setGeneratingSegmentIndex(index);
    },
    onSettled: () => setGeneratingSegmentIndex(null),
    onSuccess: (task) => {
      toast.success(`分镜任务 #${task.id} 已加入队列`);
      if (task.videoParams?.sceneComposeWarning) {
        toast.warning(`场景背景合成失败，已回退人设原图：${task.videoParams.sceneComposeWarning}`);
      }
      invalidateTasks();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteSegmentMutation = useMutation({
    mutationFn: (index: number) => api.delete(`/scripts/${activeScriptId}/segments/${index}`),
    onMutate: (index) => setDeletingSegmentIndex(index),
    onSettled: () => setDeletingSegmentIndex(null),
    onSuccess: () => {
      toast.success("已从工作流移除");
      if (selectedSegmentIndex != null) setSelectedSegmentIndex(null);
      invalidateTasks();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDeleteSegment = useCallback(
    (index: number) => {
      if (!window.confirm(`确定从工作流移除分镜 #${index}？`)) return;
      deleteSegmentMutation.mutate(index);
    },
    [deleteSegmentMutation]
  );

  const generateAllSegmentsMutation = useMutation({
    mutationFn: () =>
      api.post(`/scripts/${activeScriptId}/segments/generate-all`, segmentGenParams),
    onSuccess: (result: { createdCount: number }) => {
      toast.success(`已提交 ${result.createdCount} 个分镜任务`);
      invalidateTasks();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const queueMutation = useMutation({
    mutationFn: async () => {
      if (mode === "prompt") {
        if (!prompt.trim()) throw new Error("请输入提示词");
        return api.post<VideoTask>("/videos/generate/prompt", { prompt, ...params });
      }
      if (mode === "reference_image") {
        if (!prompt.trim()) throw new Error("请输入提示词");
        if (referenceFiles.length === 0) throw new Error("请上传至少一张参考图");
        const images = await Promise.all(referenceFiles.map((f) => fileToBase64(f.file)));
        return api.post<VideoTask>("/videos/generate/reference-images", {
          prompt,
          referenceImageUrls: images,
          ...params,
        });
      }
      if (!selectedPersonaId) throw new Error("请选择人设");
      return api.post<VideoTask>("/videos/generate/persona", {
        personaId: selectedPersonaId,
        userPrompt: personaPrompt,
        ...params,
      });
    },
    onSuccess: (task) => {
      toast.success(`任务 #${task.id} 已加入队列`);
      setSelectedTaskId(task.id);
      invalidateTasks();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (taskId: number) => api.post<VideoTask>(`/videos/tasks/${taskId}/cancel`),
    onSuccess: () => {
      toast.success("任务已取消");
      invalidateTasks();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status === "pending" || t.status === "processing"),
    [tasks]
  );
  const historyTasks = useMemo(
    () => tasks.filter((t) => t.status === "completed" || t.status === "failed"),
    [tasks]
  );

  const scriptTasks = useMemo(() => {
    if (!activeScriptId) return [];
    return tasks.filter((t) => t.videoParams?.scriptId === activeScriptId);
  }, [tasks, activeScriptId]);

  const displayTasks = useMemo(() => {
    const base = queueTab === "queue" ? activeTasks : historyTasks;
    if (consoleView === "segment" && activeScriptId) {
      const filtered = base.filter((t) => t.videoParams?.scriptId === activeScriptId);
      return filtered.length > 0 ? filtered : base;
    }
    return base;
  }, [queueTab, activeTasks, historyTasks, consoleView, activeScriptId]);

  const selectedTask = useMemo(() => {
    if (selectedTaskId) return tasks.find((t) => t.id === selectedTaskId) ?? null;
    if (consoleView === "segment" && scriptTasks.length > 0) {
      return scriptTasks.find((t) => t.status === "processing") ?? scriptTasks[0] ?? null;
    }
    return tasks[0] ?? null;
  }, [tasks, selectedTaskId, consoleView, scriptTasks]);

  useEffect(() => {
    if (!selectedTaskId && tasks.length > 0 && consoleView === "single") {
      setSelectedTaskId(tasks[0].id);
    }
  }, [tasks, selectedTaskId, consoleView]);

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (referenceFiles.length + files.length > 3) {
      toast.error("最多 3 张参考图");
      return;
    }
    const added = files.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
      file,
    }));
    setReferenceFiles((prev) => [...prev, ...added].slice(0, 3));
    e.target.value = "";
  };

  const removeReference = (index: number) => {
    setReferenceFiles((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].url);
      next.splice(index, 1);
      return next;
    });
  };

  const canQueue =
    mode === "prompt"
      ? prompt.trim().length >= 10
      : mode === "reference_image"
        ? prompt.trim().length >= 10 && referenceFiles.length > 0
        : Boolean(selectedPersonaId);

  const canSegmentGenerate = Boolean(activeScriptId && selectedPersonaId && scriptSegments);

  const selectedSegment = useMemo(() => {
    if (selectedSegmentIndex == null || !scriptSegments) return null;
    return scriptSegments.segments.find((s) => s.index === selectedSegmentIndex) ?? null;
  }, [selectedSegmentIndex, scriptSegments]);

  return (
    <div className="generate-console flex h-full min-h-0 overflow-hidden bg-[#1a1a1a] text-gray-200 select-none">
      {/* ── 左侧工作流 ── */}
      <aside className="w-[300px] shrink-0 flex flex-col border-r border-[#333] bg-[#222]">
        <div className="px-3 py-2 border-b border-[#333]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 tracking-widest">工作流</span>
            <span className="text-[10px] text-gray-600">{klingSettings?.modelName || "kling-v3"}</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setConsoleView("single")}
              className={cn(
                "flex items-center justify-center gap-1 rounded px-2 py-1.5 text-[10px] border transition-colors",
                consoleView === "single"
                  ? "border-[#f89443] bg-[#f89443]/10 text-[#f89443]"
                  : "border-[#444] text-gray-500 hover:bg-[#333]"
              )}
            >
              <Clapperboard className="w-3 h-3" />
              单片段
            </button>
            <button
              type="button"
              onClick={() => setConsoleView("segment")}
              className={cn(
                "flex items-center justify-center gap-1 rounded px-2 py-1.5 text-[10px] border transition-colors",
                consoleView === "segment"
                  ? "border-[#a29bfe] bg-[#a29bfe]/10 text-[#a29bfe]"
                  : "border-[#444] text-gray-500 hover:bg-[#333]"
              )}
            >
              <Layers className="w-3 h-3" />
              分镜成片
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {consoleView !== "segment" && <KlingSettingsPanel onConfiguredChange={setKlingSettings} />}

          {consoleView === "segment" ? (
            <>
              <NodeCard title="脚本加载" accent="#a29bfe">
                <NodeField label="选择已拆解脚本">
                  <select
                    className={selectClass}
                    value={activeScriptId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      setActiveScriptId(id);
                      setSelectedSegmentIndex(null);
                      if (id) {
                        const url = new URL(window.location.href);
                        url.searchParams.set("scriptId", String(id));
                        window.history.replaceState({}, "", url.toString());
                      }
                    }}
                  >
                    <option value="">— 选择脚本 —</option>
                    {completedScripts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title || `脚本 #${s.id}`}
                      </option>
                    ))}
                  </select>
                </NodeField>
                {scriptSegments && (
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    {scriptSegments.segments.length} 个分镜 · 约 {scriptSegments.scriptDurationSec ?? "—"} 秒
                  </p>
                )}
              </NodeCard>

              <NodeCard title="人设加载" accent="#fd79a8">
                <NodeField label="选择人设">
                  <select
                    className={selectClass}
                    value={selectedPersonaId ?? ""}
                    onChange={(e) =>
                      handlePersonaChange(e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">— 选择人设 —</option>
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </NodeField>
              </NodeCard>

              <NodeCard title="默认视频参数" accent="#74b9ff">
                <p className="text-[10px] text-gray-500 mb-2">点击分镜节点可在右侧微调单段参数</p>
                <div className="grid grid-cols-2 gap-2">
                  <NodeField label="分辨率">
                    <select
                      className={selectClass}
                      value={params.resolution}
                      onChange={(e) =>
                        setParams({ ...params, resolution: e.target.value as VideoParams["resolution"] })
                      }
                    >
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                      <option value="4K">4K</option>
                    </select>
                  </NodeField>
                  <NodeField label="宽高比">
                    <select
                      className={selectClass}
                      value={params.aspectRatio}
                      onChange={(e) =>
                        setParams({ ...params, aspectRatio: e.target.value as VideoParams["aspectRatio"] })
                      }
                    >
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                    </select>
                  </NodeField>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={params.sound}
                    onChange={(e) => setParams({ ...params, sound: e.target.checked })}
                    className="accent-[#f89443]"
                  />
                  同步音效
                </label>
                <label className="flex items-start gap-2 text-[11px] text-gray-400 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={continuityEnabled}
                    onChange={(e) => handleContinuityChange(e.target.checked)}
                    className="accent-[#00cec9] mt-0.5"
                  />
                  <span>
                    <span className="text-gray-300">镜头连贯性</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5 leading-relaxed">
                      第 2 段起用上一段片尾帧作首帧；批量生成将按顺序等待，耗时更长
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[11px] text-gray-400 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={bottomBarrageEnabled}
                    onChange={(e) => handleBottomBarrageChange(e.target.checked)}
                    className="accent-[#55efc4] mt-0.5"
                  />
                  <span>
                    <span className="text-gray-300">底部弹幕</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5 leading-relaxed">
                      整合成片时按口播分页轮播字幕（自动换行缩字），距底约 80px，长文案可完整看完
                    </span>
                  </span>
                </label>
              </NodeCard>

              <button
                type="button"
                className={btnPrimaryClass}
                disabled={!canSegmentGenerate || generateAllSegmentsMutation.isPending}
                onClick={() => generateAllSegmentsMutation.mutate()}
              >
                {generateAllSegmentsMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    提交中...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Play className="w-4 h-4 fill-current" />
                    全部生成分镜
                  </span>
                )}
              </button>
            </>
          ) : (
            <>
              <NodeCard title="加载模式" accent="#6c5ce7">
                <div className="grid grid-cols-1 gap-1.5">
                  {(
                    [
                      ["prompt", "文生视频", "#f89443"],
                      ["reference_image", "图+文生视频", "#00cec9"],
                      ["persona_agent", "人设 Agent", "#fd79a8"],
                    ] as const
                  ).map(([key, label, color]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMode(key)}
                      className={cn(
                        "flex items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors border",
                        mode === key
                          ? "border-[#f89443] bg-[#f89443]/10 text-[#f89443]"
                          : "border-transparent bg-[#2a2a2a] text-gray-400 hover:bg-[#333]"
                      )}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      {label}
                    </button>
                  ))}
                </div>
              </NodeCard>

              <NodeCard title="文本编码" accent="#f89443">
                <NodeField label="正向提示词">
                  <textarea
                    className={cn(inputClass, "min-h-[100px] resize-y font-mono text-xs leading-relaxed")}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="描述场景、动作、光线、镜头运动..."
                  />
                </NodeField>
                {mode === "persona_agent" && (
                  <NodeField label="额外指令">
                    <textarea
                      className={cn(inputClass, "min-h-[60px] resize-y font-mono text-xs")}
                      value={personaPrompt}
                      onChange={(e) => setPersonaPrompt(e.target.value)}
                      placeholder="可选：覆盖人设 Agent 的默认行为..."
                    />
                  </NodeField>
                )}
              </NodeCard>

              {mode === "reference_image" && (
                <NodeCard title="加载图片" accent="#00cec9">
                  <div className="grid grid-cols-3 gap-2">
                    {referenceFiles.map((file, i) => (
                      <div
                        key={file.url}
                        className="relative aspect-square rounded border border-[#555] overflow-hidden group"
                      >
                        <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeReference(i)}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {referenceFiles.length < 3 && (
                      <label className="aspect-square rounded border border-dashed border-[#555] flex flex-col items-center justify-center cursor-pointer hover:border-[#00cec9] hover:bg-[#00cec9]/5 transition-colors">
                        <ImagePlus className="w-5 h-5 text-gray-500" />
                        <span className="text-[10px] text-gray-500 mt-1">上传</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleReferenceUpload} />
                      </label>
                    )}
                  </div>
                </NodeCard>
              )}

              {mode === "persona_agent" && (
                <NodeCard title="人设加载" accent="#fd79a8">
                  <NodeField label="选择人设">
                    <select
                      className={selectClass}
                      value={selectedPersonaId ?? ""}
                      onChange={(e) => setSelectedPersonaId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">— 选择人设 —</option>
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </NodeField>
                </NodeCard>
              )}

              <NodeCard title="视频采样" accent="#74b9ff">
                <NodeField label={`时长：${params.duration} 秒`}>
                  <input
                    type="range"
                    min={3}
                    max={15}
                    step={1}
                    value={params.duration}
                    onChange={(e) => setParams({ ...params, duration: Number(e.target.value) })}
                    className="w-full accent-[#f89443]"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">可灵 v3：3–15 秒，按 1 秒递增</p>
                </NodeField>
                <div className="grid grid-cols-2 gap-2">
                  <NodeField label="分辨率">
                    <select
                      className={selectClass}
                      value={params.resolution}
                      onChange={(e) =>
                        setParams({ ...params, resolution: e.target.value as VideoParams["resolution"] })
                      }
                    >
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                      <option value="4K">4K</option>
                    </select>
                  </NodeField>
                  <NodeField label="宽高比">
                    <select
                      className={selectClass}
                      value={params.aspectRatio}
                      onChange={(e) =>
                        setParams({ ...params, aspectRatio: e.target.value as VideoParams["aspectRatio"] })
                      }
                    >
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                    </select>
                  </NodeField>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={params.sound}
                    onChange={(e) => setParams({ ...params, sound: e.target.checked })}
                    className="accent-[#f89443]"
                  />
                  同步音效
                </label>
              </NodeCard>

              <div className="p-0">
                <button
                  type="button"
                  className={btnPrimaryClass}
                  disabled={!canQueue || queueMutation.isPending}
                  onClick={() => queueMutation.mutate()}
                >
                  {queueMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      提交中...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Play className="w-4 h-4 fill-current" />
                      加入队列
                    </span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ── 中间画布 ── */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {consoleView === "segment" ? (
          activeScriptId && scriptSegments && scriptSegments.segments.length > 0 ? (
            <SegmentWorkflowCanvas
              scriptId={activeScriptId}
              data={scriptSegments}
              order={
                assemblyOrder.length > 0
                  ? assemblyOrder
                  : scriptSegments.segments.map((s) => s.index)
              }
              onOrderChange={handleOrderChange}
              selectedIndex={selectedSegmentIndex}
              onSelectSegment={setSelectedSegmentIndex}
              onRefresh={() => {
                refetchScriptSegments();
                invalidateTasks();
              }}
              onGenerateSegment={(index) => {
                if (!selectedPersonaId) {
                  toast.error("请先选择人设");
                  return;
                }
                generateSegmentMutation.mutate(index);
              }}
              generatingIndex={generatingSegmentIndex}
              scriptTitle={activeScript?.title ?? undefined}
              exportSelection={exportSelection}
              onExportSelectionChange={setExportSelection}
              onDeleteSegment={handleDeleteSegment}
              defaultAspectRatio={params.aspectRatio}
              onSegmentAspectChange={handleSegmentAspectChange}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
              <Layers className="w-12 h-12 opacity-20" />
              <p className="text-sm">选择已拆解的脚本，开始分镜成片工作流</p>
              <p className="text-xs text-gray-700">点击分镜节点 → 右侧查看提示词、参考图与参数</p>
            </div>
          )
        ) : (
          <>
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#333] bg-[#222]">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span className="text-gray-400 font-mono">预览</span>
                {selectedTask && (
                  <>
                    <span className="text-gray-600">·</span>
                    <span className="font-mono">#{selectedTask.id}</span>
                    <span
                      className={cn(
                        "ml-2 px-1.5 py-0.5 rounded border text-[10px] font-semibold",
                        STATUS_COLORS[selectedTask.status]
                      )}
                    >
                      {formatTaskStatus(selectedTask.status)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div
              className="flex-1 overflow-auto relative flex items-center justify-center p-8"
              style={{
                backgroundImage:
                  "linear-gradient(#2a2a2a 1px, transparent 1px), linear-gradient(90deg, #2a2a2a 1px, transparent 1px)",
                backgroundSize: "20px 20px",
                backgroundColor: "#1a1a1a",
              }}
            >
              {selectedTask ? (
                <PreviewPanel task={selectedTask} params={params} />
              ) : (
                <div className="text-center text-gray-600">
                  <div className="text-5xl mb-3 opacity-30">⬡</div>
                  <p className="text-sm">配置工作流并点击「加入队列」</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#333] bg-[#222] text-[10px] text-gray-500 font-mono">
              <span>{activeTasks.length > 0 ? `${activeTasks.length} 个任务进行中` : "队列空闲"}</span>
              <span>可灵 AI · ComfyUI 风格控制台</span>
            </div>
          </>
        )}
      </main>

      {consoleView === "segment" && selectedSegment && (
        <SegmentDetailPanel
          scriptId={activeScriptId!}
          segment={selectedSegment}
          personaId={selectedPersonaId}
          modelName={klingSettings?.modelName}
          fallbackResolution={params.resolution}
          fallbackAspectRatio={params.aspectRatio}
          fallbackSound={params.sound}
          continuityEnabled={continuityEnabled}
          isFirstInOrder={
            (assemblyOrder.length > 0
              ? assemblyOrder
              : scriptSegments?.segments.map((s) => s.index) ?? [])[0] === selectedSegment.index
          }
          maxKlingDuration={scriptSegments?.maxKlingDurationSec ?? 15}
          minKlingDuration={scriptSegments?.minKlingDurationSec ?? 3}
          onClose={() => setSelectedSegmentIndex(null)}
          onDelete={() => handleDeleteSegment(selectedSegment.index)}
          onAspectRatioChange={(aspectRatio) =>
            handleSegmentAspectChange(selectedSegment.index, aspectRatio)
          }
          onArtboardLayersChange={(layers) =>
            handleArtboardLayersChange(selectedSegment.index, layers)
          }
          onArtboardImported={() => refetchScriptSegments()}
          onFramePrepared={() => refetchScriptSegments()}
          isDeleting={deletingSegmentIndex === selectedSegment.index}
          onRegenerate={(payload) => {
            if (!selectedPersonaId) {
              toast.error("请先选择人设");
              return;
            }
            generateSegmentMutation.mutate({
              index: selectedSegment.index,
              ...payload,
              continuity: continuityEnabled,
            });
          }}
          isRegenerating={generatingSegmentIndex === selectedSegment.index}
        />
      )}

      {/* ── 右侧队列（单片段模式） ── */}
      {consoleView === "single" && (
      <aside className="w-[280px] shrink-0 flex flex-col border-l border-[#333] bg-[#222]">
        <div className="flex items-center border-b border-[#333]">
          {(["queue", "history"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setQueueTab(tab)}
              className={cn(
                "flex-1 py-2 text-xs font-semibold tracking-wider transition-colors",
                queueTab === tab ? "text-[#f89443] border-b-2 border-[#f89443]" : "text-gray-500 hover:text-gray-300"
              )}
            >
              {tab === "queue" ? `队列 (${activeTasks.length})` : `历史 (${historyTasks.length})`}
            </button>
          ))}
          <button type="button" className="px-2 py-2 text-gray-500 hover:text-gray-300" onClick={() => invalidateTasks()}>
            <RefreshCw className={cn("w-3.5 h-3.5", tasksFetching && "animate-spin")} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {displayTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-600 text-xs">
              <p>{queueTab === "queue" ? "队列为空" : "暂无历史记录"}</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#333]">
              {displayTasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedTaskId(task.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 hover:bg-[#2a2a2a] transition-colors",
                      selectedTaskId === task.id && "bg-[#2a2a2a] border-l-2 border-[#f89443]"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-gray-300">
                        #{task.id}
                        {task.videoParams?.segmentIndex != null && (
                          <span className="text-[#a29bfe] ml-1">S{task.videoParams.segmentIndex}</span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded border font-bold",
                          STATUS_COLORS[task.status]
                        )}
                      >
                        {formatTaskStatus(task.status)}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate">{MODE_LABELS[task.mode] ?? task.mode}</p>
                    <p className="text-[10px] text-gray-600 truncate mt-0.5 font-mono">
                      {getTaskPreviewText(task).slice(0, 60)}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[9px] text-gray-600">{formatTaskTime(task.createdAt)}</span>
                      {(task.status === "pending" || task.status === "processing") && (
                        <button
                          type="button"
                          className="text-[9px] text-red-400 hover:text-red-300 flex items-center gap-0.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelMutation.mutate(task.id);
                          }}
                        >
                          <Square className="w-2.5 h-2.5 fill-current" />
                          取消
                        </button>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
      )}
    </div>
  );
}

function PreviewPanel({ task, params }: { task: VideoTask; params: VideoParams }) {
  const aspect = task.videoParams?.aspectRatio ?? params.aspectRatio;
  const isPortrait = aspect === "9:16";
  const previewText = getTaskPreviewText(task);

  if (task.status === "completed" && task.generatedVideoUrl) {
    return (
      <div
        className={cn(
          "rounded-lg overflow-hidden border-2 border-[#f89443] shadow-2xl bg-black",
          isPortrait ? "w-[270px] h-[480px]" : "w-[640px] h-[360px]"
        )}
      >
        <video src={task.generatedVideoUrl} controls autoPlay loop className="w-full h-full object-contain" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border-2 shadow-2xl bg-[#252525] flex flex-col overflow-hidden",
        task.status === "processing" ? "border-[#74b9ff]" : task.status === "failed" ? "border-red-500" : "border-[#555]",
        isPortrait ? "w-[270px] h-[480px]" : "w-[640px] h-[360px]"
      )}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#2d2d2d] border-b border-[#444]">
        <span className="w-2 h-2 rounded-full bg-[#f89443]" />
        <span className="text-[10px] font-semibold text-gray-300">
          {MODE_LABELS[task.mode]} · #{task.id}
        </span>
        {task.status === "processing" && <Loader2 className="w-3 h-3 text-[#74b9ff] animate-spin ml-auto" />}
      </div>
      <div className="flex-1 flex items-center justify-center p-4 relative">
        {task.status === "processing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1a]/80">
            <Loader2 className="w-8 h-8 text-[#f89443] animate-spin mb-3" />
            <p className="text-xs text-gray-400 font-mono">生成中...</p>
          </div>
        )}
        {task.status === "failed" ? (
          <div className="text-center px-4">
            <p className="text-red-400 text-sm font-semibold mb-2">生成失败</p>
            <p className="text-[10px] text-gray-500 font-mono">{task.errorMessage ?? "未知错误"}</p>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col">
            <div className="flex-1 rounded bg-[#1a1a1a] border border-[#333] flex items-center justify-center mb-3">
              <span className="text-4xl opacity-20">🎬</span>
            </div>
            <p className="text-[10px] text-gray-400 font-mono leading-relaxed line-clamp-4">{previewText}</p>
          </div>
        )}
      </div>
    </div>
  );
}
