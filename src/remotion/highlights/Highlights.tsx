import type { Caption } from "@remotion/captions";
import { Audio, Video } from "@remotion/media";
import { linearTiming, TransitionSeries, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { blurZoom } from "../shared/blurZoom";
import { Captions } from "../shared/Captions";

// Frame-exact EDL written by .claude/skills/video-highlights/scripts/plan.ts.
export type EdlClip = {
  type: "video" | "photo";
  src: string;
  startFrame: number;
  durationInFrames: number;
  trimBefore: number;
  srcWidth: number;
  srcHeight: number;
  fit: "cover" | "blur";
  focusX: number;
  focusY: number;
  volume: number;
  kenBurns: "in" | "out" | "left" | "right" | "none" | null;
  title: string | null;
  transitionAfter: { type: "none" | "fade" | "slide" | "wipe" | "blurZoom"; frames: number } | null;
};
export type Edl = {
  title: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  clips: EdlClip[];
  narration: { src: string; startFrame: number; trimBefore: number; durationInFrames: number; volume: number; duckTo: number; captions: Caption[] } | null;
  music: { src: string; trimBefore: number; volume: number; duckTo: number } | null;
};

export type HighlightsProps = {
  /** EDL JSON inside public/. */
  readonly edlSrc: string;
  /** Filled in by calculateMetadata. */
  readonly edl?: Edl;
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Place a source of srcW×srcH into the frame: "cover" crops around the focus point,
// "blur" letterboxes it over a blurred, darkened cover copy (nothing gets cropped).
const placement = (W: number, H: number, sw: number, sh: number, mode: "cover" | "contain", fx: number, fy: number): React.CSSProperties => {
  const s = mode === "cover" ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const w = sw * s, h = sh * s;
  return { position: "absolute", width: w, height: h, left: (W - w) * fx, top: (H - h) * fy };
};

const KEN_BURNS = {
  in: { scale: [1, 1.12], x: [0, 0] },
  out: { scale: [1.12, 1], x: [0, 0] },
  left: { scale: [1.1, 1.1], x: [2.5, -2.5] },
  right: { scale: [1.1, 1.1], x: [-2.5, 2.5] },
  none: { scale: [1, 1], x: [0, 0] },
} as const;

const Clip: React.FC<{ clip: EdlClip; edl: Edl }> = ({ clip, edl }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const n = edl.narration;
  // Duck source audio while narration is speaking (global frame = clip start + local frame).
  const volume = (f: number) => {
    const g = clip.startFrame + f;
    return n && g >= n.startFrame && g < n.startFrame + n.durationInFrames ? Math.min(clip.volume, n.duckTo) : clip.volume;
  };

  const media = (mode: "cover" | "contain", background: boolean) => {
    const style = placement(W, H, clip.srcWidth, clip.srcHeight, mode, background ? 0.5 : clip.focusX, background ? 0.5 : clip.focusY);
    if (clip.type === "video")
      return <Video src={staticFile(clip.src)} trimBefore={clip.trimBefore} objectFit="fill" muted={background} volume={background ? 0 : volume} style={style} />;
    const kb = KEN_BURNS[clip.kenBurns ?? "none"];
    const p = [0, clip.durationInFrames];
    return (
      <Img
        src={staticFile(clip.src)}
        style={{
          ...style,
          transformOrigin: `${clip.focusX * 100}% ${clip.focusY * 100}%`,
          scale: String(interpolate(frame, p, [...kb.scale], clamp)),
          translate: `${interpolate(frame, p, [...kb.x], clamp)}% 0%`,
        }}
      />
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      {clip.fit === "blur" ? (
        <>
          <AbsoluteFill style={{ filter: "blur(48px) brightness(0.55)", scale: "1.15" }}>{media("cover", true)}</AbsoluteFill>
          {media("contain", false)}
        </>
      ) : (
        media("cover", false)
      )}
      {clip.title ? <Title text={clip.title} /> : null}
    </AbsoluteFill>
  );
};

const Title: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const p = spring({ frame: frame - 4, fps, config: { damping: 200 }, durationInFrames: 18 });
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: height * 0.14 }}>
      <div
        dir="auto"
        style={{
          fontFamily: "Vazirmatn, Inter, sans-serif",
          fontWeight: 700,
          fontSize: 120,
          color: "#fff",
          textShadow: "0 2px 6px rgba(0,0,0,0.7), 0 8px 40px rgba(0,0,0,0.6)",
          opacity: p,
          translate: `0px ${(1 - p) * 40}px`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

type AnyPresentation = TransitionPresentation<Record<string, unknown>>;
const presentation = (type: string): AnyPresentation | null => {
  const p = { fade: fade(), slide: slide({ direction: "from-right" }), wipe: wipe({ direction: "from-right" }), blurZoom: blurZoom() }[type];
  return (p as unknown as AnyPresentation) ?? null;
};

// A social cut rendered from an EDL: clips (video or photo, reframed to the canvas)
// joined by optional transitions, plus narration with burned-in captions and music.
export const Highlights: React.FC<HighlightsProps> = ({ edl }) => {
  const { height } = useVideoConfig();
  if (!edl) return null;
  const n = edl.narration;
  const m = edl.music;
  const musicVolume = (f: number) => (m && n && f >= n.startFrame && f < n.startFrame + n.durationInFrames ? m.duckTo : (m?.volume ?? 0));

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>
        {edl.clips.flatMap((clip, i) => {
          const out = [
            <TransitionSeries.Sequence key={`c${i}`} name={`${i + 1} ${clip.src.split("/").pop()}`} durationInFrames={clip.durationInFrames}>
              <Clip clip={clip} edl={edl} />
            </TransitionSeries.Sequence>,
          ];
          const t = clip.transitionAfter;
          const pres = t ? presentation(t.type) : null;
          if (t && pres && t.frames > 0)
            out.push(<TransitionSeries.Transition key={`t${i}`} presentation={pres} timing={linearTiming({ durationInFrames: t.frames })} />);
          return out;
        })}
      </TransitionSeries>
      {n ? (
        <Sequence name="Narration" from={n.startFrame} durationInFrames={n.durationInFrames}>
          <Audio src={staticFile(n.src)} trimBefore={n.trimBefore} volume={n.volume} />
        </Sequence>
      ) : null}
      {m ? <Audio name="Music" src={staticFile(m.src)} trimBefore={m.trimBefore} volume={musicVolume} /> : null}
      {n && n.captions.length ? (
        // Bottom safe area: Reels/TikTok UI covers roughly the lowest 20% of a 9:16 frame.
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * 0.24 }}>
          <Captions captions={n.captions} fontSize={64} boxed style={{ maxWidth: "86%" }} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

export const calculateHighlightsMetadata: CalculateMetadataFunction<HighlightsProps> = async ({ props }) => {
  const edl: Edl = await fetch(staticFile(props.edlSrc)).then((r) => r.json());
  return { fps: edl.fps, width: edl.width, height: edl.height, durationInFrames: edl.durationInFrames, props: { ...props, edl } };
};
