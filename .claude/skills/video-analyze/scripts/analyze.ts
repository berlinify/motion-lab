// Video → structured analysis for editing decisions: probe + proxy advice, shots
// (scene cuts), per-shot motion / brightness / loudness, audio peaks and silences,
// optional transcript mapped onto shots, labelled contact sheets and a timeline chart.
//
//   npx tsx .claude/skills/video-analyze/scripts/analyze.ts <video> [options]
//
// Run with --help for options. Uses the system ffmpeg (needs scdet, signalstats,
// ebur128, silencedetect, drawtext, tile).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Jimp from "jimp";
import type { Caption } from "@remotion/captions";

type Opts = {
  out: string | null;
  sceneThreshold: number;
  minShot: number;
  sampleFps: number;
  silenceDb: number;
  silenceMin: number;
  transcribe: boolean;
  lang: string;
  prompt: string | null;
  captions: string | null;
  proxy: boolean;
  cols: number;
  rows: number;
};

function usage(): never {
  console.log(`Usage: analyze.ts <video> [options]

  --out DIR              output folder (default: <video dir>/<name>.analysis/)
  --scene-threshold N    scdet score that counts as a cut (default 12; lower = more cuts)
  --min-shot S           merge shots shorter than this (default 0.6 s)
  --sample-fps N         analysis frame rate (default 10)
  --silence-db N         silence threshold in dB (default -35)
  --silence-min S        minimum silence length (default 0.6 s)
  --transcribe           also run the video-transcribe skill and map words onto shots
  --lang fa|en|auto      transcription language (default fa)
  --prompt "…"           transcription prompt (names/brands)
  --captions FILE        use an existing <name>.captions.json instead of transcribing
  --proxy                write an edit-friendly proxy (H.264, CFR 30 fps, long side ≤1920, 1 s GOP)
  --grid CxR             contact-sheet grid (default 5x6)`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const pos: string[] = [];
  const f: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") usage();
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=", 2);
      if (inline !== undefined) f[k] = inline;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) f[k] = argv[++i];
      else f[k] = true;
    } else pos.push(a);
  }
  if (pos.length !== 1) usage();
  const str = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : null);
  const num = (k: string, d: number) => (str(k) !== null ? Number(str(k)) : d);
  const [cols, rows] = (str("grid") ?? "5x6").split("x").map(Number);
  const opts: Opts = {
    out: str("out"),
    sceneThreshold: num("scene-threshold", 12),
    minShot: num("min-shot", 0.6),
    sampleFps: num("sample-fps", 10),
    silenceDb: num("silence-db", -35),
    silenceMin: num("silence-min", 0.6),
    transcribe: f.transcribe === true,
    lang: str("lang") ?? "fa",
    prompt: str("prompt"),
    captions: str("captions"),
    proxy: f.proxy === true,
    cols,
    rows,
  };
  return { input: pos[0], opts };
}

// ---------- helpers ----------

function run(bin: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

async function ffmpeg(args: string[]) {
  const r = await run("ffmpeg", ["-hide_banner", "-nostdin", ...args]);
  if (r.code !== 0) throw new Error(`ffmpeg ${args.join(" ")}\n${r.stderr.slice(-1500)}`);
  return r.stderr;
}

async function pool<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }));
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2))) || 1;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

// ffmpeg `metadata=print` / `ametadata=print` output → [{t, key: value}]
function parseMetadata(file: string): { t: number; v: Record<string, number> }[] {
  const out: { t: number; v: Record<string, number> }[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const fm = line.match(/pts_time:([\d.]+)/);
    if (fm) out.push({ t: Number(fm[1]), v: {} });
    else {
      const kv = line.match(/^lavfi\.([\w.]+)=(-?[\d.]+|-?inf)/);
      if (kv && out.length) out[out.length - 1].v[kv[1]] = kv[2].includes("inf") ? -120 : Number(kv[2]);
    }
  }
  return out;
}

// ---------- probe ----------

