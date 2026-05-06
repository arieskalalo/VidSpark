import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, getVideoMetadata } from "@remotion/renderer";
import { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

let bundleCache: string | null = null;

async function getBundle() {
  if (bundleCache) return bundleCache;
  bundleCache = await bundle({
    entryPoint: path.resolve(process.cwd(), "src/remotion/index.ts"),
    webpackOverride: (config) => config,
  });
  return bundleCache;
}

function saveToPublic(buffer: Buffer, dir: string): string {
  const filename = `video_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return filename;
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

  const publicTmpDir = path.resolve(process.cwd(), "public/tmp");
  fs.mkdirSync(publicTmpDir, { recursive: true });

  const tmpDir = os.tmpdir();
  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const outputPath = path.join(tmpDir, `output_${jobId}.mp4`);
  const outputPublicPath = path.join(publicTmpDir, `result_${jobId}.mp4`);
  const servedFiles: string[] = [];

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
      const host = request.headers.get("host") ?? "localhost:3000";
      const protocol = host.startsWith("localhost") ? "http" : "https";
      const toUrl = (filename: string) => `${protocol}://${host}/tmp/${filename}`;

      send({ type: "status", message: "Uploading video…", pct: 2 });

      // Serve main video
      const mainBuf = Buffer.from(await videoFile.arrayBuffer());
      const mainFilename = saveToPublic(mainBuf, publicTmpDir);
      servedFiles.push(mainFilename);
      const videoSrc = toUrl(mainFilename);

      // Serve second video
      let secondVideoSrc: string | undefined;
      if (secondVideoMode !== "none" && secondVideoFile) {
        const buf = Buffer.from(await secondVideoFile.arrayBuffer());
        const f = saveToPublic(buf, publicTmpDir);
        servedFiles.push(f);
        secondVideoSrc = toUrl(f);
      }

      send({ type: "status", message: "Preparing composition…", pct: 5 });

      const fps = 30;

      let videoDuration = clientDuration;
      if (!videoDuration) {
        try {
          const meta = await getVideoMetadata(videoSrc);
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
        onProgress: ({ progress }) => {
          // progress is 0–1; reserve first 10% for setup, last 5% for encoding
          const pct = Math.round(10 + progress * 85);
          const frame = Math.round(progress * durationInFrames);
          send({ type: "progress", pct, frame, total: durationInFrames });
        },
      });

      send({ type: "status", message: "Encoding final video…", pct: 96 });

      // Move to public/tmp so client can download it
      fs.copyFileSync(outputPath, outputPublicPath);
      const downloadUrl = `/tmp/result_${jobId}.mp4`;

      send({ type: "done", url: downloadUrl, pct: 100 });

      // Clean up result file after 10 minutes
      setTimeout(() => {
        if (fs.existsSync(outputPublicPath)) fs.unlinkSync(outputPublicPath);
      }, 10 * 60 * 1000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[render]", msg);
      send({ type: "error", message: msg });
    } finally {
      for (const f of servedFiles) {
        const p = path.join(publicTmpDir, f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
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
