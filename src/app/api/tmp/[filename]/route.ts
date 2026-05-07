import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { Readable } from "stream";

// Serves temporary video files (inputs for Remotion + rendered outputs)
// from os.tmpdir() so they are accessible via HTTP without relying on
// Next.js static file serving from public/, which doesn't work for
// runtime-created files on Render.

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/tmp/[filename]">) {
  const { filename } = await ctx.params;

  // Only allow our own naming patterns — prevents path traversal
  if (!/^(input_main|input_second|output)_\d+_[a-z0-9]+\.mp4$/.test(filename)) {
    return new Response("Forbidden", { status: 403 });
  }

  const filePath = path.join(os.tmpdir(), filename);

  if (!fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const nodeStream = fs.createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}
