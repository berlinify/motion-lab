import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { LOGO_ASPECT, PayStarLogo } from "./PayStarLogo";
import { Sparkle } from "./Sparkle";
import { clamp, colors, easeOutExpo, fonts } from "./theme";

const PERSIAN = "پرداخت هوشمند، تسویه روزانه";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = (delay: number) => {
    const p = spring({ frame: frame - delay * fps, fps, config: { damping: 20, stiffness: 110 } });
    return { opacity: p, translate: `0px ${(1 - p) * 30}px`, filter: `blur(${(1 - p) * 10}px)` };
  };
  const cta = spring({ frame: frame - 0.75 * fps, fps, config: { damping: 13, stiffness: 120 } });
  const logoIn = spring({ frame, fps, config: { damping: 18, stiffness: 80 } });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 36 }}>
      {/* Orbiting sparkles */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + frame / 40;
        const r = 660 + Math.sin(frame / 20 + i) * 30;
        return (
          <Sparkle
            key={i}
            size={i % 2 ? 22 : 34}
            color={i % 3 === 0 ? colors.white : colors.yellow}
            style={{
              position: "absolute",
              left: 960 + Math.cos(a) * r - 17,
              top: 330 + Math.sin(a) * r * 0.24 - 17,
              opacity: interpolate(frame, [0.2 * fps, 0.6 * fps], [0, 0.85], clamp),
              rotate: `${frame * 4}deg`,
              filter: `drop-shadow(0 0 10px ${colors.yellow})`,
            }}
          />
        );
      })}
      <div style={{ scale: String(interpolate(logoIn, [0, 1], [0.86, 1])), opacity: logoIn, filter: `blur(${(1 - logoIn) * 16}px)`, height: 1000 * LOGO_ASPECT }}>
        <PayStarLogo width={1000} accent={spring({ frame: frame - 0.2 * fps, fps, config: { damping: 9 } })} shine={interpolate(frame, [0.6 * fps, 1.5 * fps], [0, 1])} glow={0.5} />
      </div>
      {/* Persian tagline: word-level animation keeps letters joined */}
      <div dir="rtl" lang="fa" style={{ display: "flex", gap: 18, fontFamily: fonts.persian, fontWeight: 700, fontSize: 60, color: colors.white, marginTop: 10 }}>
        {PERSIAN.split(" ").map((w, i) => {
          const p = spring({ frame: frame - (0.35 + i * 0.07) * fps, fps, config: { damping: 18 } });
          return (
            <span key={i} style={{ display: "inline-block", opacity: p, translate: `0px ${(1 - p) * 28}px`, filter: `blur(${(1 - p) * 8}px)`, color: i >= 2 ? colors.yellow : colors.white }}>
              {w}
            </span>
          );
        })}
      </div>
      <div style={{ fontFamily: fonts.display, fontWeight: 500, fontSize: 40, color: colors.muted, letterSpacing: "0.12em", ...rise(0.5) }}>
        ACCEPT · ROUTE · SETTLE
      </div>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          marginTop: 16,
          padding: "22px 64px",
          borderRadius: 999,
          background: `linear-gradient(90deg, ${colors.gold}, ${colors.yellow}, #FFE680)`,
          color: colors.navy,
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 46,
          letterSpacing: "0.01em",
          scale: String(interpolate(cta, [0, 1], [0.6, 1])),
          opacity: cta,
          boxShadow: `0 0 ${50 + Math.sin(frame / 6) * 14}px rgba(255,204,0,0.55)`,
        }}
      >
        paystar.ir
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.75) 50%, transparent 65%)",
            translate: `${interpolate(frame, [1.3 * fps, 2.1 * fps], [-500, 500], { ...clamp, easing: easeOutExpo })}px 0px`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
