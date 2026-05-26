#!/usr/bin/env node
import assert from "node:assert/strict";
import { OPENAI_PROVIDER_MODES, buildOpenAiSceneSchema, shouldUseOpenAiProvider } from "../electron/services/openai-provider-contract.mjs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

assert.deepEqual(OPENAI_PROVIDER_MODES, ["disabled", "thumbnail-api", "scene-json-api", "prompt-qa-api"]);

const defaultJob = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "First scene. Second scene. Third scene.",
});
assert.equal(defaultJob.options.openaiProviderMode, "disabled");
assert.equal(shouldUseOpenAiProvider(defaultJob.options), false, "OpenAI API must be off by default");

const schema = buildOpenAiSceneSchema();
assert.equal(schema.type, "json_schema");
assert.equal(schema.strict, true);
assert.equal(schema.schema.type, "object");
assert.ok(schema.schema.required.includes("scenes"));
assert.ok(schema.schema.properties.scenes.items.required.includes("image_prompt"));

console.log(JSON.stringify({ ok: true, checked: "openai-provider-optional-contract" }));
