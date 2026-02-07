const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || "v19.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export async function createMediaContainer(params: {
  igUserId: string;
  accessToken: string;
  videoUrl: string;
  caption?: string;
  mediaType: "REELS" | "VIDEO";
  shareToFeed?: boolean;
}): Promise<string> {
  const body = new URLSearchParams({
    access_token: params.accessToken,
    video_url: params.videoUrl,
    media_type: params.mediaType,
  });

  if (params.caption) {
    body.set("caption", params.caption);
  }

  if (params.mediaType === "REELS" && typeof params.shareToFeed === "boolean") {
    body.set("share_to_feed", params.shareToFeed ? "true" : "false");
  }

  const response = await fetch(`${GRAPH_API_BASE}/${params.igUserId}/media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Instagram container creation failed: ${error}`);
  }

  const data = (await response.json()) as { id?: string };
  if (!data.id) {
    throw new Error("Instagram container response missing id");
  }

  return data.id;
}

export async function getContainerStatus(params: {
  containerId: string;
  accessToken: string;
}): Promise<{ statusCode?: string; status?: string }> {
  const query = new URLSearchParams({
    fields: "status,status_code",
    access_token: params.accessToken,
  });

  const response = await fetch(`${GRAPH_API_BASE}/${params.containerId}?${query.toString()}`);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Instagram container status failed: ${error}`);
  }

  const data = (await response.json()) as { status_code?: string; status?: string };
  return {
    statusCode: data.status_code,
    status: data.status,
  };
}

export async function publishContainer(params: {
  igUserId: string;
  accessToken: string;
  containerId: string;
}): Promise<string> {
  const body = new URLSearchParams({
    access_token: params.accessToken,
    creation_id: params.containerId,
  });

  const response = await fetch(`${GRAPH_API_BASE}/${params.igUserId}/media_publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Instagram publish failed: ${error}`);
  }

  const data = (await response.json()) as { id?: string };
  if (!data.id) {
    throw new Error("Instagram publish response missing id");
  }

  return data.id;
}
