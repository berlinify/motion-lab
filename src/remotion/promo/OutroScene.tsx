import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ClaudeSpark } from "./ClaudeSpark";
import { LightRings } from "./LightRings";
import { RevealText, sliceGradient } from "../shared/RevealText";
import { clamp, colors, fonts } from "./theme";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = (delay: number) => {
    const p = spring({ frame: frame - delay * fps, fps, config: { damping: 20, stiffness: 110 } });
    return { opacity: p, translate: `0px ${(1 - p) * 30}px`, filter: `blur(${(1 - p) * 10}px)` };
  };
  const pillIn = spring({ frame: frame - 0.6 * fps, fps, config: { damping: 15, stiffness: 120 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 34 }}>
      <LightRings start={0.05 * fps} count={2} gap={6} maxSize={1800} />
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 700,
          background: "radial-gradient(ellipse, rgba(217,119,87,0.28) 0%, transparent 60%)",
          opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], clamp),
        }}
      />
      <ClaudeSpark size={150} drawFrom={0} rotation={interpolate(frame, [0, 2.6 * fps], [-60, 40])} glow={0.9 + Math.sin(frame / 6) * 0.15} />
      <RevealText
        text="Claude Code"
        delay={0.15 * fps}
        stagger={1.2}
        style={{ fontFamily: fonts.sans, fontWeight: 700, fontSize: 132, letterSpacing: "-0.04em", lineHeight: 1.1 }}
        glyphStyle={sliceGradient(colors.text, colors.accentHot, colors.accent)}
      />
      <div style={{ fontFamily: fonts.sans, fontSize: 46, color: colors.muted, letterSpacing: "-0.01em", ...rise(0.4) }}>
        Your AI coding partner, right in the terminal.
      </div>
      <div
        style={{
          position: "relative",
          marginTop: 18,
          padding: 2,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${colors.plum}, ${colors.accent}, ${colors.accentHot})`,
          scale: String(interpolate(pillIn, [0, 1], [0.85, 1])),
          opacity: pillIn,
          boxShadow: `0 0 60px rgba(217,119,87,0.45)`,
        }}
      >
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 999,
            padding: "24px 48px",
            background: "rgba(16,15,14,0.92)",
            fontFamily: fonts.mono,
            fontSize: 38,
            color: colors.text,
          }}
        >
          <span style={{ color: colors.accentHot }}>$ </span>npm install -g @anthropic-ai/claude-code
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)",
              translate: `${interpolate(frame, [1.2 * fps, 2.2 * fps], [-1100, 1100], clamp)}px 0px`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
