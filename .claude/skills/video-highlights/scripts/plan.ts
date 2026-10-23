// Edit plan (seconds, written by hand/Claude) → frame-exact EDL for the Highlights
// composition. Validates every clip against its real source, then fits the cut to the
// target length *exactly*: photos stretch/shrink first, then video clips extend/trim
// within their source, then low-priority clips are dropped.
//
//   npx tsx .claude/skills/video-highlights/scripts/plan.ts <plan.json> [--out edl.json]
//
// Paths inside the plan are relative to public/ (what staticFile() expects).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Caption } from "@remotion/captions";

type Fit = "cover" | "blur";
type TransitionType = "none" | "fade" | "slide" | "wipe" | "blurZoom";
type Transition = { type: TransitionType; seconds?: number };

type PlanClip =
  | { type: "video"; src: string; in: number; out: number; fit?: Fit; focusX?: number; focusY?: number; volume?: number; priority?: number; title?: string; transition?: Transition; note?: string }
  | { type: "photo"; src: string; seconds: number; fit?: Fit; focusX?: number; focusY?: number; kenBurns?: "in" | "out" | "left" | "right" | "none"; priority?: number; title?: string; transition?: Transition; note?: string };

type Plan = {
  title?: string;
  format?: "9:16" | "4:5" | "1:1" | "16:9";
  fps?: number;
  targetSeconds: number;
  transition?: Transition;
  clips: PlanClip[];
  narration?: { src: string; in: number; out: number; at?: number; volume?: number; captions?: string; duckTo?: number };
  music?: { src: string; in?: number; volume?: number; duckTo?: number };
};

const SIZES = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "16:9": [1920, 1080] } as const;
const PHOTO_MIN = 1.5, PHOTO_MAX = 6, VIDEO_MIN = 1.0;

const args = process.argv.slice(2);
if (!args[0] || args[0] === "--help") {
  console.log("Usage: plan.ts <plan.json> [--out edl.json]   (paths in the plan are relative to public/)");
  process.exit(1);
}
const planPath = args[0];
const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(path.dirname(planPath), "edl.json");
const plan: Plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const pub = (p: string) => path.join("public", p);
const notes: string[] = [];

function probe(src: string) {
  const r = spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", pub(src)]);
  if (r.status !== 0) throw new Error(`Cannot read ${pub(src)}: ${r.stderr.toString().trim()}`);
  const j = JSON.parse(r.stdout.toString());
  const v = j.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  return {
    duration: Number(j.format.duration ?? v?.duration ?? 0),
    width: Number(v?.width ?? 0),
    height: Number(v?.height ?? 0),
    hasAudio: j.streams.some((s: { codec_type: string }) => s.codec_type === "audio"),
  };
}

const fps = plan.fps ?? 30;
const [width, height] = SIZES[plan.format ?? "9:16"];
const F = (s: number) => Math.round(s * fps);
const target = F(plan.targetSeconds);
const defaultTr: Transition = plan.transition ?? { type: "none" };

// ---------- resolve + validate ----------

type Item = {
  plan: PlanClip; type: "video" | "photo"; src: string; width: number; height: number;
  sourceFrames: number; inF: number; frames: number; minF: number; maxF: number; priority: number; hasAudio: boolean;
};

const errors: string[] = [];
let items: Item[] = plan.clips.map((c, i) => {
  const info = probe(c.src);
  const priority = c.priority ?? 2;
  if (c.type === "video") {
    const srcF = Math.floor(info.duration * fps);
    if (!(c.in >= 0 && c.out > c.in)) errors.push(`clip ${i + 1}: in/out must satisfy 0 ≤ in < out (got ${c.in}–${c.out})`);
    if (c.out > info.duration + 0.05) errors.push(`clip ${i + 1}: out ${c.out}s is past the end of ${c.src} (${info.duration.toFixed(2)}s)`);
    return { plan: c, type: "video", src: c.src, width: info.width, height: info.height, sourceFrames: srcF, inF: F(c.in), frames: Math.min(F(c.out), srcF) - F(c.in), minF: F(VIDEO_MIN), maxF: srcF, priority, hasAudio: info.hasAudio };
  }
  return { plan: c, type: "photo", src: c.src, width: info.width, height: info.height, sourceFrames: Infinity, inF: 0, frames: F(c.seconds), minF: F(PHOTO_MIN), maxF: F(PHOTO_MAX), priority, hasAudio: false };
});
if (errors.length) {
  console.error("Plan errors:\n- " + errors.join("\n- "));
  process.exit(1);
}

