import { useQuery } from "@tanstack/react-query";
import { User, Video, History, ArrowRight, Bot, HardDrive } from "lucide-react";
import { useLocation } from "wouter";
import { api, type GeneratedVideo, type Persona } from "@/lib/api";
import {
  ComfyPage,
  ComfyPageHeader,
  NodeCard,
  btnPrimaryClass,
  btnSecondaryClass,
  btnGhostClass,
} from "@/components/comfy-ui";

export default function Home() {
  const [, navigate] = useLocation();

  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: () => api.get<Persona[]>("/personas"),
  });

  const { data: videosData = [] } = useQuery({
    queryKey: ["history", "videos"],
    queryFn: () => api.get<GeneratedVideo[]>("/history/videos?limit=100"),
  });

  const stats = [
    { title: "数字人设", value: personas.length, icon: User, accent: "#74b9ff" },
    { title: "已生成视频", value: videosData.length, icon: Video, accent: "#00cec9" },
    { title: "生成模式", value: 3, icon: Bot, accent: "#f89443" },
    { title: "存储用量", value: "0 GB", icon: HardDrive, accent: "#a29bfe" },
  ];

  const shortcuts = [
    { title: "管理人设", desc: "照片、自我介绍、抖音主页", path: "/personas", accent: "#74b9ff" },
    { title: "生成工作室", desc: "文生视频 / 分镜成片工作流", path: "/generate", accent: "#f89443" },
    { title: "脚本拆解", desc: "URL 拆解口播与分镜脚本", path: "/scripts", accent: "#a29bfe" },
    { title: "视频历史", desc: "浏览与管理已生成视频", path: "/history", accent: "#00cec9" },
  ];

  return (
    <ComfyPage>
      <ComfyPageHeader
        title="控制台"
        subtitle="AI 数字人视频生成平台 — 创建人设、生成视频、管理历史"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <NodeCard key={s.title} title={s.title} accent={s.accent}>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-gray-100 font-mono">{s.value}</span>
              <s.icon className="w-5 h-5 opacity-40" style={{ color: s.accent }} />
            </div>
          </NodeCard>
        ))}
      </div>

      <NodeCard title="快捷操作" accent="#f89443">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <button type="button" className={btnPrimaryClass} onClick={() => navigate("/personas")}>
            <User className="w-4 h-4" /> 管理人设
          </button>
          <button type="button" className={btnSecondaryClass} onClick={() => navigate("/generate")}>
            <Video className="w-4 h-4" /> 生成视频
          </button>
          <button type="button" className={btnSecondaryClass} onClick={() => navigate("/scripts")}>
            脚本拆解
          </button>
          <button type="button" className={btnGhostClass} onClick={() => navigate("/history")}>
            <History className="w-4 h-4" /> 查看历史
          </button>
        </div>
      </NodeCard>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
        {shortcuts.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            className="text-left rounded-lg border border-[#4a4a4a] bg-[#353535] hover:border-[#f89443]/50 hover:bg-[#3a3a3a] transition-colors overflow-hidden group"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#4a4a4a] bg-[#2d2d2d]">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.accent }} />
              <span className="text-xs font-semibold text-gray-200">{item.title}</span>
            </div>
            <div className="p-3">
              <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{item.desc}</p>
              <span className="inline-flex items-center gap-1 text-[10px] text-[#f89443] group-hover:gap-2 transition-all">
                进入 <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </ComfyPage>
  );
}
