import { defineConfig } from "vite";
import motionCanvasModule from "@motion-canvas/vite-plugin";
import ffmpegModule from "@motion-canvas/ffmpeg";

// Both packages ship CJS default exports; unwrap for ESM interop.
const motionCanvas = (motionCanvasModule as any).default ?? motionCanvasModule;
const ffmpeg = (ffmpegModule as any).default ?? ffmpegModule;

export default defineConfig({
  plugins: [motionCanvas({ project: "./src/motion-canvas/project.ts" }), ffmpeg()],
});
