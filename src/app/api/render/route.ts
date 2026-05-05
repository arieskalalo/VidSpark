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
  const secondVideoUrl = formData.get("secondVideoUrl") as string | null;
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
  const outputPath = path.join(tmpDir, `output_${Date.now()}.mp4`);
  const servedFiles: string[] = [];

  try {
    const host = request.headers.get("host") ?? "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const toUrl = (filename: string) => `${protocol}://${host}/tmp/${filename}`;

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

    const fps = 30;

    // Determine video duration
    let videoDuration = clientDuration;
    if (!videoDuration) {
      try {
        const meta = await getVideoMetadata(videoSrc);
        videoDuration = meta.durationInSeconds;
      } catch {
        videoDuration = 30;
      }
    }

    const actualTrimStart = Math.max(0, trimStart);
    const actualTrimEnd = trimEndParam > 0 ? Math.min(trimEndParam, videoDuration) : videoDuration;
    const mainClipDuration = Math.max(0.1, (actualTrimEnd - actualTrimStart) / speed);

    // Total composition duration
    let totalDuration = mainClipDuration;
    if (secondVideoMode === "insert" && secondVideoSrc && insertDuration > 0) {
      totalDuration = mainClipDuration + insertDuration;
    }
    // For split screen, duration = main clip duration (both play simultaneously)

    const durationInFrames = Math.ceil(totalDuration * fps);

    const inputProps = {
      videoSrc,
      text,
      trimStart: actualTrimStart,
      trimEnd: actualTrimEnd,
      speed,
      muted,
      orientation,
      captionPosition,
      fontSize,
      textColor,
      secondVideoMode,
      secondVideoSrc,
      insertAt: Math.min(insertAt, mainClipDuration),
      insertDuration,
      splitLayout,
    };

    const serveUrl = await getBundle();

    const composition = await selectComposition({
      serveUrl,
      id: "VideoWithCaption",
      inputProps,
    });

    composition.durationInFrames = durationInFrames;
    composition.fps = fps;

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
    });

    const rendered = fs.readFileSync(outputPath);

    return new Response(rendered, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="vidspark.mp4"',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[render]", msg);
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    for (const f of servedFiles) {
      const p = path.join(publicTmpDir, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
}
