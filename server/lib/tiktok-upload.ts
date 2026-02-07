const TIKTOK_API_BASE = "https://open.tiktokapis.com";

export async function queryCreatorInfo(accessToken: string): Promise<{
  privacyLevels?: string[];
  maxVideoPostDurationSeconds?: number;
  canPost?: boolean;
}> {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    return {};
  }

  const data = (await response.json()) as {
    data?: {
      privacy_level_options?: string[];
      max_video_post_duration_sec?: number;
      can_post?: boolean;
    };
  };

  return {
    privacyLevels: data.data?.privacy_level_options,
    maxVideoPostDurationSeconds: data.data?.max_video_post_duration_sec,
    canPost: data.data?.can_post,
  };
}

export async function initDirectPost(params: {
  accessToken: string;
  caption: string;
  videoUrl: string;
  privacyLevel: string;
}): Promise<{ publishId: string }> {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      post_info: {
        title: params.caption,
        privacy_level: params.privacyLevel,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: params.videoUrl,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok publish init failed: ${error}`);
  }

  const data = (await response.json()) as { data?: { publish_id?: string } };
  const publishId = data.data?.publish_id;
  if (!publishId) {
    throw new Error("TikTok publish init missing publish_id");
  }

  return { publishId };
}

export async function fetchPublishStatus(params: {
  accessToken: string;
  publishId: string;
}): Promise<{ status?: string; videoId?: string; shareId?: string }> {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publish_id: params.publishId }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok publish status failed: ${error}`);
  }

  const data = (await response.json()) as {
    data?: {
      status?: string;
      share_id?: string;
      video_id?: string;
      item_id?: string;
    };
  };

  return {
    status: data.data?.status,
    shareId: data.data?.share_id || data.data?.item_id,
    videoId: data.data?.video_id,
  };
}
