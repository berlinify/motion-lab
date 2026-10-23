# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This is a programmatic video generation repo. It uses three separate rendering pipelines that share one `package.json`:

| Pipeline | Entry | Used for |
|---|---|---|
| **Remotion** (React → MP4) | `src/remotion/index.ts` → `Root.tsx` | Main video output. GSAP and three.js / React Three Fiber / drei scenes run inside Remotion compositions. |
| **Motion Canvas** (generator scenes → frames/MP4) | `src/motion-canvas/project.ts`, served by `vite.config.ts` | Explainer-style, code-driven 2D animation built with its own editor. |
| **Satori + resvg** (JSX → SVG → PNG) | `scripts/thumbnail.tsx` | Static images: thumbnails, title cards, and overlays to bring into either pipeline. |

FFmpeg: a full system ffmpeg (v9, with filters such as `scdet`, `silencedetect`, `ebur128`) is installed at `/usr/bin/ffmpeg`, and the analysis and transcription scripts use it. Remotion also bundles its own (`npx remotion ffmpeg …` / `npx remotion ffprobe …`), a minimal build without `-vf`/`-filter_complex` that can only transcode, concatenate, and mux. Motion Canvas uses `@motion-canvas/ffmpeg` with `@ffmpeg-installer` binaries. To inspect a frame of a composition, render it with `npm run still`.

## Video projects

Each video lives in its own folder under `src/remotion/` (`promo/` = Claude Code, `paystar/` = PayStar), and each is registered in `Root.tsx`. Helpers shared across videos, such as `RevealText` (per-glyph spring/blur reveal) and the `blurZoom` transition, live in `src/remotion/shared/`. Every promo follows the same shape: a continuous `Backdrop` sits *outside* a `TransitionSeries` of scenes. Scene lengths minus the transition overlaps must add up to the composition's `durationInFrames`.

- **Brand logos as vectors:** `paystar/logoPaths.ts` was traced from `public/paystar/logo.png` using the `potrace` dev dependency. Each colour layer was blurred and upscaled before tracing, to remove pixel stair-steps. Tracing each colour separately lets the wordmark and the accent animate independently.
- **Captions:** the `video-transcribe` skill (`.claude/skills/video-transcribe/`) turns a video into word-timed `Caption[]` JSON plus SRT/VTT/TXT/MD with local whisper.cpp. `shared/Captions.tsx` renders them with word highlighting and right-to-left (RTL) handling, and `captioned/CaptionedVideo.tsx` burns them into any video in `public/`.
- **Animated icon loops** (`paystar/icons.tsx` with `IconLoop.tsx`): the icon draws on from `start` and undraws from `end`, so a standalone render loops seamlessly. For a transparent render, add: `--codec=vp9 --image-format=png --pixel-format=yuva420p --props='{"icon":"routing","background":false}'`.

## Commands

```bash
npm run studio                                   # Remotion Studio (preview/edit compositions)
npm run render -- <CompositionId> out/x.mp4      # render a composition
npm run render -- ThreeScene out/t.mp4 --frames=0-9   # render a frame range (fast smoke test)
npm run still  -- GsapTitle out/f.png --frame=60      # render one frame (quick visual check)
npm run render -- GsapTitle out/x.mp4 --props='{"title":"Hi"}'
npm run mc                                       # Motion Canvas editor (Vite); render from its UI → output/
npm run thumbnail -- "Title" out/thumb.png       # Satori thumbnail
npm run typecheck                                # tsc over src/remotion, scripts
```

There is no test suite. To verify a change, render a still at a frame where the change is visible and look at the PNG.

## Architecture & invariants

- **Everything in Remotion must be a pure function of `useCurrentFrame()`.** Remotion renders frames out of order and in parallel tabs, so wall-clock time, `requestAnimationFrame`, CSS transitions, and self-running timers produce broken output.
- **GSAP inside Remotion** (`src/remotion/GsapTitle.tsx` is the reference pattern): create a `paused` timeline, build the tweens in a `useLayoutEffect`, then call `tl.seek(frame / fps)` in a *second* `useLayoutEffect` declared after it. Seeking during render runs before the tweens exist, which gives blank frames in `remotion still`.
- **3D inside Remotion**: use `<ThreeCanvas>` from `@remotion/three`, not R3F's `<Canvas>`. Drive motion from `frame` via `interpolate`, not from `useFrame`. `remotion.config.ts` sets the `angle` GL renderer, which headless WebGL needs. drei's `<Environment preset=…>` downloads HDRIs from a CDN at render time, so it needs network access.
- **Version pins:** all `remotion` / `@remotion/*` packages must be on the same exact version (currently pinned without `^`). R3F v9 needs React `<19.4`, so React is held at `~19.2`. Motion Canvas's vite plugin needs Vite 5, and TypeScript stays on 5.x.
- **Motion Canvas has its own TS config** (`src/motion-canvas/tsconfig.json`, which extends `@motion-canvas/2d`) because its JSX runtime differs from React. The root `tsconfig.json` deliberately excludes it, so don't mix React components into Motion Canvas scenes. Scenes are imported with the `?scene` suffix.
- **Satori** supports only a flexbox subset of CSS, and every multi-child `div` needs `display: "flex"`. Fonts must be ttf/otf/woff, *not* woff2. They come from `@fontsource/inter/files/*.woff`.
- Static assets for Remotion go in `public/` and are referenced with `staticFile()`. Renders go to `out/` (Remotion/Satori) and `output/` (Motion Canvas). Both folders are gitignored.

## Remotion agent skills

The official Remotion skills are installed in `.claude/skills/remotion-*`, tracked by `skills-lock.json`; update them with `npx skills update`. Before writing or changing Remotion code, load `remotion-best-practices`. It routes to the others: create, render, captions, multimedia, studio, maps, interactivity, upgrade, docs.
