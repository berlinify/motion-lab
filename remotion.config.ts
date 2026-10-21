import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// WebGL (three.js / R3F) needs a GPU-capable GL backend in headless Chrome.
Config.setChromiumOpenGlRenderer("angle");
