import { interpolate, useCurrentFrame } from "remotion";
import { clamp, colors } from "./theme";

// Expanding shockwave rings radiating from the centre of their parent.
export const LightRings: React.FC<{ readonly start: number; readonly count?: number; readonly gap?: number; readonly maxSize?: number }> = ({
  start,
  count = 3,
  gap = 8,
  maxSize = 1400,
}) => {
  const frame = useCurrentFrame();
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const f = frame - start - i * gap;
        const size = interpolate(f, [0, 45], [80, maxSize], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              borderRadius: "50%",
              border: `2px solid ${colors.accentHot}`,
              boxShadow: `0 0 40px ${colors.accent}, inset 0 0 40px ${colors.accent}`,
              opacity: interpolate(f, [0, 6, 45], [0, 0.5 - i * 0.12, 0], clamp),
            }}
          />
        );
      })}
    </>
  );
};
