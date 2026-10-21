import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, colors, fonts, gradientText } from "./theme";

const LINES = ["Understands your codebase.", "Edits across files.", "Runs your commands."];

// Kinetic type: each line flips up in 3D word-by-word with a landing glow.
export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        paddingLeft: 200,
        gap: 18,
        perspective: 1400,
        translate: `0px ${interpolate(frame, [0, 2 * fps], [30, -30])}px`,
      }}
    >
      {LINES.map((line, li) => {
        const lineStart = (0.05 + li * 0.28) * fps;
        const isLast = li === LINES.length - 1;
        return (
          <div key={line} style={{ display: "flex", gap: 28, fontFamily: fonts.sans, fontWeight: 700, fontSize: 116, letterSpacing: "-0.035em", lineHeight: 1.12 }}>
            {line.split(" ").map((word, wi) => {
              const p = spring({ frame: frame - lineStart - wi * 2.5, fps, config: { damping: 16, stiffness: 130 } });
              return (
                <span
                  key={word}
                  style={{
                    display: "inline-block",
                    transformOrigin: "50% 100%",
                    transform: `rotateX(${(1 - p) * -95}deg) translateY(${(1 - p) * 40}px)`,
                    opacity: interpolate(p, [0, 0.5], [0, 1], clamp),
                    filter: `blur(${(1 - p) * 10}px)`,
                    ...(isLast
                      ? gradientText(95)
                      : {
                          color: colors.text,
                          // Brief warm glow as each word lands.
                          textShadow: `0 0 ${interpolate(p, [0.6, 1], [40, 0], clamp)}px rgba(240,162,126,${interpolate(p, [0.3, 0.8, 1], [0, 0.9, 0], clamp)})`,
                        }),
                  }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
