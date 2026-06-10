#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const analyzer = readFileSync(resolve(root, "scripts/analyze-youtube-output.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

assert.match(analyzer, /title-overlay\.json/, "final QA should read title-overlay.json metadata");
assert.match(analyzer, /TITLE_OVERLAY_LINE_OVERFLOW/, "final QA should classify too many title lines");
assert.match(analyzer, /TITLE_OVERLAY_TEXT_OVERFLOW/, "final QA should classify text that exceeds line-safe visual width");
assert.match(analyzer, /TITLE_OVERLAY_BAND_UNSAFE/, "final QA should classify unsafe title band geometry");
assert.match(analyzer, /titleOverlayQa/, "final QA result should include title overlay QA details");
assert.match(packageJson.scripts["check:final-output-qa"], /check-title-overlay-no-truncation\.mjs/, "final output QA check chain should include top-title truncation guard");

// Integration test for title overlay dynamic band safety QA check
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const tempDir = join(os.tmpdir(), `hermes-title-qa-test-${Date.now()}`);
mkdirSync(tempDir, { recursive: true });

try {
  // 1. Test case: Customized style that fits within dynamic limits (safeTop: 48 + bandHeight: 461 <= maxBandBottom: 514)
  const titleOverlayDataSafe = {
    enabled: true,
    width: 1080,
    height: 1920,
    safeTop: 48,
    bandHeight: 461,
    lines: ["나폴레옹 키의 진실"],
    style: {
      positionYPercent: 2.5,
      bandHeightPercent: 24,
      maxLines: 2
    }
  };
  writeFileSync(join(tempDir, "title-overlay.json"), JSON.stringify(titleOverlayDataSafe, null, 2), "utf8");

  const resultSafe = analyzeYouTubeOutput(tempDir);
  assert.ok(resultSafe.details.titleOverlayQa.ok, "titleOverlayQa must be ok");
  assert.equal(resultSafe.details.titleOverlayQa.warnings.length, 0, "should have no warnings");

  // 2. Test case: Customized style that overflows limits (safeTop: 48 + bandHeight: 520 > maxBandBottom: 514)
  const titleOverlayDataUnsafe = {
    enabled: true,
    width: 1080,
    height: 1920,
    safeTop: 48,
    bandHeight: 520,
    lines: ["나폴레옹 키의 진실"],
    style: {
      positionYPercent: 2.5,
      bandHeightPercent: 24,
      maxLines: 2
    }
  };
  writeFileSync(join(tempDir, "title-overlay.json"), JSON.stringify(titleOverlayDataUnsafe, null, 2), "utf8");

  const resultUnsafe = analyzeYouTubeOutput(tempDir);
  assert.equal(resultUnsafe.details.titleOverlayQa.ok, false, "should reject unsafe overlay geometry");
  assert.ok(resultUnsafe.failureCodes.includes("TITLE_OVERLAY_BAND_UNSAFE"), "should raise TITLE_OVERLAY_BAND_UNSAFE");
} finally {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup error
  }
}

console.log(JSON.stringify({ ok: true, checked: "title-overlay-no-truncation" }));
