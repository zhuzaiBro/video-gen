import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Clapperboard, Loader2, Save, Sparkles } from "lucide-react";
import { api, type VideoScript } from "@/lib/api";
import { scriptInfoToPayload, scriptToInfoDraft, type ScriptInfoDraft } from "@/lib/script-types";
import {
  ComfyPage,
  ComfyPageHeader,
  ComfySpinner,
  NodeCard,
  NodeField,
  btnPrimaryClass,
  btnSecondaryClass,
  inputClass,
  comfyGridBg,
} from "@/components/comfy-ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function textareaClass(extra?: string) {
  return cn(inputClass, "min-h-[88px] resize-y leading-relaxed", extra);
}

export default function ScriptEditor() {
  const [, params] = useRoute("/scripts/:id/edit");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const scriptId = Number(params?.id);
  const validId = Number.isFinite(scriptId) && scriptId > 0;

  const [draft, setDraft] = useState<ScriptInfoDraft | null>(null);
  const [dirty, setDirty] = useState(false);

  const { data: script, isLoading, error } = useQuery({
    queryKey: ["video-script", scriptId],
    queryFn: () => api.get<VideoScript>(`/scripts/${scriptId}`),
    enabled: validId,
  });

  useEffect(() => {
    if (!script) return;
    setDraft(scriptToInfoDraft(script));
    setDirty(false);
  }, [script?.id, script?.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("无编辑内容");
      return api.patch<VideoScript>(
        `/scripts/${scriptId}`,
        scriptInfoToPayload(draft, script?.decomposedScript ?? undefined)
      );
    },
    onSuccess: () => {
      toast.success("脚本信息已保存");
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["video-script", scriptId] });
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const polishMutation = useMutation({
    mutationFn: () => api.post<VideoScript>(`/scripts/${scriptId}/polish`),
    onSuccess: (updated) => {
      toast.success("脚本已润色，核心结构与时间轴保持不变");
      setDraft(scriptToInfoDraft(updated));
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["video-script", scriptId] });
      queryClient.invalidateQueries({ queryKey: ["video-scripts"] });
      queryClient.invalidateQueries({ queryKey: ["script-segments", scriptId] });
    },
    onError: (err: Error) => toast.error(err.message || "润色失败"),
  });

  const patch = (partial: Partial<ScriptInfoDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));
    setDirty(true);
  };

  const segmentCount = Array.isArray(
    (script?.decomposedScript as Record<string, unknown> | undefined)?.segments
  )
    ? ((script?.decomposedScript as Record<string, unknown>).segments as unknown[]).length
    : 0;

  if (!validId) {
    return (
      <ComfyPage>
        <ComfyPageHeader title="脚本信息编辑" />
        <p className="text-gray-500">无效的脚本 ID</p>
      </ComfyPage>
    );
  }

  if (isLoading || !draft) {
    return (
      <ComfyPage>
        <div className="flex justify-center py-20">
          <ComfySpinner />
        </div>
      </ComfyPage>
    );
  }

  if (error || script?.status !== "completed") {
    return (
      <ComfyPage>
        <ComfyPageHeader title="脚本信息编辑" />
        <p className="text-red-400 mb-4">
          {script?.status !== "completed" ? "脚本尚未拆解完成，请稍后再编辑" : "加载失败"}
        </p>
        <button type="button" className={btnSecondaryClass} onClick={() => navigate("/scripts")}>
          返回列表
        </button>
      </ComfyPage>
    );
  }

  const decomposed = script.decomposedScript as Record<string, unknown> | undefined;

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col" style={comfyGridBg}>
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-[#333] bg-[#222]/95 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" className={btnSecondaryClass} onClick={() => navigate("/scripts")}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-100">脚本信息编辑</p>
            <p className="text-[10px] text-gray-500 font-mono truncate">
              #{scriptId}
              {draft.title ? ` · ${draft.title}` : ""}
              {dirty ? " · 未保存" : " · 已保存"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className={btnSecondaryClass}
            disabled={polishMutation.isPending || saveMutation.isPending}
            onClick={() => polishMutation.mutate()}
            title="在保持核心观点与分镜时间轴不变的前提下优化口播与文案"
          >
            {polishMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            AI 润色
          </button>
          <button
            type="button"
            className={btnSecondaryClass}
            onClick={() => navigate(`/generate?scriptId=${scriptId}`)}
          >
            <Clapperboard className="w-4 h-4" />
            分镜工作室
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={!dirty || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            保存
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          <div className="space-y-4">
            <NodeCard title="基本信息" accent="#a29bfe">
              <NodeField label="标题">
                <input className={inputClass} value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
              </NodeField>
              <NodeField label="摘要">
                <textarea
                  className={textareaClass("min-h-[72px]")}
                  value={draft.summary}
                  onChange={(e) => patch({ summary: e.target.value })}
                  placeholder="50 字以内内容概述…"
                />
              </NodeField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NodeField label="语气风格">
                  <input
                    className={inputClass}
                    value={draft.tone}
                    onChange={(e) => patch({ tone: e.target.value })}
                    placeholder="亲切、专业、搞笑…"
                  />
                </NodeField>
                <NodeField label="目标受众">
                  <input
                    className={inputClass}
                    value={draft.targetAudience}
                    onChange={(e) => patch({ targetAudience: e.target.value })}
                    placeholder="18-35 岁女性…"
                  />
                </NodeField>
              </div>
              <NodeField label="标签（逗号分隔）">
                <input
                  className={inputClass}
                  value={draft.tags}
                  onChange={(e) => patch({ tags: e.target.value })}
                  placeholder="带货, 美妆, 教程"
                />
              </NodeField>
            </NodeCard>

            <NodeCard title="结构脚本" accent="#f89443">
              <p className="text-[10px] text-gray-500 mb-3 leading-relaxed">
                拆解后的 Hook / Body / CTA，用于指导口播节奏与生成 prompt。
              </p>
              <NodeField label="Hook · 开头钩子">
                <textarea
                  className={textareaClass("min-h-[88px]")}
                  value={draft.hook}
                  onChange={(e) => patch({ hook: e.target.value })}
                  placeholder="前 3 秒抓注意力的话术…"
                />
              </NodeField>
              <NodeField label="Body · 主体内容">
                <textarea
                  className={textareaClass("min-h-[160px]")}
                  value={draft.body}
                  onChange={(e) => patch({ body: e.target.value })}
                  placeholder="主体内容要点，可多段…"
                />
              </NodeField>
              <NodeField label="CTA · 行动号召">
                <textarea
                  className={textareaClass("min-h-[72px]")}
                  value={draft.cta}
                  onChange={(e) => patch({ cta: e.target.value })}
                  placeholder="结尾转化话术…"
                />
              </NodeField>
            </NodeCard>

            <NodeCard title="完整口播" accent="#fd79a8">
              <textarea
                className={textareaClass("min-h-[280px] font-mono text-sm")}
                value={draft.transcript}
                onChange={(e) => patch({ transcript: e.target.value })}
                placeholder="按时间顺序的完整口播 / 字幕文本…"
              />
            </NodeCard>
          </div>

          <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <NodeCard title="脚本概况" accent="#6c5ce7">
              <dl className="space-y-2 text-[11px]">
                <div>
                  <dt className="text-gray-600">来源</dt>
                  <dd className="text-gray-400 break-all font-mono mt-0.5">{script.sourceUrl}</dd>
                </div>
                {script.platform && (
                  <div>
                    <dt className="text-gray-600">平台</dt>
                    <dd className="text-gray-300 mt-0.5">{script.platform}</dd>
                  </div>
                )}
                {script.scriptDurationSec != null && (
                  <div>
                    <dt className="text-gray-600">原视频时长</dt>
                    <dd className="text-gray-300 mt-0.5">约 {script.scriptDurationSec} 秒</dd>
                  </div>
                )}
                {segmentCount > 0 && (
                  <div>
                    <dt className="text-gray-600">分镜数</dt>
                    <dd className="text-gray-300 mt-0.5">{segmentCount} 段（在工作室编辑）</dd>
                  </div>
                )}
                {typeof decomposed?.tone === "string" && decomposed.tone && (
                  <div>
                    <dt className="text-gray-600">拆解语气</dt>
                    <dd className="text-gray-300 mt-0.5">{String(decomposed.tone)}</dd>
                  </div>
                )}
              </dl>
            </NodeCard>
            <p className="text-[10px] text-gray-600 leading-relaxed px-1">
              分镜时间轴、贴图布局、画板请在「分镜工作室」中编辑；此处可编辑脚本信息，或使用「AI 润色」优化口播表达（不改分镜时间与核心观点）。
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
