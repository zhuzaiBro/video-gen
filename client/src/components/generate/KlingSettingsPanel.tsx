import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { api, type KlingSettings } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NodeCard, NodeField, inputClass, selectClass, btnSecondaryClass } from "./console-ui";

type Props = {
  onConfiguredChange?: (settings: KlingSettings | undefined) => void;
};

export default function KlingSettingsPanel({ onConfiguredChange }: Props) {
  const queryClient = useQueryClient();
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api-beijing.klingai.com");
  const [modelName, setModelName] = useState("kling-v3");
  const [defaultMode, setDefaultMode] = useState("std");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["kling-settings"],
    queryFn: () => api.get<KlingSettings>("/settings/kling"),
  });

  useEffect(() => {
    if (!settings) return;
    setAccessKey(settings.accessKey ?? "");
    setApiBaseUrl(settings.apiBaseUrl || "https://api-beijing.klingai.com");
    setModelName(settings.modelName || "kling-v3");
    setDefaultMode(settings.defaultMode || "std");
    setSecretKey("");
    onConfiguredChange?.(settings);
  }, [settings, onConfiguredChange]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put<KlingSettings>("/settings/kling", {
        accessKey,
        secretKey: secretKey || undefined,
        apiBaseUrl,
        modelName,
        defaultMode,
      }),
    onSuccess: (data) => {
      toast.success("可灵 API 配置已保存");
      queryClient.setQueryData(["kling-settings"], data);
      setSecretKey("");
      onConfiguredChange?.(data);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testMutation = useMutation({
    mutationFn: () => api.post<{ success: boolean }>("/settings/kling/test"),
    onSuccess: () => toast.success("连接测试通过"),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <NodeCard title="可灵 API 配置" accent="#a29bfe">
      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          加载中...
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded border font-medium",
                settings?.configured
                  ? "border-green-500/40 text-green-400 bg-green-500/10"
                  : "border-yellow-500/40 text-yellow-400 bg-yellow-500/10"
              )}
            >
              {settings?.configured ? "已配置" : "未配置"}
            </span>
            {settings?.configuredVia && settings.configuredVia !== "none" && (
              <span className="text-gray-600">
                来源：{settings.configuredVia === "environment" ? "环境变量" : settings.configuredVia === "database" ? "面板" : "混合"}
              </span>
            )}
          </div>

          <NodeField label="Access Key">
            <input
              className={inputClass}
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="可灵 Access Key"
              autoComplete="off"
            />
          </NodeField>

          <NodeField label={`Secret Key${settings?.hasSecretKey ? "（已保存，留空则不修改）" : ""}`}>
            <input
              className={inputClass}
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={settings?.secretKeyMasked ?? "可灵 Secret Key"}
              autoComplete="new-password"
            />
          </NodeField>

          <NodeField label="API 地址">
            <input
              className={inputClass}
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://api-beijing.klingai.com"
            />
            <p className="text-[9px] text-gray-600 mt-0.5 leading-snug">
              国内账号请使用 api-beijing.klingai.com（旧域名 api.klingai.com 会 401）
            </p>
          </NodeField>

          <div className="grid grid-cols-2 gap-2">
            <NodeField label="模型">
              <select className={selectClass} value={modelName} onChange={(e) => setModelName(e.target.value)}>
                <option value="kling-v3">kling-v3（文/图生视频）</option>
                <option value="kling-v3-omni">kling-v3-omni（Omni）</option>
              </select>
            </NodeField>
            <NodeField label="默认模式">
              <select className={selectClass} value={defaultMode} onChange={(e) => setDefaultMode(e.target.value)}>
                <option value="std">std</option>
                <option value="pro">pro</option>
              </select>
            </NodeField>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className={cn(btnSecondaryClass, "flex-1")}
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <span className="flex items-center justify-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> 保存中
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1">
                  <Settings2 className="w-3 h-3" /> 保存
                </span>
              )}
            </button>
            <button
              type="button"
              className={cn(btnSecondaryClass, "flex-1")}
              disabled={testMutation.isPending || !settings?.configured}
              onClick={() => testMutation.mutate()}
            >
              {testMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mx-auto" />
              ) : (
                <span className="flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 测试
                </span>
              )}
            </button>
          </div>
        </>
      )}
    </NodeCard>
  );
}
