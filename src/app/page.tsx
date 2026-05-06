"use client";

import { useRef, useState } from "react";

type Stage = "idle" | "generating" | "ready" | "rendering" | "done" | "error";
type CaptionPosition = "top" | "center" | "bottom";
type SecondVideoMode = "none" | "insert" | "split";
type SplitLayout = "side-by-side" | "top-bottom" | "pip";
type Orientation = 0 | 90 | 180 | 270;

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function Home() {
  // Main video
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  // Edit controls
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>(0);

  // Second video
  const [secondVideoMode, setSecondVideoMode] = useState<SecondVideoMode>("none");
  const [secondFile, setSecondFile] = useState<File | null>(null);
  const [secondObjectUrl, setSecondObjectUrl] = useState<string | null>(null);
  const [secondDuration, setSecondDuration] = useState(0);
  const [insertAt, setInsertAt] = useState(0);
  const [splitLayout, setSplitLayout] = useState<SplitLayout>("side-by-side");
  const secondFileRef = useRef<HTMLInputElement>(null);
  const secondPreviewRef = useRef<HTMLVideoElement>(null);

  // Caption
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState("");
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>("bottom");
  const [fontSize, setFontSize] = useState(40);
  const [textColor, setTextColor] = useState("#ffffff");

  // App state
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const walkthroughRef = useRef<HTMLVideoElement>(null);

  const hasVideo = !!videoFile;
  const hasSecond = !!secondFile;
  const mainClipDuration = (trimEnd > 0 ? trimEnd : videoDuration) - trimStart;

  function onVideoLoaded() {
    const el = previewRef.current;
    if (!el || !isFinite(el.duration)) return;
    setVideoDuration(el.duration);
    setTrimStart(0);
    setTrimEnd(el.duration);
  }

  function onSecondVideoLoaded() {
    const el = secondPreviewRef.current;
    if (!el || !isFinite(el.duration)) return;
    setSecondDuration(el.duration);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setVideoObjectUrl(URL.createObjectURL(file));
    reset();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("video/")) return;
    setVideoFile(file);
    setVideoObjectUrl(URL.createObjectURL(file));
    reset();
  }

  function handleSecondFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSecondFile(file);
    setSecondObjectUrl(URL.createObjectURL(file));
    setSecondDuration(0);
    setInsertAt(0);
  }

  function handleSecondDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("video/")) return;
    setSecondFile(file);
    setSecondObjectUrl(URL.createObjectURL(file));
    setSecondDuration(0);
    setInsertAt(0);
  }

  function clearSecond() {
    setSecondFile(null);
    setSecondObjectUrl(null);
    setSecondDuration(0);
    setInsertAt(0);
  }

  function reset() {
    setDownloadUrl(null);
    setStage("idle");
    setCaption("");
    setTrimStart(0);
    setTrimEnd(0);
    setSpeed(1);
    setMuted(false);
    setOrientation(0);
    setSecondVideoMode("none");
    clearSecond();
  }

  function clearVideo() {
    setVideoFile(null);
    setVideoObjectUrl(null);
    setVideoDuration(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    reset();
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
    if (!videoFile) return;
    setStage("rendering");
    setErrorMsg("");
    try {
      const form = new FormData();

      form.append("video", videoFile);
      form.append("videoDuration", String(videoDuration));
      form.append("trimStart", String(trimStart));
      form.append("trimEnd", String(trimEnd > 0 ? trimEnd : videoDuration));
      form.append("speed", String(speed));
      form.append("muted", String(muted));
      form.append("orientation", String(orientation));

      form.append("secondVideoMode", secondVideoMode);
      if (secondVideoMode !== "none" && secondFile) {
        form.append("secondVideo", secondFile);
        form.append("insertAt", String(insertAt));
        form.append("insertDuration", String(secondDuration));
        form.append("splitLayout", splitLayout);
      }

      form.append("text", caption);
      form.append("captionPosition", captionPosition);
      form.append("fontSize", String(fontSize));
      form.append("textColor", textColor);

      const res = await fetch("/api/render", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Render failed" }));
        throw new Error(data.error || "Render failed");
      }

      const blob = await res.blob();
      setDownloadUrl(URL.createObjectURL(blob));
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-1">
        <span className="text-xl font-bold text-white">Vid</span>
        <span className="text-xl font-bold text-indigo-400">Spark</span>
        <button
          onClick={() => setShowWalkthrough(true)}
          className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400 hover:text-indigo-400 transition-colors border border-zinc-700 hover:border-indigo-500 rounded-lg px-3 py-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
          How it works
        </button>
      </header>

      {/* Walkthrough Modal */}
      {showWalkthrough && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowWalkthrough(false); walkthroughRef.current?.pause(); } }}
        >
          <div className="relative w-full max-w-4xl bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Vid</span>
                <span className="text-sm font-bold text-indigo-400">Spark</span>
                <span className="text-xs text-zinc-500 ml-1">— How it works</span>
              </div>
              <button
                onClick={() => { setShowWalkthrough(false); walkthroughRef.current?.pause(); }}
                className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center text-sm transition-colors"
              >
                ✕
              </button>
            </div>
            <video
              ref={walkthroughRef}
              src="/vidspark-walkthrough.mp4"
              controls
              autoPlay
              className="w-full"
            />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center py-10 px-4">
        <div className="w-full max-w-xl flex flex-col gap-5">

          <p className="text-center text-zinc-500 text-sm">Add · Edit · Second Video · Caption · Render</p>

          {/* ── Step 1: Add Video ── */}
          <Card step="1" title="Add Video">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-zinc-700 rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-indigo-500 hover:bg-zinc-800/40 transition-all"
            >
              <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
              {videoObjectUrl ? (
                <div className="relative w-full" onClick={(e) => e.stopPropagation()}>
                  <video ref={previewRef} src={videoObjectUrl} controls onLoadedMetadata={onVideoLoaded}
                    className="w-full max-h-52 rounded-lg object-contain" />
                  <button
                    onClick={(e) => { e.stopPropagation(); clearVideo(); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center text-sm font-bold transition-colors"
                    title="Remove video"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <VideoIcon />
                  <p className="text-zinc-400 text-sm font-medium">Click or drag a video here</p>
                  <p className="text-zinc-600 text-xs">MP4, MOV, AVI, WebM</p>
                </>
              )}
            </div>
            {videoFile && (
              <p className="text-xs text-zinc-500 text-center mt-2">
                {videoFile.name} · {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                {videoDuration > 0 && ` · ${fmtTime(videoDuration)}`}
              </p>
            )}
          </Card>

          {/* ── Step 2: Edit ── */}
          {hasVideo && (
            <Card step="2" title="Edit">
              {/* Trim */}
              <div className="flex flex-col gap-2 mb-5">
                <Label>Trim</Label>
                <div className="flex gap-4">
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-xs text-zinc-500">Start</span>
                    <div className="flex items-center gap-2">
                      <input type="range" min={0} max={videoDuration || 100} step={0.1} value={trimStart}
                        onChange={(e) => setTrimStart(Math.min(parseFloat(e.target.value), trimEnd - 0.5))}
                        className="flex-1 accent-indigo-500" />
                      <span className="text-xs text-zinc-400 w-10 text-right">{fmtTime(trimStart)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-xs text-zinc-500">End</span>
                    <div className="flex items-center gap-2">
                      <input type="range" min={0} max={videoDuration || 100} step={0.1} value={trimEnd || videoDuration}
                        onChange={(e) => setTrimEnd(Math.max(parseFloat(e.target.value), trimStart + 0.5))}
                        className="flex-1 accent-indigo-500" />
                      <span className="text-xs text-zinc-400 w-10 text-right">{fmtTime(trimEnd || videoDuration)}</span>
                    </div>
                  </div>
                </div>
                {videoDuration > 0 && (
                  <p className="text-xs text-zinc-600">Clip length: {fmtTime((trimEnd || videoDuration) - trimStart)}</p>
                )}
              </div>

              {/* Speed */}
              <div className="flex flex-col gap-2 mb-5">
                <Label>Speed</Label>
                <div className="flex gap-1.5">
                  {[0.5, 0.75, 1, 1.5, 2].map((s) => (
                    <button key={s} onClick={() => setSpeed(s)}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors border ${speed === s ? "bg-indigo-600 border-indigo-600 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Orientation */}
              <div className="flex flex-col gap-2 mb-5">
                <Label>Orientation</Label>
                <div className="flex gap-1.5">
                  {([
                    { label: "Normal", value: 0 },
                    { label: "90°", value: 90 },
                    { label: "180°", value: 180 },
                    { label: "270°", value: 270 },
                  ] as { label: string; value: Orientation }[]).map(({ label, value }) => (
                    <button key={value} onClick={() => setOrientation(value)}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors border ${orientation === value ? "bg-indigo-600 border-indigo-600 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mute */}
              <div className="flex items-center justify-between">
                <Label>Mute Original Audio</Label>
                <Toggle on={muted} onToggle={() => setMuted(!muted)} />
              </div>
            </Card>
          )}

          {/* ── Step 3: Second Video ── */}
          {hasVideo && (
            <Card step="3" title="Second Video">
              <div className="flex gap-1.5 mb-4">
                {([
                  { label: "None", value: "none" },
                  { label: "Insert Clip", value: "insert" },
                  { label: "Split Screen", value: "split" },
                ] as { label: string; value: SecondVideoMode }[]).map(({ label, value }) => (
                  <button key={value} onClick={() => { setSecondVideoMode(value); clearSecond(); }}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors border ${secondVideoMode === value ? "bg-indigo-600 border-indigo-600 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                    {label}
                  </button>
                ))}
              </div>

              {secondVideoMode === "none" && (
                <p className="text-xs text-zinc-600 text-center py-2">Optional — skip if not needed.</p>
              )}

              {secondVideoMode !== "none" && (
                <>
                  <p className="text-xs text-zinc-500 mb-3">
                    {secondVideoMode === "insert"
                      ? "This clip will be spliced into your main video at a chosen point."
                      : "Both videos will play at the same time on screen."}
                  </p>

                  <div
                    onClick={() => secondFileRef.current?.click()}
                    onDrop={handleSecondDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="border-2 border-dashed border-zinc-700 rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer hover:border-violet-500 hover:bg-zinc-800/40 transition-all mb-3"
                  >
                    <input ref={secondFileRef} type="file" accept="video/*" className="hidden" onChange={handleSecondFileChange} />
                    {secondObjectUrl ? (
                      <video ref={secondPreviewRef} src={secondObjectUrl} controls onLoadedMetadata={onSecondVideoLoaded}
                        className="w-full max-h-40 rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
                    ) : (
                      <>
                        <VideoIcon />
                        <p className="text-zinc-400 text-sm">Click or drag second video here</p>
                      </>
                    )}
                  </div>

                  {secondFile && secondDuration > 0 && (
                    <p className="text-xs text-zinc-500 text-center mb-3">
                      {secondFile.name} · {fmtTime(secondDuration)}
                    </p>
                  )}

                  {/* Insert: position slider */}
                  {secondVideoMode === "insert" && hasSecond && mainClipDuration > 0 && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      <Label>Insert at — {fmtTime(insertAt)} into main video</Label>
                      <input type="range" min={0} max={mainClipDuration} step={0.1} value={insertAt}
                        onChange={(e) => setInsertAt(parseFloat(e.target.value))}
                        className="accent-violet-500" />
                      <p className="text-xs text-zinc-600">
                        Insert clip plays at {fmtTime(insertAt)}, then main video continues.
                      </p>
                    </div>
                  )}

                  {/* Split: layout selector */}
                  {secondVideoMode === "split" && hasSecond && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      <Label>Layout</Label>
                      <div className="flex gap-1.5">
                        {([
                          { label: "Side by Side", value: "side-by-side" },
                          { label: "Top & Bottom", value: "top-bottom" },
                          { label: "Picture in Picture", value: "pip" },
                        ] as { label: string; value: SplitLayout }[]).map(({ label, value }) => (
                          <button key={value} onClick={() => setSplitLayout(value)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${splitLayout === value ? "bg-violet-600 border-violet-600 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {/* ── Step 4: Caption ── */}
          {hasVideo && (
            <Card step="4" title="Caption">
              <div className="flex gap-2 mb-3">
                <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && handleGenerate()}
                  placeholder="e.g. sunset surf session in Bali" disabled={busy}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50 placeholder-zinc-600" />
                <button onClick={handleGenerate} disabled={busy || !prompt.trim()}
                  className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors whitespace-nowrap">
                  {isGenerating ? <span className="flex items-center gap-1.5"><Spinner size={14} />Generating</span> : "Generate"}
                </button>
              </div>

              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} disabled={busy} rows={2}
                placeholder="Type a caption or generate one above"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50 resize-none placeholder-zinc-600 mb-4" />

              <div className="flex flex-col gap-1.5 mb-4">
                <Label>Position</Label>
                <div className="flex gap-1.5">
                  {(["top", "center", "bottom"] as CaptionPosition[]).map((p) => (
                    <button key={p} onClick={() => setCaptionPosition(p)}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors border ${captionPosition === p ? "bg-indigo-600 border-indigo-600 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 items-end">
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label>Font size — {fontSize}px</Label>
                  <input type="range" min={20} max={80} value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                    className="accent-indigo-500" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Color</Label>
                  <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)}
                    className="h-9 w-12 rounded-lg cursor-pointer bg-zinc-800 border border-zinc-700 p-0.5" />
                </div>
              </div>
            </Card>
          )}

          {/* ── Step 5: Render ── */}
          {hasVideo && (
            <Card step="5" title="Render">
              <button onClick={handleRender} disabled={busy}
                className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-base transition-colors">
                {isRendering
                  ? <span className="flex items-center justify-center gap-2"><Spinner size={16} />Rendering…</span>
                  : "Render Video"}
              </button>
              {isRendering && <p className="text-xs text-zinc-500 text-center mt-2">This may take a moment depending on video length…</p>}
            </Card>
          )}

          {stage === "error" && (
            <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300 flex gap-2">
              <span>⚠</span><span>{errorMsg}</span>
            </div>
          )}

          {stage === "done" && downloadUrl && (
            <Card step="✓" title="Your Video is Ready">
              <video src={downloadUrl} controls className="w-full rounded-lg" />
              <a href={downloadUrl} download="vidspark.mp4"
                className="mt-3 block w-full py-3 rounded-lg bg-white text-zinc-950 font-semibold text-center text-sm hover:bg-zinc-100 transition-colors">
                Download Video
              </a>
            </Card>
          )}

        </div>
      </main>

      <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-700">
        VidSpark · powered by Remotion &amp; Groq
      </footer>
    </div>
  );
}

function Card({ step, title, children }: { step: string | number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{step}</span>
        <h2 className="font-semibold text-zinc-100 text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-zinc-400">{children}</span>;
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-indigo-600" : "bg-zinc-700"}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? "left-5" : "left-0.5"}`} />
    </button>
  );
}

function VideoIcon() {
  return (
    <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="animate-spin" style={{ width: size, height: size }} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
