// Video/audio → word-timed transcript (Remotion Caption JSON) + SRT / VTT / TXT / MD.
// Runs whisper.cpp locally on CPU with Silero VAD (suppresses hallucinated lines in
// silence). Persian-aware: normalizes Arabic ي/ك to Persian ی/ک and marks RTL cues.
//
//   npx tsx .claude/skills/video-transcribe/scripts/transcribe.ts <media> [options]
//
// Run with --help for options. Needs scripts/setup.sh to have run once.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Caption } from "@remotion/captions";

const ROOT = process.env.WHISPER_CPP_DIR ?? path.join(os.homedir(), ".cache/whisper.cpp");
const VERSION = process.env.WHISPER_CPP_VERSION ?? "1.9.5";
const CLI = path.join(ROOT, `whisper.cpp-${VERSION}`, "build/bin/whisper-cli");
const MODELS = path.join(ROOT, "models");
const VAD_MODEL = path.join(MODELS, "ggml-silero-v5.1.2.bin");
const RTL_LANGS = new Set(["fa", "ar", "he", "ur", "ps", "yi"]);

type Opts = {
  lang: string;
  model: string;
  out: string | null;
  formats: Set<string>;
  prompt: string | null;
  translate: boolean;
  vad: boolean;
  threads: number;
  start: number | null;
  end: number | null;
  maxChars: number;
  maxSeconds: number;
};

function usage(): never {
  console.log(`Usage: transcribe.ts <video|audio> [options]
       transcribe.ts <name>.captions.json [--lang fa] [--out DIR]
         → regenerate srt/vtt/txt/md from a proofread captions.json (no re-transcription)

  --lang fa|en|auto   spoken language (default: fa). "auto" lets whisper detect it
  --model NAME        ggml model in ${MODELS} (default: large-v3-turbo-q5_0;
                      large-v3-q5_0 = alternative if turbo struggles; 2.3× slower)
  --prompt "…"        initial prompt: spell names/brands/jargon the way you want them
                      (e.g. "PayStar، فرنام، Remotion") — biggest single accuracy lever
  --out DIR           output folder (default: next to the input, <name>.transcript/)
  --formats LIST      any of json,srt,vtt,txt,md (default: all)
  --translate         translate speech to English (whisper can only translate *to* English)
  --no-vad            disable voice-activity detection
  --start S --end S   only transcribe this range (seconds); timestamps stay relative to the
                      full file, so captions line up with the untrimmed source
  --max-chars N       max characters per subtitle cue (default 42)
  --max-seconds S     max cue duration (default 6)
  --threads N         CPU threads (default: all cores)`);
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
  const num = (k: string) => (str(k) !== null ? Number(str(k)) : null);
  const opts: Opts = {
    lang: str("lang") ?? "fa",
    model: str("model") ?? "large-v3-turbo-q5_0",
    out: str("out"),
    formats: new Set((str("formats") ?? "json,srt,vtt,txt,md").split(",").map((s) => s.trim())),
    prompt: str("prompt"),
    translate: f.translate === true,
    vad: f["no-vad"] !== true,
    threads: num("threads") ?? os.cpus().length,
    start: num("start"),
    end: num("end"),
    maxChars: num("max-chars") ?? 42,
    maxSeconds: num("max-seconds") ?? 6,
  };
  return { input: pos[0], opts };
}

// ---------- audio ----------

function ffmpegBin(): string {
  // Prefer system ffmpeg; Remotion's bundled one can also resample to 16 kHz WAV.
  return spawnSync("ffmpeg", ["-version"]).status === 0 ? "ffmpeg" : "npx remotion ffmpeg";
}

