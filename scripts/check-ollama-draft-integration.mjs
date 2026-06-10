import assert from "node:assert/strict";

import { buildDesktopJobRequest } from "../electron/services/youtube-job-service.mjs";
import { buildResearchDraft } from "../youtube-workflow-stages.mjs";

const request = buildDesktopJobRequest({
  id: "ollama-integration-unit",
  sourceType: "script",
  sourceValue: "첫 장면은 스마트 안경의 편리함입니다. 둘째 장면은 사생활 위험입니다.",
  ollamaAssistEnabled: true,
  ollamaBaseUrl: "http://192.168.0.8:11434/",
  ollamaModel: "gemma4:12b",
  ollamaUseCases: {
    storyboard: true,
    promptQa: false,
    failureReport: true,
  },
});

assert.equal(request.options.ollamaAssistEnabled, true);
assert.equal(request.options.ollamaBaseUrl, "http://192.168.0.8:11434");
assert.equal(request.options.ollamaModel, "gemma4:12b");
assert.equal(request.options.ollamaUseCases.storyboard, true);
assert.equal(request.options.ollamaUseCases.promptQa, false);
assert.equal(request.options.ollamaUseCases.failureReport, true);

const draft = await buildResearchDraft(request, {
  jobDir: "C:/tmp/hermes-ollama-contract",
  ollamaRequestJson: async () => ({
    ok: true,
    parsed: {
      scenes: [
        {
          order: 1,
          scene_purpose: "Open with a concrete convenience demo.",
          camera: "point-of-view smart glasses overlay",
        },
      ],
    },
    diagnostics: { provider: "ollama", taskName: "storyboard" },
  }),
});

assert.equal(draft.structure, "direct-script");
assert.equal(draft.ollama_storyboard_assist.applied, true);
assert.equal(draft.scenes[0].storyboard_hint.camera, "point-of-view smart glasses overlay");
assert.match(draft.scenes[0].image_prompt, /Visual goal:/);

const events = [];
await buildResearchDraft(request, {
  emit: (event) => events.push(event),
  ollamaRequestJson: async () => ({
    ok: true,
    parsed: {
      scenes: [
        { order: 1, scene_purpose: "Show a local visual plan." },
        { order: 2, camera: "wide establishing shot" },
      ],
    },
    diagnostics: { provider: "ollama", taskName: "storyboard" },
  }),
});
const assistEvent = events.find((event) => event.phase === "ollama-storyboard");
assert.deepEqual(assistEvent.details.appliedSceneOrders, [1, 2]);
assert.match(assistEvent.message, /Storyboard assist connected/i);

const disabledRequest = buildDesktopJobRequest({
  id: "ollama-disabled-unit",
  sourceType: "script",
  sourceValue: "짧은 대본입니다.",
});
const disabledDraft = await buildResearchDraft(disabledRequest, {
  ollamaRequestJson: async () => {
    throw new Error("disabled Ollama assist must not call provider");
  },
});
assert.equal(disabledDraft.ollama_storyboard_assist, undefined);

console.log(JSON.stringify({ ok: true, checked: "ollama-draft-integration" }));
