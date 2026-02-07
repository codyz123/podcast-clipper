import { createOAuth1Header } from "./oauth-providers/x.js";

const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";
const TWEET_URL = "https://api.x.com/2/tweets";
const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB

async function xRequest(options: {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  queryParams?: Record<string, string>;
  bodyParams?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<Response> {
  const authHeader = createOAuth1Header({
    method: options.method,
    url: options.url,
    consumerKey: options.consumerKey,
    consumerSecret: options.consumerSecret,
    token: options.token,
    tokenSecret: options.tokenSecret,
    queryParams: options.queryParams,
    bodyParams: options.bodyParams,
  });

  const urlWithQuery = options.queryParams
    ? `${options.url}?${new URLSearchParams(options.queryParams).toString()}`
    : options.url;

  return fetch(urlWithQuery, {
    method: options.method,
    headers: {
      Authorization: authHeader,
      ...(options.headers || {}),
    },
    body: (options.body ?? null) as any,
  });
}

export async function initMediaUpload(params: {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  totalBytes: number;
}): Promise<{ mediaId: string }> {
  const bodyParams = {
    command: "INIT",
    total_bytes: params.totalBytes.toString(),
    media_type: "video/mp4",
    media_category: "tweet_video",
  };

  const body = new URLSearchParams(bodyParams);

  const response = await xRequest({
    method: "POST",
    url: UPLOAD_URL,
    consumerKey: params.consumerKey,
    consumerSecret: params.consumerSecret,
    token: params.token,
    tokenSecret: params.tokenSecret,
    bodyParams,
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`X media INIT failed: ${error}`);
  }

  const data = (await response.json()) as { media_id_string?: string; media_id?: string };
  const mediaId = data.media_id_string || data.media_id;
  if (!mediaId) {
    throw new Error("X media INIT response missing media_id");
  }

  return { mediaId };
}

export async function appendMediaChunk(params: {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  mediaId: string;
  segmentIndex: number;
  chunk: Buffer;
}): Promise<void> {
  const queryParams = {
    command: "APPEND",
    media_id: params.mediaId,
    segment_index: params.segmentIndex.toString(),
  };

  const form = new FormData();
  const blob = new Blob([params.chunk], { type: "video/mp4" });
  form.append("media", blob, "video.mp4");

  const response = await xRequest({
    method: "POST",
    url: UPLOAD_URL,
    consumerKey: params.consumerKey,
    consumerSecret: params.consumerSecret,
    token: params.token,
    tokenSecret: params.tokenSecret,
    queryParams,
    body: form,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`X media APPEND failed: ${error}`);
  }
}

export async function finalizeMediaUpload(params: {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  mediaId: string;
}): Promise<{ processingInfo?: { state?: string; check_after_secs?: number } }> {
  const bodyParams = {
    command: "FINALIZE",
    media_id: params.mediaId,
  };

  const body = new URLSearchParams(bodyParams);

  const response = await xRequest({
    method: "POST",
    url: UPLOAD_URL,
    consumerKey: params.consumerKey,
    consumerSecret: params.consumerSecret,
    token: params.token,
    tokenSecret: params.tokenSecret,
    bodyParams,
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`X media FINALIZE failed: ${error}`);
  }

  const data = (await response.json()) as {
    processing_info?: { state?: string; check_after_secs?: number };
  };
  return { processingInfo: data.processing_info };
}

export async function getMediaStatus(params: {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  mediaId: string;
}): Promise<{ state?: string; checkAfterSeconds?: number }> {
  const queryParams = {
    command: "STATUS",
    media_id: params.mediaId,
  };

  const response = await xRequest({
    method: "GET",
    url: UPLOAD_URL,
    consumerKey: params.consumerKey,
    consumerSecret: params.consumerSecret,
    token: params.token,
    tokenSecret: params.tokenSecret,
    queryParams,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`X media STATUS failed: ${error}`);
  }

  const data = (await response.json()) as {
    processing_info?: { state?: string; check_after_secs?: number };
  };
  return {
    state: data.processing_info?.state,
    checkAfterSeconds: data.processing_info?.check_after_secs,
  };
}

export async function createTweet(params: {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  text: string;
  mediaId: string;
}): Promise<{ tweetId: string }> {
  const body = JSON.stringify({
    text: params.text,
    media: {
      media_ids: [params.mediaId],
    },
  });

  const response = await xRequest({
    method: "POST",
    url: TWEET_URL,
    consumerKey: params.consumerKey,
    consumerSecret: params.consumerSecret,
    token: params.token,
    tokenSecret: params.tokenSecret,
    body,
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`X tweet creation failed: ${error}`);
  }

  const data = (await response.json()) as { data?: { id?: string } };
  const tweetId = data.data?.id;
  if (!tweetId) {
    throw new Error("X tweet response missing id");
  }

  return { tweetId };
}

export async function streamToX(params: {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  mediaId: string;
  sourceUrl: string;
  totalBytes: number;
  onProgress?: (bytesUploaded: number) => Promise<void> | void;
}): Promise<void> {
  let uploaded = 0;
  let segment = 0;

  while (uploaded < params.totalBytes) {
    const end = Math.min(params.totalBytes - 1, uploaded + CHUNK_SIZE - 1);
    const response = await fetch(params.sourceUrl, {
      headers: {
        Range: `bytes=${uploaded}-${end}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch media chunk: ${error}`);
    }

    const chunk = Buffer.from(await response.arrayBuffer());

    await appendMediaChunk({
      consumerKey: params.consumerKey,
      consumerSecret: params.consumerSecret,
      token: params.token,
      tokenSecret: params.tokenSecret,
      mediaId: params.mediaId,
      segmentIndex: segment,
      chunk,
    });

    uploaded += chunk.length;
    segment += 1;
    await params.onProgress?.(uploaded);
  }
}
