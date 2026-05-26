#!/usr/bin/env node
import assert from "node:assert/strict";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";
import { buildDirectScriptDraft } from "../electron/services/direct-script-draft-service.mjs";

const script = "First scene opens the topic. Second scene explains the core point. Final scene gives the lesson.";

const job = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: script,
  options: {
    scriptLengthMode: "custom",
    customDurationSeconds: 45,
    stylePresetId: "cinematic-tech-news",
    characterSheet: {
      mode: "text-and-image",
      profileText: "A consistent Korean female tech reporter in her 30s, short black bob hair, navy blazer.",
      referenceImagePaths: ["C:/Users/amd/hermes/tests/fixtures/character-sheet.png"],
    },
  },
});

assert.equal(job.sourceType, "script");
assert.equal(job.options.scriptStructure, "direct-script");
assert.equal(job.options.sceneStrategy, "sentence-proportional");
assert.equal(job.options.stylePresetId, "cinematic-tech-news");
assert.equal(job.options.characterSheet.profileText.includes("Korean female tech reporter"), true);
assert.equal(job.options.openaiProviderMode, "disabled");

const draft = buildDirectScriptDraft(job);
assert.equal(draft.structure, "direct-script");
assert.equal(draft.script, job.sourceValue);
assert.ok(draft.scenes.length >= 3, "direct script should become sentence-based scenes");
assert.equal(draft.scenes[0].narration, "First scene opens the topic.");
assert.ok(draft.scenes[0].image_prompt.includes("cinematic") || draft.scenes[0].image_prompt.includes("Visual category"));

console.log(JSON.stringify({ ok: true, checked: "direct-script-source-mode" }));
