const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_VIDEO_URL = "https://www.googleapis.com/youtube/v3/videos";

export const YOUTUBE_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB, multiple of 256KB

export interface YouTubeUploadMetadata {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "public" | "private" | "unlisted" | string;
  categoryId?: string;
}

export interface YouTubeProcessingStatus {
  status: "processing" | "processed" | "failed";
  progress?: number;
}

class YouTubeUploadError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function parseRangeHeader(rangeHeader: string | null): number | null {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/bytes=\d+-(\d+)/);
  if (!match) return null;
  const lastByte = Number(match[1]);
  return Number.isFinite(lastByte) ? lastByte : null;
}

async function uploadChunkOnce(
  uploadUri: string,
  accessToken: string,
  chunk: Buffer,
  startByte: number,
  endByte: number,
  totalSize: number
): Promise<{ done: boolean; videoId?: string; lastByte: number }> {
  const response = await fetch(uploadUri, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Length": String(chunk.length),
      "Content-Range": `bytes ${startByte}-${endByte}/${totalSize}`,
    },
    body: chunk,
  });

  if (response.status === 308) {
    const lastByte = parseRangeHeader(response.headers.get("Range"));
    return {
      done: false,
      lastByte: lastByte ?? endByte,
    };
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new YouTubeUploadError(
      `YouTube upload failed (${response.status}): ${errorText || response.statusText}`,
      response.status
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!data?.id) {
    throw new YouTubeUploadError("YouTube upload completed but video ID missing");
  }

  return {
    done: true,
    videoId: data.id as string,
    lastByte: endByte,
  };
}

async function fetchChunk(sourceUrl: string, startByte: number, endByte: number): Promise<Buffer> {
  const response = await fetch(sourceUrl, {
    headers: {
      Range: `bytes=${startByte}-${endByte}`,
    },
  });

  if (!response.ok && response.status !== 206) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Failed to fetch source chunk (${response.status}): ${errorText || response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function initializeResumableUpload(
  accessToken: string,
  metadata: YouTubeUploadMetadata,
  videoSize: number,
  contentType: string = "video/mp4"
): Promise<string> {
  const response = await fetch(`${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Length": String(videoSize),
      "X-Upload-Content-Type": contentType,
    },
    body: JSON.stringify({
      snippet: {
        title: metadata.title,
        description: metadata.description || "",
        tags: metadata.tags || [],
        categoryId: metadata.categoryId || "22",
      },
      status: {
        privacyStatus: metadata.privacyStatus || "private",
        selfDeclaredMadeForKids: false,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Failed to initialize YouTube upload (${response.status}): ${errorText || response.statusText}`
    );
  }

  const uploadUri = response.headers.get("Location");
  if (!uploadUri) {
    throw new Error("YouTube upload URI missing from response");
  }

  return uploadUri;
}

export async function getUploadResumePosition(
  uploadUri: string,
  accessToken: string,
  totalSize: number
): Promise<number> {
  const response = await fetch(uploadUri, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Length": "0",
      "Content-Range": `bytes */${totalSize}`,
    },
  });

  if (response.status === 308) {
    const lastByte = parseRangeHeader(response.headers.get("Range"));
    return lastByte !== null ? lastByte + 1 : 0;
  }

  if (response.ok) {
    return totalSize;
  }

  const errorText = await response.text().catch(() => "");
  throw new Error(
    `Failed to get upload resume position (${response.status}): ${errorText || response.statusText}`
  );
}

export async function streamToYouTube(
  uploadUri: string,
  sourceUrl: string,
  getAccessToken: (forceRefresh?: boolean) => Promise<string>,
  startByte: number,
  totalSize: number,
  onProgress: (bytesUploaded: number) => Promise<void> | void,
  chunkSize: number = YOUTUBE_CHUNK_SIZE
): Promise<string> {
  let currentByte = startByte;

  const retryDelays = [0, 5000, 15000, 45000];

  while (currentByte < totalSize) {
    const endByte = Math.min(currentByte + chunkSize - 1, totalSize - 1);
    const chunk = await fetchChunk(sourceUrl, currentByte, endByte);

    let lastErrorStatus: number | undefined;
    let forceRefresh = false;
    let uploadedChunk = false;

    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      if (attempt > 0) {
        await sleep(retryDelays[attempt]);
      }

      const accessToken = await getAccessToken(forceRefresh);

      try {
        const result = await uploadChunkOnce(
          uploadUri,
          accessToken,
          chunk,
          currentByte,
          endByte,
          totalSize
        );

        if (result.done && result.videoId) {
          await onProgress(totalSize);
          return result.videoId;
        }

        const acceptedLastByte = result.lastByte;
        const nextByte = acceptedLastByte + 1;
        if (nextByte > currentByte) {
          currentByte = nextByte;
          await onProgress(currentByte);
        } else {
          currentByte = endByte + 1;
          await onProgress(currentByte);
        }

        uploadedChunk = true;
        break;
      } catch (error) {
        if (!(error instanceof YouTubeUploadError)) {
          throw error;
        }

        lastErrorStatus = error.status;

        if (error.status === 401) {
          forceRefresh = true;
          continue;
        }

        if (error.status === 403 || error.status === 429 || (error.status && error.status >= 500)) {
          continue;
        }

        throw error;
      }
    }

    if (!uploadedChunk && lastErrorStatus) {
      throw new Error(`YouTube upload failed after retries (status ${lastErrorStatus})`);
    }
  }

  throw new Error("YouTube upload did not return a video ID");
}

export async function checkProcessingStatus(
  videoId: string,
  accessToken: string
): Promise<YouTubeProcessingStatus> {
  const params = new URLSearchParams({
    part: "processingDetails,status",
    id: videoId,
  });

  const response = await fetch(`${YOUTUBE_VIDEO_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Failed to get processing status (${response.status}): ${errorText || response.statusText}`
    );
  }

  const data = await response.json();
  const item = data.items?.[0];
  const processing = item?.processingDetails?.processingStatus as string | undefined;
  const progress = item?.processingDetails?.processingProgress;

  if (processing === "succeeded") {
    return { status: "processed", progress: 100 };
  }

  if (processing === "failed") {
    return { status: "failed" };
  }

  let percent: number | undefined;
  if (progress?.partsTotal && progress.partsProcessed) {
    percent = Math.round((progress.partsProcessed / progress.partsTotal) * 100);
  }

  return { status: "processing", progress: percent };
}
