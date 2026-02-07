#!/usr/bin/env node
/* eslint-disable no-undef */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      if (value !== undefined) {
        args[key] = value;
      } else {
        args[key] = argv[i + 1];
        i += 1;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv);

const backendUrl = process.env.BACKEND_URL || args.backend || "http://localhost:3001";
const accessCode = process.env.ACCESS_CODE || args.accessCode || "";
const clipId = process.env.CLIP_ID || args.clipId;
const format = process.env.CLIP_FORMAT || args.format || "9:16";
const repeat = Number.parseInt(process.env.REPEAT || args.repeat || "1", 10);
const pollIntervalMs = Number.parseInt(
  process.env.POLL_INTERVAL_MS || args.pollIntervalMs || "2000",
  10
);
const delayBetweenMs = Number.parseInt(
  process.env.DELAY_BETWEEN_MS || args.delayBetweenMs || "2000",
  10
);

if (!clipId) {
  console.error(
    "Missing clipId. Usage: node scripts/publish-youtube.mjs --clipId <id> [--format 9:16]"
  );
  process.exit(1);
}

async function authFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (accessCode) headers.set("x-access-code", accessCode);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${backendUrl}${path}`, { ...options, headers });
}

async function pollRender(jobId) {
  while (true) {
    const res = await authFetch(`/api/render/clip/${jobId}/status`);
    const data = await res.json();
    if (data.status === "completed") return data;
    if (data.status === "failed") throw new Error(data.errorMessage || "Render failed");
    process.stdout.write(`Render ${data.progress ?? 0}%\r`);
    await sleep(pollIntervalMs);
  }
}

async function pollUpload(uploadId) {
  while (true) {
    const res = await authFetch(`/api/youtube/upload/${uploadId}/status`);
    const data = await res.json();
    if (data.status === "completed") return data;
    if (data.status === "failed") throw new Error(data.errorMessage || "Upload failed");
    const progress =
      data.status === "processing"
        ? 50 + Math.round((data.processingProgress || 0) / 2)
        : Math.round((data.uploadProgress || 0) / 2);
    process.stdout.write(`Upload ${progress}% (${data.status})\r`);
    await sleep(pollIntervalMs);
  }
}

async function fetchEvents(uploadId) {
  const res = await authFetch(`/api/uploads/youtube/${uploadId}/events`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.events || [];
}

async function runOnce(iteration) {
  console.log(`\n=== Run ${iteration + 1}/${repeat} ===`);

  const renderRes = await authFetch("/api/render/clip", {
    method: "POST",
    body: JSON.stringify({ clipId, format }),
  });
  if (!renderRes.ok) {
    const error = await renderRes.text();
    throw new Error(`Render init failed: ${error}`);
  }
  const renderPayload = await renderRes.json();
  if (renderPayload.status !== "completed") {
    await pollRender(renderPayload.jobId);
  }

  const title = `Publish Test ${new Date().toISOString()}`;
  const initRes = await authFetch("/api/youtube/upload/init", {
    method: "POST",
    body: JSON.stringify({
      postId: `cli-${Date.now()}-${iteration}`,
      clipId,
      title,
      description: "Automated local publish test",
      tags: ["podcastomatic", "test"],
      privacyStatus: "private",
      isShort: format === "9:16",
      format,
    }),
  });

  if (!initRes.ok) {
    const error = await initRes.text();
    throw new Error(`Upload init failed: ${error}`);
  }
  const initPayload = await initRes.json();
  console.log(`Upload ID: ${initPayload.uploadId}`);

  try {
    const uploadPayload = await pollUpload(initPayload.uploadId);
    console.log(`\nUpload complete: ${uploadPayload.videoUrl || uploadPayload.videoId || "ok"}`);
  } catch (error) {
    console.error(`\nUpload failed: ${(error && error.message) || error}`);
    const events = await fetchEvents(initPayload.uploadId);
    if (events.length > 0) {
      console.log("Upload events:");
      for (const event of events) {
        console.log(`- ${event.createdAt} ${event.event}`, event.detail || "");
      }
    }
    throw error;
  }
}

async function main() {
  for (let i = 0; i < repeat; i += 1) {
    await runOnce(i);
    if (i < repeat - 1) {
      await sleep(delayBetweenMs);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
