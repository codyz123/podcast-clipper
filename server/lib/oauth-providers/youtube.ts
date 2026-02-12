import crypto from "crypto";

// YouTube/Google OAuth configuration
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const YOUTUBE_CHANNEL_URL = "https://www.googleapis.com/youtube/v3/channels";

// Scopes needed for YouTube uploads
const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface YouTubeChannelInfo {
  id: string;
  title: string;
  customUrl?: string;
}

function getConfig() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing YouTube OAuth configuration. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI"
    );
  }

  return { clientId, clientSecret, redirectUri };
}

// Generate a random state for CSRF protection
export function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Generate the authorization URL
export function getAuthorizationUrl(state: string): string {
  const config = getConfig();

  console.warn(
    "[YouTube OAuth] Generating auth URL with redirect_uri:",
    JSON.stringify(config.redirectUri)
  );

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES,
    state,
    access_type: "offline", // Request refresh token
    prompt: "consent", // Always show consent to get refresh token
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const config = getConfig();

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  const data: GoogleTokenResponse = await response.json();

  if (!data.refresh_token) {
    throw new Error("No refresh token received. User may need to revoke access and reconnect.");
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  };
}

// Refresh an expired access token
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const config = getConfig();

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data: GoogleTokenResponse = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return {
    accessToken: data.access_token,
    expiresAt,
  };
}

// Get user info from Google
export async function getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get user info: ${error}`);
  }

  return response.json();
}

// Get YouTube channel info
export async function getChannelInfo(accessToken: string): Promise<YouTubeChannelInfo | null> {
  const params = new URLSearchParams({
    part: "snippet",
    mine: "true",
  });

  const response = await fetch(`${YOUTUBE_CHANNEL_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error("Failed to get YouTube channel info:", await response.text());
    return null;
  }

  const data = await response.json();
  const channel = data.items?.[0];

  if (!channel) {
    return null;
  }

  return {
    id: channel.id,
    title: channel.snippet.title,
    customUrl: channel.snippet.customUrl,
  };
}

// Revoke tokens
export async function revokeToken(token: string): Promise<void> {
  const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to revoke token:", error);
    // Don't throw - we still want to delete local tokens even if revocation fails
  }
}

// Get account display name (prefers YouTube channel name, falls back to Google profile)
export async function getAccountDisplayName(accessToken: string): Promise<string> {
  // Try to get YouTube channel name first
  const channel = await getChannelInfo(accessToken);
  if (channel?.title) {
    return channel.customUrl ? `@${channel.customUrl.replace("@", "")}` : channel.title;
  }

  // Fall back to Google profile name
  const userInfo = await getUserInfo(accessToken);
  return userInfo.name || userInfo.email;
}
