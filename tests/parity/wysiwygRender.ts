/**
 * WYSIWYG Visual Parity Test
 *
 * Renders frames using both the client prop-building path (buildPlayerProps)
 * and a server-equivalent prop-building path, then compares the output
 * pixel-by-pixel with pixelmatch.
 *
 * Both paths use the same Remotion composition (ClipVideo), so any pixel
 * difference means the props diverge — breaking WYSIWYG.
 *
 * Usage:
 *   npx tsx tests/parity/wysiwygRender.ts
 *
 * Env vars:
 *   WYSIWYG_MAX_DIFF=0.0001  — max diff ratio (default 0.01% = 0.0001)
 *   WYSIWYG_VERBOSE=1        — print detailed per-test info
 */

import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import {
  VIDEO_TEST_CASES,
  buildVideoTestClip,
  VideoTestCase,
} from "../../src/lib/videoTestFixtures";
import { CaptionStyle } from "../../src/lib/types";
import { resolveCaptionStyle, toSubtitleConfig, toWordTimings } from "../../src/lib/clipTransform";
import type { ClipVideoProps } from "../../src/remotion/types";

// Can't import buildPlayerProps directly because it imports getMediaUrl
// which requires browser globals. Instead, we replicate the logic here
// without the getMediaUrl dependency (test fixtures have no external URLs).
function buildClientProps(testCase: VideoTestCase): ClipVideoProps {
  const clip = buildVideoTestClip(testCase);
  const FPS = 30;
  const clipDuration = clip.endTime - clip.startTime;
  const durationInFrames = Math.max(1, Math.ceil(clipDuration * FPS));

  const captionStyle = resolveCaptionStyle(clip);
  const subtitleConfig = toSubtitleConfig(captionStyle);
  const words = toWordTimings(clip.words, clip.startTime, clip.endTime, FPS);

  const background = clip.background || { type: "solid" as const, color: "#000000" };

  return {
    audioUrl: "",
    audioStartFrame: Math.floor(clip.startTime * FPS),
    audioEndFrame: Math.ceil(clip.endTime * FPS),
    words,
    format: testCase.format,
    background,
    subtitle: subtitleConfig,
    durationInFrames,
    fps: FPS,
  };
}

function buildServerProps(testCase: VideoTestCase): ClipVideoProps {
  const clip = buildVideoTestClip(testCase);
  const FPS = 30;
  const durationSeconds = Math.max(0.1, clip.endTime - clip.startTime);
  const durationInFrames = Math.ceil(durationSeconds * FPS);

  const captionStyleObj = resolveCaptionStyle({
    captionStyle: clip.captionStyle as CaptionStyle | undefined,
    tracks: clip.tracks,
  });
  const subtitleConfig = toSubtitleConfig(captionStyleObj);
  const words = toWordTimings(clip.words, clip.startTime, clip.endTime, FPS);

  const background = clip.background || {
    type: "gradient" as const,
    gradientColors: ["#667eea", "#764ba2"],
    gradientDirection: 135,
  };

  return {
    audioUrl: "",
    audioStartFrame: Math.floor(clip.startTime * FPS),
    audioEndFrame: Math.ceil(clip.endTime * FPS),
    words,
    format: testCase.format,
    background,
    subtitle: subtitleConfig,
    durationInFrames,
    fps: FPS,
  };
}

const OUTPUT_DIR = path.join(process.cwd(), ".context", "wysiwyg-parity");
const CLIENT_DIR = path.join(OUTPUT_DIR, "client");
const SERVER_DIR = path.join(OUTPUT_DIR, "server");
const DIFF_DIR = path.join(OUTPUT_DIR, "diff");

const MAX_DIFF_RATIO = Number(process.env.WYSIWYG_MAX_DIFF || "0.0001"); // 0.01%
const VERBOSE = process.env.WYSIWYG_VERBOSE === "1";

const ensureDir = (dir: string) => fs.mkdirSync(dir, { recursive: true });

const readPng = (filePath: string) => PNG.sync.read(fs.readFileSync(filePath));

const compareImages = (
  clientPath: string,
  serverPath: string,
  diffPath: string
): { diffRatio: number; diffPixels: number; totalPixels: number } => {
  const client = readPng(clientPath);
  const server = readPng(serverPath);

  if (client.width !== server.width || client.height !== server.height) {
    throw new Error(
      `Size mismatch: client ${client.width}x${client.height} vs server ${server.width}x${server.height}`
    );
  }

  const totalPixels = client.width * client.height;
  const diff = new PNG({ width: client.width, height: client.height });
  const diffPixels = pixelmatch(client.data, server.data, diff.data, client.width, client.height, {
    threshold: 0.05, // Very tight threshold — we want near-perfect match
    includeAA: false, // Ignore anti-aliasing differences
  });

  const diffRatio = diffPixels / totalPixels;
  if (diffPixels > 0) {
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }

  return { diffRatio, diffPixels, totalPixels };
};

