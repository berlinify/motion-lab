import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { RevealText, sliceGradient } from "../shared/RevealText";
import { GatewayIcon, RoutingIcon, SettlementIcon } from "./icons";
import { clamp, colors, fonts } from "./theme";

type CardProps = {
  readonly index: number;
  readonly title: string;
  readonly body: string;
  readonly icon: React.ReactNode;
};

const FeatureCard: React.FC<CardProps> = ({ index, title, body, icon }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - (0.25 + index * 0.14) * fps, fps, config: { damping: 16, stiffness: 90 } });
  const t = frame / fps;

  return (
    <div style={{ perspective: 1600 }}>
      <div
        style={{
          position: "relative",
          width: 520,
          height: 580,
          borderRadius: 36,
          padding: 2,
          background: `linear-gradient(160deg, rgba(255,255,255,0.35), rgba(255,255,255,0.04) 40%, rgba(255,204,0,0.35))`,
          transform: `rotateY(${(1 - p) * 50 * (index - 1 || -1)}deg) rotateX(${(1 - p) * 25}deg) translateY(${(1 - p) * 200 + Math.sin(t * 2 + index) * 8}px)`,
          opacity: interpolate(p, [0, 0.4], [0, 1], clamp),
          boxShadow: "0 40px 100px rgba(0,0,20,0.6)",
        }}
      >
        <div
          style={{
            position: "relative",
            height: "100%",
            borderRadius: 34,
            overflow: "hidden",
            background: "linear-gradient(180deg, rgba(30,34,120,0.75), rgba(8,8,50,0.85))",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "44px 36px",
            gap: 18,
          }}
        >
          <div style={{ position: "absolute", top: -120, width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,204,0,0.22), transparent 65%)" }} />
          <div style={{ height: 230, display: "flex", alignItems: "center" }}>{icon}</div>
          <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 46, color: colors.white, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{title}</div>
          <div style={{ fontFamily: fonts.display, fontWeight: 500, fontSize: 30, color: colors.muted, textAlign: "center", lineHeight: 1.35 }}>{body}</div>
        </div>
      </div>
    </div>
  );
};

export const FeaturesScene: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 70 }}>
      <RevealText
        text="One platform. Every payment."
        delay={0}
        stagger={0.8}
        style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 84, letterSpacing: "-0.02em", lineHeight: 1.1 }}
        glyphStyle={sliceGradient(colors.white, colors.white, colors.yellow)}
      />
      <div style={{ display: "flex", gap: 56 }}>
        <FeatureCard index={0} title="Payment Gateway" body="Branded checkout for every bank card" icon={<GatewayIcon size={210} start={0.4 * fps} />} />
        <FeatureCard index={1} title="Smart Routing" body="The fastest bank path, every time" icon={<RoutingIcon size={210} start={0.55 * fps} />} />
        <FeatureCard index={2} title="Daily Settlement" body="Funds settled to you automatically" icon={<SettlementIcon size={210} start={0.7 * fps} />} />
      </div>
    </AbsoluteFill>
  );
};
