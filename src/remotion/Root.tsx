import { Composition, Folder } from "remotion";
import { GsapTitle } from "./GsapTitle";
import { ThreeScene } from "./ThreeScene";
import { ClaudeCodePromo } from "./promo/ClaudeCodePromo";
import { PayStarPromo } from "./paystar/PayStarPromo";
import { IconLoop } from "./paystar/IconLoop";
import { CaptionedVideo, calculateCaptionedVideoMetadata } from "./captioned/CaptionedVideo";
import { Highlights, calculateHighlightsMetadata } from "./highlights/Highlights";

export const Root: React.FC = () => (
  <>
    <Folder name="PayStar">
      <Composition id="PayStarPromo" component={PayStarPromo} durationInFrames={300} fps={30} width={1920} height={1080} />
      <Composition
        id="PayStarIconGateway"
        component={IconLoop}
        durationInFrames={90}
        fps={30}
        width={512}
        height={512}
        defaultProps={{ icon: "gateway" as const, background: true }}
      />
      <Composition
        id="PayStarIconRouting"
        component={IconLoop}
        durationInFrames={99}
        fps={30}
        width={512}
        height={512}
        defaultProps={{ icon: "routing" as const, background: true }}
      />
      <Composition
        id="PayStarIconSettlement"
        component={IconLoop}
        durationInFrames={90}
        fps={30}
        width={512}
        height={512}
        defaultProps={{ icon: "settlement" as const, background: true }}
      />
    </Folder>
    {/* Burned-in captions from the video-transcribe skill. public/demo/ is gitignored
        (third-party sample); point the props at your own video + captions JSON. */}
    <Composition
      id="CaptionedVideo"
      component={CaptionedVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ videoSrc: "demo/nowruz-fa.mp4", captionsSrc: "demo/nowruz-fa.captions.json" }}
      calculateMetadata={calculateCaptionedVideoMetadata}
    />
    {/* Social cut rendered from an EDL by the video-highlights skill (plan.ts).
        Size, fps and duration come from the EDL. */}
    <Composition
      id="Highlights"
      component={Highlights}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ edlSrc: "demo/nowruz/edl.json" }}
      calculateMetadata={calculateHighlightsMetadata}
    />
    <Composition
      id="ClaudeCodePromo"
      component={ClaudeCodePromo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="GsapTitle"
      component={GsapTitle}
      durationInFrames={120}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ title: "Hello, video" }}
    />
    <Composition
      id="ThreeScene"
      component={ThreeScene}
      durationInFrames={150}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
