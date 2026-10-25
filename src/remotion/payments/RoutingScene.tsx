import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { RevealText, sliceGradient } from "../shared/RevealText";
import { Sparkle } from "./Sparkle";
import { clamp, colors, easeOutExpo, fonts } from "./theme";

const SRC = { x: 400, y: 640 };
const DST_X = 1200;
const GATEWAYS = [
  { y: 430, ms: 142 },
  { y: 570, ms: 38 },
  { y: 710, ms: 97 },
  { y: 850, ms: 211 },
];
const BEST = 1;

const pathD = (y: number) => `M${SRC.x} ${SRC.y} C ${SRC.x + 420} ${SRC.y} ${DST_X - 420} ${y} ${DST_X} ${y}`;
const pointAt = (y: number, u: number) => {
  const p = [
    [SRC.x, SRC.y],
    [SRC.x + 420, SRC.y],
    [DST_X - 420, y],
    [DST_X, y],
  ];
  const m = 1 - u;
  return [0, 1].map((k) => m * m * m * p[0][k] + 3 * m * m * u * p[1][k] + 3 * m * u * u * p[2][k] + u * u * u * p[3][k]);
};

export const RoutingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drawOn = interpolate(frame, [0.2 * fps, 0.9 * fps], [0, 1], { ...clamp, easing: easeOutExpo });
  const probe = interpolate(frame, [0.8 * fps, 1.6 * fps], [0, 1], clamp);
  const decided = frame >= 1.65 * fps;
  const pay = interpolate(frame, [1.7 * fps, 2.25 * fps], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  const approved = spring({ frame: frame - 2.25 * fps, fps, config: { damping: 12, stiffness: 160 } });
  const amount = Math.round(interpolate(frame, [2.25 * fps, 2.85 * fps], [0, 2450000], { ...clamp, easing: easeOutExpo }));
  const [px, py] = pointAt(GATEWAYS[BEST].y, pay);

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 110, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <RevealText
          text="Smart routing."
          delay={0}
          stagger={1}
          style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 104, letterSpacing: "-0.02em", lineHeight: 1.1 }}
          glyphStyle={sliceGradient(colors.white, "#FFF1B8", colors.yellow)}
        />
        <RevealText
          text="Every payment takes the fastest bank path."
          delay={0.3 * fps}
          stagger={0.5}
          style={{ fontFamily: fonts.display, fontWeight: 500, fontSize: 44, color: colors.muted }}
        />
      </div>

      <svg width={1920} height={1080} style={{ position: "absolute", overflow: "visible" }}>
        <defs>
          <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="route-best" x1={SRC.x} x2={DST_X} y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={colors.gold} />
            <stop offset="1" stopColor={colors.yellow} />
          </linearGradient>
        </defs>
        {GATEWAYS.map((g, i) => {
          const isBest = decided && i === BEST;
          return (
            <path
              key={g.y}
              d={pathD(g.y)}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - drawOn}
              fill="none"
              stroke={isBest ? "url(#route-best)" : "rgba(160,170,255,0.55)"}
              strokeWidth={isBest ? 6 : 3}
              opacity={decided && !isBest ? 0.25 : 1}
              filter={isBest ? "url(#route-glow)" : undefined}
            />
          );
        })}
        {/* Probe pulses race to every gateway; arrival time ∝ latency */}
        {!decided
          ? GATEWAYS.map((g) => {
              const u = Math.min(1, probe * (211 / g.ms) * 0.35 + probe * 0.2);
              const [x, y] = pointAt(g.y, u);
              return <circle key={g.y} cx={x} cy={y} r={7} fill={colors.white} opacity={probe > 0 && u < 1 ? 0.9 : 0} filter="url(#route-glow)" />;
            })
          : null}
      </svg>

      {/* Source node: the customer's card */}
      <div
        style={{
          position: "absolute",
          left: SRC.x - 150,
          top: SRC.y - 50,
          width: 150,
          height: 100,
          borderRadius: 16,
          background: `linear-gradient(135deg, ${colors.blue}, ${colors.navy})`,
          border: `2px solid ${colors.glassBorder}`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(61,75,255,0.5)`,
          scale: String(spring({ frame: frame - 0.1 * fps, fps, config: { damping: 14 } })),
          rotate: "-6deg",
        }}
      >
        <div style={{ position: "absolute", left: 18, top: 34, width: 34, height: 26, borderRadius: 6, background: `linear-gradient(135deg, #FFE066, ${colors.gold})` }} />
        <Sparkle size={26} style={{ position: "absolute", right: 16, top: 14 }} />
      </div>

      {/* Gateway nodes */}
      {GATEWAYS.map((g, i) => {
        const pop = spring({ frame: frame - (0.6 + i * 0.07) * fps, fps, config: { damping: 14 } });
        const arrivedAt = 0.8 + (1.6 - 0.8) * Math.min(1, 1 / ((211 / g.ms) * 0.35 + 0.2));
        const showMs = frame >= arrivedAt * fps;
        const isBest = decided && i === BEST;
        return (
          <div
            key={g.y}
            style={{
              position: "absolute",
              left: DST_X,
              top: g.y - 40,
              height: 80,
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "0 28px",
              borderRadius: 40,
              background: isBest ? `linear-gradient(90deg, rgba(255,204,0,0.25), rgba(255,204,0,0.08))` : colors.glass,
              border: `2px solid ${isBest ? colors.yellow : colors.glassBorder}`,
              boxShadow: isBest ? `0 0 50px rgba(255,204,0,0.45)` : "none",
              fontFamily: fonts.display,
              fontSize: 32,
              fontWeight: 600,
              color: colors.white,
              scale: String(pop),
              transformOrigin: "0% 50%",
              opacity: decided && !isBest ? 0.4 : 1,
            }}
          >
            <span>Bank {String.fromCharCode(65 + i)}</span>
            <span
              style={{
                fontWeight: 500,
                fontSize: 28,
                color: isBest ? colors.yellow : colors.muted,
                opacity: showMs ? 1 : 0,
                minWidth: 90,
              }}
            >
              {g.ms}ms
            </span>
          </div>
        );
      })}

      {/* The payment itself */}
      {decided && pay < 0.97 ? (
        <Sparkle size={56} style={{ position: "absolute", left: px - 28, top: py - 28, rotate: `${frame * 14}deg`, filter: `drop-shadow(0 0 18px ${colors.yellow})` }} />
      ) : null}

      {/* Approved badge */}
      <div
        style={{
          position: "absolute",
          left: DST_X + 330,
          top: GATEWAYS[BEST].y - 150,
          whiteSpace: "nowrap",
          padding: "18px 30px",
          borderRadius: 22,
          background: "rgba(10,12,60,0.85)",
          border: `2px solid rgba(61,220,151,0.6)`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(61,220,151,0.3)`,
          fontFamily: fonts.display,
          color: colors.white,
          scale: String(approved),
          transformOrigin: "0% 100%",
          opacity: approved > 0.01 ? 1 : 0,
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 600, color: colors.green }}>✓ Approved</div>
        <div style={{ fontSize: 40, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {amount.toLocaleString("en-US")} <span style={{ fontSize: 24, fontWeight: 500, color: colors.muted }}>IRR</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
