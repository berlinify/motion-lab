---
name: video-transcribe
description: Transcribe a video or audio file (Persian by default, also English, mixed, or any whisper language) locally on CPU into word-timed captions — Remotion Caption JSON, SRT, VTT, plain text and a timestamped Markdown transcript — and optionally burn them into the video as animated, RTL-aware captions. Use when asked to transcribe, subtitle, caption, or get the text/timestamps of a video or recording.
---

# Video transcribe

`scripts/transcribe.ts` extracts 16 kHz mono audio with ffmpeg and runs **whisper.cpp** locally. It runs on CPU, so nothing is uploaded and no API key is needed. Silero VAD is on by default. The script writes one segment per word, so every word carries its own start and end time. These are the outputs:

| File | Use |
|---|---|
| `<name>.captions.json` | Remotion `Caption[]` (word-level). Feed it to `<Captions>` / `CaptionedVideo` |
| `<name>.srt`, `<name>.vtt` | Subtitle files for players, YouTube and editors. RTL cues are prefixed with U+200F |
| `<name>.txt` | Plain text, with paragraphs split at long pauses |
| `<name>.md` | Transcript with a `[mm:ss]` stamp per paragraph (RTL-wrapped for Persian) |

## Setup (once per machine)

```bash
bash .claude/skills/video-transcribe/scripts/setup.sh                    # whisper.cpp + large-v3-turbo-q5_0
bash .claude/skills/video-transcribe/scripts/setup.sh large-v3-q5_0      # optional: second opinion when turbo struggles
```

This builds whisper.cpp v1.9.5 and downloads the models into `~/.cache/whisper.cpp/`, which is shared across projects. Override the location with `WHISPER_CPP_DIR`. There is no usable GPU on this machine, so everything runs on CPU.

## Workflow

1. **Ask, or infer, three things**:
   - The language: `fa` is the default. Use `en`, or `auto` for unknown or mixed audio.
   - Names, brands and jargon that must be spelled right. These go in `--prompt`.
   - What the user wants out: a transcript, subtitle files, or burned-in captions.
2. **For long files, test on a range first.** Use `--start 0 --end 60` and check speed and quality before committing to an hour of CPU time.
3. **Run:**
   ```bash
   npx tsx .claude/skills/video-transcribe/scripts/transcribe.ts <video|audio> \
     --lang fa --prompt "PayStar، فرنام، Remotion" [--out DIR] [--model …]
   ```
   The script prints a JSON summary: language, `realtimeFactor` (processing time ÷ audio length), word and cue counts, `droppedAsHallucination` and `lowConfidenceWords`.
4. **Proofread. This step is not optional for Persian.** Read the `.md` and fix the errors:
   - Edit the `text` fields in `<name>.captions.json`. Keep each word's leading space, and never touch `startMs` / `endMs`.
   - Then regenerate the other formats from the corrected JSON. No re-transcription is needed:
     ```bash
     npx tsx .claude/skills/video-transcribe/scripts/transcribe.ts <dir>/<name>.captions.json --lang fa
     ```
   - Recurring names belong in `--prompt` on the next run, not in manual fixes.
   - Words below 0.4 confidence are the first places to check.
5. **Deliver** the requested files. For burned-in captions, see the next section.

## Burned-in captions (Remotion)

- `src/remotion/shared/Captions.tsx` is the reusable component. It shows word-synced pages, highlights the word being spoken, and picks the direction (RTL/LTR) per page by majority script, so a Persian line opening with "PayStar" still reads right-to-left. Fonts are Vazirmatn for Persian with Inter for Latin.
- The `CaptionedVideo` composition takes `videoSrc` and `captionsSrc` (both paths inside `public/`). `calculateMetadata` reads the video's duration and size and loads the captions.

```bash
cp <name>.captions.json public/<folder>/
npm run still  -- CaptionedVideo out/check.png --frame=120 --props='{"videoSrc":"<folder>/x.mp4","captionsSrc":"<folder>/x.captions.json"}'
npm run render -- CaptionedVideo out/captioned.mp4 --props='{…same…}'
```

Caption timestamps are relative to the start of the **source file**. Even with `--start`, the times stay aligned to the untrimmed file. When a clip is trimmed inside a larger edit, put the trim on the `<Sequence>` that wraps both the `<Video>` and the `<Captions>`. Don't shift the timestamps.

## Models (CPU, 8 cores)

| Model | Size | Persian quality | Speed (measured) |
|---|---|---|---|
| `large-v3-turbo-q5_0` (default) | 547 MB | Good. Words and structure are right, but about 1 word in 10 has a homophone spelling error. Proofread | **2.7× real time** (60 s of audio takes about 165 s, so 1 h of audio takes about 2.7 h) |
| `large-v3-q5_0` | 1.1 GB | **Not better** on the test clip: it made more errors than turbo (≈19 vs ≈15 in 150 words), including Latin garbage inside a Persian word ("فévری"). Try it only when turbo fails on a specific recording | 6.2× real time |
| `base-q5_1` | 60 MB | Poor. Many words are misheard | 0.6× real time. Only for pipeline smoke tests |

For long recordings, run in the background and test a 60 s range first. The comparison above comes from one clip (60 s of formal read Persian, one speaker), so re-check it on conversational audio before generalizing.

`--translate` translates speech **to English** only, because whisper can't translate into other languages. For Persian subtitles from English audio, transcribe in English and then translate the text yourself.

## Persian specifics

- **Homophone spellings are the main error class.** Persian has several letters for the same sound, and Whisper picks the wrong one: ث/س/ص, ح/ه, ذ/ز/ض/ظ, ت/ط, ع/ء. Real examples from a test run: بحار→بهار, محصوب→محسوب, تصریب→تصویب, میراس→میراث, خرشیدی→خورشیدی, آزروایجان→آذربایجان, تحتیل→تعطیل. These are easy to fix in proofreading, because the context makes the right spelling obvious.
- Half-spaces (ZWNJ) are restored automatically for می/نمی prefixes and ها/های suffixes ("می شود" → "می‌شود"), with the merged word spanning both timings. Other compounds ("غیر ملموس" → "غیرملموس") need a proofreading pass.
- Arabic `ي` / `ك` are normalized to Persian `ی` / `ک`.
- VAD plus a line filter removes Whisper's learned hallucinations in silence ("زیرنویس …", "Thanks for watching"). Their count is reported as `droppedAsHallucination`.
- Whisper writes some colloquial speech phonetically (e.g. "میرن" for "می‌روند"). Decide with the user whether subtitles should be verbatim or normalized to formal written Persian.

## Limits

- No speaker labels (diarization).
- Overlapping speech and loud music reduce accuracy.
- Word timings are accurate to about ±100–200 ms. That's fine for highlighting, but too coarse for frame-exact cuts.
