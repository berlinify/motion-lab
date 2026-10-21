import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ClaudeSpark } from "./ClaudeSpark";
import { LightRings } from "./LightRings";
import { RevealText, sliceGradient } from "../shared/RevealText";
import { clamp, colors, easeOutExpo, fonts } from "./theme";

export const LogoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Spark lands centre-stage, then slides left to make room for the wordmark.
  const slide = spring({ frame: frame - 0.95 * fps, fps, config: { damping: 20, stiffness: 90 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", scale: interpolate(frame, [0, 2.8 * fps], [1, 1.06]) }}>
      <LightRings start={0.35 * fps} />
      {/* Bloom behind the mark */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(240,162,126,0.35) 0%, transparent 60%)`,
          opacity: interpolate(frame, [0.2 * fps, 0.8 * fps, 2.8 * fps], [0, 1, 0.6], clamp),
          translate: `${-495 * slide}px 0px`,
        }}
      />
      <div style={{ position: "absolute", translate: `${-495 * slide}px 0px` }}>
        <ClaudeSpark
          size={interpolate(slide, [0, 1], [300, 210])}
          drawFrom={0.1 * fps}
          rotation={interpolate(frame, [0, 2.8 * fps], [-120, 15], { ...clamp, easing: easeOutExpo })}
          glow={interpolate(frame, [0.3 * fps, 0.9 * fps, 2 * fps], [0, 1, 0.55], clamp)}
        />
      </div>
      <div style={{ position: "absolute", translate: `${110 + (1 - slide) * 60}px 0px` }}>
        <RevealText
          text="Claude Code"
          delay={1.05 * fps}
          stagger={1.6}
          style={{ fontFamily: fonts.sans, fontWeight: 600, fontSize: 160, letterSpacing: "-0.035em", lineHeight: 1.15 }}
          glyphStyle={sliceGradient(colors.text, colors.text, colors.accentHot)}
        />
      </div>
    </AbsoluteFill>
  );
};
