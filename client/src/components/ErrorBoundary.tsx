import { RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
import { btnPrimaryClass, comfyGridBg } from "@/components/comfy-ui";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8" style={comfyGridBg}>
          <div className="flex flex-col items-center w-full max-w-2xl rounded-lg border border-[#4a4a4a] bg-[#353535] p-8">
            <div className="text-4xl mb-4 opacity-40">⚠</div>
            <h2 className="text-lg font-bold text-gray-200 mb-4">发生了意外错误</h2>
            <div className="p-4 w-full rounded border border-[#444] bg-[#252525] overflow-auto mb-6 max-h-64">
              <pre className="text-xs text-gray-500 whitespace-break-spaces font-mono">
                {this.state.error?.stack}
              </pre>
            </div>
            <button type="button" onClick={() => window.location.reload()} className={btnPrimaryClass}>
              <RotateCcw className="w-4 h-4" /> 刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
