---
name: video-highlights
description: Cut a set of videos and photos into a social clip (9:16 by default, also 4:5, 1:1, 16:9) of an exact target length, with optional narration plus burned-in captions, music, titles and transitions, rendered in Remotion. Use when asked for highlights, a reel, a short, a recap, a trailer or a montage from real footage and/or photos, especially with a maximum or target duration.
---

# Video highlights

The pipeline is **analyze → look → plan → fit → check → render**. You make the editorial decisions. The scripts handle everything that has to be exact: source bounds, transition overlaps, the target length to the frame, and audio ducking.

## 1. Gather the brief

- **Target length** (seconds). It is hit **exactly**: "max 30 s" means a 30.000 s cut.
- **Format**: `9:16` is the default for social. Also `4:5`, `1:1`, `16:9`.
- **Story and tone**: what it's about, what to open on, and how it ends (an end card or title?).
- **Sound**: narration (whose and which part), music, or the natural sound of the clips.
- **Transitions: only if the user asks.** Hard cuts are the social default. When asked, use them sparingly: one at a section change and one into the end card.

## 2. Analyze and look

Put the sources under `public/<project>/`. For each video:

```bash
npx tsx .claude/skills/video-analyze/scripts/analyze.ts public/<project>/<clip> --proxy --out public/<project>/<clip>.analysis [--transcribe --lang fa]
```

Always use `--proxy`. The plan must reference the `.proxy.mp4` files, because they're H.264 at constant 30 fps and seek reliably in Remotion. Then **read every contact sheet**: the numbers alone can't tell you what's watchable. For photos:

```bash
bash .claude/skills/video-highlights/scripts/photos.sh out/photos.png public/<project>/*.jpg
```

From the sheets, note for each candidate moment: the source and time range, what is visible, and where the subject sits horizontally (that becomes `focusX`).

## 3. Write `plan.json`

Times are in seconds, and paths are relative to `public/`:

```jsonc
{
  "format": "9:16", "fps": 30, "targetSeconds": 30,
  "transition": { "type": "none" },                 // default between clips: none|fade|slide|wipe|blurZoom
  "narration": { "src": "p/voice.mp4", "in": 0.5, "out": 18.0, "at": 0.6,
                 "captions": "p/voice.captions.json", "duckTo": 0.12 },   // optional
  "music": { "src": "p/track.mp3", "volume": 0.35, "duckTo": 0.12 },       // optional
  "clips": [
    { "type": "photo", "src": "p/a.jpg", "seconds": 3, "kenBurns": "in", "focusX": 0.5, "title": "نوروز", "priority": 1 },
    { "type": "video", "src": "p/b.analysis/b.proxy.mp4", "in": 9.0, "out": 12.0, "focusX": 0.75, "priority": 1 },
    { "type": "video", "src": "p/c.analysis/c.proxy.mp4", "in": 16.2, "out": 19.0, "fit": "blur",
      "transition": { "type": "fade", "seconds": 0.5 } }   // transition *after* this clip
  ]
}
```

| Field | Meaning |
|---|---|
| `fit` | `cover` crops to fill the frame, centring `focusX` / `focusY`: **the subject's position in the source** (0 = left/top, 1 = right/bottom), clamped at the edges. `blur` shows the whole frame over a blurred copy of itself. The default is `cover` when a focus point is given or the source is roughly the canvas shape, otherwise `blur` |
| `kenBurns` | Photo motion: `in`, `out`, `left`, `right` or `none`. Defaults rotate through them |
| `priority` | 1 = must keep, 3 = first to drop if the cut can't fit |
| `volume` | Source audio level (default 1). It's ducked to `narration.duckTo` while the narration plays |
| `sourceAudio` (plan level) | `false` mutes every clip, for music-only cuts |
| `title` | Large text over the clip. Use it for the hook and the end card. RTL-aware |

**Social editing defaults:**
- The strongest image plus a title in the first 1–2 s.
- Most cuts 1.5–3 s.
- Vertical sources, or a clear subject, use `cover`. Wide shots where the subject is small or spread out use `blur`.
- Narration ends on a sentence boundary: check the `segments` in the transcript analysis.
- Natural sound (fire, music, crowds) carries the parts without narration.

## 4. Fit, check, render

```bash
npx tsx .claude/skills/video-highlights/scripts/plan.ts public/<project>/plan.json      # → public/<project>/edl.json
```

The fitter makes the total exactly `targetSeconds`:
1. Photos stretch or shrink first (1.5–6 s each).
2. Then video clips extend or trim within their source.
3. Then clips are dropped, highest `priority` number first.

It fails loudly when there isn't enough material. It also prints the timeline, warnings (`!` lines, e.g. a source upscaled more than 2.5× to cover, or narration running past the end), and `check frames`.

Render the check frames as stills and **look at them** before the full render:

```bash
npm run still -- Highlights out/check.png --frame=<f> --scale=0.5 --props='{"edlSrc":"<project>/edl.json"}'
npm run render -- Highlights out/<name>.mp4 --props='{"edlSrc":"<project>/edl.json"}'
```

Then verify the result: `ffprobe` should show `nb_frames` = target × fps.

## Branded wrappers (intro / outro / overlays)

`Highlights.tsx` exports `EdlClips`, which is just the clip timeline. A custom composition can put it in a `TransitionSeries.Sequence` between its own intro and outro scenes, and add overlays (a mascot, a logo bug) and music on top. Fit the plan's `targetSeconds` to the **body** length: total minus intro and outro, plus the transition overlaps. Give such a composition a `guides` prop that tints the Instagram Reels UI zones, and render check stills with it on.

**Instagram Reels safe area** (1080×1920): keep text and overlays out of the top ~250 px, the bottom ~420 px and the right ~150 px between y≈900 and y≈1500. A landscape source cropped to 9:16 has no vertical room, so a sign or text at the top of the frame lands under the UI. Use `blur` fit for those shots.

## What the demo taught

These are from the "Nowruz in 30 seconds" test: 4 videos and 5 photos, with Persian narration.
- Captions need the backing box (`boxed`) on busy footage. Shadow alone was unreadable over a haft-sin photo.
- Sources of 640×416 and 854×480 cropped to 9:16 (4–4.6× upscale) looked soft. `blur` fit fixed both. 1280×720 at 2.7× was acceptable for a small bright subject (a sparkler).
- One clip that looked fine on the contact sheet (a sky lantern at 1:01) was an unreadable close-up in a 9:16 crop. Only the still check caught it. Drop such clips and re-fit.

## Limits

- One static focus point per clip, with no automatic subject tracking. Split a clip in two if the subject moves across the frame.
- No beat-synced cutting yet.
- Narration is a single range of a single file.
