import { AbsoluteFill, useVideoConfig } from "remotion";
import { ICONS, type IconName } from "./icons";
import { colors } from "./theme";

type Props = { readonly icon: IconName; readonly background: boolean };

// Standalone seamless loop of one icon: draws on, idles, undraws.
export const IconLoop: React.FC<Props> = ({ icon, background }) => {
  const { fps, durationInFrames, width } = useVideoConfig();
  const Icon = ICONS[icon];
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background: background ? `radial-gradient(circle at 50% 30%, #1A1F8C 0%, ${colors.navy} 45%, ${colors.deep} 100%)` : undefined,
      }}
    >
      <Icon size={width * 0.62} start={0.1 * fps} end={durationInFrames - 0.6 * fps - 3} />
    </AbsoluteFill>
  );
};
