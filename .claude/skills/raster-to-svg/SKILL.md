---
name: raster-to-svg
description: Convert a raster image (PNG/JPG logo, icon, illustration, mascot, line art, or a photo for a posterized look) into an accurate, layered SVG — one path per color — with a measured accuracy score and a visual diff. Use when asked to vectorize, trace, or "make an SVG of" an image, or when a brand asset needs to become animatable paths for Remotion / Motion Canvas.
---

# Raster → SVG

`scripts/trace.ts` quantizes the image's colors, traces each color layer with potrace on an upscaled and smoothed mask, then re-renders the SVG with resvg and scores it against the source. Accuracy is a number plus a diff image, not a guess.

Dependencies are already in the repo: `potrace`, `jimp` and `@resvg/resvg-js`. Run everything from the repo root.

## Workflow

1. **Look at the image first** with Read, and pick a preset:

   | Image | Preset | Notes |
   |---|---|---|
   | Logo, flat illustration, mascot, sticker | `logo` (default) | Auto color count, up to 10 |
   | Single-ink line art, scanned signature, mono icon | `lineart` | 2 colors |
   | Photo, textured or painterly art | `poster` | A *stylized* result. Tell the user plainly that photos don't vectorize faithfully |

2. **Trace:**
   ```bash
   npx tsx .claude/skills/raster-to-svg/scripts/trace.ts <input> <out.svg> [--preset …] [options]
   ```
   The script prints JSON: palette, layers (bottom → top, with area %) and metrics. It also writes `<out>.report/preview.png` (source | SVG | structural diff heatmap) and `metrics.json`.

3. **Read `preview.png`.** Red in the heatmap marks where the SVG differs in a way you can actually see. For close-ups, use:
   ```bash
   npx tsx .claude/skills/raster-to-svg/scripts/zoom.ts <src> <out.svg> <zoom.png> <x> <y> <w> <h> [factor]
   ```

4. **Iterate** using the symptom table below until the metrics and the zoom look right. Usually this takes 1–3 runs.

5. **Deliver.** Rename the generic `layer-N` ids to meaningful ones (`wordmark`, `accent`, `eyes`). For Remotion, emit a TS module with `--ts` (see below).

## Reading the metrics

| Metric | Meaning | Targets |
|---|---|---|
| `structuralBadPct` | **Headline number.** Share of drawn pixels that still differ after a 5×5 blur. Ignores ½px antialiasing shifts, but catches lost strokes, text and specks | Flat logo < 1 · illustration < 3 · poster < 8 |
| `interiorMeanDeltaE` / `interiorBadPct` | Color accuracy inside flat fills | Mean ΔE < 2 is visually exact. Above 3 means the palette needs more or better colors |
| `edgeBadPct` | Raw antialiasing mismatch | Always 30–50%. Only compare it between runs of the same image |
| `svgBytes` | Output size | Watch it when raising `--scale`, `--colors` or lowering `--turd` |

Reference results: a flat two-colour wordmark logo (500×125) scored structural 0.46%, interior ΔE 0, 2 layers, 40 KB. A mascot illustration scores structural 1.7%, 10 layers, about 500 KB.

## Symptom → knob

| Symptom (in the preview or zoom) | Fix |
|---|---|
| Shading bands merged / flat area has the wrong tone | `--colors N` higher, or `--max-colors` higher in auto mode |
| Exact brand colors required | `--palette "#000066,#ffcc00"`. This skips k-means and gives the best accuracy for known brands |
| Two near-identical shades should be one | Lower `--colors`, or raise `--merge-de` |
| Wobbly / lumpy edges | Raise `--smooth` (0.6 → 0.9) |
| Sharp corners rounded off | Lower `--smooth`, and `--alpha-max 0.6` |
| Thin strokes, small text or specks lost | `--turd 1`, `--smooth 0.3`, `--scale 10` |
| Noise specks | Raise `--turd` |
| Solid backdrop wrongly dropped / kept | `--keep-bg`. The background is auto-detected when one opaque color covers more than 85% of the border |
| Too slow / huge file | Lower `--scale`. Cost grows with scale², and about 30 s for a 500 px image at ×8 is normal |

**Small text inside artwork** (author names, taglines) never traces cleanly. Recommend real text with the actual font instead, and keep it out of the trace.

## Layering: `stacked` vs `cutout`

- `stacked` (default): each layer extends underneath the layers above it. There are no seams, and it gives the best static accuracy.
- `cutout`: layers don't overlap. Use it when layers are **animated independently**, e.g. an accent that flies in separately. With `stacked`, the layer below would have a blob of color where the accent sits.

Every layer except the bottom one is grown by about ¼px in both modes, so neighbours meet without hairline gaps.

## Using the output in Remotion

```bash
npx tsx .claude/skills/raster-to-svg/scripts/trace.ts public/<video>/logo.png out/logo.svg \
  --layering cutout --ts src/remotion/<video>/logoPaths.ts
```

The generated module exports `VIEWBOX`, optionally `BACKGROUND`, and `LAYERS` (`{ id, fill, d }[]`, bottom → top), with coordinates in source pixels:

```tsx
import { LAYERS, VIEWBOX } from "./logoPaths";

<svg viewBox={VIEWBOX} width={width}>
  {LAYERS.map((l, i) => (
    <path key={l.id} d={l.d} fill={l.fill} fillRule="evenodd"
      style={{ opacity: interpolate(frame, [i * 4, i * 4 + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }} />
  ))}
</svg>
```

Animate from `frame` only (see the repo invariants in CLAUDE.md). The paths are filled outlines, not centerlines. A "draw-on" effect therefore means stroking the outline (`@remotion/paths` `evolvePath`) and then fading in the fill, or revealing the fill with a mask. A true single-stroke centerline trace isn't supported yet.

## Limits

- Palettes are capped at 30 colors.
- Gradients become bands of flat color. More colors make the bands finer, but no gradient is reconstructed.
- Photos give a poster look, never a faithful vector.
- The faint ring of an in-between color can survive around thin features whose own color isn't in the palette (e.g. a dark olive outline on yellow). Check it in a zoom, and add that color with `--palette` if it matters.
