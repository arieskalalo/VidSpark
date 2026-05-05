import { Composition } from "remotion";
import { VideoWithCaption } from "./VideoWithCaption";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VideoWithCaption"
      component={VideoWithCaption}
      durationInFrames={150}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{
        videoSrc: "",
        text: "Your caption here",
        trimStart: 0,
        trimEnd: 0,
        speed: 1,
        muted: false,
        orientation: 0,
        captionPosition: "bottom",
        fontSize: 40,
        textColor: "#ffffff",
        secondVideoMode: "none",
      }}
    />
  );
};
