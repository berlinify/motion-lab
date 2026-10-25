import { springTiming, TransitionSeries } from "@remotion/transitions";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { blurZoom } from "../shared/blurZoom";
import { Backdrop } from "./Backdrop";
import { FeaturesScene } from "./FeaturesScene";
import { IntroScene } from "./IntroScene";
import { OutroScene } from "./OutroScene";
import { RoutingScene } from "./RoutingScene";

// Scene lengths sum to 11.2s; three 0.4s transitions overlap → 10s total.
export const PaymentsPromo: React.FC = () => {
  const { fps } = useVideoConfig();
  const transition = (
    <TransitionSeries.Transition
      presentation={blurZoom()}
      timing={springTiming({ config: { damping: 200 }, durationInFrames: 0.4 * fps, durationRestThreshold: 0.001 })}
    />
  );

  return (
    <AbsoluteFill>
      <Backdrop />
      <TransitionSeries>
        <TransitionSeries.Sequence name="Intro" durationInFrames={2.6 * fps}>
          <IntroScene />
        </TransitionSeries.Sequence>
        {transition}
        <TransitionSeries.Sequence name="Routing" durationInFrames={3.2 * fps}>
          <RoutingScene />
        </TransitionSeries.Sequence>
        {transition}
        <TransitionSeries.Sequence name="Features" durationInFrames={2.8 * fps}>
          <FeaturesScene />
        </TransitionSeries.Sequence>
        {transition}
        <TransitionSeries.Sequence name="Outro" durationInFrames={2.6 * fps}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
