const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USERINFO_URL = "https://open.tiktokapis.com/v2/user/info/";

const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.upload"].join(",");

interface TikTokTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id?: string;
}

interface TikTokUserInfoResponse {
  data?: {
    user?: {
      open_id?: string;
      display_name?: string;
    };
  };
}

function getConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;

  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing TikTok OAuth configuration. Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_REDIRECT_URI"
    );
  }

  return { clientKey, clientSecret, redirectUri };
}

export function getAuthorizationUrl(state: string): string {
  const config = getConfig();

  const params = new URLSearchParams({
    client_key: config.clientKey,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: TIKTOK_SCOPES,
    state,
  });

  return `${TIKTOK_AUTH_URL}?${params.toString()}`;
}

async function getUserInfo(
  accessToken: string
): Promise<{ displayName?: string; openId?: string }> {
  const params = new URLSearchParams({
    fields: "open_id,display_name",
  });

  const response = await fetch(`${TIKTOK_USERINFO_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return {};
  }

  const data = (await response.json()) as TikTokUserInfoResponse;
  return {
    displayName: data.data?.user?.display_name,
    openId: data.data?.user?.open_id,
  };
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  accountId: string;
  accountName: string;
}> {
  const config = getConfig();

  const body = new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  const data: TikTokTokenResponse = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  const userInfo = await getUserInfo(data.access_token);
  const accountId = userInfo.openId || data.open_id || "";
  const accountName = userInfo.displayName || accountId || "TikTok";

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    accountId,
    accountName,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  accountId: string;
  accountName: string;
}> {
  const config = getConfig();

  const body = new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data: TikTokTokenResponse = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  const userInfo = await getUserInfo(data.access_token);
  const accountId = userInfo.openId || data.open_id || "";
  const accountName = userInfo.displayName || accountId || "TikTok";

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    accountId,
    accountName,
  };
}

export async function revokeToken(_token: string): Promise<void> {
  // TikTok does not provide a token revocation endpoint for this API surface.
}
