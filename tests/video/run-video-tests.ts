import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition, ensureBrowser } from "@remotion/renderer";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import {
  VIDEO_TEST_CASES,
  buildVideoTestClip,
  buildVideoTestTemplate,
  VideoTestCase,
} from "../../src/lib/videoTestFixtures";
import { VIDEO_FORMATS } from "../../src/lib/types";
import { calculateDurationInFrames, wordsToFrameTiming } from "../../src/lib/renderService";

const FPS = 30;
const OUTPUT_DIR = path.join(process.cwd(), ".context", "video-tests");
const PREVIEW_DIR = path.join(OUTPUT_DIR, "preview");
const RENDER_DIR = path.join(OUTPUT_DIR, "render");
const DIFF_DIR = path.join(OUTPUT_DIR, "diff");

const MAX_DIFF_RATIO = Number(process.env.VIDEO_TEST_MAX_DIFF_RATIO || "0.001");
const BASE_URL = process.env.VIDEO_TEST_BASE_URL || "http://127.0.0.1:4173";

const ensureDir = (dir: string) => fs.mkdirSync(dir, { recursive: true });

const waitForServer = async (url: string, timeoutMs: number = 30000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      // ignore until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for server at ${url}`);
};

const startDevServer = async (): Promise<ChildProcessWithoutNullStreams | null> => {
  if (process.env.VIDEO_TEST_BASE_URL) return null;

  const proc = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4173"], {
    stdio: "pipe",
    env: { ...process.env },
  });

  proc.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
  });
  proc.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  await waitForServer(`${BASE_URL}/__video-test`);
  return proc;
};

const stopDevServer = async (proc: ChildProcessWithoutNullStreams | null) => {
  if (!proc) return;
  proc.kill("SIGTERM");
};

const readPng = (filePath: string) => PNG.sync.read(fs.readFileSync(filePath));

const compareImages = (previewPath: string, renderPath: string, diffPath: string) => {
  const preview = readPng(previewPath);
  const render = readPng(renderPath);

  if (preview.width !== render.width || preview.height !== render.height) {
    throw new Error(
      `Size mismatch: preview ${preview.width}x${preview.height} vs render ${render.width}x${render.height}`
    );
  }

  const diff = new PNG({ width: preview.width, height: preview.height });
  const diffPixels = pixelmatch(
    preview.data,
    render.data,
    diff.data,
    preview.width,
    preview.height,
    {
      threshold: 0.1,
      includeAA: true,
    }
  );

  const diffRatio = diffPixels / (preview.width * preview.height);
  if (diffRatio > MAX_DIFF_RATIO) {
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }

  return diffRatio;
};

const buildRenderProps = (testCase: VideoTestCase) => {
  const clip = buildVideoTestClip(testCase);
  const template = buildVideoTestTemplate(testCase);
  const durationInFrames = calculateDurationInFrames(clip.startTime, clip.endTime, FPS);
  const words = wordsToFrameTiming(clip.words, clip.startTime, FPS);

  return {
    clip,
    inputProps: {
      audioUrl: "",
      audioStartFrame: Math.floor(clip.startTime * FPS),
      audioEndFrame: Math.ceil(clip.endTime * FPS),
      words,
      format: testCase.format,
      background: clip.background || template.background,
      subtitle: clip.subtitle || template.subtitle,
      durationInFrames,
      fps: FPS,
      tracks: clip.tracks ?? [],
    },
  };
};

const ensureOutputDirs = () => {
  ensureDir(OUTPUT_DIR);
  ensureDir(PREVIEW_DIR);
  ensureDir(RENDER_DIR);
  ensureDir(DIFF_DIR);
};

