// Raster → layered SVG. Quantizes colors (k-means in Lab), traces each color
// layer with potrace on an upscaled + smoothed mask, then re-renders the SVG with
// resvg and scores it against the source so accuracy is measured, not eyeballed.
//
//   npx tsx .claude/skills/raster-to-svg/scripts/trace.ts <input> <out.svg> [options]
//
// Run with --help for options.
import fs from "node:fs";
import path from "node:path";
import Jimp from "jimp";
// @ts-expect-error potrace ships no type declarations
import potrace from "potrace";
import { Resvg } from "@resvg/resvg-js";

type RGB = [number, number, number];
type Lab = [number, number, number];

const PRESETS = {
  // Flat logos / illustrations: few colors, sharp corners kept.
  logo: { colors: 0, maxColors: 10, scale: 8, smooth: 0.6, turd: 4, alphaMax: 1.0, optTolerance: 0.2, mergeDE: 8 },
  // Single-ink line art / icons / scans.
  lineart: { colors: 2, maxColors: 2, scale: 6, smooth: 0.5, turd: 6, alphaMax: 1.0, optTolerance: 0.2, mergeDE: 8 },
  // Photos → stylized posterized vector. Never "accurate"; a look.
  poster: { colors: 12, maxColors: 24, scale: 3, smooth: 0.6, turd: 6, alphaMax: 1.2, optTolerance: 0.4, mergeDE: 4 },
} as const;

type Opts = {
  preset: keyof typeof PRESETS;
  colors: number; // 0 = auto
  maxColors: number;
  scale: number;
  smooth: number; // mask blur radius, in *source* pixels
  turd: number; // speckle suppression, in *source* pixels² (scaled internally)
  alphaMax: number;
  optTolerance: number;
  mergeDE: number;
  layering: "stacked" | "cutout";
  keepBg: boolean;
  palette: RGB[] | null;
  ts: string | null;
  report: string | null;
  precision: number;
};

function usage(): never {
  console.log(`Usage: trace.ts <input.png|jpg> <out.svg> [options]

  --preset logo|lineart|poster   defaults bundle (default: logo)
  --colors N          fixed color count (0 = auto, picks smallest k under a ΔE target)
  --max-colors N      ceiling for auto mode
  --merge-de F        merge palette colors closer than this ΔE
  --palette "#hex,#hex,…"  force exact brand colors (skips k-means, best accuracy)
  --scale N           upscale factor before tracing (smoother curves, slower)
  --smooth R          mask blur radius in source px (0 = none)
  --turd N            drop specks smaller than N source px²
  --alpha-max F       potrace corner threshold (lower = more corners, 0–1.34)
  --opt-tolerance F   potrace curve optimization tolerance
  --layering stacked|cutout
                      stacked: lower layers extend under upper ones (no seams; best static accuracy)
                      cutout:  layers don't overlap (best for animating layers independently)
  --keep-bg           keep the detected solid background color as a layer
  --ts out.ts         also emit a TS module (VIEWBOX + LAYERS) for Remotion
  --report dir        write preview.png (source | svg | diff) + metrics.json (default: next to out.svg)
  --precision N       decimals in path data (default 2)`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") usage();
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=", 2);
      if (inline !== undefined) flags[k] = inline;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  if (pos.length < 2) usage();
  const presetName = (flags.preset as string) ?? "logo";
  if (!(presetName in PRESETS)) throw new Error(`Unknown preset ${presetName}`);
  const p = PRESETS[presetName as keyof typeof PRESETS];
  const num = (k: string, d: number) => (flags[k] !== undefined ? Number(flags[k]) : d);
  const palette = typeof flags.palette === "string" ? flags.palette.split(",").map((h) => hexToRgb(h.trim())) : null;
  const opts: Opts = {
    preset: presetName as Opts["preset"],
    colors: num("colors", p.colors),
    maxColors: num("max-colors", p.maxColors),
    scale: num("scale", p.scale),
    smooth: num("smooth", p.smooth),
    turd: num("turd", p.turd),
    alphaMax: num("alpha-max", p.alphaMax),
    optTolerance: num("opt-tolerance", p.optTolerance),
    mergeDE: num("merge-de", p.mergeDE),
    layering: flags.layering === "cutout" ? "cutout" : "stacked",
    keepBg: flags["keep-bg"] === true,
    palette,
    ts: typeof flags.ts === "string" ? flags.ts : null,
    report: typeof flags.report === "string" ? flags.report : null,
    precision: num("precision", 2),
  };
  // Allowed-color sets are int32 bitmasks.
  if (opts.maxColors > 30 || opts.colors > 30 || (palette?.length ?? 0) > 30) throw new Error("At most 30 colors are supported");
  return { input: pos[0], output: pos[1], opts };
}

// ---------- color math ----------

function hexToRgb(h: string): RGB {
  const s = h.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}
const rgbToHex = (c: RGB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

function rgbToLab([r, g, b]: RGB): Lab {
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---------- quantization ----------

type Sample = { lab: Lab; rgb: RGB };

// "Interior" = opaque with a nearly uniform 3×3 neighbourhood (summed RGB spread
// ≤ tol), i.e. not an antialiased edge blend. 1 = interior.
function interiorMap(img: Jimp, tol = 24): Uint8Array {
  const { width: w, height: h, data } = img.bitmap;
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 250) continue;
      let maxDiff = 0;
      for (let dy = -1; dy <= 1 && maxDiff <= tol; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const j = ((y + dy) * w + x + dx) * 4;
          if (data[j + 3] < 250) maxDiff = 999;
          else maxDiff = Math.max(maxDiff, Math.abs(data[j] - data[i]) + Math.abs(data[j + 1] - data[i + 1]) + Math.abs(data[j + 2] - data[i + 2]));
        }
      if (maxDiff <= tol) out[y * w + x] = 1;
    }
  }
  return out;
}

