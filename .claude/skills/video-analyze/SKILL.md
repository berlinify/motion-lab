---
name: video-analyze
description: Analyze a video file for editing decisions — technical probe and proxy advice, shot/scene cuts, per-shot motion, brightness and loudness, audio peaks, silences, optional transcript mapped to shots and sentences — and produce labelled contact sheets plus a timeline chart to look at. Use when asked what is in a video, to find the best/interesting/key moments, to plan cuts or highlights, or before editing real footage in Remotion.
---

# Video analyze

`scripts/analyze.ts` turns a video into evidence you can **look at and reason over**. It doesn't decide what's interesting. You do, by reading its outputs against the user's brief.

```bash
npx tsx .claude/skills/video-analyze/scripts/analyze.ts <video> [--transcribe --lang fa --prompt "…"] [--proxy]
```

It writes to `<video dir>/<name>.analysis/` (or `--out DIR`):

| File | What it's for |
|---|---|
| `summary.md` | **Read first.** Probe, proxy advice, a shot table, speech segments, audio peaks and silences |
| `timeline.png` | Loudness and motion over time, with cuts (white lines), audio peaks (red), silences (grey) and speech (yellow). It shows the shape of the video at a glance |
| `sheets/contact-NN.png` | Every shot as a labelled tile (`#shot start duration`). Tiles follow the display orientation (portrait 180×320 for phone-vertical video). Shots over 15 s get an extra tile every 10 s (`#shot @ time`). **These are your eyes on the footage** |
| `analysis.json` | Everything in machine form. `shots[]`, `segments[]`, `audioPeaks[]` and `silences[]` feed the highlights edit |
| `thumbs/` | The individual tiles |
| `<name>.proxy.mp4` | Only with `--proxy`: H.264, constant 30 fps, long side ≤1920 (1080×1920 for phone-vertical), 1 s keyframe interval. Fast and frame-accurate in Remotion |

Speed: the 10.5 min test file (480p VP9, 60 fps) took about 58 s on 8 cores, roughly 11× faster than real time. `--transcribe` adds the transcription time (about 2.7× real time for Persian on CPU, see `video-transcribe`).

## Workflow

1. **Run it.**
   - Add `--transcribe` whenever the footage has speech that matters: interviews, talks, vlogs, podcasts.
   - If a proofread `captions.json` already exists, pass it with `--captions FILE` instead of transcribing again.
   - Add `--proxy` when the summary says a proxy is recommended **and** the video will be edited in Remotion.
2. **Read `summary.md`, then `timeline.png`, then every contact sheet.** Don't pick or describe moments from numbers alone. The signals measure motion and loudness, not meaning. On the test film, the closing credits (2 min of scrolling text over music) scored as "high energy" and produced audio peaks. Only the contact sheets showed it was credits.
3. **Answer the brief from the evidence.**
   - Cite shots as `#N (mm:ss)` and speech as segment numbers. They map directly to the timestamps in `analysis.json`.
   - When the summary and the sheets disagree, trust the sheets.

## Reading the signals

| Signal | Meaning | Watch out for |
|---|---|---|
| `motion` | Mean absolute frame difference at 10 fps (0 = static, about 20+ = fast action or a whip-pan) | Scrolling text, camera shake and noise all read as motion |
| `loudness` / `peakLoudness` | Momentary LUFS (400 ms window). About -23 is normal programme level; above -15 is loud | Music beds, not just events. A peak is "loud", not necessarily "exciting" |
| `energy` | A z-score blend of motion and loudness, **relative to this video** | A hint for where to look first, never a ranking to trust |
| `audioPeaks` | Up to 15 local loudness maxima, at most 2 per shot | Laughter, applause, impacts and music swells all look the same |
| `segments` (with a transcript) | Sentence units with timing, `wordsPerMin` and loudness | Fast, loud sentences often mark emphasis. Slow ones are often reading, lists or asides |
| `silences` | Gaps below `--silence-db` | Natural cut points, and dead air to trim |

For **talking-head or single-shot footage**, the shot table is nearly empty, so work from `segments`. For **edited or action footage**, work from shots and the sheets.

## Tuning

| Symptom | Fix |
|---|---|
| Flashes or fast pans counted as cuts | Raise `--scene-threshold` (12 → 18) |
| Real cuts missed (similar-looking shots, dissolves) | Lower it (12 → 8). Slow dissolves and fades are a known weak spot of frame-difference detection |
| Too many tiny shots | Raise `--min-shot` |
| Room tone counted as speech, or pauses missed | Adjust `--silence-db` (-35 → -30 for noisy rooms, -45 for quiet studios) |

## Limits

- No face, object or OCR detection. Anything about *what* is on screen comes from you reading the sheets.
- Loudness can't tell laughter from music.
- Shot detection uses frame differences only, so gradual transitions may be merged into a neighbouring shot.
