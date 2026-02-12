import React, { useState, useEffect } from "react";
import {
  Link2Icon,
  PersonIcon,
  GearIcon,
  EnvelopeClosedIcon,
  PlusIcon,
  Cross2Icon,
  CheckIcon,
  ReloadIcon,
  CopyIcon,
  CheckCircledIcon,
  ExternalLinkIcon,
  CrossCircledIcon,
  InfoCircledIcon,
} from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { useWorkspaceStore, SocialConnection } from "../../stores/workspaceStore";
import { usePodcast } from "../../hooks/usePodcast";
import {
  startOAuthFlow,
  disconnectOAuth,
  getOAuthStatus,
  type OAuthPlatform,
} from "../../services/oauth";

// ============ Social Platform Config ============
interface PlatformConfig {
  id: SocialConnection["platform"];
  name: string;
  description: string;
  icon: React.ReactNode;
  oauthSupported: boolean;
}

const platformConfigs: PlatformConfig[] = [
  {
    id: "youtube",
    name: "YouTube",
    description: "Publish full episodes and clips to your YouTube channel",
    oauthSupported: true,
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
    oauthSupported: false,
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
    oauthSupported: false,
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
    oauthSupported: false,
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
];

export const PodcastSettingsPage: React.FC = () => {
  // ============ Connections State ============
  const { connections, connectAccount, disconnectAccount } = useWorkspaceStore();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // ============ Team State ============
  const {
    podcast,
    isLoading: isLoadingPodcast,
    error: podcastError,
    inviteMember,
    removeMember,
    cancelInvitation,
    resendInvitation,
    isOwner,
  } = usePodcast();
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(null);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<{
    invitationId: string;
    success: boolean;
    message: string;
    invitationUrl?: string;
  } | null>(null);

  // ============ Connections Logic ============
  useEffect(() => {
    const syncStatus = async () => {
      try {
        const statuses = await getOAuthStatus();
        for (const status of statuses) {
          if (status.connected && status.accountName) {
            connectAccount(status.platform, status.accountName);
          } else {
            disconnectAccount(status.platform);
          }
        }
      } catch (err) {
        console.error("Failed to sync OAuth status:", err);
      }
    };
    syncStatus();
  }, [connectAccount, disconnectAccount]);

  const handleConnect = async (platform: SocialConnection["platform"]) => {
    const config = platformConfigs.find((p) => p.id === platform);
    if (!config?.oauthSupported) {
      setConnectionError(`OAuth for ${platform} is coming soon. Use manual upload for now.`);
      setTimeout(() => setConnectionError(null), 3000);
      return;
    }

    setConnecting(platform);
    setConnectionError(null);

    try {
      const result = await startOAuthFlow(platform as OAuthPlatform);
      if (result.success && result.accountName) {
        connectAccount(platform, result.accountName);
      } else if (result.error) {
        setConnectionError(result.error);
        setTimeout(() => setConnectionError(null), 5000);
      }
    } catch (err) {
      setConnectionError((err as Error).message);
      setTimeout(() => setConnectionError(null), 5000);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform: SocialConnection["platform"]) => {
    const config = platformConfigs.find((p) => p.id === platform);
    if (config?.oauthSupported) {
      await disconnectOAuth(platform as OAuthPlatform);
    }
    disconnectAccount(platform);
  };

  const getConnectionState = (platform: SocialConnection["platform"]) => {
    return connections.find((c) => c.platform === platform);
  };

  // ============ Team Logic ============
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    setInviteLink(null);

    try {
      const result = await inviteMember(inviteEmail.trim());
      setInviteEmail("");
      if (result.status === "added") {
        setInviteSuccess("User added to team!");
      } else if (result.emailSent) {
        setInviteSuccess("Invitation sent! They'll receive an email.");
      } else {
        setInviteSuccess(result.message || "Invitation created, but email could not be sent.");
        if (result.emailError) {
          setInviteError(result.emailError);
        }
        if (result.invitationUrl) {
          setInviteLink(result.invitationUrl);
        }
      }
      setTimeout(() => setInviteSuccess(null), 5000);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setRemovingMemberId(userId);
    await removeMember(userId);
    setRemovingMemberId(null);
  };

  const handleCancelInvitation = async (invitationId: string) => {
    setCancellingInviteId(invitationId);
    await cancelInvitation(invitationId);
    setCancellingInviteId(null);
  };

  const handleResendInvitation = async (invitationId: string) => {
    setResendingInviteId(invitationId);
    setResendResult(null);

    const result = await resendInvitation(invitationId);
    setResendResult({
      invitationId,
      success: result.success,
      message: result.message || (result.success ? "Email sent!" : "Failed to send email"),
      invitationUrl: result.invitationUrl,
    });

    setResendingInviteId(null);
    setTimeout(() => setResendResult(null), 10000);
  };

  const handleCopyInviteLink = (url: string) => {
    navigator.clipboard.writeText(url);
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
        <div className="flex items-center gap-2">
          <GearIcon className="h-5 w-5 text-[hsl(var(--text-muted))]" />
          <div>
            <h1 className="text-lg font-semibold text-[hsl(var(--text))]">Settings</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* ============ Connections Section ============ */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              <Link2Icon className="h-4 w-4" />
              Connected Accounts
            </h2>
            <p className="mb-4 text-sm text-[hsl(var(--text-muted))]">
              Connect your social accounts for auto-publishing
            </p>

            <div className="space-y-3">
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
                    <div
                      className={cn(
                        "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
                        isConnected
                          ? "bg-[hsl(var(--surface))] text-[hsl(var(--text))]"
                          : "bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]"
                      )}
                    >
                      {platform.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-[hsl(var(--text))]">{platform.name}</h3>
                        {isConnected && (
                          <span className="flex items-center gap-1 text-xs text-[hsl(var(--success))]">
                            <CheckCircledIcon className="h-3 w-3" />
                            Connected
                          </span>
                        )}
                        {!platform.oauthSupported && !isConnected && (
                          <span className="rounded-full bg-[hsl(var(--surface))] px-2 py-0.5 text-[10px] text-[hsl(var(--text-muted))]">
                            Coming soon
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm text-[hsl(var(--text-muted))]">
                        {isConnected ? accountName : platform.description}
                      </p>
                    </div>

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
            </div>

            {connectionError && (
              <div
                className={cn(
                  "mt-4 rounded-lg p-4",
                  "bg-[hsl(var(--error)/0.1)]",
                  "border border-[hsl(var(--error)/0.3)]"
                )}
              >
                <p className="text-sm text-[hsl(var(--error))]">{connectionError}</p>
              </div>
            )}

            <div
              className={cn(
                "mt-4 rounded-lg p-4",
                "bg-[hsl(var(--surface)/0.3)]",
                "border border-[hsl(var(--border-subtle))]"
              )}
            >
              <div className="flex items-start gap-2">
                <InfoCircledIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--text-muted))]" />
                <p className="text-sm text-[hsl(var(--text-muted))]">
                  <strong>Currently supported:</strong> YouTube. TikTok, Instagram, and X support is
                  coming soon - for now, use manual upload with the copy caption feature.
                </p>
              </div>
            </div>
          </section>

          {/* ============ Team Section ============ */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium tracking-wider text-[hsl(var(--text-muted))] uppercase">
              <PersonIcon className="h-4 w-4" />
              Team
            </h2>
            <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.5)] p-5">
              {/* Invite Form */}
              <form onSubmit={handleInvite} className="mb-6">
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--text))]">
                  Invite a team member
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    disabled={isInviting}
                    className={cn(
                      "flex-1 rounded-lg px-4 py-2.5",
                      "bg-[hsl(var(--bg-base))]",
                      "border border-[hsl(var(--border-subtle))]",
                      "text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-ghost))]",
                      "focus:border-[hsl(var(--cyan))] focus:ring-1 focus:ring-[hsl(var(--cyan)/0.3)] focus:outline-none",
                      "disabled:opacity-50"
                    )}
                  />
                  <button
                    type="submit"
                    disabled={isInviting || !inviteEmail.trim()}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg px-4 py-2.5",
                      "bg-[hsl(var(--cyan))] text-[hsl(var(--bg-base))]",
                      "text-sm font-medium",
                      "hover:bg-[hsl(var(--cyan)/0.9)]",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      "transition-colors"
                    )}
                  >
                    <PlusIcon className="h-4 w-4" />
                    {isInviting ? "Inviting..." : "Invite"}
                  </button>
                </div>
                {inviteError && (
                  <p className="mt-2 text-sm text-[hsl(var(--error))]">{inviteError}</p>
                )}
                {inviteSuccess && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-green-500">
                    <CheckIcon className="h-4 w-4" />
                    {inviteSuccess}
                  </p>
                )}
                {inviteLink && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-[hsl(var(--text-muted))]">
                    <span className="truncate">Invite link ready</span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(inviteLink)}
                      className={cn(
                        "rounded-full px-2.5 py-1",
                        "bg-[hsl(var(--surface))]",
                        "border border-[hsl(var(--border-subtle))]",
                        "text-[hsl(var(--text))]",
                        "hover:bg-[hsl(var(--surface-hover))]"
                      )}
                    >
                      Copy invite link
                    </button>
                  </div>
                )}
              </form>

              {/* Current Members */}
              <div className="mb-4">
                <h3 className="mb-3 text-sm font-medium text-[hsl(var(--text))]">
                  Current Members
                </h3>
                {isLoadingPodcast ? (
                  <p className="text-sm text-[hsl(var(--text-ghost))]">Loading...</p>
                ) : podcastError ? (
                  <p className="text-sm text-[hsl(var(--error))]">{podcastError}</p>
                ) : podcast?.members && podcast.members.length > 0 ? (
                  <div className="space-y-2">
                    {podcast.members.map((member) => (
                      <div
                        key={member.userId}
                        className={cn(
                          "flex items-center justify-between rounded-lg px-4 py-3",
                          "bg-[hsl(var(--bg-base))]",
                          "border border-[hsl(var(--border-subtle))]"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {member.avatarUrl ? (
                            <img
                              src={member.avatarUrl}
                              alt={member.name}
                              className="h-8 w-8 rounded-full"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--cyan)/0.2)] text-sm font-medium text-[hsl(var(--cyan))]">
                              {member.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()
                                .slice(0, 2)}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-[hsl(var(--text))]">
                              {member.name}
                            </p>
                            <p className="text-xs text-[hsl(var(--text-ghost))]">{member.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-xs font-medium",
                              member.role === "owner"
                                ? "bg-[hsl(var(--cyan)/0.15)] text-[hsl(var(--cyan))]"
                                : "bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]"
                            )}
                          >
                            {member.role === "owner" ? "Owner" : "Member"}
                          </span>
                          {isOwner && member.role !== "owner" && (
                            <button
                              onClick={() => handleRemoveMember(member.userId)}
                              disabled={removingMemberId === member.userId}
                              className={cn(
                                "rounded p-1.5 text-[hsl(var(--text-ghost))]",
                                "hover:bg-[hsl(var(--error)/0.1)] hover:text-[hsl(var(--error))]",
                                "disabled:opacity-50",
                                "transition-colors"
                              )}
                              title="Remove member"
                            >
                              <Cross2Icon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[hsl(var(--text-ghost))]">No members yet</p>
                )}
              </div>

              {/* Pending Invitations */}
              {podcast?.pendingInvitations && podcast.pendingInvitations.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-medium text-[hsl(var(--text))]">
                    Pending Invitations
                  </h3>
                  <div className="space-y-2">
                    {podcast.pendingInvitations.map((invitation) => (
                      <div key={invitation.id} className="space-y-2">
                        <div
                          className={cn(
                            "flex items-center justify-between rounded-lg px-4 py-3",
                            "bg-[hsl(var(--bg-base))]",
                            "border border-dashed border-[hsl(var(--border-subtle))]"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--surface))] text-[hsl(var(--text-ghost))]">
                              <EnvelopeClosedIcon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm text-[hsl(var(--text))]">{invitation.email}</p>
                              <p className="text-xs text-[hsl(var(--text-ghost))]">
                                Invited {new Date(invitation.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleResendInvitation(invitation.id)}
                              disabled={resendingInviteId === invitation.id}
                              className={cn(
                                "rounded p-1.5 text-[hsl(var(--text-ghost))]",
                                "hover:bg-[hsl(var(--cyan)/0.1)] hover:text-[hsl(var(--cyan))]",
                                "disabled:opacity-50",
                                "transition-colors"
                              )}
                              title="Resend invitation email"
                            >
                              <ReloadIcon
                                className={cn(
                                  "h-4 w-4",
                                  resendingInviteId === invitation.id && "animate-spin"
                                )}
                              />
                            </button>
                            <button
                              onClick={() => handleCancelInvitation(invitation.id)}
                              disabled={cancellingInviteId === invitation.id}
                              className={cn(
                                "rounded p-1.5 text-[hsl(var(--text-ghost))]",
                                "hover:bg-[hsl(var(--error)/0.1)] hover:text-[hsl(var(--error))]",
                                "disabled:opacity-50",
                                "transition-colors"
                              )}
                              title="Cancel invitation"
                            >
                              <Cross2Icon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {resendResult?.invitationId === invitation.id && (
                          <div
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs",
                              resendResult.success
                                ? "bg-green-500/10 text-green-500"
                                : "bg-[hsl(var(--error)/0.1)] text-[hsl(var(--error))]"
                            )}
                          >
                            {resendResult.success ? (
                              <CheckIcon className="h-3.5 w-3.5" />
                            ) : (
                              <Cross2Icon className="h-3.5 w-3.5" />
                            )}
                            <span className="flex-1">{resendResult.message}</span>
                            {!resendResult.success && resendResult.invitationUrl && (
                              <button
                                onClick={() =>
                                  handleCopyInviteLink(resendResult.invitationUrl ?? "")
                                }
                                className={cn(
                                  "inline-flex items-center gap-1 rounded px-2 py-1",
                                  "bg-[hsl(var(--surface))]",
                                  "hover:bg-[hsl(var(--surface-hover))]",
                                  "text-[hsl(var(--text))]"
                                )}
                              >
                                <CopyIcon className="h-3 w-3" />
                                Copy link
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PodcastSettingsPage;