// Transition i sits between items i and i+1; a clip's own `transition` overrides the default.
const trFrames = (list: Item[]) =>
  list.slice(0, -1).map((it) => {
    const t = it.plan.transition ?? defaultTr;
    return { type: t.type, frames: t.type === "none" ? 0 : F(t.seconds ?? 0.4) };
  });
const total = (list: Item[]) => list.reduce((n, it) => n + it.frames, 0) - trFrames(list).reduce((n, t) => n + t.frames, 0);

// ---------- fit to target ----------

// Room for a clip to grow: photos up to PHOTO_MAX; video forward to the source end, then backward.
const growRoom = (it: Item) => (it.type === "photo" ? it.maxF - it.frames : it.sourceFrames - it.frames);
const shrinkRoom = (it: Item) => it.frames - it.minF;

// Returns the signed number of frames that could not be absorbed.
function adjust(list: Item[], diff: number) {
  const grow = diff > 0;
  let remaining = Math.abs(diff);
  // Photos absorb first, then videos; spread proportionally to current length.
  for (const kind of ["photo", "video"] as const) {
    while (remaining > 0) {
      const pool = list.filter((it) => it.type === kind && (grow ? growRoom(it) : shrinkRoom(it)) > 0);
      if (!pool.length) break;
      const sum = pool.reduce((n, it) => n + it.frames, 0);
      let moved = 0;
      for (const it of pool) {
        const share = Math.max(1, Math.round((remaining * it.frames) / sum));
        const d = Math.min(share, grow ? growRoom(it) : shrinkRoom(it), remaining - moved);
        if (d <= 0) continue;
        if (grow && it.type === "video") {
          // Extend the out point first; only reach back before `in` when the source ends.
          const forward = Math.min(d, it.sourceFrames - (it.inF + it.frames));
          it.inF -= d - forward;
        }
        it.frames += grow ? d : -d;
        moved += d;
      }
      if (!moved) break;
      remaining -= moved;
    }
  }
  return grow ? remaining : -remaining;
}

let diff = target - total(items);
const before = total(items);
diff = adjust(items, diff);
while (diff < 0 && items.length > 1) {
  // Still too long at minimum lengths: drop the least important clip (highest priority number, then shortest).
  const drop = [...items].sort((a, b) => b.priority - a.priority || a.frames - b.frames)[0];
  notes.push(`dropped clip ${plan.clips.indexOf(drop.plan) + 1} (${drop.src}, priority ${drop.priority}) — not enough room for the target`);
  items = items.filter((it) => it !== drop);
  diff = adjust(items, target - total(items));
}
if (diff > 0) {
  console.error(`Not enough material: the plan is ${((target - diff) / fps).toFixed(2)}s at maximum length, target is ${plan.targetSeconds}s. Add clips or photos.`);
  process.exit(1);
}

// Transitions can't be longer than either neighbour.
const trs = trFrames(items);
trs.forEach((t, i) => {
  const cap = Math.min(items[i].frames, items[i + 1].frames) - 1;
  if (t.frames > cap) {
    notes.push(`transition ${i + 1} shortened ${t.frames}→${cap} frames to fit its clips`);
    items[i + 1].frames += t.frames - cap; // keep the total unchanged
    t.frames = cap;
  }
});
if (total(items) !== target) throw new Error(`internal: fitted ${total(items)} ≠ target ${target}`);

// ---------- narration / music ----------