function probe(input: string) {
  const r = spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input]);
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr.toString()}`);
  const j = JSON.parse(r.stdout.toString());
  const v = j.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  const a = j.streams.find((s: { codec_type: string }) => s.codec_type === "audio");
  if (!v) throw new Error("No video stream");
  const rate = (s: string) => { const [n, d] = s.split("/").map(Number); return d ? n / d : 0; };
  const fps = rate(v.avg_frame_rate);
  const rotation = Math.abs(Number(v.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0));
  const vfr = Math.abs(rate(v.r_frame_rate) - fps) > 0.5;
  const reasons: string[] = [];
  if (v.codec_name !== "h264") reasons.push(`codec ${v.codec_name} (H.264 decodes fastest in Remotion)`);
  if (vfr) reasons.push(`variable frame rate (avg ${fps.toFixed(2)} vs nominal ${rate(v.r_frame_rate).toFixed(2)}) → audio drift`);
  if (rotation) reasons.push(`rotation metadata ${rotation}°`);
  if (fps > 31) reasons.push(`${fps.toFixed(0)} fps (twice the decoding work of a 30 fps edit)`);
  if (v.height > 1080) reasons.push(`${v.width}×${v.height} (heavier than a 1080p edit needs)`);
  return {
    duration: Number(j.format.duration),
    sizeBytes: Number(j.format.size),
    container: j.format.format_name,
    video: { codec: v.codec_name, width: v.width, height: v.height, fps: r2(fps), vfr, rotation, pixFmt: v.pix_fmt },
    audio: a ? { codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels } : null,
    proxyRecommended: reasons.length > 0,
    proxyReasons: reasons,
  };
}

// ---------- passes ----------

async function videoPass(input: string, tmp: string, o: Opts) {
  const file = path.join(tmp, "video.txt");
  // Downscaled + resampled: cuts and motion survive, decoding cost drops ~20×.
  await ffmpeg(["-i", input, "-an", "-sn", "-vf", `scale=320:-2,fps=${o.sampleFps},signalstats,scdet=t=${o.sceneThreshold},metadata=mode=print:file=${file}`, "-f", "null", "-"]);
  return parseMetadata(file).map((f) => ({ t: f.t, motion: f.v["scd.mafd"] ?? 0, score: f.v["scd.score"] ?? 0, luma: f.v["signalstats.YAVG"] ?? 0 }));
}

async function audioPass(input: string, tmp: string, o: Opts) {
  const file = path.join(tmp, "audio.txt");
  const stderr = await ffmpeg(["-i", input, "-vn", "-sn", "-af", `ebur128=metadata=1,ametadata=mode=print:key=lavfi.r128.M:file=${file},silencedetect=n=${o.silenceDb}dB:d=${o.silenceMin}`, "-f", "null", "-"]);
  const loud = parseMetadata(file).map((f) => ({ t: f.t, lufs: Math.max(-70, f.v["r128.M"] ?? -70) }));
  const silences: { start: number; end: number }[] = [];
  for (const m of stderr.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === "start") silences.push({ start: Number(m[2]), end: NaN });
    else if (silences.length) silences[silences.length - 1].end = Number(m[2]);
  }
  return { loud, silences };
}

// ---------- shots ----------

type Shot = {
  index: number; start: number; end: number; duration: number;
  motion: number; luma: number; loudness: number; peakLoudness: number;
  energy: number; words: number; text: string; thumbs: string[];
};

function detectShots(frames: { t: number; score: number }[], duration: number, o: Opts) {
  const cuts = [0];
  for (const f of frames) if (f.score >= o.sceneThreshold && f.t - cuts[cuts.length - 1] >= o.minShot) cuts.push(f.t);
  // A final sliver after the last cut joins the previous shot.
  if (duration - cuts[cuts.length - 1] < o.minShot && cuts.length > 1) cuts.pop();
  return cuts.map((start, i) => ({ start, end: cuts[i + 1] ?? duration }));
}

function audioPeaks(loud: { t: number; lufs: number }[], shots: { start: number; end: number }[]) {
  // Smooth to 1 s, then keep local maxima well above the programme's typical level.
  const win = 10;
  const smooth = loud.map((_, i) => mean(loud.slice(Math.max(0, i - win / 2), i + win / 2).map((l) => l.lufs)));
  const audible = smooth.filter((v) => v > -60);
  const m = mean(audible), s = std(audible);
  const peaks: { t: number; lufs: number; z: number }[] = [];
  for (let i = 1; i < smooth.length - 1; i++) {
    const v = smooth[i];
    if (v < m + 1.2 * s || v < smooth[i - 1] || v < smooth[i + 1]) continue;
    const last = peaks[peaks.length - 1];
    if (last && loud[i].t - last.t < 4) {
      if (v > last.lufs) peaks[peaks.length - 1] = { t: loud[i].t, lufs: v, z: (v - m) / s };
      continue;
    }
    peaks.push({ t: loud[i].t, lufs: v, z: (v - m) / s });
  }
  // At most 2 per shot, so one long loud take (music under credits) can't fill the list.
  const perShot = new Map<number, number>();
  const kept = peaks.sort((a, b) => b.z - a.z).filter((pk) => {
    const s = shots.findIndex((sh) => pk.t >= sh.start && pk.t < sh.end);
    const n = perShot.get(s) ?? 0;
    perShot.set(s, n + 1);
    return n < 2;
  });
  return kept.slice(0, 15).sort((a, b) => a.t - b.t).map((p) => ({ t: r2(p.t), lufs: r2(p.lufs), z: r2(p.z) }));
}

// ---------- speech ----------

type Segment = { index: number; start: number; end: number; duration: number; text: string; words: number; wordsPerMin: number; loudness: number; shot: number };

// Sentence-level units for talk footage (one long shot = useless shot table): break at
// sentence punctuation or pauses, cap at 20 s. Speaking rate + loudness hint at emphasis.
function speechSegments(words: Caption[], loud: { t: number; lufs: number }[], shots: Shot[]): Segment[] {
  const segs: Segment[] = [];
  let cur: Caption[] = [];
  const flush = () => {
    if (!cur.length) return;
    const start = cur[0].startMs / 1000, end = cur[cur.length - 1].endMs / 1000;
    const ld = loud.filter((l) => l.t >= start && l.t < end).map((l) => l.lufs);
    segs.push({
      index: segs.length + 1, start: r2(start), end: r2(end), duration: r2(end - start),
      text: cur.map((w) => w.text).join("").trim(), words: cur.length,
      wordsPerMin: Math.round((cur.length / Math.max(0.5, end - start)) * 60),
      loudness: r2(mean(ld)), shot: shots.find((sh) => start >= sh.start && start < sh.end)?.index ?? 0,
    });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.startMs - prev.endMs > 900 || w.endMs - cur[0].startMs > 20000)) flush();
    cur.push(w);
    if (/[.!?؟]$/.test(w.text.trim())) flush();
  }
  flush();
  return segs;
}

// ---------- visuals ----------

// One tile per shot (mid-shot frame); shots over 15 s get another tile every 10 s so
// long takes (interviews, credits, b-roll pans) show what actually happens in them.
async function thumbnails(input: string, shots: Shot[], dir: string, tmp: string, portrait: boolean) {
  // Tiles follow the source's display orientation, so phone-vertical footage isn't a sliver.
  const [tw, th] = portrait ? [180, 320] : [320, 180];
  const font = spawnSync("fc-match", ["-f", "%{file}", "sans:bold"]).stdout?.toString() || "";
  fs.rmSync(path.join(dir, "thumbs"), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "thumbs"), { recursive: true });
  const tiles: { shot: Shot; t: number; label: string }[] = [];
  for (const s of shots) {
    // Long shots: lead tile near the start, so tiles stay in time order.
    const lead = s.duration > 15 ? s.start + 2 : s.start + Math.min(s.duration / 2, Math.max(0.2, s.duration - 0.2));
    tiles.push({ shot: s, t: lead, label: `#${s.index}  ${fmt(s.start)}  ${s.duration.toFixed(1)}s` });
    if (s.duration > 15) for (let t = s.start + 10; t < s.end - 2; t += 10) tiles.push({ shot: s, t, label: `#${s.index} @ ${fmt(t)}` });
  }
  tiles.sort((a, b) => a.t - b.t);
  await pool(tiles, Math.max(2, os.cpus().length >> 1), async (tile, i) => {
    const label = path.join(tmp, `label-${i}.txt`);
    fs.writeFileSync(label, tile.label);
    const draw = font
      ? `,drawtext=fontfile=${font}:textfile=${label}:x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=6`
      : "";
    const name = path.join("thumbs", `tile-${String(i + 1).padStart(3, "0")}.jpg`);
    await ffmpeg(["-ss", tile.t.toFixed(2), "-i", input, "-frames:v", "1", "-vf", `scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2${draw}`, "-q:v", "3", "-y", path.join(dir, name)]);
    tile.shot.thumbs.push(name);
  });
  for (const s of shots) s.thumbs.sort();
}

