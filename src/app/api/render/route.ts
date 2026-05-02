import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, getVideoMetadata } from "@remotion/renderer";
import { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

// Cache the bundle path so we don't recompile on every request
let bundleCache: string | null = null;

async function getBundle() {
  if (bundleCache) return bundleCache;
  bundleCache = await bundle({
    entryPoint: path.resolve(process.cwd(), "src/remotion/index.ts"),
    webpackOverride: (config) => config,
  });
  return bundleCache;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const videoFile = formData.get("video") as File | null;
  const text = formData.get("text") as string | null;

  if (!videoFile || !text) {
    return Response.json({ error: "video and text are required" }, { status: 400 });
  }

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `input_${Date.now()}.mp4`);
  const outputPath = path.join(tmpDir, `output_${Date.now()}.mp4`);

  try {
    // Save uploaded video to temp file
    const buffer = Buffer.from(await videoFile.arrayBuffer());
    fs.writeFileSync(inputPath, buffer);

    // Get video duration
    const metadata = await getVideoMetadata(inputPath);
    const fps = 30;
    const durationInFrames = Math.ceil(metadata.durationInSeconds * fps);

    const videoSrc = `file://${inputPath}`;

    // Bundle the Remotion composition (cached after first run)
    const serveUrl = await getBundle();

    const composition = await selectComposition({
      serveUrl,
      id: "VideoWithCaption",
      inputProps: { videoSrc, text },
    });

    // Override duration to match source video
    composition.durationInFrames = durationInFrames;
    composition.fps = fps;

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: { videoSrc, text },
    });

    const rendered = fs.readFileSync(outputPath);

    return new Response(rendered, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="captioned.mp4"',
      },
    });
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
}