function extractAudio(input: string, wav: string, o: Opts) {
  const range = [
    ...(o.start !== null ? ["-ss", String(o.start)] : []),
    ...(o.end !== null ? ["-to", String(o.end)] : []),
  ];
  const [bin, ...pre] = ffmpegBin().split(" ");
  const r = spawnSync(bin, [...pre, "-hide_banner", "-loglevel", "error", "-y", ...range, "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.toString()}`);
}

function durationOf(wav: string) {
  return (fs.statSync(wav).size - 44) / (16000 * 2);
}

// ---------- whisper ----------

type WhisperSegment = { offsets: { from: number; to: number }; text: string; tokens?: { text: string; p: number }[] };

function runWhisper(wav: string, outBase: string, o: Opts): Promise<{ language: string; transcription: WhisperSegment[] }> {
  const modelPath = path.join(MODELS, `ggml-${o.model}.bin`);
  for (const [what, p] of [["whisper-cli", CLI], ["model", modelPath], ...(o.vad ? [["VAD model", VAD_MODEL]] : [])])
    if (!fs.existsSync(p)) throw new Error(`${what} missing at ${p}. Run: bash .claude/skills/video-transcribe/scripts/setup.sh ${o.model}`);

  const args = [
    "-m", modelPath, "-f", wav, "-l", o.lang, "-t", String(o.threads),
    // One segment per word: whisper.cpp assembles each word from its (byte-level) tokens,
    // so Persian characters split across tokens come out whole, with per-word times.
    "-ml", "1", "-sow",
    "-ojf", "-of", outBase, "-np", "-pp",
    ...(o.translate ? ["-tr"] : []),
    ...(o.prompt ? ["--prompt", o.prompt] : []),
    ...(o.vad ? ["--vad", "-vm", VAD_MODEL] : []),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(CLI, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      const s = d.toString();
      stderr += s;
      const m = s.match(/progress =\s*(\d+)%/g);
      if (m) process.stderr.write(`\r  whisper ${m[m.length - 1].replace(/\D/g, "")}%   `);
    });
    child.on("close", (code) => {
      process.stderr.write("\n");
      if (code !== 0) return reject(new Error(`whisper-cli exited ${code}\n${stderr.slice(-2000)}`));
      const json = JSON.parse(fs.readFileSync(`${outBase}.json`, "utf8"));
      resolve({ language: json.result?.language ?? o.lang, transcription: json.transcription });
    });
  });
}

// ---------- post-processing ----------

// Whisper's classic hallucinations in silence / music (it learned them from subtitle files).
const HALLUCINATIONS = [
  /زیرنویس/, /امضا ?گذاری/, /ترجمه و زیرنویس/, /subtitles? by/i, /amara\.org/i,
  /thanks? for watching/i, /please subscribe/i, /^\s*\.+\s*$/,
];

const normalizeFa = (s: string) => s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ى/g, "ی");

function toCaptions(segs: WhisperSegment[], offsetMs: number, lang: string): Caption[] {
  const out: Caption[] = [];
  for (const s of segs) {
    let text = s.text;
    if (!text.trim()) continue;
    if (lang === "fa") text = normalizeFa(text);
    const probs = (s.tokens ?? []).filter((t) => !t.text.startsWith("[_")).map((t) => t.p);
    out.push({
      // Remotion convention: words carry their leading space ("Hello", " world").
      text: out.length === 0 ? text.trimStart() : text.startsWith(" ") ? text : " " + text,
      startMs: s.offsets.from + offsetMs,
      endMs: s.offsets.to + offsetMs,
      timestampMs: Math.round((s.offsets.from + s.offsets.to) / 2) + offsetMs,
      confidence: probs.length ? +Math.min(...probs).toFixed(3) : null,
    });
  }
  return out;
}

// Whisper splits Persian compounds that take a half-space (ZWNJ): "می شود" → "می‌شود",
// "کتاب ها" → "کتاب‌ها". Merge those word pairs, combining their timings.
const ZWNJ = "\u200C";
const PREFIX = /^(ن?می)$/;
const SUFFIX = /^(ها|های|هایی|هایم|هایت|هایش|هایمان|هایتان|هایشان)([.!?؟،,;؛:]?)$/;
function joinHalfSpaces(words: Caption[]): Caption[] {
  const out: Caption[] = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    const t = w.text.trim();
    if (prev && (PREFIX.test(prev.text.trim()) || SUFFIX.test(t)) && /[\u0600-\u06FF]$/.test(prev.text)) {
      out[out.length - 1] = {
        ...prev,
        text: prev.text + ZWNJ + t,
        endMs: w.endMs,
        timestampMs: Math.round((prev.startMs + w.endMs) / 2),
        confidence: prev.confidence !== null && w.confidence !== null ? Math.min(prev.confidence, w.confidence) : null,
      };
    } else out.push(w);
  }
  return out;
}

type Cue = { startMs: number; endMs: number; text: string; words: Caption[] };

// Group words into subtitle cues: break at sentence punctuation, pauses, or size limits.
function toCues(words: Caption[], o: Opts): Cue[] {
  const cues: Cue[] = [];
  let cur: Caption[] = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((w) => w.text).join("").trim();
    if (!HALLUCINATIONS.some((r) => r.test(text))) cues.push({ startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs, text, words: cur });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const len = cur.map((x) => x.text).join("").trim().length + w.text.length;
    // A sentence's last word may overrun the limit by 30% rather than sit alone in a cue.
    const limit = /[.!?؟]$/.test(w.text.trim()) ? o.maxChars * 1.3 : o.maxChars;
    if (prev && (w.startMs - prev.endMs > 700 || len > limit || w.endMs - cur[0].startMs > o.maxSeconds * 1000)) flush();
    cur.push(w);
    if (/[.!?؟。]$|[،,;؛:]$/.test(w.text.trim()) && cur.map((x) => x.text).join("").trim().length > o.maxChars * 0.5) flush();
    else if (/[.!?؟]$/.test(w.text.trim())) flush();
  }
  flush();
  // Whisper word times can overlap by a few ms; overlapping cues stack in players.
  for (let i = 0; i < cues.length - 1; i++) cues[i].endMs = Math.min(cues[i].endMs, cues[i + 1].startMs);
  return cues;
}

