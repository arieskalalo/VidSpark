"use client";

import { useRef, useState } from "react";

type Stage = "idle" | "generating" | "ready" | "rendering" | "done" | "error";

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setDownloadUrl(null);
    setStage("idle");
    setCaption("");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("video/")) return;
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setDownloadUrl(null);
    setStage("idle");
    setCaption("");
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setStage("generating");
    setErrorMsg("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setCaption(data.text);
      setStage("ready");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStage("error");
    }
  }

  async function handleRender() {
    if (!videoFile || !caption.trim()) return;
    setStage("rendering");
    setErrorMsg("");
    try {
      const form = new FormData();
      form.append("video", videoFile);
      form.append("text", caption);

      const res = await fetch("/api/render", { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Render failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStage("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStage("error");
    }
  }

  const isGenerating = stage === "generating";
  const isRendering = stage === "rendering";
  const busy = isGenerating || isRendering;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">AI Video Captioner</h1>
          <p className="mt-2 text-zinc-400 text-lg">
            Upload a video, describe it, and get a captioned video
          </p>
        </div>

        {/* Step 1: Upload */}
        <section className="flex flex-col gap-3">
          <label className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">
            1. Upload Video
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="relative border-2 border-dashed border-zinc-700 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-zinc-500 transition-colors bg-zinc-900"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                className="w-full max-h-64 rounded-xl object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <div className="text-5xl text-zinc-600">🎬</div>
                <p className="text-zinc-400 text-sm">
                  Drag & drop or click to upload a video
                </p>
                <p className="text-zinc-600 text-xs">MP4, MOV, AVI, WebM supported</p>
              </>
            )}
          </div>
          {videoFile && (
            <p className="text-xs text-zinc-500 text-center">
              {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)} MB)
            </p>
          )}
        </section>

        {/* Step 2: Generate caption */}
        <section className="flex flex-col gap-3">
          <label className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">
            2. Describe Your Video
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && handleGenerate()}
              placeholder="e.g. sunset surf session in Bali"
              disabled={busy}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400 disabled:opacity-50 placeholder-zinc-600"
            />
            <button
              onClick={handleGenerate}
              disabled={busy || !prompt.trim()}
              className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors whitespace-nowrap"
            >
              {isGenerating ? "Generating…" : "Generate"}
            </button>
          </div>

          {/* Editable caption */}
          {caption && (
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-500">
                AI-generated caption (you can edit it):
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={busy}
                rows={2}
                className="bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400 disabled:opacity-50 resize-none"
              />
            </div>
          )}
        </section>

        {/* Step 3: Render */}
        <section className="flex flex-col gap-3">
          <label className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">
            3. Render Video
          </label>
          <button
            onClick={handleRender}
            disabled={busy || !videoFile || !caption.trim()}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-lg transition-colors"
          >
            {isRendering ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner /> Rendering…
              </span>
            ) : (
              "Render with Caption"
            )}
          </button>
          {isRendering && (
            <p className="text-xs text-zinc-500 text-center">
              This may take a minute depending on video length…
            </p>
          )}
        </section>

        {/* Error */}
        {stage === "error" && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
            {errorMsg}
          </div>
        )}

        {/* Download */}
        {stage === "done" && downloadUrl && (
          <section className="flex flex-col gap-3">
            <video
              src={downloadUrl}
              controls
              className="w-full rounded-2xl"
            />
            <a
              href={downloadUrl}
              download="captioned.mp4"
              className="w-full py-4 rounded-2xl bg-zinc-100 text-zinc-950 font-bold text-center text-lg hover:bg-white transition-colors"
            >
              Download Video
            </a>
          </section>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
