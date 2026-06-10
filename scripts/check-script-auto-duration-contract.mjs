#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { estimateDirectScriptSeconds, estimateDirectScriptDuration } from "../electron/services/direct-script-duration.mjs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";
import { buildDirectScriptDraft } from "../electron/services/direct-script-draft-service.mjs";
import { buildRenderOptions } from "../youtube-workflow.mjs";
import { estimateKoreanNarrationSeconds, validateDraftDurationContract } from "./youtube-draft-duration.mjs";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");
const timeline = readFileSync(resolve(root, "timeline.md"), "utf8");

const script = "첫 문장은 시청자의 호기심을 엽니다. 두 번째 문장은 핵심 상황을 설명합니다. 세 번째 문장은 구체적인 장면을 보여줍니다.";
const estimated = estimateDirectScriptSeconds({ script, speechSpeed: 1.0 });
const fastEstimate = estimateDirectScriptSeconds({ script, speechSpeed: 2.0 });

assert.ok(estimated >= 15, "auto duration should clamp short scripts to at least 15 seconds");
assert.ok(estimated <= 1200, "auto duration should stay within renderer limits");
assert.equal(
  fastEstimate,
  estimateDirectScriptSeconds({ script, speechSpeed: 1.5 }),
  "speech speed should clamp to the shared 1.5 upper bound",
);
assert.equal(
  estimateDirectScriptDuration({ script, targetSeconds: estimated, speechSpeed: 1.0 }).severity,
  "ok",
  "a script's own auto duration should not warn as too short or too long",
);
assert.match(html, /<option value="auto"[^>]*>/, "UI must expose auto duration mode");
assert.match(renderer, /estimatedScriptSeconds/, "renderer must submit estimatedScriptSeconds");
assert.match(renderer, /durationSource:[\s\S]*"script-auto"/, "renderer must mark script auto duration source");

const autoJob = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: script,
  options: {
    scriptLengthMode: "auto",
    estimatedScriptSeconds: estimated,
    customDurationSeconds: 60,
    voiceId: "male_30_announcer",
  },
});

assert.equal(autoJob.options.scriptLengthMode, "auto");
assert.equal(autoJob.options.durationSource, "script-auto");
assert.equal(autoJob.options.customDurationSeconds, estimated);
assert.equal(autoJob.options.estimatedScriptSeconds, estimated);

const longformAutoJob = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: `${script} `.repeat(80),
  options: {
    videoFormat: "longform",
    scriptLengthMode: "auto",
    estimatedScriptSeconds: 640,
    customDurationSeconds: 60,
    longformTargetSeconds: 720,
    voiceId: "male_30_announcer",
  },
});

assert.equal(longformAutoJob.options.scriptLengthMode, "auto", "longform schema must not overwrite script auto mode");
assert.equal(longformAutoJob.options.durationSource, "script-auto");
assert.equal(longformAutoJob.options.customDurationSeconds, 640);

const draft = buildDirectScriptDraft(autoJob);
assert.equal(draft.duration_seconds, estimated);
assert.equal(draft.duration_source, "script-auto");
assert.equal(draft.estimated_duration_seconds, estimated);
assert.equal(
  draft.scenes.reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0),
  estimated,
);

const renderOptions = buildRenderOptions(autoJob);
assert.equal(renderOptions.targetSeconds, estimated);
assert.equal(renderOptions.durationSource, "script-auto");

const durationQa = validateDraftDurationContract({
  draft,
  job: autoJob,
  stage: "unit",
  jobDir: "unit-script-auto",
});
assert.equal(durationQa.ok, true);
assert.equal(durationQa.targetSeconds, estimated);
assert.equal(
  estimateKoreanNarrationSeconds({ text: script, speechSpeed: 1.0 }),
  estimateDirectScriptSeconds({ script, speechSpeed: 1.0, minSeconds: 0, round: false }),
  "draft duration QA must use the same direct script duration estimator",
);

assert.match(workflow, /durationSource/, "workflow progress/render options should expose durationSource");
assert.match(workflow, /estimatedScriptSeconds/, "workflow progress/render options should expose estimatedScriptSeconds");
assert.match(packageJson, /check-script-auto-duration-contract\.mjs/, "npm run check should include script auto duration contract");
assert.match(timeline, /Script auto duration|대본.*자동/i, "timeline should record the script auto duration feature");

console.log(JSON.stringify({ ok: true, checked: "script-auto-duration-contract", estimated }));
