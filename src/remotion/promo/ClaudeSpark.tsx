import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors } from "./theme";

// Approximation of the Claude spark mark: irregular radial rays.
// Swap for the official SVG (public/claude-logo.svg) when available.
const RAYS: { angle: number; length: number }[] = [
  { angle: 0, length: 46 },
  { angle: 31, length: 40 },
  { angle: 58, length: 47 },
  { angle: 92, length: 42 },
  { angle: 119, length: 46 },
  { angle: 151, length: 39 },
  { angle: 179, length: 47 },
  { angle: 211, length: 41 },
  { angle: 238, length: 46 },
  { angle: 272, length: 40 },
  { angle: 299, length: 47 },
  { angle: 331, length: 42 },
];

type Props = {
  readonly size: number;
  /** Frame at which rays start springing out; omit for a fully drawn mark. */
  readonly drawFrom?: number;
  readonly rotation?: number;
  /** Glow strength 0–1. */
  readonly glow?: number;
};

export const ClaudeSpark: React.FC<Props> = ({ size, drawFrom, rotation = 0, glow = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      style={{
        rotate: `${rotation}deg`,
        overflow: "visible",
        filter: glow > 0 ? `drop-shadow(0 0 ${size * 0.08 * glow}px ${colors.accent}) drop-shadow(0 0 ${size * 0.25 * glow}px rgba(217,119,87,0.55))` : undefined,
      }}
    >
      <defs>
        <linearGradient id="spark-grad" x1="-50" y1="-50" x2="50" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colors.accentHot} />
          <stop offset="100%" stopColor={colors.accent} />
        </linearGradient>
      </defs>
      {RAYS.map(({ angle, length }, i) => {
        // Rays shoot out one after another with a springy overshoot.
        const p = drawFrom === undefined ? 1 : spring({ frame: frame - drawFrom - i * 1.6, fps, config: { damping: 11, stiffness: 140 } });
        const rad = (angle * Math.PI) / 180;
        return (
          <line
            key={angle}
            x1={0}
            y1={0}
            x2={Math.cos(rad) * length * p}
            y2={Math.sin(rad) * length * p}
            stroke="url(#spark-grad)"
            strokeWidth={10}
            strokeLinecap="round"
            opacity={p > 0.01 ? 1 : 0}
          />
        );
      })}
    </svg>
  );
};
