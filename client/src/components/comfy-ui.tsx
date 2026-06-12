import { cn } from "@/lib/utils";
import type { VideoTask } from "@/lib/api";
import { Loader2, X } from "lucide-react";

export const MODE_LABELS: Record<string, string> = {
  prompt: "文生视频",
  reference_image: "图+文生视频",
  persona_agent: "人设 Agent",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "等待中",
  processing: "生成中",
  completed: "已完成",
  failed: "失败",
};

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  processing: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  completed: "bg-green-500/20 text-green-400 border-green-500/40",
  failed: "bg-red-500/20 text-red-400 border-red-500/40",
};

export const comfyGridBg = {
  backgroundImage:
    "linear-gradient(#2a2a2a 1px, transparent 1px), linear-gradient(90deg, #2a2a2a 1px, transparent 1px)",
  backgroundSize: "20px 20px",
  backgroundColor: "#1a1a1a",
} as const;

export function formatTaskStatus(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export function formatTaskTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function getTaskPreviewText(task: VideoTask) {
  if (task.expandedPrompt) return task.expandedPrompt;
  if (task.prompt) return task.prompt;
  return "（无提示词）";
}

type NodeCardProps = {
  title: string;
  accent?: string;
  children: React.ReactNode;
  className?: string;
  headerExtra?: React.ReactNode;
};

export function NodeCard({ title, accent = "#f89443", children, className, headerExtra }: NodeCardProps) {
  return (
    <div className={cn("rounded-lg border border-[#4a4a4a] bg-[#353535] shadow-lg overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#4a4a4a] bg-[#2d2d2d]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
          <span className="text-xs font-semibold tracking-wide text-gray-200 truncate">{title}</span>
        </div>
        {headerExtra}
      </div>
      <div className="p-3 space-y-3">{children}</div>
    </div>
  );
}

type NodeFieldProps = {
  label: string;
  children: React.ReactNode;
};

export function NodeField({ label, children }: NodeFieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] tracking-wider text-gray-500 font-medium uppercase">{label}</label>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded border border-[#555] bg-[#252525] px-2.5 py-1.5 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-[#f89443] focus:ring-1 focus:ring-[#f89443]/40";

export const selectClass =
  "w-full rounded border border-[#555] bg-[#252525] px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-[#f89443]";

export const btnPrimaryClass =
  "inline-flex items-center justify-center gap-2 rounded-md bg-[#f89443] hover:bg-[#e88332] text-black font-semibold py-2 px-4 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export const btnPrimaryBlockClass = cn(btnPrimaryClass, "w-full py-2.5");

export const btnSecondaryClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-[#555] bg-[#2d2d2d] hover:bg-[#3a3a3a] text-gray-200 px-3 py-1.5 text-xs transition-colors disabled:opacity-40";

export const btnDangerClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 text-xs transition-colors";

export const btnGhostClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-[#f89443]/40 bg-[#f89443]/10 hover:bg-[#f89443]/20 text-[#f89443] px-3 py-1.5 text-xs transition-colors disabled:opacity-40";

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex text-[10px] px-2 py-0.5 rounded border font-bold",
        STATUS_COLORS[status] ?? STATUS_COLORS.pending
      )}
    >
      {label ?? formatTaskStatus(status)}
    </span>
  );
}

type ComfyPageProps = {
  children: React.ReactNode;
  className?: string;
  fullHeight?: boolean;
};

export function ComfyPage({ children, className, fullHeight }: ComfyPageProps) {
  return (
    <div
      className={cn("relative", fullHeight ? "h-full overflow-hidden" : "min-h-full overflow-auto p-4 md:p-6", className)}
      style={fullHeight ? comfyGridBg : undefined}
    >
      {!fullHeight && (
        <div className="absolute inset-0 pointer-events-none" style={comfyGridBg} aria-hidden />
      )}
      <div className={cn("relative z-10", fullHeight ? "h-full" : "max-w-6xl mx-auto space-y-4")}>{children}</div>
    </div>
  );
}

export function ComfyPageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
      <div>
        <h1 className="text-xl font-bold text-gray-100 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ComfyEmpty({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-3 opacity-20">⬡</div>
      <p className="text-sm text-gray-500 mb-4">{message}</p>
      {action}
    </div>
  );
}

export function ComfyAlert({
  type = "info",
  message,
  description,
}: {
  type?: "info" | "success" | "warning";
  message: string;
  description?: React.ReactNode;
}) {
  const colors = {
    info: "border-[#74b9ff]/40 bg-[#74b9ff]/10 text-[#74b9ff]",
    success: "border-green-500/40 bg-green-500/10 text-green-400",
    warning: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  };
  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-xs", colors[type])}>
      <p className="font-semibold">{message}</p>
      {description && <p className="mt-1 opacity-80 leading-relaxed">{description}</p>}
    </div>
  );
}

type ComfyDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function ComfyDrawer({ open, onClose, title, width = 640, children, footer }: ComfyDrawerProps) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} aria-hidden />
      <aside
        className="fixed top-0 right-0 h-full z-50 flex flex-col bg-[#222] border-l border-[#333] shadow-2xl"
        style={{ width: Math.min(width, typeof window !== "undefined" ? window.innerWidth : width) }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] shrink-0">
          <h2 className="text-sm font-bold text-[#f89443] tracking-wide truncate">{title}</h2>
          <button type="button" className={btnSecondaryClass} onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-[#333] p-4 flex justify-end gap-2">{footer}</div>}
      </aside>
    </>
  );
}

type ComfyModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
};

export function ComfyModal({
  open,
  onClose,
  title,
  children,
  onConfirm,
  confirmText = "确认",
  cancelText = "取消",
  loading,
}: ComfyModalProps) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4">
        <div className="rounded-lg border border-[#4a4a4a] bg-[#353535] shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#4a4a4a] bg-[#2d2d2d]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f89443]" />
            <span className="text-sm font-semibold text-gray-200">{title}</span>
          </div>
          <div className="p-4 text-sm text-gray-300">{children}</div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#4a4a4a] bg-[#2d2d2d]">
            <button type="button" className={btnSecondaryClass} onClick={onClose} disabled={loading}>
              {cancelText}
            </button>
            {onConfirm && (
              <button type="button" className={btnPrimaryClass} onClick={onConfirm} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmText}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function ComfySpinner({ className }: { className?: string }) {
  return <Loader2 className={cn("w-6 h-6 animate-spin text-[#f89443]", className)} />;
}
