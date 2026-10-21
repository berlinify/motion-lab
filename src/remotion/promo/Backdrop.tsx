import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { colors } from "./theme";

// Continuous aurora behind every scene: drifting blurred gradient blobs,
// a vignette and per-frame film grain. Lives outside the TransitionSeries so
// it never cuts between scenes.
const BLOBS = [
  { color: colors.accent, size: 1100, x: 0.25, y: 0.35, speed: 0.6, phase: 0, amp: 160, opacity: 0.55 },
  { color: colors.plum, size: 1300, x: 0.78, y: 0.7, speed: 0.45, phase: 2, amp: 200, opacity: 0.6 },
  { color: colors.amber, size: 900, x: 0.7, y: 0.15, speed: 0.75, phase: 4, amp: 140, opacity: 0.35 },
  { color: "#2A2346", size: 1200, x: 0.1, y: 0.9, speed: 0.5, phase: 1, amp: 180, opacity: 0.7 },
];

export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ filter: "blur(120px)", scale: interpolate(frame, [0, durationInFrames], [1.05, 1.2]) }}>
        {BLOBS.map((b) => (
          <div
            key={b.color}
            style={{
              position: "absolute",
              width: b.size,
              height: b.size,
              left: b.x * width - b.size / 2 + Math.sin(t * b.speed + b.phase) * b.amp,
              top: b.y * height - b.size / 2 + Math.cos(t * b.speed * 1.3 + b.phase) * b.amp,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${b.color} 0%, transparent 65%)`,
              opacity: b.opacity,
            }}
          />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.75) 100%)" }} />
      <svg width={width} height={height} style={{ position: "absolute", opacity: 0.09, mixBlendMode: "overlay" }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed={frame % 24} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};
