import { Home } from "lucide-react";
import { useLocation } from "wouter";
import { ComfyPage, btnPrimaryClass, comfyGridBg } from "@/components/comfy-ui";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center" style={comfyGridBg}>
      <div className="text-center px-4">
        <div className="text-6xl font-bold text-[#f89443]/30 font-mono mb-2">404</div>
        <h1 className="text-lg font-bold text-gray-200 mb-2">页面不存在</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          抱歉，您访问的页面不存在。
          <br />
          可能已被移动或删除。
        </p>
        <button type="button" className={btnPrimaryClass} onClick={() => setLocation("/")}>
          <Home className="w-4 h-4" /> 返回首页
        </button>
      </div>
    </div>
  );
}
