// Satori: JSX -> SVG, then resvg: SVG -> PNG. Usage: npm run thumbnail -- "Title" out/thumb.png
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const require = createRequire(import.meta.url);
const font = (w: number) =>
  readFile(require.resolve(`@fontsource/inter/files/inter-latin-${w}-normal.woff`));

const [title = "Untitled", outPath = "out/thumbnail.png"] = process.argv.slice(2);

const svg = await satori(
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #0b0b0f, #2d1b69)",
      color: "white",
      fontSize: 96,
      fontWeight: 700,
      fontFamily: "Inter",
    }}
  >
    {title}
  </div>,
  {
    width: 1280,
    height: 720,
    // Satori accepts ttf/otf/woff only — not woff2.
    fonts: [
      { name: "Inter", data: await font(400), weight: 400, style: "normal" },
      { name: "Inter", data: await font(700), weight: 700, style: "normal" },
    ],
  },
);

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, new Resvg(svg).render().asPng());
console.log(`wrote ${outPath}`);
