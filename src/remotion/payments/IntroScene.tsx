import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { RevealText } from "../shared/RevealText";
import { ACCENT_CENTER, LOGO_ASPECT, Logo } from "./Logo";
import { Sparkle } from "./Sparkle";
import { clamp, colors, easeOutExpo, fonts } from "./theme";

const LOGO_W = 1300;
const LOGO_CX = 960;
const LOGO_CY = 470;
// Where the yellow accent sits on screen — the shooting star lands exactly here.
const VB_W = 4120;
const IMPACT = {
  x: LOGO_CX - LOGO_W / 2 + (ACCENT_CENTER.x / VB_W) * LOGO_W,
  y: LOGO_CY - (LOGO_W * LOGO_ASPECT) / 2 + (ACCENT_CENTER.y / VB_W) * LOGO_W,
};
const FROM = { x: 2050, y: -260 };
const ANGLE = Math.atan2(IMPACT.y - FROM.y, IMPACT.x - FROM.x);

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hit = 0.55 * fps;
  const fly = interpolate(frame, [0, hit], [0, 1], { ...clamp, easing: (x) => x * x * x * 0.4 + x * 0.6 });
  const starX = FROM.x + (IMPACT.x - FROM.x) * fly;
  const starY = FROM.y + (IMPACT.y - FROM.y) * fly;
  const accent = spring({ frame: frame - hit, fps, config: { damping: 10, stiffness: 160 } });
  const flash = interpolate(frame, [hit - 1, hit + 2, hit + 14], [0, 1, 0], clamp);

  return (
    <AbsoluteFill style={{ scale: interpolate(frame, [0, 2.8 * fps], [1.08, 1]) }}>
      {/* Shooting star + trail */}
      {frame < hit + 2 ? (
        <>
          <div
            style={{
              position: "absolute",
              left: starX,
              top: starY,
              width: 900 * Math.min(1, fly * 3),
              height: 6,
              marginTop: -3,
              transformOrigin: "0 50%",
              rotate: `${ANGLE + Math.PI}rad`,
              background: `linear-gradient(90deg, ${colors.yellow}, rgba(255,204,0,0.4) 30%, transparent)`,
              borderRadius: 3,
              filter: "blur(1px)",
              boxShadow: `0 0 24px ${colors.yellow}`,
            }}
          />
          <Sparkle size={70} style={{ position: "absolute", left: starX - 35, top: starY - 35, rotate: `${frame * 12}deg`, filter: `drop-shadow(0 0 20px ${colors.yellow})` }} />
        </>
      ) : null}
      {/* Impact flash + shockwave */}
      <div
        style={{
          position: "absolute",
          left: IMPACT.x - 600,
          top: IMPACT.y - 600,
          width: 1200,
          height: 1200,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(255,240,180,0.9) 0%, rgba(255,204,0,0.35) 20%, transparent 55%)`,
          opacity: flash,
          scale: String(interpolate(flash, [0, 1], [0.4, 1])),
        }}
      />
      {[0, 6].map((d) => {
        const f = frame - hit - d;
        const s = interpolate(f, [0, 40], [40, 1600], { ...clamp, easing: easeOutExpo });
        return (
          <div
            key={d}
            style={{
              position: "absolute",
              left: IMPACT.x - s / 2,
              top: IMPACT.y - s / 2,
              width: s,
              height: s,
              borderRadius: "50%",
              border: `3px solid ${colors.yellow}`,
              boxShadow: `0 0 30px ${colors.yellow}`,
              opacity: interpolate(f, [0, 4, 40], [0, 0.6, 0], clamp),
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left: LOGO_CX - LOGO_W / 2, top: LOGO_CY - (LOGO_W * LOGO_ASPECT) / 2 }}>
        <Logo
          width={LOGO_W}
          reveal={interpolate(frame, [hit, hit + 0.75 * fps], [0, 1], { ...clamp, easing: easeOutExpo })}
          accent={accent}
          shine={interpolate(frame, [1.5 * fps, 2.4 * fps], [0, 1])}
          glow={interpolate(frame, [hit, hit + 10, 2.8 * fps], [0, 1, 0.3], clamp)}
        />
      </div>
      <div style={{ position: "absolute", top: 760, width: "100%", display: "flex", justifyContent: "center" }}>
        <RevealText
          text="Payments, made brilliant."
          delay={1.25 * fps}
          stagger={0.9}
          style={{ fontFamily: fonts.display, fontWeight: 500, fontSize: 64, color: colors.muted, letterSpacing: "0.01em" }}
        />
      </div>
    </AbsoluteFill>
  );
};
