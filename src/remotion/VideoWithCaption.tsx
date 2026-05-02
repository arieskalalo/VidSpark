import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  interpolate,
} from "remotion";

export type VideoWithCaptionProps = {
  videoSrc: string;
  text: string;
};

export const VideoWithCaption: React.FC<VideoWithCaptionProps> = ({
  videoSrc,
  text,
}) => {
  const frame = useCurrentFrame();

  const textOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textY = interpolate(frame, [0, 20], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo src={videoSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "0 40px 48px",
        }}
      >
        <div
          style={{
            opacity: textOpacity,
            transform: `translateY(${textY}px)`,
            backgroundColor: "rgba(0, 0, 0, 0.72)",
            padding: "16px 28px",
            borderRadius: 12,
            maxWidth: "90%",
          }}
        >
          <p
            style={{
              color: "#fff",
              fontSize: 40,
              fontWeight: 700,
              textAlign: "center",
              margin: 0,
              lineHeight: 1.3,
              fontFamily: "sans-serif",
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}
          >
            {text}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
