import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ClaudeSpark } from "./ClaudeSpark";
import { RevealText, sliceGradient } from "../shared/RevealText";
import { clamp, colors, easeOutExpo, fonts } from "./theme";

const PROMPT = "Add a dark mode toggle to the settings page";

// `at`/`done` are seconds into the scene.
const STEPS: { at: number; done: number; text: string }[] = [
  { at: 1.55, done: 1.95, text: "Read src/settings/SettingsPage.tsx" },
  { at: 1.95, done: 2.4, text: "Update theme.ts, SettingsPage.tsx, App.tsx" },
  { at: 2.4, done: 2.9, text: "Run npm test — 42 passed" },
];

export const TerminalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const typed = Math.floor(interpolate(frame, [0.45 * fps, 1.4 * fps], [0, PROMPT.length], clamp));
  const cursorOn = Math.floor(frame / (fps / 2.5)) % 2 === 0;
  const enter = spring({ frame, fps, config: { damping: 22, stiffness: 70 } });
  const finished = spring({ frame: frame - 2.95 * fps, fps, config: { damping: 14 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 60 }}>
      <div style={{ display: "flex", fontFamily: fonts.sans, fontWeight: 600, fontSize: 88, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
        <RevealText text="Describe it. " delay={0.1 * fps} stagger={0.9} style={{ color: colors.text }} />
        <RevealText text="Claude builds it." delay={0.35 * fps} stagger={0.9} glyphStyle={sliceGradient(colors.accentHot, colors.accent, "#E8B4A0")} />
      </div>

      <div style={{ perspective: 1800 }}>
        {/* Rotating conic gradient border */}
        <div
          style={{
            position: "relative",
            width: 1420,
            padding: 2,
            borderRadius: 26,
            overflow: "hidden",
            transform: `rotateX(${(1 - enter) * 28}deg) translateY(${(1 - enter) * 140}px)`,
            opacity: interpolate(enter, [0, 0.4], [0, 1], clamp),
            boxShadow: `0 60px 140px rgba(0,0,0,0.6), 0 0 ${80 + finished * 60}px rgba(217,119,87,${0.18 + finished * 0.22})`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 2400,
              height: 2400,
              marginLeft: -1200,
              marginTop: -1200,
              background: `conic-gradient(from 0deg, transparent 0%, ${colors.accentHot} 10%, transparent 25%, transparent 50%, ${colors.plum} 62%, transparent 75%)`,
              rotate: `${interpolate(frame, [0, 4 * fps], [0, 300])}deg`,
            }}
          />
          <div
            style={{
              position: "relative",
              borderRadius: 24,
              background: "linear-gradient(180deg, rgba(34,31,29,0.92), rgba(20,19,18,0.94))",
              fontFamily: fonts.mono,
              fontSize: 34,
              color: colors.text,
              overflow: "hidden",
            }}
          >
            {/* Glass sheen sweeping across */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.07) 50%, transparent 60%)",
                translate: `${interpolate(frame, [0.2 * fps, 1.6 * fps], [-1500, 1500], clamp)}px 0px`,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "22px 30px", borderBottom: `1px solid ${colors.border}` }}>
              {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
                <div key={c} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: c, opacity: 0.85 }} />
              ))}
              <div style={{ flex: 1, textAlign: "center", fontSize: 24, color: colors.muted, marginRight: 80 }}>~/my-app — claude</div>
            </div>
            <div style={{ padding: "38px 48px 46px", display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18, color: colors.muted }}>
                <ClaudeSpark size={38} rotation={frame * 2} glow={0.4} />
                <span>Claude Code</span>
              </div>
              <div style={{ padding: "18px 24px", borderRadius: 14, border: `1px solid ${colors.border}`, background: "rgba(255,255,255,0.03)" }}>
                <span style={{ color: colors.accent }}>&gt; </span>
                {PROMPT.slice(0, typed)}
                {typed < PROMPT.length || cursorOn ? (
                  <span style={{ color: colors.accentHot, textShadow: `0 0 16px ${colors.accent}` }}>▍</span>
                ) : null}
              </div>
              {STEPS.map((step) => {
                const show = spring({ frame: frame - step.at * fps, fps, config: { damping: 18, stiffness: 140 } });
                const isDone = frame >= step.done * fps;
                const pop = spring({ frame: frame - step.done * fps, fps, config: { damping: 9, stiffness: 200 } });
                return (
                  <div
                    key={step.text}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 20,
                      opacity: show,
                      translate: `${(1 - show) * -30}px 0px`,
                      filter: `blur(${(1 - show) * 8}px)`,
                    }}
                  >
                    <div style={{ width: 34, display: "flex", justifyContent: "center" }}>
                      {isDone ? (
                        <span style={{ color: colors.green, scale: String(pop), textShadow: `0 0 18px ${colors.green}` }}>✓</span>
                      ) : (
                        <ClaudeSpark size={30} rotation={frame * 9} />
                      )}
                    </div>
                    <span style={{ color: isDone ? colors.text : colors.muted }}>{step.text}</span>
                  </div>
                );
              })}
              {/* Progress bar */}
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 8 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${interpolate(frame, [1.55 * fps, 2.9 * fps], [0, 100], { ...clamp, easing: easeOutExpo })}%`,
                    background: `linear-gradient(90deg, ${colors.plum}, ${colors.accent}, ${colors.accentHot})`,
                    boxShadow: `0 0 20px ${colors.accent}`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
