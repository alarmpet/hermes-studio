#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function writeBaseFixture(jobDir) {
  writeJson(join(jobDir, "job-request.json"), {
    id: "qa-soft-slowdown-fixture",
    sourceType: "url",
    sourceValue: "https://example.com/article",
    options: {
      scriptStructure: "hpsl",
      customDurationSeconds: 60,
    },
  });

  writeJson(join(jobDir, "draft.json"), {
    title: "펜타닐의 위험성",
    structure: "HPSL",
    hpsl: {
      hook: { goal: "Hook", narration: "한 번의 호기심이 삶을 흔들 수 있습니다.", target_seconds: 7 },
      point: { goal: "Point", narration: "펜타닐은 매우 강한 마약성 진통제입니다.", target_seconds: 13 },
      story: { goal: "Story", narration: "처음에는 통증 완화로 시작되지만 오남용은 위험합니다.", target_seconds: 30 },
      lesson: { goal: "Lesson", narration: "의사의 처방 없는 사용은 피해야 합니다.", target_seconds: 10 },
    },
    script: "한 번의 호기심이 삶을 흔들 수 있습니다. 펜타닐은 매우 강한 마약성 진통제입니다. 처음에는 통증 완화로 시작되지만 오남용은 위험합니다. 의사의 처방 없는 사용은 피해야 합니다.",
    scenes: [
      {
        order: 1,
        narration: "한 번의 호기심이 삶을 흔들 수 있습니다.",
        image_prompt: "cinematic symbolic hourglass",
        visual_category: "curiosity-object",
      },
      {
        order: 2,
        narration: "펜타닐은 매우 강한 마약성 진통제입니다.",
        image_prompt: "generic medicine bottle in a hospital cabinet",
        visual_category: "core-fact-demo",
        outputMode: "image",
      },
    ],
  });

  writeJson(join(jobDir, "scene_audio_manifest.json"), {
    ok: true,
    scenes: [
      { order: 1, duration: 11.35, text: "한 번의 호기심이 삶을 흔들 수 있습니다." },
      { order: 2, duration: 8, text: "펜타닐은 매우 강한 마약성 진통제입니다." },
    ],
  });
}

function writeRenderReport(jobDir, firstScene) {
  const secondOrder = Number(firstScene.order) === 2 ? 1 : 2;
  writeJson(join(jobDir, "render-report-v2.json"), {
    ok: true,
    finalDuration: 56.67,
    subtitleEnd: 56.63,
    freezeRisk: "low",
    requiresRegeneration: false,
    scenes: [
      firstScene,
      {
        order: secondOrder,
        videoDuration: 8,
        audioDuration: 8,
        ratio: 1,
        strategy: "setpts",
        extraHoldSeconds: 0,
        requiresRegeneration: false,
        sceneOutputMode: "video",
      },
    ],
  });
}

let tempJobDir = "";
try {
  tempJobDir = mkdtempSync(join(tmpdir(), "hermes-soft-slowdown-qa-"));
  writeBaseFixture(tempJobDir);

  writeRenderReport(tempJobDir, {
    order: 1,
    videoDuration: 8,
    audioDuration: 11.35,
    ratio: 1.41875,
    strategy: "slowdown-loop",
    extraHoldSeconds: 3.35,
    requiresRegeneration: false,
    sceneOutputMode: "video",
  });
  const softResult = analyzeYouTubeOutput(tempJobDir);
  assert.equal(softResult.ok, true, "policy-approved soft slowdown should not fail final output QA");
  assert.equal(
    softResult.failureCodes.includes("HARD_FREEZE_RISK"),
    false,
    "policy-approved soft slowdown should not trigger HARD_FREEZE_RISK",
  );
  assert.ok(
    Array.isArray(softResult.details.softDurationWarnings),
    "soft slowdown warnings should remain observable",
  );

  writeRenderReport(tempJobDir, {
    order: 1,
    videoDuration: 8,
    audioDuration: 11.35,
    ratio: 1.41875,
    strategy: "slowdown-loop",
    extraHoldSeconds: 3.35,
    requiresRegeneration: false,
    freezeRisk: "high",
    sceneOutputMode: "video",
  });
  const staleFreezeFlagResult = analyzeYouTubeOutput(tempJobDir);
  assert.equal(
    staleFreezeFlagResult.failureCodes.includes("HARD_FREEZE_RISK"),
    false,
    "stale freezeRisk flags should not override a policy-approved slowdown-loop",
  );

  writeRenderReport(tempJobDir, {
    order: 2,
    videoDuration: 8,
    audioDuration: 20,
    ratio: 2.5,
    strategy: "slowdown-loop",
    extraHoldSeconds: 12,
    requiresRegeneration: false,
  });
  const imageFallbackResult = analyzeYouTubeOutput(tempJobDir);
  assert.equal(
    imageFallbackResult.failureCodes.includes("HARD_FREEZE_RISK"),
    false,
    "draft outputMode should be used as fallback for image-mode soft motion scenes",
  );

  writeRenderReport(tempJobDir, {
    order: 1,
    videoDuration: 8,
    audioDuration: 14,
    ratio: 1.75,
    strategy: "tpad",
    extraHoldSeconds: 6,
    requiresRegeneration: true,
    sceneOutputMode: "video",
  });
  const hardResult = analyzeYouTubeOutput(tempJobDir);
  assert.equal(hardResult.ok, false, "real hard freeze should still fail final output QA");
  assert.equal(hardResult.failureCodes.includes("HARD_FREEZE_RISK"), true);
} finally {
  if (tempJobDir && existsSync(tempJobDir)) {
    rmSync(tempJobDir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ ok: true, checked: "final-output-soft-slowdown-qa" }));
