import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";

export type VideoWithCaptionProps = {
  videoSrc: string;
  text: string;
  trimStart: number;
  trimEnd: number;
  speed: number;
  muted: boolean;
  orientation: 0 | 90 | 180 | 270;
  captionPosition: "top" | "center" | "bottom";
  fontSize: number;
  textColor: string;
  secondVideoMode: "none" | "insert" | "split";
  secondVideoSrc?: string;
  insertAt?: number;
  insertDuration?: number;
  splitLayout?: "side-by-side" | "top-bottom" | "pip";
};

function getOrientationStyle(orientation: number): React.CSSProperties {
  const scale = orientation === 90 || orientation === 270 ? 1280 / 720 : 1;
  return {
    transform: `rotate(${orientation}deg) scale(${scale})`,
    transformOrigin: "center",
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  };
}

export const VideoWithCaption: React.FC<VideoWithCaptionProps> = ({
  videoSrc,
  text,
  trimStart,
  speed,
  muted,
  orientation,
  captionPosition,
  fontSize,
  textColor,
  secondVideoMode = "none",
  secondVideoSrc,
  insertAt = 0,
  insertDuration = 0,
  splitLayout = "side-by-side",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const captionPositionStyle: React.CSSProperties =
    captionPosition === "top"
      ? { justifyContent: "flex-start", alignItems: "center", paddingTop: 48 }
      : captionPosition === "center"
      ? { justifyContent: "center", alignItems: "center" }
      : { justifyContent: "flex-end", alignItems: "center", paddingBottom: 48 };

  const trimStartFrame = Math.floor(trimStart * fps);
  const hasSecond = !!secondVideoSrc;

  // ── SPLIT SCREEN ─────────────────────────────────────────────
  if (secondVideoMode === "split" && hasSecond) {
    const mainVideoEl = (
      <OffthreadVideo
        src={videoSrc}
        startFrom={trimStartFrame}
        playbackRate={speed}
        volume={muted ? 0 : 1}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
    const secondVideoEl = (
      <OffthreadVideo
        src={secondVideoSrc}
        volume={muted ? 0 : 1}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );

    return (
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        {splitLayout === "side-by-side" && (
          <AbsoluteFill style={{ flexDirection: "row" }}>
            <div style={{ flex: 1, overflow: "hidden" }}>{mainVideoEl}</div>
            <div style={{ width: 2, backgroundColor: "#000" }} />
            <div style={{ flex: 1, overflow: "hidden" }}>{secondVideoEl}</div>
          </AbsoluteFill>
        )}
        {splitLayout === "top-bottom" && (
          <AbsoluteFill style={{ flexDirection: "column" }}>
            <div style={{ flex: 1, overflow: "hidden" }}>{mainVideoEl}</div>
            <div style={{ height: 2, backgroundColor: "#000" }} />
            <div style={{ flex: 1, overflow: "hidden" }}>{secondVideoEl}</div>
          </AbsoluteFill>
        )}
        {splitLayout === "pip" && (
          <>
            <AbsoluteFill>{mainVideoEl}</AbsoluteFill>
            <div style={{
              position: "absolute", bottom: 24, right: 24,
              width: "32%", height: "32%",
              borderRadius: 12, overflow: "hidden",
              border: "3px solid rgba(255,255,255,0.8)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            }}>
              {secondVideoEl}
            </div>
          </>
        )}
        {text && (
          <AbsoluteFill style={{ padding: "0 40px", ...captionPositionStyle }}>
            <Caption opacity={opacity} fontSize={fontSize} textColor={textColor} text={text} />
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    );
  }

  // ── INSERT (SPLICE) ───────────────────────────────────────────
  if (secondVideoMode === "insert" && hasSecond && insertDuration > 0) {
    const insertAtFrame = Math.floor(insertAt * fps);
    const insertFrames = Math.ceil(insertDuration * fps);
    const part2StartSourceFrame = Math.floor(trimStart * fps + insertAtFrame * speed);

    return (
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <Sequence from={0} durationInFrames={insertAtFrame}>
          <OffthreadVideo
            src={videoSrc}
            startFrom={trimStartFrame}
            playbackRate={speed}
            volume={muted ? 0 : 1}
            style={getOrientationStyle(orientation)}
          />
        </Sequence>
        <Sequence from={insertAtFrame} durationInFrames={insertFrames}>
          <OffthreadVideo
            src={secondVideoSrc}
            volume={muted ? 0 : 1}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Sequence>
        <Sequence from={insertAtFrame + insertFrames}>
          <OffthreadVideo
            src={videoSrc}
            startFrom={part2StartSourceFrame}
            playbackRate={speed}
            volume={muted ? 0 : 1}
            style={getOrientationStyle(orientation)}
          />
        </Sequence>
        {text && (
          <AbsoluteFill style={{ padding: "0 40px", ...captionPositionStyle }}>
            <Caption opacity={opacity} fontSize={fontSize} textColor={textColor} text={text} />
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    );
  }

  // ── SINGLE VIDEO ──────────────────────────────────────────────
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      <OffthreadVideo
        src={videoSrc}
        startFrom={trimStartFrame}
        playbackRate={speed}
        volume={muted ? 0 : 1}
        style={getOrientationStyle(orientation)}
      />
      {text && (
        <AbsoluteFill style={{ padding: "0 40px", ...captionPositionStyle }}>
          <Caption opacity={opacity} fontSize={fontSize} textColor={textColor} text={text} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

function Caption({ opacity, fontSize, textColor, text }: {
  opacity: number; fontSize: number; textColor: string; text: string;
}) {
  return (
    <div style={{
      opacity,
      backgroundColor: "rgba(0,0,0,0.70)",
      padding: "14px 24px",
      borderRadius: 10,
      maxWidth: "88%",
    }}>
      <p style={{
        color: textColor,
        fontSize,
        fontWeight: 700,
        textAlign: "center",
        margin: 0,
        lineHeight: 1.35,
        fontFamily: "sans-serif",
        textShadow: "0 2px 6px rgba(0,0,0,0.6)",
      }}>
        {text}
      </p>
    </div>
  );
}
