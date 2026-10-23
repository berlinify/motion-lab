import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { loadFont } from "@remotion/fonts";
import { spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// Vazirmatn's subset is Arabic-script only, so Latin words fall through to Inter.
for (const weight of ["500", "700"]) {
  loadFont({ family: "Vazirmatn", url: staticFile(`fonts/vazirmatn-arabic-${weight}-normal.woff2`), weight });
}
loadFont({ family: "Inter", url: staticFile("fonts/inter-latin-700-normal.woff2"), weight: "700" });

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
// Decide by majority, not by the first word: Persian lines often open with a Latin brand name.
const isRtl = (words: string[]) => words.filter((w) => RTL.test(w)).length > words.length / 2;

type Props = {
  readonly captions: Caption[];
  /** Words whose starts fall within this window share one on-screen page. */
  readonly pageMs?: number;
  readonly fontSize?: number;
  readonly color?: string;
  readonly highlight?: string;
  /** Translucent box behind each page, for busy or bright footage. */
  readonly boxed?: boolean;
  readonly style?: React.CSSProperties;
};

// Word-synced caption pages: the page springs in, the word being spoken lights up.
// Timestamps are relative to the start of the enclosing <Sequence>, like the source file.
export const Captions: React.FC<Props> = ({
  captions,
  pageMs = 1400,
  fontSize = 56,
  color = "rgba(255,255,255,0.92)",
  highlight = "#FFCC00",
  boxed = false,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  const { pages } = createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: pageMs });
  const index = pages.findIndex((p, i) => nowMs >= p.startMs && nowMs < (pages[i + 1]?.startMs ?? Infinity));
  const page = pages[index];
  if (!page || nowMs > page.startMs + page.durationMs + 600) return null;

  const words = page.tokens.map((t) => t.text.trim()).filter(Boolean);
  const enter = spring({ frame: frame - Math.round((page.startMs / 1000) * fps), fps, config: { damping: 200 }, durationInFrames: 10 });

  return (
    <div
      dir={isRtl(words) ? "rtl" : "ltr"}
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        columnGap: "0.28em",
        fontFamily: "Vazirmatn, Inter, sans-serif",
        fontWeight: 700,
        fontSize,
        lineHeight: 1.5,
        color,
        textShadow: "0 4px 24px rgba(0,0,0,0.45)",
        ...(boxed ? { backgroundColor: "rgba(0,0,0,0.5)", borderRadius: fontSize * 0.4, padding: `${fontSize * 0.12}px ${fontSize * 0.45}px` } : {}),
        opacity: enter,
        translate: `0px ${(1 - enter) * 24}px`,
        ...style,
      }}
    >
      {page.tokens.map((t, i) => {
        const text = t.text.trim();
        if (!text) return null;
        const active = nowMs >= t.fromMs && nowMs < t.toMs;
        const spoken = nowMs >= t.fromMs;
        return (
          <span
            key={`${index}-${i}`}
            style={{
              display: "inline-block",
              color: active ? highlight : color,
              opacity: spoken ? 1 : 0.55,
              scale: active ? "1.08" : "1",
            }}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
};