// Train only on interior pixels so edge blends don't spawn in-between clusters.
function trainingSamples(img: Jimp, interior: Uint8Array): Sample[] {
  const { data } = img.bitmap;
  const out: Sample[] = [];
  interior.forEach((v, p) => {
    if (!v) return;
    const rgb: RGB = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
    out.push({ rgb, lab: rgbToLab(rgb) });
  });
  // Tiny images or pure gradients: fall back to every opaque pixel.
  if (out.length < 200) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
      out.push({ rgb, lab: rgbToLab(rgb) });
    }
  }
  // Subsample for speed.
  const MAX = 40000;
  if (out.length <= MAX) return out;
  const step = out.length / MAX;
  return Array.from({ length: MAX }, (_, i) => out[Math.floor(i * step)]);
}

function kmeans(samples: Sample[], k: number) {
  // k-means++ seeding, deterministic (seeded LCG) so reruns are reproducible.
  let seed = 1234567;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const centers: Lab[] = [samples[Math.floor(rand() * samples.length)].lab];
  const d2 = new Float64Array(samples.length);
  while (centers.length < k) {
    let sum = 0;
    samples.forEach((s, i) => {
      d2[i] = Math.min(...centers.map((c) => dE(s.lab, c) ** 2));
      sum += d2[i];
    });
    if (sum === 0) break;
    let r = rand() * sum, idx = 0;
    while ((r -= d2[idx]) > 0 && idx < samples.length - 1) idx++;
    centers.push(samples[idx].lab);
  }
  const assign = new Int32Array(samples.length);
  for (let iter = 0; iter < 25; iter++) {
    let moved = 0;
    samples.forEach((s, i) => {
      let best = 0, bd = Infinity;
      centers.forEach((c, j) => {
        const d = dE(s.lab, c);
        if (d < bd) (bd = d), (best = j);
      });
      if (assign[i] !== best) moved++;
      assign[i] = best;
    });
    const acc = centers.map(() => [0, 0, 0, 0]);
    samples.forEach((s, i) => {
      const a = acc[assign[i]];
      a[0] += s.lab[0]; a[1] += s.lab[1]; a[2] += s.lab[2]; a[3]++;
    });
    acc.forEach((a, j) => { if (a[3]) centers[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
    if (iter > 0 && moved === 0) break;
  }
  let err = 0;
  samples.forEach((s, i) => (err += dE(s.lab, centers[assign[i]])));
  // Represent each cluster by the median RGB of its members (a real source color, not a Lab average).
  const rgbs = centers.map((_, j) => {
    const m = samples.filter((_, i) => assign[i] === j).map((s) => s.rgb);
    if (!m.length) return null;
    const med = (ch: number) => m.map((c) => c[ch]).sort((a, b) => a - b)[m.length >> 1];
    return [med(0), med(1), med(2)] as RGB;
  });
  return { palette: rgbs.filter((c): c is RGB => c !== null), meanErr: err / samples.length };
}

// Does `c` lie near the straight sRGB segment between two of the colors in `mask`,
// away from both ends? That's what an antialiased boundary pixel looks like
// (renderers blend in sRGB, which is a curve in Lab, so test in RGB).
function isBlend(c: RGB, pal: RGB[], mask: number): boolean {
  const ids = pal.map((_, i) => i).filter((i) => mask & (1 << i));
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = pal[ids[i]], b = pal[ids[j]];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      if (!len2) continue;
      const t = ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / len2;
      if (t < 0.05 || t > 0.95) continue;
      const off = Math.hypot(c[0] - a[0] - t * ab[0], c[1] - a[1] - t * ab[1], c[2] - a[2] - t * ab[2]);
      if (off < 28) return true;
    }
  return false;
}

function mergeClose(pal: RGB[], minDE: number): RGB[] {
  const out: RGB[] = [];
  for (const c of pal) if (!out.some((o) => dE(rgbToLab(o), rgbToLab(c)) < minDE)) out.push(c);
  return out;
}

function choosePalette(img: Jimp, interior: Uint8Array, o: Opts): { palette: RGB[]; note: string } {
  if (o.palette) return { palette: o.palette, note: "forced --palette" };
  const samples = trainingSamples(img, interior);
  if (o.colors > 0) {
    const r = kmeans(samples, o.colors);
    return { palette: mergeClose(r.palette, o.mergeDE), note: `k=${o.colors}, mean ΔE ${r.meanErr.toFixed(2)}` };
  }
  // Auto: smallest k whose interior pixels sit within ΔE≈2.5 of their color.
  const TARGET = 2.5;
  let last = kmeans(samples, 1), lastK = 1;
  for (let k = 2; k <= o.maxColors && last.meanErr > TARGET; k++) {
    last = kmeans(samples, k);
    lastK = k;
  }
  return { palette: mergeClose(last.palette, o.mergeDE), note: `auto k=${lastK}, mean ΔE ${last.meanErr.toFixed(2)}` };
}

// ---------- background ----------

// A solid background = an opaque border dominated (>85%) by one palette color.
function detectBackground(img: Jimp, labels: Int16Array, w: number, h: number): number {
  const counts = new Map<number, number>();
  let total = 0;
  const add = (x: number, y: number) => {
    const l = labels[y * w + x];
    total++;
    if (l >= 0) counts.set(l, (counts.get(l) ?? 0) + 1);
  };
  for (let x = 0; x < w; x++) add(x, 0), add(x, h - 1);
  for (let y = 0; y < h; y++) add(0, y), add(w - 1, y);
  let best = -1, bc = 0;
  counts.forEach((c, l) => { if (c > bc) (bc = c), (best = l); });
  return bc / total > 0.85 ? best : -1;
}

// ---------- tracing ----------

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / win;
      s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / win;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function tracePath(mask: Float32Array, w: number, h: number, o: Opts, grow: boolean): Promise<string> {
  // Two box-blur passes ≈ gaussian. Mask is 1 = inside.
  const r = Math.round(o.smooth * o.scale);
  const soft = boxBlur(boxBlur(mask, w, h, r), w, h, r);
  const img = new Jimp(w, h);
  const d = img.bitmap.data;
  for (let i = 0; i < soft.length; i++) {
    const v = 255 - Math.round(soft[i] * 255);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  const tracer = new potrace.Potrace({
    // Cutout layers grow ~0.25px past the boundary so neighbours meet without hairline seams.
    threshold: grow ? 160 : 128,
    turdSize: o.turd * o.scale * o.scale,
    alphaMax: o.alphaMax,
    optTolerance: o.optTolerance,
    optCurve: true,
  });
  return new Promise((resolve, reject) =>
    tracer.loadImage(img, (err: Error | null) => {
      if (err) return reject(err);
      const tag: string = tracer.getPathTag("#000");
      resolve(tag.match(/ d="([^"]*)"/)?.[1] ?? "");
    }),
  );
}

// Potrace coordinates are in upscaled pixels; map back to source pixels and round.
function rescalePath(d: string, scale: number, precision: number) {
  return d
    .replace(/-?\d*\.?\d+(?:e-?\d+)?/g, (n) => {
      const v = Number(n) / scale;
      return String(Number(v.toFixed(precision)));
    })
    .replace(/,\s+/g, ",")
    .trim();
}

// ---------- scoring ----------

function overWhite(d: Uint8Array | Buffer, i: number): RGB {
  const a = d[i + 3] / 255;
  return [255 + (d[i] - 255) * a, 255 + (d[i + 1] - 255) * a, 255 + (d[i + 2] - 255) * a];
}

async function score(src: Jimp, interior: Uint8Array, svg: string, reportDir: string) {
  const { width: w, height: h } = src.bitmap;
  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: w } }).render();
  const rp = rendered.pixels;
  const sp = src.bitmap.data;
  const errs = new Float32Array(w * h);
  // 5×5 box blur of the over-white composite: a ½px edge shift between source and
  // render drops below ΔE 15, while a lost 1–2px stroke (text, specks) stays above.
  const soft = (d: Uint8Array | Buffer) => {
    const flat = Array.from({ length: w * h }, (_, i) => overWhite(d, i * 4));
    return flat.map((_, i) => {
      const x = i % w, y = (i / w) | 0;
      const acc = [0, 0, 0];
      let n = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const c = flat[yy * w + xx];
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; n++;
        }
      return rgbToLab([acc[0] / n, acc[1] / n, acc[2] / n]);
    });
  };
  const sSoft = soft(sp), rSoft = soft(rp);

  // structuralBadPct is the headline number. interior* isolates flat-fill color
  // accuracy; edgeBadPct is raw antialiasing mismatch (always high, compare relatively).
  let iSum = 0, iN = 0, iBad = 0, eN = 0, eBad = 0, dN = 0, sBad = 0;
  for (let i = 0; i < w * h; i++) {
    const e = dE(rgbToLab(overWhite(sp, i * 4)), rgbToLab(overWhite(rp, i * 4)));
    errs[i] = dE(sSoft[i], rSoft[i]);
    if (sp[i * 4 + 3] <= 8 && rp[i * 4 + 3] <= 8) continue;
    dN++;
    if (errs[i] > 15) sBad++;
    if (interior[i]) (iSum += e), iN++, e > 10 && iBad++;
    else eN++, e > 10 && eBad++;
  }
  const pct = (a: number, b: number) => +((a / Math.max(1, b)) * 100).toFixed(2);
  const metrics = {
    structuralBadPct: pct(sBad, dN),
    interiorMeanDeltaE: +(iSum / Math.max(1, iN)).toFixed(2),
    interiorBadPct: pct(iBad, iN),
    edgeBadPct: pct(eBad, eN),
    svgBytes: Buffer.byteLength(svg),
  };

  // preview.png: source | svg render | structural diff heatmap, on a checkerboard, upscaled for inspection.
  const z = Math.max(1, Math.min(4, Math.round(600 / Math.max(w, h))));
  const prev = new Jimp(w * 3 * z, h * z);
  const pd = prev.bitmap.data;
  const pw = w * 3 * z;
  for (let y = 0; y < h * z; y++)
    for (let x = 0; x < w * z; x++) {
      const si = (Math.floor(y / z) * w + Math.floor(x / z)) * 4;
      const checker = ((x >> 3) + (y >> 3)) & 1 ? 235 : 255;
      const put = (ox: number, c: RGB) => {
        const o = (y * pw + ox + x) * 4;
        pd[o] = c[0]; pd[o + 1] = c[1]; pd[o + 2] = c[2]; pd[o + 3] = 255;
      };
      const comp = (d: Uint8Array | Buffer): RGB => {
        const a = d[si + 3] / 255;
        return [0, 1, 2].map((k) => checker + (d[si + k] - checker) * a) as RGB;
      };
      put(0, comp(sp));
      put(w * z, comp(rp));
      const e = Math.min(1, errs[si / 4] / 30);
      put(2 * w * z, [255, Math.round(255 * (1 - e)), Math.round(255 * (1 - e))]);
    }
  fs.mkdirSync(reportDir, { recursive: true });
  await prev.writeAsync(path.join(reportDir, "preview.png"));
  return metrics;
}

