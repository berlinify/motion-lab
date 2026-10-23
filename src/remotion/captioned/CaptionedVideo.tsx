import type { Caption } from "@remotion/captions";
import { Video } from "@remotion/media";
import { ALL_FORMATS, Input, UrlSource } from "mediabunny";
import { AbsoluteFill, staticFile, type CalculateMetadataFunction } from "remotion";
import { Captions } from "../shared/Captions";

export type CaptionedVideoProps = {
  /** Video path inside public/. */
  readonly videoSrc: string;
  /** Caption JSON (from the video-transcribe skill) inside public/. */
  readonly captionsSrc: string;
  /** Filled in by calculateMetadata from captionsSrc. */
  readonly captions?: Caption[];
};

// Any video with burned-in, word-synced captions. Duration and size follow the video.
export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({ videoSrc, captions = [] }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Video src={staticFile(videoSrc)} objectFit="contain" style={{ width: "100%", height: "100%" }} />
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: "8%" }}>
      <Captions captions={captions} style={{ width: "84%" }} />
    </AbsoluteFill>
  </AbsoluteFill>
);

export const calculateCaptionedVideoMetadata: CalculateMetadataFunction<CaptionedVideoProps> = async ({ props }) => {
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(staticFile(props.videoSrc)) });
  const [seconds, track] = await Promise.all([input.computeDuration(), input.getPrimaryVideoTrack()]);
  const captions: Caption[] = await fetch(staticFile(props.captionsSrc)).then((r) => r.json());
  const fps = 30;
  return {
    fps,
    durationInFrames: Math.ceil(seconds * fps),
    width: track?.displayWidth ?? 1920,
    height: track?.displayHeight ?? 1080,
    props: { ...props, captions },
  };
};