async function contactSheets(dir: string, o: Opts, portrait: boolean) {
  fs.rmSync(path.join(dir, "sheets"), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "sheets"), { recursive: true });
  await ffmpeg(["-framerate", "1", "-i", path.join(dir, "thumbs", "tile-%03d.jpg"), "-vf", `tile=${portrait ? "8x3" : `${o.cols}x${o.rows}`}:padding=4:color=0x202020`, "-y", path.join(dir, "sheets", "contact-%02d.png")]);
  return fs.readdirSync(path.join(dir, "sheets")).sort().map((f) => path.join("sheets", f));
}

// Stacked strip chart: loudness, motion, shot boundaries, silences, speech, peaks.
async function timeline(dir: string, duration: number, frames: { t: number; motion: number }[], loud: { t: number; lufs: number }[], shots: Shot[], silences: { start: number; end: number }[], words: Caption[], peaks: { t: number }[]) {
  const W = 1600, H = 330, L = 70, R = 10, plotW = W - L - R;
  const img = new Jimp(W, H, 0x14161cff);
  const x = (t: number) => Math.round(L + (t / duration) * plotW);
  const rect = (x0: number, y0: number, w: number, h: number, c: number) => {
    for (let yy = Math.max(0, y0); yy < Math.min(H, y0 + h); yy++) for (let xx = Math.max(0, x0); xx < Math.min(W, x0 + w); xx++) img.setPixelColor(c, xx, yy);
  };
  const lane = (y0: number, h: number, series: { t: number; v: number }[], lo: number, hi: number, color: number) => {
    rect(L, y0, plotW, h, 0x1d2029ff);
    const cols = new Map<number, number>();
    for (const p of series) { const px = x(p.t); cols.set(px, Math.max(cols.get(px) ?? -Infinity, p.v)); }
    cols.forEach((v, px) => { const hh = Math.round(((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * h); rect(px, y0 + h - hh, 1, hh, color); });
  };
  lane(30, 80, loud.map((l) => ({ t: l.t, v: l.lufs })), -50, -5, 0x4fa3ffff);
  lane(120, 80, frames.map((f) => ({ t: f.t, v: f.motion })), 0, 30, 0x3ddc97ff);
  rect(L, 210, plotW, 14, 0x1d2029ff);
  for (const s of silences) rect(x(s.start), 210, Math.max(1, x(s.end || duration) - x(s.start)), 14, 0x6b6f7aff);
  rect(L, 230, plotW, 14, 0x1d2029ff);
  for (const w of words) rect(x(w.startMs / 1000), 230, Math.max(1, x(w.endMs / 1000) - x(w.startMs / 1000)), 14, 0xffcc00ff);
  for (const s of shots) rect(x(s.start), 26, 1, 222, 0xffffff55);
  for (const p of peaks) rect(x(p.t) - 2, 20, 5, 8, 0xff5a5aff);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  img.print(font, 6, 60, "loud");
  img.print(font, 6, 150, "motion");
  img.print(font, 6, 208, "silence");
  img.print(font, 6, 228, "speech");
  img.print(font, L, 4, "red = audio peaks · white lines = cuts");
  const step = [5, 10, 15, 30, 60, 120, 300, 600].find((s) => duration / s <= 14) ?? 600;
  for (let t = 0; t <= duration; t += step) { rect(x(t), 250, 1, 8, 0xaaaaaaff); img.print(font, x(t) - 16, 262, fmt(t).replace(/\.\d$/, "")); }
  await img.writeAsync(path.join(dir, "timeline.png"));
}

// ---------- main ----------

async function main() {
  const { input, opts: o } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(input)) throw new Error(`No such file: ${input}`);
  const base = path.basename(input, path.extname(input));
  const dir = o.out ?? path.join(path.dirname(input), `${base}.analysis`);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "analyze-"));
  const t0 = Date.now();

  try {
    const info = probe(input);
    const [frames, audio] = await Promise.all([videoPass(input, tmp, o), info.audio ? audioPass(input, tmp, o) : Promise.resolve({ loud: [], silences: [] })]);
    for (const s of audio.silences) if (Number.isNaN(s.end)) s.end = info.duration;

    // Transcript: reuse a captions file, or run the video-transcribe skill.
    let words: Caption[] = [];
    if (o.captions) words = JSON.parse(fs.readFileSync(o.captions, "utf8"));
    else if (o.transcribe && info.audio) {
      const script = path.join(path.dirname(new URL(import.meta.url).pathname), "../../video-transcribe/scripts/transcribe.ts");
      const args = ["tsx", script, input, "--lang", o.lang, "--out", path.join(dir, "transcript"), ...(o.prompt ? ["--prompt", o.prompt] : [])];
      const r = spawnSync("npx", args, { stdio: ["ignore", "pipe", "inherit"] });
      if (r.status !== 0) throw new Error("transcription failed");
      words = JSON.parse(fs.readFileSync(path.join(dir, "transcript", `${base}.captions.json`), "utf8"));
    }

    const ranges = detectShots(frames, info.duration, o);
    const shots: Shot[] = ranges.map((r, i) => {
      const fr = frames.filter((f) => f.t >= r.start && f.t < r.end).slice(1); // skip the cut frame itself
      const ld = audio.loud.filter((l) => l.t >= r.start && l.t < r.end).map((l) => l.lufs);
      const ws = words.filter((w) => w.startMs / 1000 >= r.start && w.startMs / 1000 < r.end);
      return {
        index: i + 1, start: r2(r.start), end: r2(r.end), duration: r2(r.end - r.start),
        motion: r2(mean(fr.map((f) => f.motion))), luma: r2(mean(fr.map((f) => f.luma))),
        loudness: r2(mean(ld)), peakLoudness: r2(ld.length ? Math.max(...ld) : -70),
        energy: 0, words: ws.length, text: ws.map((w) => w.text).join("").trim(), thumbs: [],
      };
    });
    // Relative "energy" hint: motion and loudness z-scores across this video's shots.
    const zm = (k: "motion" | "loudness" | "peakLoudness") => { const a = shots.map((s) => s[k]); const m = mean(a), sd = std(a); return (s: Shot) => (s[k] - m) / sd; };
    const [zMot, zLoud, zPeak] = [zm("motion"), zm("loudness"), zm("peakLoudness")];
    for (const s of shots) s.energy = r2(0.45 * zMot(s) + 0.35 * zLoud(s) + 0.2 * zPeak(s));

    const peaks = audioPeaks(audio.loud, shots);
    const segments = speechSegments(words, audio.loud, shots);
    // Display orientation: ffmpeg auto-rotates, so a ±90° rotation swaps the stored size.
    const sideways = info.video.rotation % 180 === 90;
    const portrait = sideways ? info.video.width > info.video.height : info.video.height > info.video.width;
    await thumbnails(input, shots, dir, tmp, portrait);
    const sheets = await contactSheets(dir, o, portrait);
    await timeline(dir, info.duration, frames, audio.loud, shots, audio.silences, words, peaks);

    let proxy: string | null = null;
    if (o.proxy) {
      proxy = path.join(dir, `${base}.proxy.mp4`);
      await ffmpeg(["-i", input, "-vf", "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))',fps=30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-g", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-y", proxy]);
    }

    const silences = audio.silences.map((s) => ({ start: r2(s.start), end: r2(s.end), duration: r2(s.end - s.start) }));
    const analysis = {
      input, analyzedAt: new Date().toISOString(), processingSeconds: r2((Date.now() - t0) / 1000),
      probe: info, proxy,
      stats: {
        shots: shots.length, avgShotSeconds: r2(mean(shots.map((s) => s.duration))),
        integratedLoudnessApprox: r2(mean(audio.loud.filter((l) => l.lufs > -60).map((l) => l.lufs))),
        silentSeconds: r2(silences.reduce((n, s) => n + s.duration, 0)),
        speechWords: words.length,
      },
      shots, segments, audioPeaks: peaks, silences,
      files: { summary: "summary.md", timeline: "timeline.png", sheets },
    };
    fs.writeFileSync(path.join(dir, "analysis.json"), JSON.stringify(analysis, null, 2) + "\n");
    fs.writeFileSync(path.join(dir, "summary.md"), summaryMd(analysis, shots, segments, peaks, silences));
    console.log(JSON.stringify({ dir, processingSeconds: analysis.processingSeconds, ...analysis.stats, proxyRecommended: info.proxyRecommended, files: analysis.files }, null, 2));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function summaryMd(a: { input: string; probe: ReturnType<typeof probe>; stats: Record<string, number>; proxy: string | null }, shots: Shot[], segments: Segment[], peaks: { t: number; lufs: number; z: number }[], silences: { start: number; end: number; duration: number }[]) {
  const p = a.probe;
  const top = [...shots].sort((x, y) => y.energy - x.energy).slice(0, Math.min(10, Math.ceil(shots.length / 4))).map((s) => s.index);
  const lines = [
    `# Analysis: ${path.basename(a.input)}`,
    "",
    `- **Duration** ${fmt(p.duration)} · ${p.video.width}×${p.video.height} · ${p.video.fps} fps · ${p.video.codec}${p.audio ? ` / ${p.audio.codec}` : " / no audio"}`,
    `- **Shots** ${a.stats.shots} (avg ${a.stats.avgShotSeconds}s) · **silence** ${a.stats.silentSeconds}s · **speech words** ${a.stats.speechWords}`,
    `- **Proxy** ${p.proxyRecommended ? `recommended: ${p.proxyReasons.join("; ")}` : "not needed"}${a.proxy ? ` → \`${a.proxy}\`` : ""}`,
    `- **Highest-energy shots** (motion + loudness, relative to this video): ${top.map((i) => `#${i}`).join(", ")}`,
    "",
    "## Shots",
    "",
    "| # | start | dur | motion | loud (LUFS) | peak | energy | speech |",
    "|---|---|---|---|---|---|---|---|",
    ...shots.map((s) => `| ${s.index} | ${fmt(s.start)} | ${s.duration}s | ${s.motion} | ${s.loudness} | ${s.peakLoudness} | ${s.energy > 0 ? "**" + s.energy + "**" : s.energy} | ${s.text ? s.text.slice(0, 80).replace(/\|/g, "/") : ""} |`),
    "",
    ...(segments.length
      ? [
          "## Speech segments",
          "",
          "| # | start | dur | wpm | loud | shot | text |",
          "|---|---|---|---|---|---|---|",
          ...segments.map((g) => `| ${g.index} | ${fmt(g.start)} | ${g.duration}s | ${g.wordsPerMin} | ${g.loudness} | #${g.shot} | ${g.text.replace(/\|/g, "/")} |`),
          "",
        ]
      : []),
    "## Audio peaks",
    "",
    peaks.length ? peaks.map((pk) => `- ${fmt(pk.t)}: ${pk.lufs} LUFS (z ${pk.z}), shot #${shots.find((s) => pk.t >= s.start && pk.t < s.end)?.index ?? "?"}`).join("\n") : "_none_",
    "",
    "## Silences",
    "",
    silences.length ? silences.map((s) => `- ${fmt(s.start)} → ${fmt(s.end)} (${s.duration}s)`).join("\n") : "_none_",
    "",
  ];
  return lines.join("\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
