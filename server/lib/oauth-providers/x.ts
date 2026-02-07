import crypto from "crypto";

const REQUEST_TOKEN_URL = "https://api.x.com/oauth/request_token";
const ACCESS_TOKEN_URL = "https://api.x.com/oauth/access_token";
const AUTHORIZE_URL = "https://api.x.com/oauth/authorize";

function getConfig() {
  const consumerKey = process.env.X_CONSUMER_KEY;
  const consumerSecret = process.env.X_CONSUMER_SECRET;
  const redirectUri = process.env.X_REDIRECT_URI;

  if (!consumerKey || !consumerSecret || !redirectUri) {
    throw new Error(
      "Missing X OAuth configuration. Set X_CONSUMER_KEY, X_CONSUMER_SECRET, and X_REDIRECT_URI"
    );
  }

  return { consumerKey, consumerSecret, redirectUri };
}

function percentEncode(input: string): string {
  return encodeURIComponent(input)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function buildSignatureBaseString(
  method: string,
  baseUrl: string,
  params: Record<string, string>
): string {
  const normalized = Object.entries(params)
    .map(([key, value]) => [percentEncode(key), percentEncode(value)])
    .sort(([aKey, aVal], [bKey, bVal]) => {
      if (aKey === bKey) return aVal.localeCompare(bVal);
      return aKey.localeCompare(bKey);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return [method.toUpperCase(), percentEncode(baseUrl), percentEncode(normalized)].join("&");
}

function createSignature(
  baseString: string,
  consumerSecret: string,
  tokenSecret: string = ""
): string {
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
}

function createOAuthParams(
  consumerKey: string,
  token?: string,
  extra?: Record<string, string>
): Record<string, string> {
  const params: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };

  if (token) {
    params.oauth_token = token;
  }

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      params[key] = value;
    }
  }

  return params;
}

export function createOAuth1Header(options: {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  queryParams?: Record<string, string>;
  bodyParams?: Record<string, string>;
  extraOAuthParams?: Record<string, string>;
}): string {
  const {
    method,
    url,
    consumerKey,
    consumerSecret,
    token,
    tokenSecret,
    queryParams,
    bodyParams,
    extraOAuthParams,
  } = options;

  const oauthParams = createOAuthParams(consumerKey, token, extraOAuthParams);
  const signatureParams: Record<string, string> = {
    ...oauthParams,
    ...(queryParams || {}),
    ...(bodyParams || {}),
  };

  const baseUrl = url.split("?")[0];
  const baseString = buildSignatureBaseString(method, baseUrl, signatureParams);
  const signature = createSignature(baseString, consumerSecret, tokenSecret);

  const headerParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const header = Object.entries(headerParams)
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ");

  return `OAuth ${header}`;
}

export async function getRequestToken(): Promise<{
  oauthToken: string;
  oauthTokenSecret: string;
  authUrl: string;
}> {
  const config = getConfig();

  const authHeader = createOAuth1Header({
    method: "POST",
    url: REQUEST_TOKEN_URL,
    consumerKey: config.consumerKey,
    consumerSecret: config.consumerSecret,
    extraOAuthParams: {
      oauth_callback: config.redirectUri,
    },
  });

  const response = await fetch(REQUEST_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to request X token: ${error}`);
  }

  const text = await response.text();
  const params = new URLSearchParams(text);
  const oauthToken = params.get("oauth_token");
  const oauthTokenSecret = params.get("oauth_token_secret");

  if (!oauthToken || !oauthTokenSecret) {
    throw new Error("Invalid request token response from X");
  }

  return {
    oauthToken,
    oauthTokenSecret,
    authUrl: `${AUTHORIZE_URL}?oauth_token=${encodeURIComponent(oauthToken)}`,
  };
}

export async function exchangeRequestToken(params: {
  oauthToken: string;
  oauthTokenSecret: string;
  oauthVerifier: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  accountName: string;
  accountId: string;
}> {
  const config = getConfig();

  const authHeader = createOAuth1Header({
    method: "POST",
    url: ACCESS_TOKEN_URL,
    consumerKey: config.consumerKey,
    consumerSecret: config.consumerSecret,
    token: params.oauthToken,
    tokenSecret: params.oauthTokenSecret,
    extraOAuthParams: {
      oauth_verifier: params.oauthVerifier,
    },
  });

  const response = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange X access token: ${error}`);
  }

  const text = await response.text();
  const data = new URLSearchParams(text);

  const accessToken = data.get("oauth_token");
  const refreshToken = data.get("oauth_token_secret");
  const accountName = data.get("screen_name") || "X";
  const accountId = data.get("user_id") || "";

  if (!accessToken || !refreshToken) {
    throw new Error("Invalid access token response from X");
  }

  return {
    accessToken,
    refreshToken,
    accountName,
    accountId,
  };
}

export async function revokeToken(_token: string): Promise<void> {
  // X OAuth 1.0a tokens are revoked via the developer portal or user settings.
}
