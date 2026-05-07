import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, getVideoMetadata } from "@remotion/renderer";
import { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

let bundleCache: string | null = null;

const BUNDLE_PATH_FILE = path.resolve(process.cwd(), ".remotion-bundle-path");

async function getBundle() {
  if (bundleCache) return bundleCache;

  // Use the bundle pre-built during Docker image creation (scripts/prebundle.mjs)
  if (fs.existsSync(BUNDLE_PATH_FILE)) {
    const prebuilt = fs.readFileSync(BUNDLE_PATH_FILE, "utf-8").trim();
    if (fs.existsSync(prebuilt)) {
      bundleCache = prebuilt;
      return bundleCache;
    }
  }

  // Bundle at runtime — rspack is much faster and uses far less RAM than webpack
  bundleCache = await bundle({
    entryPoint: path.resolve(process.cwd(), "src/remotion/index.ts"),
    rspack: true,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        fallback: {
          ...(config.resolve?.fallback ?? {}),
          // Node built-ins used by source-map and other deps — stub them out
          // in the browser bundle so rspack doesn't error trying to resolve them
          fs: false,
          path: false,
          stream: false,
          crypto: false,
        },
      },
    }),
  });
  return bundleCache;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  // Main video
  const videoFile = formData.get("video") as File | null;
  const clientDuration = parseFloat((formData.get("videoDuration") as string) ?? "0");
  const trimStart = parseFloat((formData.get("trimStart") as string) ?? "0") || 0;
  const trimEndParam = parseFloat((formData.get("trimEnd") as string) ?? "0");
  const speed = parseFloat((formData.get("speed") as string) ?? "1") || 1;
  const muted = (formData.get("muted") as string) === "true";
  const orientation = parseInt((formData.get("orientation") as string) ?? "0") as 0 | 90 | 180 | 270;

  // Second video
  const secondVideoMode = (formData.get("secondVideoMode") as string) ?? "none";
  const secondVideoFile = formData.get("secondVideo") as File | null;
  const insertAt = parseFloat((formData.get("insertAt") as string) ?? "0") || 0;
  const insertDuration = parseFloat((formData.get("insertDuration") as string) ?? "0") || 0;
  const splitLayout = (formData.get("splitLayout") as string) ?? "side-by-side";

  // Caption
  const text = (formData.get("text") as string) ?? "";
  const captionPosition = (formData.get("captionPosition") as string) ?? "bottom";
  const fontSize = parseInt((formData.get("fontSize") as string) ?? "40") || 40;
  const textColor = (formData.get("textColor") as string) ?? "#ffffff";

  if (!videoFile) {
    return Response.json({ error: "Main video is required" }, { status: 400 });
  }

  const tmpDir = os.tmpdir();
  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const outputPath = path.join(tmpDir, `output_${jobId}.mp4`);

  // Track all input files for cleanup after render
  const inputFiles: string[] = [];

  // ── SSE stream setup ──
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const send = (data: object) => {
    try {
      writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch { /* client disconnected */ }
  };

  // Run render in background, stream progress
  (async () => {
    try {
      send({ type: "status", message: "Uploading video…", pct: 2 });

      // Save videos to tmpdir and pass LOCAL FILE PATHS to Remotion.
      // OffthreadVideo uses ffmpeg server-side — ffmpeg reads the file
      // directly from disk, no HTTP request needed.
      const mainBuf = Buffer.from(await videoFile.arrayBuffer());
      const mainInputPath = path.join(tmpDir, `input_main_${jobId}.mp4`);
      fs.writeFileSync(mainInputPath, mainBuf);
      inputFiles.push(mainInputPath);
      const videoSrc = mainInputPath;

      // Second video
      let secondVideoSrc: string | undefined;
      if (secondVideoMode !== "none" && secondVideoFile) {
        const buf = Buffer.from(await secondVideoFile.arrayBuffer());
        const secondInputPath = path.join(tmpDir, `input_second_${jobId}.mp4`);
        fs.writeFileSync(secondInputPath, buf);
        inputFiles.push(secondInputPath);
        secondVideoSrc = secondInputPath;
      }

      send({ type: "status", message: "Preparing composition…", pct: 5 });

      const fps = 30;

      let videoDuration = clientDuration;
      if (!videoDuration) {
        try {
          // getVideoMetadata also accepts local file paths
          const meta = await getVideoMetadata(mainInputPath);
          videoDuration = meta.durationInSeconds ?? 30;
        } catch {
          videoDuration = 30;
        }
      }

      const actualTrimStart = Math.max(0, trimStart);
      const actualTrimEnd = trimEndParam > 0 ? Math.min(trimEndParam, videoDuration) : videoDuration;
      const mainClipDuration = Math.max(0.1, (actualTrimEnd - actualTrimStart) / speed);

      let totalDuration = mainClipDuration;
      if (secondVideoMode === "insert" && secondVideoSrc && insertDuration > 0) {
        totalDuration = mainClipDuration + insertDuration;
      }

      const durationInFrames = Math.ceil(totalDuration * fps);

      const inputProps = {
        videoSrc, text, trimStart: actualTrimStart, trimEnd: actualTrimEnd,
        speed, muted, orientation, captionPosition, fontSize, textColor,
        secondVideoMode, secondVideoSrc,
        insertAt: Math.min(insertAt, mainClipDuration),
        insertDuration, splitLayout,
      };

      send({ type: "status", message: "Bundling…", pct: 8 });

      const serveUrl = await getBundle();

      const composition = await selectComposition({ serveUrl, id: "VideoWithCaption", inputProps });
      composition.durationInFrames = durationInFrames;
      composition.fps = fps;

      send({ type: "status", message: "Rendering frames…", pct: 10 });

      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        outputLocation: outputPath,
        inputProps,
        // Limit memory usage to stay within Render's free-tier 512MB cap
        concurrency: 1,
        chromiumOptions: {
          gl: "swangle",           // software-only renderer, no GPU memory
          enableMultiProcessOnLinux: false, // single-process Chrome
        },
        onProgress: ({ progress }) => {
          const pct = Math.round(10 + progress * 85);
          const frame = Math.round(progress * durationInFrames);
          send({ type: "progress", pct, frame, total: durationInFrames });
        },
      });

      send({ type: "status", message: "Encoding final video…", pct: 96 });

      // Send a URL via the /api/tmp route — no public/tmp copy needed
      const downloadUrl = `/api/tmp/output_${jobId}.mp4`;
      send({ type: "done", url: downloadUrl, pct: 100 });

      // Auto-delete rendered output after 10 minutes
      setTimeout(() => {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      }, 10 * 60 * 1000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[render]", msg);
      send({ type: "error", message: msg });
      // Clean up output on error
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } finally {
      // Always clean up input files immediately
      for (const f of inputFiles) {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      try { writer.close(); } catch { /* already closed */ }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
