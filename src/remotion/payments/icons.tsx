import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, colors } from "./theme";

// Three animated line icons on a 200×200 grid. Each one draws itself on from
// `start`, idles in a loop, and (if `end` is given) undraws from `end` so a
// standalone render loops seamlessly.
type IconProps = { readonly size: number; readonly start?: number; readonly end?: number };

const useDraw = (start: number, end?: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: frame - start, fps, config: { damping: 200 }, durationInFrames: 0.8 * fps });
  const outP = end === undefined ? 0 : spring({ frame: frame - end, fps, config: { damping: 200 }, durationInFrames: 0.6 * fps });
  return { draw: inP * (1 - outP), t: (frame - start) / fps, frame: frame - start, fps };
};

/** Props for a stroke that draws on as `p` goes 0 → 1. */
const stroke = (p: number, color = "url(#ps-icon-stroke)", width = 7) => ({
  pathLength: 1,
  strokeDasharray: 1,
  strokeDashoffset: 1 - p,
  stroke: color,
  strokeWidth: width,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
  // Round caps would leave a dot on a zero-length stroke.
  strokeOpacity: p > 0.01 ? 1 : 0,
});

const Defs: React.FC = () => (
  <defs>
    <linearGradient id="ps-icon-stroke" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor="#FFFFFF" />
      <stop offset="1" stopColor="#B9C0FF" />
    </linearGradient>
    <linearGradient id="ps-icon-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#FFE066" />
      <stop offset="1" stopColor={colors.gold} />
    </linearGradient>
    <filter id="ps-icon-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="5" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
);

/** Payment Gateway: a bank card with a shimmer and a shield that checks. */
export const GatewayIcon: React.FC<IconProps> = ({ size, start = 0, end }) => {
  const { draw, t, frame, fps } = useDraw(start, end);
  const sweep = ((frame - 0.6 * fps) % (1.6 * fps)) / (1.6 * fps);
  const check = interpolate(draw, [0.6, 1], [0, 1], clamp);
  const shieldPop = interpolate(draw, [0.35, 0.8], [0, 1], clamp);

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ overflow: "visible" }}>
      <Defs />
      <g style={{ translate: `0px ${Math.sin(t * 2.4) * 4}px`, rotate: `${Math.sin(t * 1.6) * 2 - 6}deg`, transformOrigin: "100px 100px" }}>
        <clipPath id="ps-card-clip">
          <rect x="22" y="48" width="140" height="94" rx="16" />
        </clipPath>
        <rect x="22" y="48" width="140" height="94" rx="16" fill="rgba(255,255,255,0.06)" opacity={draw} />
        {frame > 0.6 * fps && draw > 0.95 ? (
          <rect
            clipPath="url(#ps-card-clip)"
            x={interpolate(sweep, [0, 1], [-60, 200])}
            y="30"
            width="40"
            height="140"
            fill="rgba(255,255,255,0.18)"
            transform="skewX(-20)"
          />
        ) : null}
        <rect x="22" y="48" width="140" height="94" rx="16" {...stroke(draw)} />
        <path d="M22 76 H162" {...stroke(interpolate(draw, [0.2, 0.8], [0, 1], clamp))} />
        <rect x="40" y="96" width="28" height="22" rx="5" {...stroke(interpolate(draw, [0.3, 0.9], [0, 1], clamp), "url(#ps-icon-gold)", 6)} />
      </g>
      <g style={{ scale: String(shieldPop), transformOrigin: "146px 140px" }} filter="url(#ps-icon-glow)">
        <path d="M146 104 L176 116 V138 C176 158 162 170 146 176 C130 170 116 158 116 138 V116 Z" fill={colors.navy} stroke="url(#ps-icon-gold)" strokeWidth="7" strokeLinejoin="round" />
        <path d="M132 140 L143 151 L162 129" {...stroke(check, colors.yellow, 8)} />
      </g>
    </svg>
  );
};

const BRANCHES = ["M42 100 C 90 100 100 46 158 46", "M42 100 H158", "M42 100 C 90 100 100 154 158 154"];
const branchPoint = (i: number, u: number) => {
  // Cubic bezier sample matching BRANCHES.
  const ys = [46, 100, 154][i];
  const p0 = [42, 100], p1 = [90, 100], p2 = [100, ys], p3 = [158, ys];
  if (i === 1) return [42 + 116 * u, 100];
  const m = 1 - u;
  return [0, 1].map((k) => m * m * m * p0[k] + 3 * m * m * u * p1[k] + 3 * m * u * u * p2[k] + u * u * u * p3[k]);
};

