import { useState } from "react";
import {
  Home,
  User,
  Video,
  History,
  FileText,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  ChevronDown,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import Login from "@/pages/Login";
import { cn } from "@/lib/utils";
import { ComfySpinner } from "@/components/comfy-ui";

interface LayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { path: "/", label: "控制台", icon: Home },
  { path: "/personas", label: "人设", icon: User },
  { path: "/generate", label: "生成工作室", icon: Video },
  { path: "/scripts", label: "脚本拆解", icon: FileText },
  { path: "/history", label: "历史", icon: History },
] as const;

export default function AppLayout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [location, navigate] = useLocation();
  const isStudio = location === "/generate";
  const { user, loading, logout, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a1a]" style={{
        backgroundImage:
          "linear-gradient(#2a2a2a 1px, transparent 1px), linear-gradient(90deg, #2a2a2a 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}>
        <ComfySpinner />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Login />;
  }

  const handleLogout = async () => {
    await logout();
    toast.success("已退出登录");
    navigate("/");
    setUserMenuOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#1a1a1a] text-gray-200">
      {/* Sidebar */}
      <aside
        className={cn(
          "shrink-0 flex flex-col border-r border-[#333] bg-[#222] transition-all duration-200",
          collapsed ? "w-[68px]" : "w-[200px]"
        )}
      >
        <div className={cn("px-3 py-4 border-b border-[#333]", collapsed ? "text-center" : "")}>
          <h1 className={cn("font-bold text-[#f89443] tracking-wide", collapsed ? "text-sm" : "text-base")}>
            {collapsed ? "AI" : "AI 视频生成"}
          </h1>
          {!collapsed && (
            <p className="text-[10px] text-gray-600 mt-0.5 font-mono">ComfyUI 控制台</p>
          )}
        </div>

        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = location === path;
            return (
              <button
                key={path}
                type="button"
                onClick={() => navigate(path)}
                title={collapsed ? label : undefined}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors",
                  active
                    ? "bg-[#f89443]/15 text-[#f89443] border border-[#f89443]/30"
                    : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200 border border-transparent"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-2 border-t border-[#333]">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 rounded-md px-2 py-2 text-xs text-gray-500 hover:bg-[#2d2d2d] hover:text-gray-300 transition-colors"
          >
            {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            {!collapsed && <span>收起侧栏</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between h-12 px-4 border-b border-[#333] bg-[#222]">
          <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
            <span className="text-gray-400">
              {NAV_ITEMS.find((n) => n.path === location)?.label ?? "页面"}
            </span>
            {isStudio && (
              <>
                <span className="text-gray-700">·</span>
                <span className="text-[#f89443]">工作流模式</span>
              </>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-[#2d2d2d] transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[#f89443]/20 border border-[#f89443]/40 flex items-center justify-center text-[#f89443] text-xs font-bold">
                {(user.name || user.email || "U").charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-medium text-gray-200">{user.name || "用户"}</div>
                <div className="text-[10px] text-gray-500 max-w-[140px] truncate">{user.email}</div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500 hidden sm:block" />
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} aria-hidden />
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-[#444] bg-[#353535] shadow-xl py-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-[#2d2d2d] transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    退出登录
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            isStudio ? "overflow-hidden" : "overflow-auto"
          )}
        >
          {children}
        </main>

        {!isStudio && (
          <footer className="shrink-0 flex items-center justify-between px-4 py-1.5 border-t border-[#333] bg-[#222] text-[10px] text-gray-600 font-mono">
            <span>可灵 AI · ComfyUI 风格控制台</span>
            <span>{new Date().getFullYear()}</span>
          </footer>
        )}
      </div>
    </div>
  );
}
