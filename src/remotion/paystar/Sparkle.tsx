// Four-point star — the same motif cut into the "P" of the PayStar logo.
export const Sparkle: React.FC<{ readonly size: number; readonly color?: string; readonly style?: React.CSSProperties }> = ({
  size,
  color = "#FFCC00",
  style,
}) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100" style={{ overflow: "visible", ...style }}>
    <path d="M0 -50 C 6 -12 12 -6 50 0 C 12 6 6 12 0 50 C -6 12 -12 6 -50 0 C -12 -6 -6 -12 0 -50 Z" fill={color} />
  </svg>
);