const RLM = "‏";
const ts = (ms: number, sep: string) => {
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${sep}${String(Math.round(ms % 1000)).padStart(3, "0")}`;
};
const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

function writeOutputs(dir: string, base: string, words: Caption[], cues: Cue[], rtl: boolean, o: Opts) {
  // RLM anchors the paragraph direction so a cue that starts with a Latin word
  // ("PayStar …") still lays out right-to-left in players that guess direction.
  const line = (t: string) => (rtl ? RLM + t : t);
  const kept = new Set(cues.flatMap((c) => c.words));
  const files: string[] = [];
  const write = (ext: string, content: string) => {
    const p = path.join(dir, `${base}.${ext}`);
    fs.writeFileSync(p, content);
    files.push(p);
  };
  if (o.formats.has("json")) write("captions.json", JSON.stringify(words.filter((w) => kept.has(w)), null, 2) + "\n");
  if (o.formats.has("srt")) write("srt", cues.map((c, i) => `${i + 1}\n${ts(c.startMs, ",")} --> ${ts(c.endMs, ",")}\n${line(c.text)}\n`).join("\n"));
  if (o.formats.has("vtt")) write("vtt", "WEBVTT\n\n" + cues.map((c) => `${ts(c.startMs, ".")} --> ${ts(c.endMs, ".")}\n${line(c.text)}\n`).join("\n"));
  // Paragraphs: break the running text at long pauses.
  const paras: Cue[][] = [];
  cues.forEach((c, i) => {
    if (i === 0 || c.startMs - cues[i - 1].endMs > 1500) paras.push([]);
    paras[paras.length - 1].push(c);
  });
  if (o.formats.has("txt")) write("txt", paras.map((p) => p.map((c) => c.text).join(" ")).join("\n\n") + "\n");
  if (o.formats.has("md"))
    write("md", (rtl ? '<div dir="rtl">\n\n' : "") + paras.map((p) => `**[${mmss(p[0].startMs)}]** ${p.map((c) => c.text).join(" ")}`).join("\n\n") + (rtl ? "\n\n</div>" : "") + "\n");
  return files;
}

// ---------- main ----------

// Proofreading loop: edit word texts in captions.json (timings untouched), then
// rebuild every other format from it.
function regenerate(input: string, o: Opts) {
  const parsed: Caption[] = JSON.parse(fs.readFileSync(input, "utf8"));
  const words = o.lang === "fa" ? joinHalfSpaces(parsed) : parsed;
  const base = path.basename(input).replace(/\.captions\.json$/, "");
  const dir = o.out ?? path.dirname(input);
  fs.mkdirSync(dir, { recursive: true });
  const cues = toCues(words, o);
  const files = writeOutputs(dir, base, words, cues, RTL_LANGS.has(o.lang), o);
  console.log(JSON.stringify({ regeneratedFrom: input, words: words.length, cues: cues.length, files }, null, 2));
}

async function main() {
  const { input, opts: o } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(input)) throw new Error(`No such file: ${input}`);
  if (input.endsWith(".captions.json")) return regenerate(input, o);
  const base = path.basename(input, path.extname(input));
  const dir = o.out ?? path.join(path.dirname(input), `${base}.transcript`);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "transcribe-"));

  try {
    const wav = path.join(tmp, "audio.wav");
    extractAudio(input, wav, o);
    const audioSec = durationOf(wav);
    const t0 = Date.now();
    const { language, transcription } = await runWhisper(wav, path.join(tmp, "whisper"), o);
    const elapsed = (Date.now() - t0) / 1000;

    const lang = o.translate ? "en" : language;
    const raw = toCaptions(transcription, Math.round((o.start ?? 0) * 1000), lang);
    const words = lang === "fa" ? joinHalfSpaces(raw) : raw;
    const cues = toCues(words, o);
    const rtl = RTL_LANGS.has(lang);
    const files = writeOutputs(dir, base, words, cues, rtl, o);

    const summary = {
      input, language: lang, rtl, model: o.model, vad: o.vad,
      audioSeconds: +audioSec.toFixed(1), processingSeconds: +elapsed.toFixed(1),
      realtimeFactor: +(elapsed / audioSec).toFixed(2),
      words: cues.reduce((n, c) => n + c.words.length, 0), cues: cues.length,
      droppedAsHallucination: words.length - cues.reduce((n, c) => n + c.words.length, 0),
      lowConfidenceWords: words.filter((w) => w.confidence !== null && w.confidence < 0.4).length,
      files,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
