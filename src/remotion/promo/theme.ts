import { loadFont } from "@remotion/fonts";
import { Easing, staticFile } from "remotion";

export const colors = {
  bg: "#0C0B0A",
  panel: "rgba(28, 26, 24, 0.62)",
  border: "rgba(250, 249, 245, 0.10)",
  text: "#FAF9F5",
  muted: "#A8A59C",
  accent: "#D97757",
  accentHot: "#F0A27E",
  plum: "#6B3A5E",
  amber: "#C2653F",
  green: "#9BD18B",
};

export const fonts = {
  sans: "Inter, sans-serif",
  mono: "JetBrains Mono, monospace",
};

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOutExpo = Easing.bezier(0.16, 1, 0.3, 1);

/** Cream → terracotta gradient used for clipped headline text. */
export const gradientText = (angle = 100): React.CSSProperties => ({
  backgroundImage: `linear-gradient(${angle}deg, ${colors.text} 0%, ${colors.accentHot} 55%, ${colors.accent} 100%)`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
});

for (const weight of ["400", "600", "700"]) {
  loadFont({ family: "Inter", url: staticFile(`fonts/inter-latin-${weight}-normal.woff2`), weight });
}
for (const weight of ["400", "500"]) {
  loadFont({ family: "JetBrains Mono", url: staticFile(`fonts/jetbrains-mono-latin-${weight}-normal.woff2`), weight });
}
