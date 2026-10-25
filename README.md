# motion-lab

A lab for making videos in code. It holds three rendering pipelines that share one `package.json`, plus a set of Claude Code skills for analyzing, transcribing and editing real footage.

| Pipeline | Entry | Output | Used for |
|---|---|---|---|
| **Remotion** (React → MP4) | `src/remotion/index.ts` → `Root.tsx` | `out/` | The main video output: branded promos, animated icons, captioned videos and social highlight reels. GSAP and three.js / React Three Fiber scenes run inside Remotion compositions. |
| **Motion Canvas** (generator scenes → frames/MP4) | `src/motion-canvas/project.ts`, served by `vite.config.ts` | `output/` | Explainer-style, code-driven 2D animation, built in its own editor. |
| **Satori + resvg** (JSX → SVG → PNG) | `scripts/thumbnail.tsx` | `out/` | Static images: thumbnails, title cards and overlays to bring into either video pipeline. |

---

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Compositions](#compositions)
- [Project layout](#project-layout)
- [Footage workflows (Claude Code skills)](#footage-workflows-claude-code-skills)
- [Rules for writing compositions](#rules-for-writing-compositions)
- [Version pins](#version-pins)
- [Adding a new video](#adding-a-new-video)
- [Troubleshooting](#troubleshooting)

---

## Requirements

| Tool | Why | Notes |
|---|---|---|
| **Node.js** (v20 or newer; developed on v24) | Everything | |
| **ffmpeg / ffprobe** on `PATH`, full build | The `video-analyze`, `video-transcribe` and `video-highlights` scripts | They use filters such as `scdet`, `silencedetect`, `ebur128` and `drawtext`. On macOS: `brew install ffmpeg`. On Debian/Ubuntu: `apt install ffmpeg fontconfig`. Remotion bundles its own minimal ffmpeg (`npx remotion ffmpeg …`), but that build only transcodes, concatenates and muxes, with no `-vf` or `-filter_complex`. |
| **git, cmake, a C/C++ compiler** | Building whisper.cpp for transcription | Only needed for the `video-transcribe` skill. On macOS: `xcode-select --install && brew install cmake` |
| **Network access** at render time | `ThreeScene` | drei's `<Environment preset="city">` downloads an HDRI from a CDN |

Motion Canvas renders MP4 through `@motion-canvas/ffmpeg`, which ships its own binaries via `@ffmpeg-installer`.

## Quick start

```bash
npm install
npm run studio          # open Remotion Studio and browse every composition
```

Render something:

```bash
npm run render -- PayStarPromo out/paystar.mp4
npm run still  -- ClaudeCodePromo out/frame.png --frame=90
npm run thumbnail -- "Hello, video" out/thumb.png
```

## Commands

```bash
npm run studio                                         # Remotion Studio (preview and edit compositions)
npm run render -- <CompositionId> out/x.mp4            # render a composition
npm run render -- ThreeScene out/t.mp4 --frames=0-9    # render a frame range (fast smoke test)
npm run still  -- GsapTitle out/f.png --frame=60       # render one frame (quick visual check)
npm run render -- GsapTitle out/x.mp4 --props='{"title":"Hi"}'   # override props
npm run mc                                             # Motion Canvas editor (Vite); render from its UI → output/
npm run thumbnail -- "Title" out/thumb.png             # Satori thumbnail (1280×720)
npm run typecheck                                      # tsc over src/remotion and scripts
```

**There is no test suite.** To verify a change, render a still at a frame where the change is visible and look at the PNG. Run `npm run typecheck` before committing.

## Compositions

All are registered in [`src/remotion/Root.tsx`](src/remotion/Root.tsx).

| ID | Size · fps · length | What it is | Props |
|---|---|---|---|
| `PayStarPromo` | 1920×1080 · 30 · 10 s | PayStar brand promo: Intro → Routing → Features → Outro, with blur-zoom transitions over a continuous backdrop | none |
| `PayStarIconGateway` | 512×512 · 30 · 3 s | Seamlessly looping animated line icon | `icon`, `background` |
| `PayStarIconRouting` | 512×512 · 30 · 3.3 s | 〃 | `icon`, `background` |
| `PayStarIconSettlement` | 512×512 · 30 · 3 s | 〃 | `icon`, `background` |
| `ClaudeCodePromo` | 1920×1080 · 30 · 10 s | Claude Code promo: Logo → Terminal → Features → Outro | none |
| `CaptionedVideo` | from the video | Burns word-timed, RTL-aware captions into any video in `public/` | `videoSrc`, `captionsSrc` |
| `Highlights` | from the EDL (default 1080×1920) | Social cut rendered from an `edl.json` | `edlSrc` |
| `GsapTitle` | 1920×1080 · 30 · 4 s | Reference pattern for driving GSAP from Remotion | `title` |
| `ThreeScene` | 1920×1080 · 30 · 5 s | Reference pattern for three.js / R3F in Remotion | none |

`CaptionedVideo` and `Highlights` use `calculateMetadata`, so their size, fps and duration come from the input files. Their default props point at `public/demo/`, which is gitignored, so pass your own paths.

**Transparent icon render** (WebM with alpha):

```bash
npm run render -- PayStarIconRouting out/routing.webm \
  --codec=vp9 --image-format=png --pixel-format=yuva420p \
  --props='{"icon":"routing","background":false}'
```

## Project layout

```
.
├── src/
│   ├── remotion/
│   │   ├── index.ts / Root.tsx      # entry + composition registry
│   │   ├── GsapTitle.tsx            # GSAP reference pattern
│   │   ├── ThreeScene.tsx           # three.js reference pattern
│   │   ├── shared/                  # helpers used across videos
│   │   │   ├── RevealText.tsx       #   per-glyph spring/blur text reveal
│   │   │   ├── blurZoom.tsx         #   blur-zoom TransitionSeries presentation
│   │   │   └── Captions.tsx         #   word-highlighted captions, RTL/LTR per page
│   │   ├── promo/                   # Claude Code promo (scenes, Backdrop, theme)
│   │   ├── paystar/                 # PayStar promo, icons, IconLoop, traced logoPaths.ts
│   │   ├── captioned/               # CaptionedVideo composition
│   │   └── highlights/              # Highlights composition (EDL renderer)
│   └── motion-canvas/
│       ├── project.ts               # Motion Canvas project
│       ├── scenes/intro.tsx         # example scene
│       └── tsconfig.json            # separate TS config (different JSX runtime)
├── scripts/thumbnail.tsx            # Satori + resvg thumbnail generator
├── public/                          # static assets for Remotion (fonts, brand logos)
├── .claude/skills/                  # Claude Code skills (see below)
├── remotion.config.ts               # jpeg frames, overwrite, ANGLE GL renderer
├── vite.config.ts                   # Motion Canvas + ffmpeg Vite plugins
└── CLAUDE.md                        # guidance for Claude Code in this repo
```

`out/`, `output/`, `public/demo/` and `.env` are gitignored.

### Shape of a promo

Every promo has the same structure: a continuous `Backdrop` sits **outside** a `TransitionSeries` of scenes, so the background never cuts during a transition.

```tsx
<AbsoluteFill>
  <Backdrop />
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={2.6 * fps}><IntroScene /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={blurZoom()} timing={springTiming({ durationInFrames: 0.4 * fps })} />
    …
  </TransitionSeries>
</AbsoluteFill>
```

The scene lengths minus the transition overlaps must add up to the composition's `durationInFrames`. For example, 11.2 s of scenes minus three 0.4 s transitions gives 10 s.

### Brand logos as vectors

`paystar/logoPaths.ts` was traced from `public/paystar/logo.png` with potrace. Each colour layer was traced separately, so the wordmark and the accent can animate independently. The `raster-to-svg` skill automates this; see below.

## Footage workflows (Claude Code skills)

`.claude/skills/` holds four custom skills. Each one is a script that you can also run by hand from the repo root.

### `video-analyze`: see what is in a video

```bash
npx tsx .claude/skills/video-analyze/scripts/analyze.ts <video> [--transcribe --lang fa] [--proxy]
```

The script writes `<name>.analysis/`, which contains:

- `summary.md`: the probe, a shot table, speech segments, audio peaks and silences.
- `timeline.png`: loudness and motion over time.
- Labelled contact sheets of every shot.
- `analysis.json`.
- With `--proxy`, a frame-accurate H.264 proxy at constant 30 fps that seeks reliably in Remotion.

### `video-transcribe`: local, word-timed captions

```bash
bash .claude/skills/video-transcribe/scripts/setup.sh          # once: builds whisper.cpp, downloads large-v3-turbo-q5_0
npx tsx .claude/skills/video-transcribe/scripts/transcribe.ts <video|audio> --lang fa --prompt "PayStar، Remotion"
```

The script runs whisper.cpp locally (CPU on Linux, Metal GPU on Apple Silicon): nothing is uploaded and no API key is needed. It outputs Remotion `Caption[]` JSON, SRT, VTT, TXT and a timestamped Markdown transcript. Persian is the default language, and the script handles ZWNJ (half-space) repair, Arabic → Persian letter normalization and hallucination filtering. To render the captions into a video, use the `CaptionedVideo` composition:

```bash
npm run render -- CaptionedVideo out/captioned.mp4 \
  --props='{"videoSrc":"<folder>/x.mp4","captionsSrc":"<folder>/x.captions.json"}'
```

Models and the whisper.cpp build go to `~/.cache/whisper.cpp/`, which you can override with `WHISPER_CPP_DIR`. The default model processes audio at about 2.7× real time on 8 CPU cores, so for long files, test a 60 s range first with `--start 0 --end 60`.

### `video-highlights`: exact-length social cuts

The pipeline is analyze → look → plan → fit → check → render. You write a `plan.json` with the format (`9:16`, `4:5`, `1:1` or `16:9`), the target length, the clips with in/out points and focus points, and optional narration, music, titles and transitions. Then:

```bash
npx tsx .claude/skills/video-highlights/scripts/plan.ts public/<project>/plan.json   # → edl.json, exact to the frame
npm run still  -- Highlights out/check.png --frame=<f> --props='{"edlSrc":"<project>/edl.json"}'
npm run render -- Highlights out/reel.mp4 --props='{"edlSrc":"<project>/edl.json"}'
```

The fitter makes the cut exactly `targetSeconds` long. It first stretches or shrinks photos, then trims or extends video clips within their sources, then drops clips by priority. `Highlights.tsx` renders the EDL with:

- cover/blur reframing
- Ken Burns moves on photos
- RTL-aware titles
- transitions
- narration with ducking
- captions

`EdlClips` is exported so branded reels can reuse the clip track.

### `raster-to-svg`: vectorize logos into animatable paths

```bash
npx tsx .claude/skills/raster-to-svg/scripts/trace.ts public/<video>/logo.png out/logo.svg \
  --layering cutout --ts src/remotion/<video>/logoPaths.ts
```

The script quantizes the colours, then traces each colour layer with potrace. It scores the result against the source (structural diff and ΔE) and writes a visual `preview.png`. With `--ts`, it also emits a `{ VIEWBOX, LAYERS }` module that you can animate layer by layer.

### Official Remotion skills

`.claude/skills/remotion-*` are the official [remotion-dev/skills](https://github.com/remotion-dev/skills), pinned in `skills-lock.json`. Update them with `npx skills update`. Start from `remotion-best-practices`, which routes to the rest.

## Rules for writing compositions

These rules exist because of how Remotion renders: out of order, in parallel browser tabs, and headless.

1. **Every frame must be a pure function of `useCurrentFrame()`.** Don't use wall-clock time, `requestAnimationFrame`, CSS transitions/animations or self-running timers. They render correctly in the Studio preview but break in the final output.
2. **GSAP:** create a `paused` timeline and build the tweens in a `useLayoutEffect`. Then call `tl.seek(frame / fps)` in a *second* `useLayoutEffect` declared after the first. Seeking during render runs before the tweens exist, which gives blank frames in `remotion still`. See [`GsapTitle.tsx`](src/remotion/GsapTitle.tsx).
3. **three.js / R3F:** use `<ThreeCanvas>` from `@remotion/three`, not R3F's `<Canvas>`. Drive motion with `interpolate(frame, …)`, not `useFrame`. `remotion.config.ts` sets the `angle` GL renderer, which headless WebGL needs. See [`ThreeScene.tsx`](src/remotion/ThreeScene.tsx).
4. **Assets** go in `public/` and are referenced with `staticFile()`.
5. **Motion Canvas** has its own `tsconfig.json`, because its JSX runtime is not React's. The root config excludes it. Don't import React components into Motion Canvas scenes. Scenes are imported with the `?scene` suffix.
6. **Satori** supports only a flexbox subset of CSS. Every `div` with more than one child needs `display: "flex"`. Fonts must be ttf/otf/woff, **not woff2**. Load them from `@fontsource/*/files/*.woff`.

## Version pins

| Package | Constraint | Reason |
|---|---|---|
| `remotion`, `@remotion/*` | exact, all the same version (`4.0.537`) | Remotion requires matching versions across its packages |
| `react`, `react-dom` | `~19.2` | React Three Fiber v9 needs React `<19.4` |
| `vite` | `^5` | The Motion Canvas Vite plugin needs Vite 5 |
| `typescript` | `^5` | Kept on 5.x |

To upgrade Remotion, bump every `remotion` / `@remotion/*` package together, for example with the `remotion-upgrade` skill.

## Adding a new video

1. Create `src/remotion/<name>/` with a `theme.ts`, a `Backdrop.tsx`, one file per scene, and a top-level `<Name>Promo.tsx` that follows the [promo shape](#shape-of-a-promo).
2. Reuse `shared/RevealText` and `shared/blurZoom` where they fit.
3. Put brand assets in `public/<name>/`. Vectorize logos with `raster-to-svg --ts`.
4. Register the composition in `Root.tsx`, grouped in a `<Folder>` if the video has several compositions.
5. Check that the scene lengths minus the transition overlaps equal `durationInFrames`.
6. Run `npm run typecheck`, then render stills at the key frames and look at them.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Blank frames from `npm run still` in a GSAP composition | The seek runs before the timeline is built. Keep the two-`useLayoutEffect` order. |
| Animation looks right in Studio but jitters or jumps in the render | Something isn't derived from `useCurrentFrame()` (CSS transition, timer, `useFrame`). |
| `ThreeScene` renders black or fails offline | WebGL needs the ANGLE renderer (already set), and `<Environment preset>` needs network access. |
| ffmpeg errors about `-vf` / `-filter_complex` | A script found Remotion's minimal ffmpeg. Install a full ffmpeg on `PATH`. |
| Satori: "unsupported font" or broken layout | woff2 font, or a multi-child `div` without `display: "flex"`. |
| Remotion version mismatch warning | Some `@remotion/*` package drifted. Re-pin them all to the same exact version. |
| Contact sheets have no labels | `fc-match` (fontconfig) is missing. It ships with Homebrew's ffmpeg. On Linux: `apt install fontconfig`. |
