// Four-point star, the brand motif (it's also the mark in the logo).
export const sparklePath = (cx: number, cy: number, r: number) => {
  const k = r / 50;
  const p = (x: number, y: number) => `${cx + x * k} ${cy + y * k}`;
  return (
    `M${p(0, -50)} C ${p(6, -12)} ${p(12, -6)} ${p(50, 0)} C ${p(12, 6)} ${p(6, 12)} ${p(0, 50)} ` +
    `C ${p(-6, 12)} ${p(-12, 6)} ${p(-50, 0)} C ${p(-12, -6)} ${p(-6, -12)} ${p(0, -50)} Z`
  );
};

export const Sparkle: React.FC<{ readonly size: number; readonly color?: string; readonly style?: React.CSSProperties }> = ({
  size,
  color = "#FFCC00",
  style,
}) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100" style={{ overflow: "visible", ...style }}>
    <path d={sparklePath(0, 0, 50)} fill={color} />
  </svg>
);