let narration = null;
if (plan.narration) {
  const n = plan.narration;
  const info = probe(n.src);
  if (n.out > info.duration + 0.05) throw new Error(`narration out ${n.out}s is past the end of ${n.src}`);
  const at = n.at ?? 0;
  const len = n.out - n.in;
  if (F(at + len) > target) notes.push(`narration runs ${(at + len - plan.targetSeconds).toFixed(2)}s past the end — it will be cut; end it on an earlier sentence`);
  let captions: Caption[] = [];
  if (n.captions) {
    const all: Caption[] = JSON.parse(fs.readFileSync(pub(n.captions), "utf8"));
    // Shift into timeline time; drop words outside the used range.
    captions = all
      .filter((w) => w.startMs >= n.in * 1000 - 50 && w.endMs <= n.out * 1000 + 50)
      .map((w) => ({ ...w, startMs: w.startMs - n.in * 1000 + at * 1000, endMs: w.endMs - n.in * 1000 + at * 1000, timestampMs: w.timestampMs === null ? null : w.timestampMs - n.in * 1000 + at * 1000 }));
    if (captions[0]) captions[0] = { ...captions[0], text: captions[0].text.trimStart() };
  }
  narration = { src: n.src, startFrame: F(at), trimBefore: F(n.in), durationInFrames: Math.min(F(len), target - F(at)), volume: n.volume ?? 1, duckTo: n.duckTo ?? 0.12, captions };
}
const music = plan.music ? { src: plan.music.src, trimBefore: F(plan.music.in ?? 0), volume: plan.music.volume ?? 0.35, duckTo: plan.music.duckTo ?? 0.12 } : null;

// Each clip's first frame on the global timeline (transitions overlap neighbours).
const starts: number[] = [];
items.reduce((t, it, i) => ((starts[i] = t), t + it.frames - (trs[i]?.frames ?? 0)), 0);

// ---------- write ----------

const edl = {
  title: plan.title ?? path.basename(planPath, ".json"),
  fps, width, height, durationInFrames: target,
  clips: items.map((it, i) => ({
    type: it.type, src: it.src, startFrame: starts[i], durationInFrames: it.frames, trimBefore: it.inF,
    srcWidth: it.width, srcHeight: it.height,
    // Default: crop (cover) when a focus point was given or the source is at least as tall as the
    // canvas shape; otherwise letterbox over a blurred copy so nothing important is cut off.
    fit: it.plan.fit ?? (it.plan.focusX !== undefined || it.plan.focusY !== undefined || it.width / it.height <= (width / height) * 1.4 ? "cover" : "blur"),
    focusX: it.plan.focusX ?? 0.5, focusY: it.plan.focusY ?? 0.5,
    // Source audio plays at this level and is ducked under narration by the composition.
    volume: it.type === "video" ? ((it.plan as { volume?: number }).volume ?? 1) : 0,
    kenBurns: it.type === "photo" ? ((it.plan as { kenBurns?: string }).kenBurns ?? ["in", "left", "out", "right"][i % 4]) : null,
    title: it.plan.title ?? null,
    transitionAfter: i < items.length - 1 ? trs[i] : null,
  })),
  narration, music,
};
// Cropping a small source to fill the canvas magnifies it; past ~2.5× it looks soft.
edl.clips.forEach((c, i) => {
  if (c.fit !== "cover" || !c.srcWidth) return;
  const up = Math.max(width / c.srcWidth, height / c.srcHeight);
  if (up > 2.5) notes.push(`clip ${i + 1} (${c.src}) is upscaled ×${up.toFixed(1)} to cover — consider "fit": "blur" or a higher-resolution source`);
});
fs.writeFileSync(outPath, JSON.stringify(edl, null, 2) + "\n");

const sec = (f: number) => (f / fps).toFixed(2) + "s";
console.log(`EDL → ${outPath}`);
console.log(`${edl.width}×${edl.height} @ ${fps} fps · target ${sec(target)} · plan before fitting ${sec(before)}`);
let t = 0;
edl.clips.forEach((c, i) => {
  const src = c.type === "video" ? ` src ${sec(c.trimBefore)}–${sec(c.trimBefore + c.durationInFrames)}` : "";
  console.log(`  ${String(i + 1).padStart(2)}. ${sec(t).padStart(7)}  ${c.type.padEnd(5)} ${sec(c.durationInFrames).padStart(6)} ${c.fit.padEnd(5)} ${c.src}${src}${c.transitionAfter && c.transitionAfter.type !== "none" ? `  → ${c.transitionAfter.type} ${sec(c.transitionAfter.frames)}` : ""}`);
  t += c.durationInFrames - (c.transitionAfter?.frames ?? 0);
});
if (narration) console.log(`  narration ${narration.src} from ${sec(narration.startFrame)} for ${sec(narration.durationInFrames)} · ${narration.captions.length} caption words`);
for (const n of notes) console.log(`  ! ${n}`);
// Mid-point of every clip: render these with `npm run still` before the full render.
console.log(`  check frames: ${edl.clips.map((c) => c.startFrame + Math.floor(c.durationInFrames / 2)).join(" ")}`);