// ---------- main ----------

async function main() {
  const { input, output, opts: o } = parseArgs(process.argv.slice(2));
  const src = await Jimp.read(input);
  const { width: W, height: H } = src.bitmap;

  const interior = interiorMap(src);
  const { palette, note } = choosePalette(src, interior, o);
  const labs = palette.map(rgbToLab);
  const nearest = (lab: Lab, allowed: number) => {
    let best = -1, bd = Infinity;
    labs.forEach((c, j) => {
      if (!(allowed & (1 << j))) return;
      const d = dE(lab, c);
      if (d < bd) (bd = d), (best = j);
    });
    return best;
  };
  const ALL = (1 << palette.length) - 1;

  // Per source pixel, the colors it may take: those of "anchor" pixels within 3px —
  // low-contrast pixels (a looser interior test, so textured fills still qualify).
  // An antialiased yellow→white edge can then only become yellow or white, never a
  // third in-between color tracing as a halo.
  const sd = src.bitmap.data;
  const srcLabel = new Int16Array(W * H);
  const anchor = interiorMap(src, 60);
  for (let p = 0; p < W * H; p++) srcLabel[p] = anchor[p] ? nearest(rgbToLab([sd[p * 4], sd[p * 4 + 1], sd[p * 4 + 2]]), ALL) : -1;
  const allowed = new Int32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let m = 0;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const l = srcLabel[yy * W + xx];
          if (l >= 0) m |= 1 << l;
        }
      if (!m) m = ALL;
      // A non-anchor pixel whose nearest color its anchors don't offer is either a
      // blend (lies between two anchor colors → keep restricted) or a real thin
      // feature like a 2px outline (→ allow its own color, or it gets erased).
      const p = y * W + x;
      if (!anchor[p] && sd[p * 4 + 3] >= 128) {
        const rgb: RGB = [sd[p * 4], sd[p * 4 + 1], sd[p * 4 + 2]];
        const own = nearest(rgbToLab(rgb), ALL);
        if (!(m & (1 << own)) && !isBlend(rgb, palette, m)) m |= 1 << own;
      }
      allowed[p] = m;
    }

  // Label at upscaled resolution: bicubic upscale smooths stair-steps before labelling.
  const up = src.clone().resize(W * o.scale, H * o.scale, Jimp.RESIZE_BICUBIC);
  const w = up.bitmap.width, h = up.bitmap.height, ud = up.bitmap.data;
  const labels = new Int16Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (ud[i * 4 + 3] < 128) { labels[i] = -1; continue; }
    const sp = Math.min(H - 1, Math.floor(Math.floor(i / w) / o.scale)) * W + Math.min(W - 1, Math.floor((i % w) / o.scale));
    labels[i] = nearest(rgbToLab([ud[i * 4], ud[i * 4 + 1], ud[i * 4 + 2]]), allowed[sp]);
  }

  const bg = o.keepBg ? -1 : detectBackground(up, labels, w, h);
  const area = palette.map(() => 0);
  for (const l of labels) if (l >= 0) area[l]++;
  // Bottom-to-top: largest area first, so small details sit on top.
  const order = palette.map((_, i) => i).filter((i) => i !== bg && area[i] > 0).sort((a, b) => area[b] - area[a]);

  const layers: { id: string; fill: string; d: string; areaPct: number }[] = [];
  for (let n = 0; n < order.length; n++) {
    const members = new Set(o.layering === "stacked" ? order.slice(n) : [order[n]]);
    const mask = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = members.has(labels[i]) ? 1 : 0;
    // Grow every layer but the bottom one: cutout layers then meet without seams, and
    // stacked layers fully cover the edge of the union beneath them (no fringe).
    const raw = await tracePath(mask, w, h, o, n > 0);
    const d = rescalePath(raw, o.scale, o.precision);
    if (!d) continue;
    const ci = order[n];
    layers.push({ id: `layer-${layers.length}`, fill: rgbToHex(palette[ci]), d, areaPct: +((area[ci] / (w * h)) * 100).toFixed(2) });
  }

  const bgLayer = bg >= 0 ? `  <rect id="background" width="${W}" height="${H}" fill="${rgbToHex(palette[bg])}"/>\n` : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n` +
    bgLayer +
    layers.map((l) => `  <path id="${l.id}" fill="${l.fill}" fill-rule="evenodd" d="${l.d}"/>`).join("\n") +
    `\n</svg>\n`;
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, svg);

  if (o.ts) {
    const ts =
      `// Traced from ${path.relative(process.cwd(), path.resolve(input))} (${W}×${H}) by raster-to-svg ` +
      `(preset ${o.preset}, ${o.layering}, ×${o.scale}). Layers are bottom → top.\n` +
      `export const VIEWBOX = "0 0 ${W} ${H}";\n` +
      (bg >= 0 ? `export const BACKGROUND = "${rgbToHex(palette[bg])}";\n` : "") +
      `export const LAYERS = [\n` +
      layers.map((l) => `  { id: "${l.id}", fill: "${l.fill}", d: "${l.d}" },`).join("\n") +
      `\n] as const;\n`;
    fs.mkdirSync(path.dirname(path.resolve(o.ts)), { recursive: true });
    fs.writeFileSync(o.ts, ts);
  }

  const reportDir = o.report ?? path.join(path.dirname(output), path.basename(output, ".svg") + ".report");
  const metrics = await score(src, interior, svg, reportDir);
  const summary = {
    input, output, size: [W, H], preset: o.preset, layering: o.layering, palette: note,
    background: bg >= 0 ? rgbToHex(palette[bg]) : null,
    layers: layers.map(({ id, fill, areaPct }) => ({ id, fill, areaPct })),
    metrics,
    preview: path.join(reportDir, "preview.png"),
  };
  fs.writeFileSync(path.join(reportDir, "metrics.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
