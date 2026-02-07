import { Router, Request, Response } from "express";
import {
  generateState,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getAccountDisplayName,
  revokeToken,
} from "../lib/oauth-providers/youtube.js";
import * as instagramOAuth from "../lib/oauth-providers/instagram.js";
import * as tiktokOAuth from "../lib/oauth-providers/tiktok.js";
import {
  getRequestToken as getXRequestToken,
  exchangeRequestToken,
  revokeToken as revokeXToken,
} from "../lib/oauth-providers/x.js";
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
const pendingStates = new Map<
  string,
  {
    createdAt: number;
    platform: string;
    oauthTokenSecret?: string;
  }
>();

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

// Get authorization URL for Instagram
router.get("/instagram/authorize", (_req: Request, res: Response) => {
  try {
    const state = generateState();
    pendingStates.set(state, { createdAt: Date.now(), platform: "instagram" });

    const authUrl = instagramOAuth.getAuthorizationUrl(state);
    res.json({ authUrl, state });
  } catch (error) {
    console.error("Error generating Instagram auth URL:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// OAuth callback for Instagram
router.get("/instagram/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error) {
    console.error("Instagram OAuth error:", error);
    res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent(String(error))}&platform=instagram`
    );
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendUrl}/oauth/callback?error=missing_params&platform=instagram`);
    return;
  }

  const pendingState = pendingStates.get(String(state));
  if (!pendingState || pendingState.platform !== "instagram") {
    res.redirect(`${frontendUrl}/oauth/callback?error=invalid_state&platform=instagram`);
    return;
  }
  pendingStates.delete(String(state));

  try {
    const tokens = await instagramOAuth.exchangeCodeForTokens(String(code));
    await saveToken(
      "instagram",
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresAt,
      tokens.accountName,
      tokens.accountId
    );

    res.redirect(
      `${frontendUrl}/oauth/callback?success=true&platform=instagram&accountName=${encodeURIComponent(tokens.accountName)}`
    );
  } catch (error) {
    console.error("Error exchanging Instagram code for tokens:", error);
    res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent((error as Error).message)}&platform=instagram`
    );
  }
});

// Refresh Instagram token
router.post("/instagram/refresh", async (_req: Request, res: Response) => {
  try {
    const token = await getToken("instagram");
    if (!token) {
      res.status(404).json({ error: "No Instagram token found" });
      return;
    }

    const refreshed = await instagramOAuth.refreshAccessToken(token.refreshToken);
    await saveToken(
      "instagram",
      refreshed.accessToken,
      refreshed.refreshToken,
      refreshed.expiresAt,
      refreshed.accountName,
      refreshed.accountId
    );

    res.json({
      success: true,
      expiresAt: refreshed.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error refreshing Instagram token:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Revoke Instagram token
router.post("/instagram/revoke", async (_req: Request, res: Response) => {
  try {
    const token = await getToken("instagram");
    if (token) {
      await instagramOAuth.revokeToken(token.accessToken);
    }

    await deleteToken("instagram");
    res.json({ success: true });
  } catch (error) {
    console.error("Error revoking Instagram token:", error);
    res.json({ success: true });
  }
});

// Get authorization URL for TikTok
router.get("/tiktok/authorize", (_req: Request, res: Response) => {
  try {
    const state = generateState();
    pendingStates.set(state, { createdAt: Date.now(), platform: "tiktok" });

    const authUrl = tiktokOAuth.getAuthorizationUrl(state);
    res.json({ authUrl, state });
  } catch (error) {
    console.error("Error generating TikTok auth URL:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// OAuth callback for TikTok
router.get("/tiktok/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error) {
    console.error("TikTok OAuth error:", error);
    res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent(String(error))}&platform=tiktok`
    );
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendUrl}/oauth/callback?error=missing_params&platform=tiktok`);
    return;
  }

  const pendingState = pendingStates.get(String(state));
  if (!pendingState || pendingState.platform !== "tiktok") {
    res.redirect(`${frontendUrl}/oauth/callback?error=invalid_state&platform=tiktok`);
    return;
  }
  pendingStates.delete(String(state));

  try {
    const tokens = await tiktokOAuth.exchangeCodeForTokens(String(code));
    await saveToken(
      "tiktok",
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresAt,
      tokens.accountName,
      tokens.accountId
    );

    res.redirect(
      `${frontendUrl}/oauth/callback?success=true&platform=tiktok&accountName=${encodeURIComponent(tokens.accountName)}`
    );
  } catch (error) {
    console.error("Error exchanging TikTok code for tokens:", error);
    res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent((error as Error).message)}&platform=tiktok`
    );
  }
});

