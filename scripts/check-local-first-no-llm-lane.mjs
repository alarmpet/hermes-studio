#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildDirectScriptDraft } from "../electron/services/direct-script-draft-service.mjs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const job = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "첫 장면입니다. 그런데 문제가 커집니다. 결국 결과가 남습니다.",
  options: {
    ollamaAssistEnabled: false,
    openaiProviderMode: "disabled",
    scriptLengthMode: "custom",
    customDurationSeconds: 24,
    flowOutputMode: "auto",
  },
});

const draft = buildDirectScriptDraft(job);
assert.equal(draft.structure, "direct-script");
assert.equal(job.options.ollamaAssistEnabled, false);
assert.equal(job.options.openaiProviderMode, "disabled");
assert.ok(draft.scenes.length >= 1);
assert.ok(draft.scenes.every((scene) => scene.image_prompt));
assert.doesNotMatch(draft.scenes.map((scene) => scene.image_prompt).join("\n"), /ollama|undefined|null/i);

console.log(JSON.stringify({ ok: true, checked: "local-first-no-llm-lane" }));
