// Side-by-side zoom of one region: source (left) | SVG render (right), on grey.
// Use it to inspect seams, halos and lost thin features that preview.png is too small to show.
//
//   npx tsx .claude/skills/raster-to-svg/scripts/zoom.ts <src.png> <out.svg> <zoom.png> <x> <y> <w> <h> [factor=4]
//
// x/y/w/h are in source pixels.
import fs from "node:fs";
import Jimp from "jimp";
import { Resvg } from "@resvg/resvg-js";

const [srcPath, svgPath, outPath, ...nums] = process.argv.slice(2);
const [x, y, w, h, z = 4] = nums.map(Number);
if (!outPath || [x, y, w, h].some((n) => !Number.isFinite(n))) {
  console.log("Usage: zoom.ts <src.png> <out.svg> <zoom.png> <x> <y> <w> <h> [factor=4]");
  process.exit(1);
}

const src = await Jimp.read(srcPath);
const rendered = new Resvg(fs.readFileSync(svgPath, "utf8"), {
  fitTo: { mode: "width", value: src.bitmap.width * z },
  background: "#888",
}).render();
const svgImg = (await Jimp.read(Buffer.from(rendered.asPng()))).crop(x * z, y * z, w * z, h * z);
const left = new Jimp(w * z, h * z, 0x888888ff).composite(
  src.clone().crop(x, y, w, h).resize(w * z, h * z, Jimp.RESIZE_NEAREST_NEIGHBOR),
  0,
  0,
);
const out = new Jimp(w * z * 2 + 4, h * z, 0xff00ffff).composite(left, 0, 0).composite(svgImg, w * z + 4, 0);
await out.writeAsync(outPath);
console.log(outPath);