// Refresh TikTok token
router.post("/tiktok/refresh", async (_req: Request, res: Response) => {
  try {
    const token = await getToken("tiktok");
    if (!token) {
      res.status(404).json({ error: "No TikTok token found" });
      return;
    }

    const refreshed = await tiktokOAuth.refreshAccessToken(token.refreshToken);
    await saveToken(
      "tiktok",
      refreshed.accessToken,
      refreshed.refreshToken,
      refreshed.expiresAt,
      refreshed.accountName,
      refreshed.accountId
    );

    res.json({
      success: true,
      expiresAt: refreshed.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error refreshing TikTok token:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Revoke TikTok token
router.post("/tiktok/revoke", async (_req: Request, res: Response) => {
  try {
    const token = await getToken("tiktok");
    if (token) {
      await tiktokOAuth.revokeToken(token.accessToken);
    }

    await deleteToken("tiktok");
    res.json({ success: true });
  } catch (error) {
    console.error("Error revoking TikTok token:", error);
    res.json({ success: true });
  }
});

// Get authorization URL for X (OAuth 1.0a)
router.get("/x/authorize", async (_req: Request, res: Response) => {
  try {
    const requestToken = await getXRequestToken();
    pendingStates.set(requestToken.oauthToken, {
      createdAt: Date.now(),
      platform: "x",
      oauthTokenSecret: requestToken.oauthTokenSecret,
    });

    res.json({ authUrl: requestToken.authUrl, state: requestToken.oauthToken });
  } catch (error) {
    console.error("Error generating X auth URL:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// OAuth callback for X
router.get("/x/callback", async (req: Request, res: Response) => {
  const { oauth_token: oauthToken, oauth_verifier: oauthVerifier, error } = req.query;

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error) {
    console.error("X OAuth error:", error);
    res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent(String(error))}&platform=x`
    );
    return;
  }

  if (!oauthToken || !oauthVerifier) {
    res.redirect(`${frontendUrl}/oauth/callback?error=missing_params&platform=x`);
    return;
  }

  const pendingState = pendingStates.get(String(oauthToken));
  if (!pendingState || pendingState.platform !== "x" || !pendingState.oauthTokenSecret) {
    res.redirect(`${frontendUrl}/oauth/callback?error=invalid_state&platform=x`);
    return;
  }

  pendingStates.delete(String(oauthToken));

  try {
    const tokens = await exchangeRequestToken({
      oauthToken: String(oauthToken),
      oauthTokenSecret: pendingState.oauthTokenSecret,
      oauthVerifier: String(oauthVerifier),
    });

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10); // 10 years

    await saveToken(
      "x",
      tokens.accessToken,
      tokens.refreshToken,
      expiresAt,
      tokens.accountName,
      tokens.accountId
    );

    res.redirect(
      `${frontendUrl}/oauth/callback?success=true&platform=x&accountName=${encodeURIComponent(tokens.accountName)}`
    );
  } catch (error) {
    console.error("Error exchanging X tokens:", error);
    res.redirect(
      `${frontendUrl}/oauth/callback?error=${encodeURIComponent((error as Error).message)}&platform=x`
    );
  }
});

// Revoke X token
router.post("/x/revoke", async (_req: Request, res: Response) => {
  try {
    const token = await getToken("x");
    if (token) {
      await revokeXToken(token.accessToken);
    }

    await deleteToken("x");
    res.json({ success: true });
  } catch (error) {
    console.error("Error revoking X token:", error);
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
            } else if (token && status.platform === "instagram") {
              const refreshed = await instagramOAuth.refreshAccessToken(token.refreshToken);
              await saveToken(
                "instagram",
                refreshed.accessToken,
                refreshed.refreshToken,
                refreshed.expiresAt,
                refreshed.accountName,
                refreshed.accountId
              );
              status.expiresAt = refreshed.expiresAt.toISOString();
              status.accountName = refreshed.accountName;
            } else if (token && status.platform === "tiktok") {
              const refreshed = await tiktokOAuth.refreshAccessToken(token.refreshToken);
              await saveToken(
                "tiktok",
                refreshed.accessToken,
                refreshed.refreshToken,
                refreshed.expiresAt,
                refreshed.accountName,
                refreshed.accountId
              );
              status.expiresAt = refreshed.expiresAt.toISOString();
              status.accountName = refreshed.accountName;
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
  const rawPlatform = req.params.platform;
  const platform = Array.isArray(rawPlatform) ? rawPlatform[0] : rawPlatform;

  const supportedPlatforms = ["youtube", "instagram", "tiktok", "x"];
  if (!platform || !supportedPlatforms.includes(platform)) {
    res.status(400).json({ error: "Unsupported platform" });
    return;
  }

  try {
    // Check if token is expired and refresh if needed
    const expired = await isTokenExpired(platform as "youtube" | "instagram" | "tiktok" | "x");
    if (expired && platform !== "x") {
      const token = await getToken(platform as "youtube" | "instagram" | "tiktok" | "x");
      if (!token) {
        res.status(404).json({ error: `Not connected to ${platform}` });
        return;
      }

      if (platform === "youtube") {
        const refreshed = await refreshAccessToken(token.refreshToken);
        await updateToken("youtube", refreshed.accessToken, refreshed.expiresAt);
      } else if (platform === "instagram") {
        const refreshed = await instagramOAuth.refreshAccessToken(token.refreshToken);
        await saveToken(
          "instagram",
          refreshed.accessToken,
          refreshed.refreshToken,
          refreshed.expiresAt,
          refreshed.accountName,
          refreshed.accountId
        );
      } else if (platform === "tiktok") {
        const refreshed = await tiktokOAuth.refreshAccessToken(token.refreshToken);
        await saveToken(
          "tiktok",
          refreshed.accessToken,
          refreshed.refreshToken,
          refreshed.expiresAt,
          refreshed.accountName,
          refreshed.accountId
        );
      }
    }

    const token = await getToken(platform as "youtube" | "instagram" | "tiktok" | "x");
    if (!token) {
      res.status(404).json({ error: `Not connected to ${platform}` });
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
