import { Router, Request, Response } from "express";
import {
  generateState,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getAccountDisplayName,
  revokeToken,
} from "../lib/oauth-providers/youtube.js";
import {
  saveToken,
  getToken,
  updateToken,
  deleteToken,
  getAllTokenStatuses,
  isTokenExpired,
} from "../lib/token-storage.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// Apply auth middleware to all routes except callbacks
// Callbacks come from OAuth providers without auth headers
router.use((req, res, next) => {
  // Skip auth for callback routes
  if (req.path.includes("/callback")) {
    return next();
  }
  // Apply auth middleware for all other routes
  return authMiddleware(req, res, next);
});

// In-memory state storage for CSRF protection (in production, use Redis or similar)
const pendingStates = new Map<string, { createdAt: number; platform: string }>();

// Clean up old states every 10 minutes
setInterval(
  () => {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    for (const [state, data] of pendingStates.entries()) {
      if (now - data.createdAt > maxAge) {
        pendingStates.delete(state);
      }
    }
  },
  10 * 60 * 1000
);

// Get authorization URL for YouTube
router.get("/youtube/authorize", (_req: Request, res: Response) => {
  try {
    const state = generateState();
    pendingStates.set(state, { createdAt: Date.now(), platform: "youtube" });

    const authUrl = getAuthorizationUrl(state);
    res.json({ authUrl, state });
  } catch (error) {
    console.error("Error generating auth URL:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// OAuth callback for YouTube
router.get("/youtube/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  // Get frontend URL for redirects
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error) {
    console.error("OAuth error:", error);
    res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent(String(error))}&platform=youtube`
    );
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendUrl}/oauth/callback?error=missing_params&platform=youtube`);
    return;
  }

  // Validate state
  const pendingState = pendingStates.get(String(state));
  if (!pendingState || pendingState.platform !== "youtube") {
    res.redirect(`${frontendUrl}/oauth/callback?error=invalid_state&platform=youtube`);
    return;
  }
  pendingStates.delete(String(state));

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(String(code));

    // Get account display name
    const accountName = await getAccountDisplayName(tokens.accessToken);

    // Save tokens
    await saveToken(
      "youtube",
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresAt,
      accountName
    );

    // Redirect to frontend callback page with success
    res.redirect(
      `${frontendUrl}/oauth/callback?success=true&platform=youtube&accountName=${encodeURIComponent(accountName)}`
    );
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent((error as Error).message)}&platform=youtube`
    );
  }
});

// Refresh YouTube token
router.post("/youtube/refresh", async (_req: Request, res: Response) => {
  try {
    const token = await getToken("youtube");
    if (!token) {
      res.status(404).json({ error: "No YouTube token found" });
      return;
    }

    const refreshed = await refreshAccessToken(token.refreshToken);
    await updateToken("youtube", refreshed.accessToken, refreshed.expiresAt);

    res.json({
      success: true,
      expiresAt: refreshed.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error refreshing token:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Revoke YouTube token (disconnect)
router.post("/youtube/revoke", async (_req: Request, res: Response) => {
  try {
    const token = await getToken("youtube");
    if (token) {
      // Revoke the token with Google
      await revokeToken(token.accessToken);
    }

    // Delete local token regardless
    await deleteToken("youtube");

    res.json({ success: true });
  } catch (error) {
    console.error("Error revoking token:", error);
    // Still return success if we deleted local token
    res.json({ success: true });
  }
});

// Get status of all OAuth connections
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const statuses = await getAllTokenStatuses();

    // Check if any tokens need refresh
    for (const status of statuses) {
      if (status.connected) {
        const expired = await isTokenExpired(status.platform);
        if (expired) {
          // Try to refresh the token
          try {
            const token = await getToken(status.platform);
            if (token && status.platform === "youtube") {
              const refreshed = await refreshAccessToken(token.refreshToken);
              await updateToken("youtube", refreshed.accessToken, refreshed.expiresAt);
              status.expiresAt = refreshed.expiresAt.toISOString();
            }
          } catch (refreshError) {
            console.error(`Failed to refresh ${status.platform} token:`, refreshError);
            // Mark as disconnected if refresh fails
            status.connected = false;
            status.accountName = undefined;
            status.expiresAt = undefined;
          }
        }
      }
    }

    res.json({ connections: statuses });
  } catch (error) {
    console.error("Error getting OAuth status:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get access token for a platform (for upload use)
router.get("/:platform/token", async (req: Request, res: Response) => {
  const { platform } = req.params;

  if (platform !== "youtube") {
    res.status(400).json({ error: "Unsupported platform" });
    return;
  }

  try {
    // Check if token is expired and refresh if needed
    const expired = await isTokenExpired("youtube");
    if (expired) {
      const token = await getToken("youtube");
      if (!token) {
        res.status(404).json({ error: "Not connected to YouTube" });
        return;
      }

      const refreshed = await refreshAccessToken(token.refreshToken);
      await updateToken("youtube", refreshed.accessToken, refreshed.expiresAt);
    }

    const token = await getToken("youtube");
    if (!token) {
      res.status(404).json({ error: "Not connected to YouTube" });
      return;
    }

    res.json({
      accessToken: token.accessToken,
      expiresAt: token.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error getting token:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export const oauthRouter = router;
