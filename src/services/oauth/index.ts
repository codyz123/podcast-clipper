import { useSettingsStore } from "../../stores/settingsStore";

export type OAuthPlatform = "youtube" | "tiktok" | "instagram" | "x";

interface OAuthResult {
  success: boolean;
  platform: OAuthPlatform;
  accountName?: string;
  error?: string;
}

function getBackendConfig(): { backendUrl: string; accessCode: string } {
  const { settings } = useSettingsStore.getState();
  const backendUrl = settings.backendUrl || "http://localhost:3002";
  const accessCode = settings.accessCode || "";
  return { backendUrl, accessCode };
}

// Start OAuth flow in a popup window
export async function startOAuthFlow(platform: OAuthPlatform): Promise<OAuthResult> {
  const { backendUrl, accessCode } = getBackendConfig();

  try {
    // Get the authorization URL from the backend
    const response = await fetch(`${backendUrl}/api/oauth/${platform}/authorize`, {
      headers: {
        "x-access-code": accessCode,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to get authorization URL");
    }

    const { authUrl } = await response.json();

    // Open popup window
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      `Connect ${platform}`,
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );

    if (!popup) {
      throw new Error("Popup blocked. Please allow popups for this site.");
    }

    // Wait for the callback
    return await waitForOAuthCallback(popup, platform);
  } catch (error) {
    return {
      success: false,
      platform,
      error: (error as Error).message,
    };
  }
}

// Wait for the OAuth callback from the popup
function waitForOAuthCallback(popup: Window, platform: OAuthPlatform): Promise<OAuthResult> {
  return new Promise((resolve) => {
    // Check if popup was closed without completing
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handleMessage);
        resolve({
          success: false,
          platform,
          error: "OAuth window was closed",
        });
      }
    }, 500);

    // Listen for postMessage from the callback page
    const handleMessage = (event: MessageEvent) => {
      // Verify origin (should match our frontend URL)
      if (!event.origin.includes(window.location.hostname)) {
        return;
      }

      if (event.data?.type === "oauth-callback" && event.data?.platform === platform) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handleMessage);
        popup.close();

        if (event.data.success) {
          resolve({
            success: true,
            platform,
            accountName: event.data.accountName,
          });
        } else {
          resolve({
            success: false,
            platform,
            error: event.data.error || "OAuth failed",
          });
        }
      }
    };

    window.addEventListener("message", handleMessage);
  });
}

// Disconnect an OAuth account
export async function disconnectOAuth(platform: OAuthPlatform): Promise<boolean> {
  const { backendUrl, accessCode } = getBackendConfig();

  try {
    const response = await fetch(`${backendUrl}/api/oauth/${platform}/revoke`, {
      method: "POST",
      headers: {
        "x-access-code": accessCode,
        "Content-Type": "application/json",
      },
    });

    return response.ok;
  } catch (error) {
    console.error(`Failed to disconnect ${platform}:`, error);
    return false;
  }
}

// Get OAuth connection status for all platforms
export async function getOAuthStatus(): Promise<
  Array<{
    platform: OAuthPlatform;
    connected: boolean;
    accountName?: string;
    expiresAt?: string;
  }>
> {
  const { backendUrl, accessCode } = getBackendConfig();

  try {
    const response = await fetch(`${backendUrl}/api/oauth/status`, {
      headers: {
        "x-access-code": accessCode,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get OAuth status");
    }

    const data = await response.json();
    return data.connections;
  } catch (error) {
    console.error("Failed to get OAuth status:", error);
    // Return all disconnected on error
    return [
      { platform: "youtube", connected: false },
      { platform: "tiktok", connected: false },
      { platform: "instagram", connected: false },
      { platform: "x", connected: false },
    ];
  }
}

// Get access token for uploading (refreshes if needed)
export async function getAccessToken(
  platform: OAuthPlatform
): Promise<{ accessToken: string; expiresAt: string } | null> {
  const { backendUrl, accessCode } = getBackendConfig();

  try {
    const response = await fetch(`${backendUrl}/api/oauth/${platform}/token`, {
      headers: {
        "x-access-code": accessCode,
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    console.error(`Failed to get ${platform} access token:`, error);
    return null;
  }
}
