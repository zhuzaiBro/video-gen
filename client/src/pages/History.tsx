import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Delete, Download, Heart, Share2 } from "lucide-react";
import { api, type GeneratedVideo, type Persona } from "@/lib/api";
import { toast } from "sonner";
import {
  ComfyPage,
  ComfyPageHeader,
  ComfyEmpty,
  ComfySpinner,
  NodeCard,
  NodeField,
  btnSecondaryClass,
  btnDangerClass,
  selectClass,
} from "@/components/comfy-ui";
import { cn } from "@/lib/utils";

export default function History() {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const queryClient = useQueryClient();

  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: () => api.get<Persona[]>("/personas"),
  });

  const queryParams = new URLSearchParams({ limit: "100" });
  if (selectedPersonaId) queryParams.set("personaId", selectedPersonaId);

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["history", "videos", selectedPersonaId],
    queryFn: () => api.get<GeneratedVideo[]>(`/history/videos?${queryParams.toString()}`),
  });

  const toggleFavorite = useMutation({
    mutationFn: (videoId: number) => api.patch<GeneratedVideo>(`/history/videos/${videoId}/favorite`),
    onSuccess: () => {
      toast.success("已更新");
      queryClient.invalidateQueries({ queryKey: ["history", "videos"] });
    },
    onError: () => toast.error("更新失败"),
  });

  const deleteVideo = useMutation({
    mutationFn: (videoId: number) => api.delete(`/history/videos/${videoId}`),
    onSuccess: () => {
      toast.success("视频已删除");
      queryClient.invalidateQueries({ queryKey: ["history", "videos"] });
    },
    onError: () => toast.error("删除失败"),
  });

  const displayVideos = videos.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(videos.length / pageSize);

  return (
    <ComfyPage>
      <ComfyPageHeader title="视频历史" subtitle="浏览和管理已生成的视频" />

      <NodeCard title="筛选" accent="#74b9ff">
        <NodeField label="按人设筛选">
          <select
            className={selectClass}
            value={selectedPersonaId}
            onChange={(e) => {
              setSelectedPersonaId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部人设</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id.toString()}>
                {p.name}
              </option>
            ))}
          </select>
        </NodeField>
      </NodeCard>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <ComfySpinner />
        </div>
      ) : displayVideos.length === 0 ? (
        <NodeCard title="视频列表" accent="#00cec9">
          <ComfyEmpty message="暂无视频" />
        </NodeCard>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayVideos.map((video) => (
              <NodeCard key={video.id} title={video.title || "未命名视频"} accent="#a29bfe">
                <div className="aspect-video rounded border border-[#444] bg-[#1a1a1a] flex items-center justify-center mb-2">
                  <div className="text-center text-gray-500">
                    <div className="text-2xl mb-1">🎬</div>
                    <p className="text-[10px] font-mono">
                      {video.resolution} · {video.aspectRatio}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-gray-500 font-mono">
                    {new Date(video.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                  {video.isFavorite && (
                    <span className="text-[10px] text-red-400">♥ 已收藏</span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <button type="button" className={cn(btnSecondaryClass, "w-full")} onClick={() => toast.info("下载功能即将上线")}>
                    <Download className="w-3.5 h-3.5" /> 下载
                  </button>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className={cn(btnSecondaryClass, "flex-1")}
                      onClick={() => toggleFavorite.mutate(video.id)}
                    >
                      <Heart className={cn("w-3.5 h-3.5", video.isFavorite && "fill-red-400 text-red-400")} />
                      {video.isFavorite ? "已收藏" : "收藏"}
                    </button>
                    <button type="button" className={btnSecondaryClass} onClick={() => toast.info("分享功能即将上线")}>
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className={btnDangerClass}
                      disabled={deleteVideo.isPending}
                      onClick={() => {
                        if (window.confirm("确定删除此视频？")) deleteVideo.mutate(video.id);
                      }}
                    >
                      <Delete className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </NodeCard>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                className={btnSecondaryClass}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </button>
              <span className="text-xs text-gray-500 font-mono">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className={btnSecondaryClass}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </ComfyPage>
  );
}