const main = async () => {
  ensureOutputDirs();

  let devServer: ChildProcessWithoutNullStreams | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    devServer = await startDevServer();

    try {
      const browserStatus = await ensureBrowser({
        chromeMode: "headless-shell",
        logLevel: "warn",
      });
      const executablePath = browserStatus.type === "no-browser" ? undefined : browserStatus.path;
      browser = await chromium.launch({ executablePath, headless: true });
    } catch (error) {
      console.error("Playwright browser not available. Run `npx playwright install` and retry.");
      throw error;
    }

    const page = await browser.newPage({ deviceScaleFactor: 1 });
    page.on("pageerror", (err) => {
      console.error("Page error:", err);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error("Console error:", msg.text());
      }
    });

    await page.goto(`${BASE_URL}/__video-test`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__VIDEO_TEST_READY__ === true);
    const initialProbe = await page.evaluate(() => {
      return {
        path: window.location.pathname,
        ready: window.__VIDEO_TEST_READY__ === true,
        hasFrame: Boolean(document.querySelector('[data-video-test="frame"]')),
        bodySnippet: document.body?.innerText?.slice(0, 200) || "",
      };
    });
    if (!initialProbe.hasFrame) {
      console.warn("Video test page probe:", initialProbe);
    }

    const serveUrl = await bundle({
      entryPoint: path.join(process.cwd(), "src", "remotion", "index.ts"),
      onProgress: () => {},
    });

    let failures = 0;

    for (const testCase of VIDEO_TEST_CASES) {
      const { inputProps } = buildRenderProps(testCase);
      const formatConfig = VIDEO_FORMATS[testCase.format];

      const compositionId = `ClipVideo-${testCase.format.replace(":", "-")}`;
      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps,
      });

      for (const frameTime of testCase.frames) {
        const frame = Math.max(
          0,
          Math.min(composition.durationInFrames - 1, Math.round(frameTime * FPS))
        );

        const previewCase: VideoTestCase = {
          ...testCase,
          frames: [frameTime],
        };

        await page.setViewportSize({ width: formatConfig.width, height: formatConfig.height });
        await page.evaluate((config) => {
          window.__VIDEO_TEST_SET__?.(config);
        }, previewCase);
        await page.evaluate(async () => {
          if (document.fonts?.ready) {
            await document.fonts.ready;
          }
        });
        await page.waitForTimeout(50);

        const previewLocator = page.locator('[data-video-test="frame"]');
        await previewLocator.waitFor({ state: "attached" });
        if (process.env.VIDEO_TEST_DEBUG === "1") {
          const styleProbe = await page.evaluate(() => {
            const el = document.querySelector('[data-video-test="frame"] p');
            if (!el) return null;
            const style = window.getComputedStyle(el);
            return {
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              lineHeight: style.lineHeight,
              wordSpacing: style.wordSpacing,
              letterSpacing: style.letterSpacing,
            };
          });
          if (styleProbe) {
            console.log(`[StyleProbe] ${testCase.id}`, styleProbe);
          }
        }
        const previewBox = await previewLocator.boundingBox();
        if (!previewBox) {
          const html = await page.evaluate(() => document.body.innerHTML);
          throw new Error(`Preview element not visible for ${testCase.id}. HTML: ${html}`);
        }

        if (
          Math.round(previewBox.width) !== formatConfig.width ||
          Math.round(previewBox.height) !== formatConfig.height
        ) {
          throw new Error(
            `Preview size mismatch for ${testCase.id}: got ${previewBox.width}x${previewBox.height}, expected ${formatConfig.width}x${formatConfig.height}`
          );
        }

        const previewPath = path.join(PREVIEW_DIR, `${testCase.id}-t${frameTime.toFixed(2)}.png`);
        const renderPath = path.join(RENDER_DIR, `${testCase.id}-t${frameTime.toFixed(2)}.png`);
        const diffPath = path.join(DIFF_DIR, `${testCase.id}-t${frameTime.toFixed(2)}.png`);

        await previewLocator.screenshot({ path: previewPath });

        await renderStill({
          serveUrl,
          composition,
          frame,
          output: renderPath,
          inputProps,
          imageFormat: "png",
        });

        const diffRatio = compareImages(previewPath, renderPath, diffPath);
        const pct = (diffRatio * 100).toFixed(3);

        if (diffRatio > MAX_DIFF_RATIO) {
          failures += 1;
          console.error(
            `[Mismatch] ${testCase.id} @ ${frameTime.toFixed(2)}s diff=${pct}% (see ${diffPath})`
          );
        } else {
          console.log(`[OK] ${testCase.id} @ ${frameTime.toFixed(2)}s diff=${pct}%`);
        }
      }
    }

    if (failures > 0) {
      throw new Error(`Video parity tests failed: ${failures} mismatches`);
    }

    console.log("Video parity tests passed");
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopDevServer(devServer);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
