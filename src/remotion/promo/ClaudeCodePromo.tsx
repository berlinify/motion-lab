import { springTiming, TransitionSeries } from "@remotion/transitions";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Backdrop } from "./Backdrop";
import { blurZoom } from "../shared/blurZoom";
import { FeaturesScene } from "./FeaturesScene";
import { LogoScene } from "./LogoScene";
import { OutroScene } from "./OutroScene";
import { TerminalScene } from "./TerminalScene";

// Scene lengths sum to 11.2s; three 0.4s transitions overlap → 10s total.
export const ClaudeCodePromo: React.FC = () => {
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
        <TransitionSeries.Sequence name="Logo" durationInFrames={2.8 * fps}>
          <LogoScene />
        </TransitionSeries.Sequence>
        {transition}
        <TransitionSeries.Sequence name="Terminal" durationInFrames={4 * fps}>
          <TerminalScene />
        </TransitionSeries.Sequence>
        {transition}
        <TransitionSeries.Sequence name="Features" durationInFrames={1.8 * fps}>
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
