#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { detectVisualRepetition } from "./analyze-youtube-output.mjs";

const repeatedTechPrompts = [
  "9:16 video. Visual goal: Google Glass close-up on a face. Action: person wearing smart glasses in office. Camera: close-up.",
  "9:16 video. Visual goal: Google Glass close-up on a face. Action: person wearing smart glasses in office. Camera: close-up.",
  "9:16 video. Visual goal: Google Glass close-up on a face. Action: person wearing smart glasses in office. Camera: close-up.",
  "9:16 video. Visual goal: Google Glass close-up on a face. Action: person wearing smart glasses in office. Camera: close-up.",
];

const variedPrompts = [
  "9:16 video. Visual category: product-closeup. Action: smart glasses lens showing subtle AR reflection.",
  "9:16 video. Visual category: real-world-use-case. Action: technician repairs equipment hands-free.",
  "9:16 video. Visual category: privacy-risk. Action: camera indicator light turns on in public space.",
  "9:16 video. Visual category: takeaway-metaphor. Action: balanced choice between convenience and privacy.",
];

const repeated = detectVisualRepetition(
  repeatedTechPrompts,
  ["product-closeup", "product-closeup", "product-closeup", "product-closeup"],
);
assert.equal(repeated.repetitionRisk, true);
assert.ok(repeated.maxPromptSimilarity >= 0.75);
assert.ok(repeated.categoryDominance >= 0.75);

const varied = detectVisualRepetition(
  variedPrompts,
  ["product-closeup", "real-world-use-case", "privacy-risk", "takeaway-metaphor"],
);
assert.equal(varied.repetitionRisk, false);

const policySafeBoilerplatePrompts = [
  "9:16 cinematic YouTube shorts B-roll scene. Visual category: curiosity-object. Visual goal: make this narration instantly understandable without showing subtitles or text: Hook. Action: a concrete real-world demonstration of the narration idea. Scene keywords: salary gap, surprise, comparison. Variation: show cause and effect through visible motion. Context keywords: company compensation; clear cause and effect, visible action, simple visual metaphor. Camera: dynamic close-up to medium shot, smooth handheld or dolly motion, clear subject focus, polished realistic lighting. Character consistency: if a recurring human is needed, use an anonymous presenter; otherwise prioritize objects. No talking head, avoid a person simply speaking to camera. Do not depict any identifiable real public figure, celebrity, politician, athlete, influencer, or named private person. No logos, no readable text, no subtitles, no watermarks.",
  "9:16 cinematic YouTube shorts B-roll scene. Visual category: simple-comparison. Visual goal: make this narration instantly understandable without showing subtitles or text: Point. Action: two anonymous office desks contrasted with different benefit envelopes. Scene keywords: average, salary, semiconductor. Variation: use a close-up detail shot before revealing the wider situation. Context keywords: company compensation; clear cause and effect, visible action, simple visual metaphor. Camera: dynamic close-up to medium shot, smooth handheld or dolly motion, clear subject focus, polished realistic lighting. Character consistency: if a recurring human is needed, use an anonymous presenter; otherwise prioritize objects. No talking head, avoid a person simply speaking to camera. Do not depict any identifiable real public figure, celebrity, politician, athlete, influencer, or named private person. No logos, no readable text, no subtitles, no watermarks.",
  "9:16 cinematic YouTube shorts B-roll scene. Visual category: risk-or-tension. Visual goal: make this narration instantly understandable without showing subtitles or text: Story. Action: workers walking past a factory gate while budget documents are stacked. Scene keywords: pressure, capital, competition. Variation: show the consequence first, then reveal the cause. Context keywords: company compensation; clear cause and effect, visible action, simple visual metaphor. Camera: dynamic close-up to medium shot, smooth handheld or dolly motion, clear subject focus, polished realistic lighting. Character consistency: if a recurring human is needed, use an anonymous presenter; otherwise prioritize objects. No talking head, avoid a person simply speaking to camera. Do not depict any identifiable real public figure, celebrity, politician, athlete, influencer, or named private person. No logos, no readable text, no subtitles, no watermarks.",
  "9:16 cinematic YouTube shorts B-roll scene. Visual category: takeaway-metaphor. Visual goal: make this narration instantly understandable without showing subtitles or text: Lesson. Action: a balanced scale with talent on one side and company growth on the other. Scene keywords: value, growth, lesson. Variation: end with a symbolic visual metaphor. Context keywords: company compensation; clear cause and effect, visible action, simple visual metaphor. Camera: dynamic close-up to medium shot, smooth handheld or dolly motion, clear subject focus, polished realistic lighting. Character consistency: if a recurring human is needed, use an anonymous presenter; otherwise prioritize objects. No talking head, avoid a person simply speaking to camera. Do not depict any identifiable real public figure, celebrity, politician, athlete, influencer, or named private person. No logos, no readable text, no subtitles, no watermarks.",
];
const boilerplateVaried = detectVisualRepetition(
  policySafeBoilerplatePrompts,
  ["curiosity-object", "simple-comparison", "risk-or-tension", "takeaway-metaphor"],
);
assert.equal(boilerplateVaried.repetitionRisk, false, "shared safety boilerplate should not cause a repetition failure");

const policySafeLocalJob = "C:/Users/amd/AppData/Roaming/hermes/outputs/desktop/youtube-1779721136244/draft.json";
if (existsSync(policySafeLocalJob)) {
  const draft = JSON.parse(readFileSync(policySafeLocalJob, "utf8"));
  const prompts = draft.scenes.map((scene) => scene.image_prompt || "");
  const categories = draft.scenes.map((scene) => scene.visual_category || "");
  const local = detectVisualRepetition(prompts, categories);
  assert.equal(local.repetitionRisk, false, "policy-safe prompt boilerplate from the latest job should not fail visual repetition QA");
}

console.log(JSON.stringify({ ok: true, checked: "generic-visual-repetition-analyzer" }));
