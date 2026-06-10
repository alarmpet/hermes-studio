import assert from "node:assert/strict";

import {
  applyOllamaStoryboardHints,
  buildOllamaStoryboardPrompt,
  normalizeOllamaStoryboardHints,
  runOllamaStoryboardAssist,
} from "../electron/services/ollama-storyboard-assist.mjs";

const draft = {
  title: "스마트 안경의 현실",
  script: "스마트 안경은 편리하지만 사생활 논란도 큽니다.",
  scenes: [
    {
      order: 1,
      narration: "스마트 안경은 손을 쓰지 않고 정보를 보여줍니다.",
      image_prompt: "Original prompt one.",
      duration_seconds: 8,
    },
    {
      order: 2,
      narration: "하지만 녹화 여부를 주변 사람이 알기 어렵습니다.",
      image_prompt: "Original prompt two.",
      duration_seconds: 7,
    },
  ],
};

const prompt = buildOllamaStoryboardPrompt({ draft });
assert.match(prompt, /Return JSON only/i);
assert.match(prompt, /scene_purpose/);
assert.match(prompt, /스마트 안경은 손을 쓰지 않고 정보를 보여줍니다/);

const hints = normalizeOllamaStoryboardHints({
  scenes: [
    {
      order: 1,
      narration: "LLM must not replace narration.",
      duration_seconds: 99,
      image_prompt: "LLM must not replace image prompt.",
      scene_purpose: "Show practical hands-free value.",
      visual_subject: "Smart glasses lens reflection",
      camera: "close-up lens reflection, then medium shot",
      mood: "curious and practical",
      motion: "slow push-in",
      negative_prompt: "no readable text",
      unknown_field: "must be removed",
    },
  ],
});

assert.deepEqual(Object.keys(hints.scenes[0]).sort(), [
  "camera",
  "mood",
  "motion",
  "negative_prompt",
  "order",
  "scene_purpose",
  "visual_subject",
]);

const assisted = applyOllamaStoryboardHints({ draft, hints });
assert.equal(assisted.scenes[0].narration, draft.scenes[0].narration);
assert.equal(assisted.scenes[0].duration_seconds, draft.scenes[0].duration_seconds);
assert.equal(assisted.scenes[0].image_prompt, draft.scenes[0].image_prompt);
assert.equal(assisted.scenes[0].storyboard_hint.scene_purpose, "Show practical hands-free value.");
assert.equal(assisted.scenes[0].storyboard_hint.camera, "close-up lens reflection, then medium shot");
assert.equal(assisted.scenes[1].storyboard_hint, undefined);
assert.equal(assisted.ollama_storyboard_assist.applied, true);
assert.equal(assisted.ollama_storyboard_assist.hintCount, 1);

const rejected = applyOllamaStoryboardHints({ draft, hints: { scenes: [] } });
assert.equal(rejected.ollama_storyboard_assist.applied, false);
assert.equal(rejected.scenes[0].storyboard_hint, undefined);

const disabled = await runOllamaStoryboardAssist({
  draft,
  config: { enabled: false, baseUrl: "http://127.0.0.1:11434", model: "gemma4:12b" },
  requestJson: async () => {
    throw new Error("disabled assist must not call provider");
  },
});
assert.equal(disabled.draft, draft);
assert.equal(disabled.diagnostics.failureCode, "OLLAMA_DISABLED");

const assistedRun = await runOllamaStoryboardAssist({
  draft,
  config: { enabled: true, allowed: true, baseUrl: "http://127.0.0.1:11434", model: "gemma4:12b" },
  requestJson: async ({ taskName, prompt }) => ({
    ok: true,
    parsed: { scenes: [{ order: 2, camera: "wide privacy-aware crowd shot" }] },
    diagnostics: { provider: "ollama", taskName, promptLength: prompt.length },
  }),
});
assert.equal(assistedRun.draft.scenes[1].storyboard_hint.camera, "wide privacy-aware crowd shot");
assert.equal(assistedRun.diagnostics.ok, true);

const failedRun = await runOllamaStoryboardAssist({
  draft,
  config: { enabled: true, allowed: true, baseUrl: "http://127.0.0.1:11434", model: "missing" },
  requestJson: async () => ({
    ok: false,
    failure: { failureCode: "OLLAMA_MODEL_UNAVAILABLE", message: "model missing" },
    diagnostics: { provider: "ollama" },
  }),
});
assert.equal(failedRun.draft, draft);
assert.equal(failedRun.diagnostics.failureCode, "OLLAMA_MODEL_UNAVAILABLE");

console.log(JSON.stringify({ ok: true, checked: "ollama-storyboard-assist" }));
