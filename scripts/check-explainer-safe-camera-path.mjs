#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildStableCameraPath } from "../electron/services/stable-image-sequence-renderer.mjs";

const path = buildStableCameraPath({
  frameCount: 300,
  width: 2560,
  height: 1440,
  outputWidth: 1920,
  outputHeight: 1080,
  motionPreset: "hook-punch-zoom",
  motionStrength: "strong",
  cameraSafetyMode: "explainer",
});

const maxZoom = Math.max(...path.map((point) => Number(point.zoom || 1)));
const minCropWidth = Math.min(...path.map((point) => Number(point.cropWidth || 0)));
const minCropHeight = Math.min(...path.map((point) => Number(point.cropHeight || 0)));

assert.ok(maxZoom <= 1.12, `explainer strong zoom should stay <= 1.12, got ${maxZoom}`);
assert.ok(minCropWidth >= 1714, `explainer mode should preserve broad width context, got ${minCropWidth}`);
assert.ok(minCropHeight >= 964, `explainer mode should preserve broad height context, got ${minCropHeight}`);

console.log(JSON.stringify({ ok: true, checked: "explainer-safe-camera-path", maxZoom, minCropWidth, minCropHeight }));
