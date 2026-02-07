const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || "v19.0";
const FACEBOOK_AUTH_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const FACEBOOK_TOKEN_URL = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
].join(",");

interface FacebookTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface AccountsResponse {
  data: Array<{
    id: string;
    name?: string;
    access_token?: string;
    instagram_business_account?: {
      id: string;
    };
  }>;
}

interface InstagramUserResponse {
  username?: string;
}

function getConfig() {
  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Instagram OAuth configuration. Set INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET, and INSTAGRAM_REDIRECT_URI"
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function getAuthorizationUrl(state: string): string {
  const config = getConfig();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: INSTAGRAM_SCOPES,
    state,
  });

  return `${FACEBOOK_AUTH_URL}?${params.toString()}`;
}

async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const config = getConfig();

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    fb_exchange_token: shortLivedToken,
  });

  const response = await fetch(`${FACEBOOK_TOKEN_URL}?${params.toString()}`);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange long-lived token: ${error}`);
  }

  const data: FacebookTokenResponse = await response.json();
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

async function getInstagramAccount(userToken: string): Promise<{
  igUserId: string;
  igUsername?: string;
  pageAccessToken: string;
  pageName?: string;
}> {
  const params = new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account",
    access_token: userToken,
  });

  const response = await fetch(`${GRAPH_API_BASE}/me/accounts?${params.toString()}`);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Facebook pages: ${error}`);
  }

  const data = (await response.json()) as AccountsResponse;
  const preferredPageId = process.env.INSTAGRAM_PAGE_ID;

  const page = data.data.find(
    (item) =>
      item.instagram_business_account?.id && (!preferredPageId || item.id === preferredPageId)
  );

  if (!page || !page.instagram_business_account?.id) {
    throw new Error("No Instagram business account connected to the Facebook user");
  }

  if (!page.access_token) {
    throw new Error("Missing page access token for Instagram publishing");
  }

  const igUserId = page.instagram_business_account.id;
  const usernameParams = new URLSearchParams({
    fields: "username",
    access_token: page.access_token,
  });

  const igResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}?${usernameParams.toString()}`);
  let igUsername: string | undefined;
  if (igResponse.ok) {
    const igData = (await igResponse.json()) as InstagramUserResponse;
    igUsername = igData.username;
  }

  return {
    igUserId,
    igUsername,
    pageAccessToken: page.access_token,
    pageName: page.name,
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

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
  });

  const response = await fetch(`${FACEBOOK_TOKEN_URL}?${params.toString()}`);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  const shortLived: FacebookTokenResponse = await response.json();
  const longLived = await exchangeForLongLivedToken(shortLived.access_token);
  const expiresAt = new Date(Date.now() + longLived.expiresIn * 1000);

  const account = await getInstagramAccount(longLived.accessToken);
  const accountName = account.igUsername || account.pageName || "Instagram";

  return {
    accessToken: account.pageAccessToken,
    refreshToken: longLived.accessToken,
    expiresAt,
    accountId: account.igUserId,
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
  const longLived = await exchangeForLongLivedToken(refreshToken);
  const expiresAt = new Date(Date.now() + longLived.expiresIn * 1000);
  const account = await getInstagramAccount(longLived.accessToken);

  return {
    accessToken: account.pageAccessToken,
    refreshToken: longLived.accessToken,
    expiresAt,
    accountId: account.igUserId,
    accountName: account.igUsername || account.pageName || "Instagram",
  };
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${GRAPH_API_BASE}/me/permissions?access_token=${encodeURIComponent(token)}`, {
      method: "DELETE",
    });
  } catch (error) {
    console.warn("Failed to revoke Instagram token:", error);
  }
}
