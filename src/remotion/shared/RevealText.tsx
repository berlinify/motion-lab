import { spring, useCurrentFrame, useVideoConfig } from "remotion";

type Props = {
  readonly text: string;
  /** Frame (relative to the scene) when the first character starts. */
  readonly delay: number;
  /** Frames between consecutive characters. */
  readonly stagger?: number;
  readonly style?: React.CSSProperties;
  /** Style applied to each glyph (e.g. gradient clip so it spans per-glyph). */
  readonly glyphStyle?: (index: number, count: number) => React.CSSProperties;
};

// Per-character reveal: each glyph springs up from below while de-blurring.
export const RevealText: React.FC<Props> = ({ text, delay, stagger = 1.5, style, glyphStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chars = [...text];

  return (
    <div style={{ display: "flex", whiteSpace: "pre", ...style }}>
      {chars.map((ch, i) => {
        const p = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 18, stiffness: 120, mass: 0.8 } });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: Math.min(1, p * 1.4),
              translate: `0px ${(1 - p) * 0.6}em`,
              rotate: `${(1 - p) * 8}deg`,
              filter: `blur(${(1 - Math.min(1, p)) * 14}px)`,
              ...glyphStyle?.(i, chars.length),
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/** Slice of a horizontal gradient so a split word still reads as one gradient. */
export const sliceGradient =
  (from: string, via: string, to: string) =>
  (i: number, count: number): React.CSSProperties => ({
    backgroundImage: `linear-gradient(90deg, ${from}, ${via}, ${to})`,
    backgroundSize: `${count * 100}% 100%`,
    backgroundPosition: `${count > 1 ? (i / (count - 1)) * 100 : 0}% 0%`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  });
