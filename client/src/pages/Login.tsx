import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  ComfyPage,
  NodeCard,
  NodeField,
  inputClass,
  btnPrimaryBlockClass,
  comfyGridBg,
} from "@/components/comfy-ui";
import { cn } from "@/lib/utils";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("登录成功");
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    const name = String(fd.get("name") ?? "");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name || undefined } },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("注册成功，请查收确认邮件（如已开启邮箱验证）");
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4" style={comfyGridBg}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2 opacity-30">⬡</div>
          <h1 className="text-xl font-bold text-gray-100">AI 数字人视频生成</h1>
          <p className="text-xs text-gray-500 mt-1 font-mono">ComfyUI 风格控制台 · Supabase 登录</p>
        </div>

        <NodeCard title={tab === "login" ? "登录" : "注册"} accent="#f89443">
          <div className="flex gap-1 p-1 rounded-md bg-[#252525] border border-[#444] mb-1">
            {(["login", "signup"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex-1 py-1.5 text-xs rounded transition-colors",
                  tab === key ? "bg-[#f89443] text-black font-semibold" : "text-gray-400 hover:text-gray-200"
                )}
              >
                {key === "login" ? "登录" : "注册"}
              </button>
            ))}
          </div>

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <NodeField label="邮箱">
                <input name="email" type="email" required className={inputClass} placeholder="name@example.com" />
              </NodeField>
              <NodeField label="密码">
                <input name="password" type="password" required minLength={6} className={inputClass} placeholder="••••••••" />
              </NodeField>
              <button type="submit" disabled={loading} className={btnPrimaryBlockClass}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "登录"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-3">
              <NodeField label="昵称（可选）">
                <input name="name" type="text" className={inputClass} placeholder="可选" />
              </NodeField>
              <NodeField label="邮箱">
                <input name="email" type="email" required className={inputClass} placeholder="name@example.com" />
              </NodeField>
              <NodeField label="密码">
                <input name="password" type="password" required minLength={6} className={inputClass} placeholder="••••••••" />
              </NodeField>
              <button type="submit" disabled={loading} className={btnPrimaryBlockClass}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "注册"}
              </button>
            </form>
          )}
        </NodeCard>
      </div>
    </div>
  );
}