const main = async () => {
  ensureDir(OUTPUT_DIR);
  ensureDir(CLIENT_DIR);
  ensureDir(SERVER_DIR);
  ensureDir(DIFF_DIR);

  console.log("=== WYSIWYG Visual Parity Test ===\n");
  console.log(`Max diff ratio: ${(MAX_DIFF_RATIO * 100).toFixed(4)}%`);
  console.log(`Test cases: ${VIDEO_TEST_CASES.length}`);
  console.log(`Total frames: ${VIDEO_TEST_CASES.reduce((sum, tc) => sum + tc.frames.length, 0)}\n`);

  // Bundle Remotion compositions
  console.log("Bundling Remotion compositions...");
  const serveUrl = await bundle({
    entryPoint: path.join(process.cwd(), "src", "remotion", "index.ts"),
    onProgress: (pct) => {
      if (VERBOSE) process.stdout.write(`\r  Bundling: ${(pct * 100).toFixed(0)}%`);
    },
  });
  if (VERBOSE) console.log("");
  console.log("Bundle ready.\n");

  let failures = 0;
  let totalTests = 0;
  let perfectMatches = 0;
  const results: Array<{
    testId: string;
    frame: number;
    diffRatio: number;
    diffPixels: number;
    pass: boolean;
  }> = [];

  for (const testCase of VIDEO_TEST_CASES) {
    const compositionId = `ClipVideo-${testCase.format.replace(":", "-")}`;

    // Build props both ways
    const clientInputProps = buildClientProps(testCase);
    const serverInputProps = buildServerProps(testCase);

    // First: verify props are structurally equivalent
    const propsMatch = JSON.stringify(clientInputProps) === JSON.stringify(serverInputProps);
    if (!propsMatch && VERBOSE) {
      console.log(`  [PROPS DIFF] ${testCase.id}: client and server props differ`);
      // Find which fields differ
      for (const key of Object.keys(clientInputProps) as Array<keyof ClipVideoProps>) {
        const clientVal = JSON.stringify(clientInputProps[key]);
        const serverVal = JSON.stringify(serverInputProps[key]);
        if (clientVal !== serverVal) {
          console.log(
            `    ${key}: client=${clientVal?.slice(0, 80)} server=${serverVal?.slice(0, 80)}`
          );
        }
      }
    }

    // Select composition with client props (both should work identically)
    const clientComposition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: clientInputProps,
    });

    const serverComposition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: serverInputProps,
    });

    for (const frameTime of testCase.frames) {
      totalTests++;
      const clientFrame = Math.max(
        0,
        Math.min(clientComposition.durationInFrames - 1, Math.round(frameTime * 30))
      );
      const serverFrame = Math.max(
        0,
        Math.min(serverComposition.durationInFrames - 1, Math.round(frameTime * 30))
      );

      const baseName = `${testCase.id}-t${frameTime.toFixed(2)}`;
      const clientPath = path.join(CLIENT_DIR, `${baseName}.png`);
      const serverPath = path.join(SERVER_DIR, `${baseName}.png`);
      const diffPath = path.join(DIFF_DIR, `${baseName}.png`);

      // Render with client props
      await renderStill({
        serveUrl,
        composition: clientComposition,
        frame: clientFrame,
        output: clientPath,
        inputProps: clientInputProps,
        imageFormat: "png",
      });

      // Render with server props
      await renderStill({
        serveUrl,
        composition: serverComposition,
        frame: serverFrame,
        output: serverPath,
        inputProps: serverInputProps,
        imageFormat: "png",
      });

      // Compare
      const { diffRatio, diffPixels, totalPixels } = compareImages(
        clientPath,
        serverPath,
        diffPath
      );
      const pass = diffRatio <= MAX_DIFF_RATIO;

      results.push({
        testId: testCase.id,
        frame: frameTime,
        diffRatio,
        diffPixels,
        pass,
      });

      if (!pass) {
        failures++;
        console.error(
          `  [FAIL] ${testCase.id} @ ${frameTime.toFixed(2)}s — ` +
            `${diffPixels}/${totalPixels} pixels differ (${(diffRatio * 100).toFixed(4)}%) ` +
            `→ ${diffPath}`
        );
      } else {
        if (diffPixels === 0) perfectMatches++;
        const status = diffPixels === 0 ? "PERFECT" : "OK";
        console.log(
          `  [${status}] ${testCase.id} @ ${frameTime.toFixed(2)}s — ` +
            `${diffPixels} pixels differ (${(diffRatio * 100).toFixed(4)}%)`
        );
      }
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Total: ${totalTests} frame comparisons`);
  console.log(`Perfect matches (0 diff pixels): ${perfectMatches}`);
  console.log(`Passed (within threshold): ${totalTests - failures}`);
  console.log(`Failed: ${failures}`);
  console.log(`Output: ${OUTPUT_DIR}`);

  if (failures > 0) {
    console.error(`\n${failures} WYSIWYG parity failures detected.`);
    console.error("Check diff images in:", DIFF_DIR);
    process.exit(1);
  }

  console.log("\nAll WYSIWYG parity tests passed!");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