/** Smart Routing: a source fans out to three gateways; a payment picks one each cycle. */
export const RoutingIcon: React.FC<IconProps> = ({ size, start = 0, end }) => {
  const { draw, frame, fps } = useDraw(start, end);
  const period = 1.1 * fps;
  const local = Math.max(0, frame - 0.5 * fps);
  const cycle = Math.floor(local / period);
  const u = (local % period) / period;
  const chosen = [0, 2, 1][cycle % 3];
  const travel = interpolate(u, [0, 0.7], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  const [px, py] = branchPoint(chosen, travel);
  const arrivedPulse = interpolate(u, [0.7, 1], [0, 1], clamp);
  const active = frame > 0.5 * fps && draw > 0.95;

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ overflow: "visible" }}>
      <Defs />
      {BRANCHES.map((d, i) => (
        <path
          key={d}
          d={d}
          {...stroke(interpolate(draw, [0.15 + i * 0.1, 0.75 + i * 0.1], [0, 1], clamp), active && i === chosen ? colors.yellow : "url(#ps-icon-stroke)", 6)}
          opacity={active && i !== chosen ? 0.45 : 1}
          filter={active && i === chosen ? "url(#ps-icon-glow)" : undefined}
        />
      ))}
      <circle cx="42" cy="100" r={16 * draw} fill={colors.navy} stroke="url(#ps-icon-stroke)" strokeWidth="6" />
      {[46, 100, 154].map((y, i) => (
        <g key={y}>
          {active && i === chosen ? (
            <circle cx="158" cy={y} r={14 + arrivedPulse * 22} fill="none" stroke={colors.yellow} strokeWidth="3" opacity={1 - arrivedPulse} />
          ) : null}
          <circle
            cx="158"
            cy={y}
            r={14 * interpolate(draw, [0.5 + i * 0.1, 0.9 + i * 0.1], [0, 1], clamp)}
            fill={active && i === chosen && u > 0.7 ? colors.yellow : colors.navy}
            stroke={active && i === chosen ? colors.yellow : "url(#ps-icon-stroke)"}
            strokeWidth="6"
          />
        </g>
      ))}
      {active && u < 0.75 ? (
        <path
          d="M0 -12 C 2 -4 4 -2 12 0 C 4 2 2 4 0 12 C -2 4 -4 2 -12 0 C -4 -2 -2 -4 0 -12 Z"
          fill={colors.yellow}
          transform={`translate(${px} ${py}) rotate(${u * 360})`}
          filter="url(#ps-icon-glow)"
        />
      ) : null}
    </svg>
  );
};

/** Daily Settlement: a coin flips inside a rotating 24h cycle arrow. */
export const SettlementIcon: React.FC<IconProps> = ({ size, start = 0, end }) => {
  const { draw, t } = useDraw(start, end);
  const ring = interpolate(draw, [0, 0.8], [0, 1], clamp);
  const coin = interpolate(draw, [0.3, 1], [0, 1], clamp);
  const flip = Math.cos(t * Math.PI * 1.3);

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ overflow: "visible" }}>
      <Defs />
      <g style={{ rotate: `${t * 120}deg`, transformOrigin: "100px 100px" }}>
        {/* 300° arc with arrowhead */}
        <path d="M100 30 A70 70 0 1 1 39.4 65" {...stroke(ring)} />
        <path d="M39.4 65 L34 40 M39.4 65 L62 56" {...stroke(interpolate(draw, [0.7, 1], [0, 1], clamp))} />
      </g>
      {/* 24 tick marks around */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={100 + Math.cos(a) * 52}
            y1={100 + Math.sin(a) * 52}
            x2={100 + Math.cos(a) * 57}
            y2={100 + Math.sin(a) * 57}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity={interpolate(draw, [i / 24, i / 24 + 0.4], [0, 1], clamp)}
          />
        );
      })}
      <g style={{ scale: `${Math.abs(flip) * coin} ${coin}`, transformOrigin: "100px 100px" }} filter="url(#ps-icon-glow)">
        <circle cx="100" cy="100" r="34" fill={flip > 0 ? "url(#ps-icon-gold)" : colors.gold} />
        <circle cx="100" cy="100" r="26" fill="none" stroke="rgba(0,0,102,0.35)" strokeWidth="3" />
        {flip > 0 ? (
          <path d="M100 82 C 102 95 105 98 118 100 C 105 102 102 105 100 118 C 98 105 95 102 82 100 C 95 98 98 95 100 82 Z" fill={colors.navy} />
        ) : (
          <text x="100" y="110" textAnchor="middle" fontFamily="Poppins" fontWeight="800" fontSize="28" fill={colors.navy}>
            24h
          </text>
        )}
      </g>
    </svg>
  );
};

export const ICONS = { gateway: GatewayIcon, routing: RoutingIcon, settlement: SettlementIcon };
export type IconName = keyof typeof ICONS;
