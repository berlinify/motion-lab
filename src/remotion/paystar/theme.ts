import { loadFont } from "@remotion/fonts";
import { Easing, staticFile } from "remotion";

// Brand colours sampled from public/paystar/logo.png.
export const colors = {
  navy: "#000066",
  deep: "#03031F",
  ink: "#070738",
  yellow: "#FFCC00",
  gold: "#FFB300",
  blue: "#3D4BFF",
  white: "#FFFFFF",
  muted: "rgba(220, 224, 255, 0.68)",
  glass: "rgba(255, 255, 255, 0.06)",
  glassBorder: "rgba(255, 255, 255, 0.14)",
  green: "#3DDC97",
};

export const fonts = {
  display: "Poppins, sans-serif",
  persian: "Vazirmatn, sans-serif",
};

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOutExpo = Easing.bezier(0.16, 1, 0.3, 1);

for (const weight of ["500", "600", "700", "800"]) {
  loadFont({ family: "Poppins", url: staticFile(`fonts/poppins-latin-${weight}-normal.woff2`), weight });
}
for (const weight of ["500", "700"]) {
  loadFont({ family: "Vazirmatn", url: staticFile(`fonts/vazirmatn-arabic-${weight}-normal.woff2`), weight });
}
