#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  chooseFlowGeneratorChip,
  flowChipClassifierBrowserSource,
  isAgentChip,
  isModelSettingsChip,
  rejectedFlowChipReasons,
} from "../automation/google-flow-chip-classifier.mjs";

const failedJobBottomButtons = [
  { label: "add_2 만들기 add_2만들기", x: 350, y: 647, width: 32, height: 32 },
  { label: "에이전트 에이전트", x: 387, y: 647, width: 76, height: 32 },
  { label: "🍌 Nano Banana Pro crop_9_16 1x 🍌 Nano Banana Procrop_9_161x", x: 729, y: 646, width: 166, height: 34 },
  { label: "arrow_forward 만들기 arrow_forward만들기", x: 900, y: 647, width: 32, height: 32 },
];

assert.equal(isAgentChip("에이전트 에이전트"), true);
assert.equal(isAgentChip("Agent Agent"), true);
assert.equal(isAgentChip("요청"), true);
assert.equal(isAgentChip("요청 사항"), true);
assert.equal(isModelSettingsChip("🍌 Nano Banana Pro crop_9_16 1x"), true);
assert.equal(isModelSettingsChip("Veo 3.1 - Lite 9:16 1x"), true);
assert.equal(isModelSettingsChip("Veo 3.2 crop_9_16 1x"), true);
assert.equal(isModelSettingsChip("Imagen 4 9:16 1x"), true);
assert.equal(isModelSettingsChip("에이전트 에이전트"), false);

const selected = chooseFlowGeneratorChip(failedJobBottomButtons);
assert.ok(selected, "classifier should select a bottom generator/model settings chip");
assert.match(selected.label, /Nano Banana Pro/i, "failed-job fixture must select Nano Banana Pro chip, not Agent");
assert.equal(selected.x, 729);

const rejected = rejectedFlowChipReasons(failedJobBottomButtons);
assert.ok(rejected.some((item) => item.reason === "agent-chip"), "agent chip rejection should be recorded");
assert.ok(rejected.some((item) => item.reason === "create-chip"), "create chip rejection should be recorded");

const videoStateButtons = [
  { label: "에이전트", x: 387, y: 647, width: 76, height: 32 },
  { label: "Veo 3.1 - Lite crop_9_16 1x", x: 720, y: 646, width: 190, height: 34 },
];
assert.match(chooseFlowGeneratorChip(videoStateButtons).label, /Veo 3\.1/i);

const browserHelpers = Function(`${flowChipClassifierBrowserSource()}; return { chooseFlowGeneratorChip, rejectedFlowChipReasons };`)();
const browserSelected = browserHelpers.chooseFlowGeneratorChip(failedJobBottomButtons);
assert.match(browserSelected.label, /Nano Banana Pro/i, "browser-eval classifier source should select the model chip");
assert.ok(
  browserHelpers.rejectedFlowChipReasons(failedJobBottomButtons).some((item) => item.reason === "agent-chip"),
  "browser-eval classifier source should preserve agent rejection reasons",
);

console.log(JSON.stringify({ ok: true, checked: "flow-chip-classifier" }));
