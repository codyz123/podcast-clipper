import React from "react";
import { CheckIcon } from "@radix-ui/react-icons";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { SocialPlatform } from "../../lib/publish";
import { PlatformIcon } from "./PlatformIcon";
import { cn } from "../../lib/utils";

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
};

interface ConnectedAccountsBarProps {
  onConnect: (platform: SocialPlatform) => void;
  connectingPlatform: SocialPlatform | null;
}

export const ConnectedAccountsBar: React.FC<ConnectedAccountsBarProps> = ({
  onConnect,
  connectingPlatform,
}) => {
  const connections = useWorkspaceStore((s) => s.connections);

  const platforms: SocialPlatform[] = ["youtube", "instagram", "tiktok", "x"];

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        "border-[hsl(var(--glass-border))]",
        "bg-[hsl(var(--surface))]"
      )}
    >
      <h3 className="mb-3 text-xs font-semibold tracking-wider text-[hsl(var(--text-muted))] uppercase">
        Connected Accounts
      </h3>
      <div className="flex flex-wrap gap-2">
        {platforms.map((platform) => {
          const connection = connections.find((c) => c.platform === platform);
          const isConnected = connection?.connected;
          const isConnecting = connectingPlatform === platform;

          return (
            <div
              key={platform}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                isConnected
                  ? "bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]"
                  : "bg-[hsl(var(--surface-hover))] text-[hsl(var(--text-muted))]"
              )}
            >
              <PlatformIcon platform={platform} className="h-4 w-4" />
              {isConnected ? (
                <>
                  <span className="max-w-[100px] truncate">
                    {connection.accountName || PLATFORM_LABELS[platform]}
                  </span>
                  <CheckIcon className="h-3 w-3" />
                </>
              ) : (
                <button
                  onClick={() => onConnect(platform)}
                  disabled={isConnecting}
                  className="transition-colors hover:text-[hsl(var(--text))]"
                >
                  {isConnecting ? "Connecting..." : `Connect ${PLATFORM_LABELS[platform]}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
