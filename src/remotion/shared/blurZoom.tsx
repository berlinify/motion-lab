import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill } from "remotion";

type Props = Record<string, never>;

// Exiting scene pushes toward the camera and dissolves into blur; entering
// scene settles in from slightly behind, de-blurring.
const BlurZoom: React.FC<TransitionPresentationComponentProps<Props>> = ({ children, presentationDirection, presentationProgress: p }) => {
  const exiting = presentationDirection === "exiting";
  const scale = exiting ? 1 + p * 0.18 : 0.88 + p * 0.12;
  const blur = exiting ? p * 24 : (1 - p) * 24;
  const opacity = exiting ? 1 - p : p;
  return <AbsoluteFill style={{ scale: String(scale), filter: `blur(${blur}px)`, opacity }}>{children}</AbsoluteFill>;
};

export const blurZoom = (): TransitionPresentation<Props> => ({ component: BlurZoom, props: {} });
