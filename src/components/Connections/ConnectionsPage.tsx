import React, { useState } from "react";
import { CheckCircledIcon, ExternalLinkIcon, CrossCircledIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { useWorkspaceStore, SocialConnection } from "../../stores/workspaceStore";

interface PlatformConfig {
  id: SocialConnection["platform"];
  name: string;
  description: string;
  icon: React.ReactNode;
}

const platformConfigs: PlatformConfig[] = [
  {
    id: "youtube",
    name: "YouTube",
    description: "Publish full episodes and clips to your YouTube channel",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Share short-form clips to TikTok",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
      </svg>
    ),
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Post Reels and stories to Instagram",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    ),
  },
  {
    id: "x",
    name: "X (Twitter)",
    description: "Share clips and episode announcements on X",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
];

export const ConnectionsPage: React.FC = () => {
  const { connections, connectAccount, disconnectAccount } = useWorkspaceStore();
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleConnect = async (platform: SocialConnection["platform"]) => {
    setConnecting(platform);
    // Simulate OAuth flow - in production this would redirect to OAuth provider
    await new Promise((resolve) => setTimeout(resolve, 1500));
    connectAccount(platform, `@${platform}_user`);
    setConnecting(null);
  };

  const handleDisconnect = (platform: SocialConnection["platform"]) => {
    disconnectAccount(platform);
  };

  // Get connection state for a platform
  const getConnectionState = (platform: SocialConnection["platform"]) => {
    return connections.find((c) => c.platform === platform);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          "flex h-14 flex-shrink-0 items-center justify-between px-6",
          "border-b border-[hsl(var(--border-subtle))]"
        )}
      >
        <div>
          <h1 className="text-lg font-semibold text-[hsl(var(--text))]">Connections</h1>
          <p className="text-sm text-[hsl(var(--text-muted))]">
            Connect your social accounts for auto-publishing
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {platformConfigs.map((platform) => {
            const connectionState = getConnectionState(platform.id);
            const isConnected = connectionState?.connected ?? false;
            const accountName = connectionState?.accountName;

            return (
              <div
                key={platform.id}
                className={cn(
                  "flex items-center gap-4 rounded-xl p-4",
                  "bg-[hsl(var(--surface)/0.5)]",
                  "border border-[hsl(var(--border-subtle))]",
                  "transition-all duration-150",
                  isConnected && "border-[hsl(var(--success)/0.3)]"
                )}
              >
                {/* Icon */}
                <div
                  className={cn(
                    "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg",
                    isConnected
                      ? "bg-[hsl(var(--surface))] text-[hsl(var(--text))]"
                      : "bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]"
                  )}
                >
                  {platform.icon}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-[hsl(var(--text))]">{platform.name}</h3>
                    {isConnected && (
                      <span className="flex items-center gap-1 text-xs text-[hsl(var(--success))]">
                        <CheckCircledIcon className="h-3 w-3" />
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-[hsl(var(--text-muted))]">
                    {isConnected ? accountName : platform.description}
                  </p>
                </div>

                {/* Action */}
                {isConnected ? (
                  <button
                    onClick={() => handleDisconnect(platform.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2",
                      "text-sm font-medium",
                      "text-[hsl(var(--text-muted))]",
                      "hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--error))]",
                      "transition-colors"
                    )}
                  >
                    <CrossCircledIcon className="h-4 w-4" />
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(platform.id)}
                    disabled={connecting === platform.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-4 py-2",
                      "text-sm font-medium",
                      "bg-[hsl(var(--cyan))] text-[hsl(var(--bg-base))]",
                      "hover:bg-[hsl(var(--cyan)/0.9)]",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      "transition-colors"
                    )}
                  >
                    {connecting === platform.id ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <ExternalLinkIcon className="h-4 w-4" />
                        Connect
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}

          {/* Help text */}
          <div
            className={cn(
              "mt-6 rounded-lg p-4",
              "bg-[hsl(var(--surface)/0.3)]",
              "border border-[hsl(var(--border-subtle))]"
            )}
          >
            <p className="text-sm text-[hsl(var(--text-muted))]">
              Connecting your accounts allows Podcastomatic to automatically publish your clips and
              episodes. We only request the minimum permissions needed for publishing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectionsPage;
