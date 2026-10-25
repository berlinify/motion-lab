import { useId } from "react";
import { sparklePath } from "./Sparkle";
import { colors, fonts } from "./theme";

// Placeholder "Acme Pay" logo: a sparkle mark plus a Poppins wordmark, drawn in SVG so
// it stays crisp at any size and its two parts can animate independently.
// To use a real brand logo, trace it with the raster-to-svg skill (--ts) and swap the
// wordmark <text> and ACCENT_PATH for the traced paths.
export const BRAND_NAME = "Acme Pay";
const PAD = 60;
const VB_W = 4000 + PAD * 2;
const VB_H = 1000 + PAD * 2;
const ACCENT = { x: 420, y: 500, r: 400 };
const ACCENT_PATH = sparklePath(ACCENT.x, ACCENT.y, ACCENT.r);
/** Centre of the yellow accent in viewBox units (for transform origin / impact point). */
export const ACCENT_CENTER = { x: ACCENT.x + PAD, y: ACCENT.y + PAD };
export const LOGO_ASPECT = VB_H / VB_W;

type Props = {
  readonly width: number;
  readonly wordmarkColor?: string;
  /** 0–1 soft left-to-right wipe of the wordmark. */
  readonly reveal?: number;
  /** 0–1 (overshoot allowed) entrance of the yellow accent. */
  readonly accent?: number;
  /** 0–1 position of a light sweep across the wordmark; outside range hides it. */
  readonly shine?: number;
  readonly glow?: number;
};

const Wordmark: React.FC<{ readonly fill?: string }> = ({ fill }) => (
  <text x={960} y={500} dominantBaseline="central" fontFamily={fonts.display} fontWeight={700} fontSize={600} letterSpacing={-12} fill={fill}>
    {BRAND_NAME}
  </text>
);

export const Logo: React.FC<Props> = ({ width, wordmarkColor = colors.white, reveal = 1, accent = 1, shine = -1, glow = 0 }) => {
  const id = useId().replace(/:/g, "");
  const wipeX = -PAD - 500 + reveal * (VB_W + 1000);
  const shineX = -PAD - 900 + shine * (VB_W + 1800);

  return (
    <svg width={width} height={width * LOGO_ASPECT} viewBox={`${-PAD} ${-PAD} ${VB_W} ${VB_H}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}-wipe`} gradientUnits="userSpaceOnUse" x1={wipeX - 500} x2={wipeX} y1={0} y2={0}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x={-PAD} y={-PAD} width={VB_W} height={VB_H}>
          <rect x={-PAD} y={-PAD} width={VB_W} height={VB_H} fill={`url(#${id}-wipe)`} />
        </mask>
        <clipPath id={`${id}-shape`}>
          <Wordmark />
        </clipPath>
        <linearGradient id={`${id}-shine`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={colors.yellow} stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFF6CC" stopOpacity="0.95" />
          <stop offset="1" stopColor={colors.yellow} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g mask={`url(#${id}-mask)`} style={{ filter: glow > 0 ? `drop-shadow(0 0 ${30 * glow}px rgba(61,75,255,0.9))` : undefined }}>
        <Wordmark fill={wordmarkColor} />
        {shine >= 0 && shine <= 1 ? (
          <g clipPath={`url(#${id}-shape)`}>
            <rect x={shineX} y={-PAD - 200} width={900} height={VB_H + 400} fill={`url(#${id}-shine)`} transform={`skewX(-22)`} />
          </g>
        ) : null}
      </g>
      <path
        d={ACCENT_PATH}
        fill={colors.yellow}
        style={{
          transformOrigin: `${ACCENT_CENTER.x - PAD}px ${ACCENT_CENTER.y - PAD}px`,
          transformBox: "view-box",
          scale: String(Math.max(0, accent)),
          rotate: `${(1 - accent) * -140}deg`,
          opacity: accent > 0.02 ? 1 : 0,
          filter: `drop-shadow(0 0 ${40 + glow * 40}px rgba(255,204,0,${0.35 + glow * 0.4}))`,
        }}
      />
    </svg>
  );
};
