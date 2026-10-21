import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { colors } from "./theme";

const STARS = Array.from({ length: 140 }, (_, i) => ({
  x: random(`x${i}`),
  y: random(`y${i}`) * 0.75,
  size: 1 + random(`s${i}`) * 2.6,
  phase: random(`p${i}`) * Math.PI * 2,
  speed: 0.5 + random(`v${i}`) * 1.5,
}));

const BLOBS = [
  { color: colors.blue, size: 1300, x: 0.2, y: 0.3, speed: 0.5, phase: 0, amp: 180, opacity: 0.55 },
  { color: colors.navy, size: 1500, x: 0.8, y: 0.6, speed: 0.4, phase: 2, amp: 200, opacity: 0.9 },
  { color: colors.yellow, size: 700, x: 0.75, y: 0.2, speed: 0.7, phase: 4, amp: 160, opacity: 0.14 },
  { color: "#5A1FB8", size: 1000, x: 0.1, y: 0.95, speed: 0.55, phase: 1, amp: 160, opacity: 0.4 },
];

// Night-sky backdrop: drifting aurora, twinkling stars, a perspective grid
// floor flowing toward camera, vignette and grain. Continuous across scenes.
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, ${colors.ink} 0%, ${colors.deep} 70%)`, overflow: "hidden" }}>
      <AbsoluteFill style={{ filter: "blur(130px)", scale: interpolate(frame, [0, durationInFrames], [1.05, 1.18]) }}>
        {BLOBS.map((b) => (
          <div
            key={b.color + b.x}
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
      {STARS.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: s.x * width + t * 8 * s.speed,
            top: s.y * height,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            background: i % 9 === 0 ? colors.yellow : colors.white,
            opacity: 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3 * s.speed + s.phase)),
            boxShadow: s.size > 2.6 ? `0 0 8px ${colors.white}` : undefined,
          }}
        />
      ))}
      {/* Perspective grid floor */}
      <div style={{ position: "absolute", left: -width / 2, right: -width / 2, bottom: -80, height: height * 0.55, perspective: 700 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: "rotateX(72deg)",
            transformOrigin: "50% 100%",
            backgroundImage: `linear-gradient(rgba(120,130,255,0.35) 2px, transparent 2px), linear-gradient(90deg, rgba(120,130,255,0.35) 2px, transparent 2px)`,
            backgroundSize: "120px 120px",
            backgroundPosition: `0px ${t * 90}px`,
            maskImage: "linear-gradient(to top, black 0%, transparent 85%)",
            WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 85%)",
          }}
        />
      </div>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,10,0.8) 100%)" }} />
      <svg width={width} height={height} style={{ position: "absolute", opacity: 0.08, mixBlendMode: "overlay" }}>
        <filter id="ps-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed={frame % 24} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#ps-grain)" />
      </svg>
    </AbsoluteFill>
  );
};
