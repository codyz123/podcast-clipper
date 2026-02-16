import { Component, ErrorInfo, ReactNode } from "react";
import { cn } from "../lib/utils";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);

    // Auto-reload on chunk load failures (stale deployment assets)
    const msg = error.message || "";
    const isChunkError =
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Loading chunk") ||
      msg.includes("Loading CSS chunk") ||
      msg.includes("error loading dynamically imported module");

    if (isChunkError) {
      const key = "chunk-reload";
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - parseInt(last) > 30_000) {
        sessionStorage.setItem(key, now.toString());
        window.location.reload();
      }
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className={cn(
            "flex min-h-[200px] flex-col items-center justify-center gap-4 p-8",
            "bg-[hsl(var(--surface))]",
            "rounded-lg border border-[hsl(var(--border-subtle))]"
          )}
        >
          <div className="text-center">
            <h2 className="mb-2 text-lg font-semibold text-[hsl(var(--text))]">
              Something went wrong
            </h2>
            <p className="mb-4 text-sm text-[hsl(var(--text-muted))]">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            className={cn(
              "rounded-md px-4 py-2",
              "bg-[hsl(var(--cyan))] text-[hsl(var(--bg-base))]",
              "text-sm font-medium",
              "transition-opacity hover:opacity-90"
            )}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
