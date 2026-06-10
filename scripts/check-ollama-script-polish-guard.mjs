#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  decideScriptPolishAcceptance,
  estimateCompactKoreanChars,
} from "../electron/services/ollama-script-polish-guard.mjs";

assert.equal(estimateCompactKoreanChars("첫 장면입니다. 둘째 장면입니다."), 15);

assert.deepEqual(decideScriptPolishAcceptance({
  originalScript: "첫 장면입니다.",
  polishedScript: "첫 장면입니다.",
  scriptPolishEnabled: false,
}), { accept: false, reason: "SCRIPT_POLISH_DISABLED" });

assert.equal(decideScriptPolishAcceptance({
  originalScript: "첫 장면입니다.",
  polishedScript: "첫 장면입니다. 너무 길게 늘어납니다. 너무 길게 늘어납니다. 너무 길게 늘어납니다.",
  scriptPolishEnabled: true,
}).accept, false);

assert.equal(decideScriptPolishAcceptance({
  originalScript: "첫 장면입니다.",
  polishedScript: "첫 장면입니다!",
  scriptPolishEnabled: true,
}).accept, true);

console.log(JSON.stringify({ ok: true, checked: "ollama-script-polish-guard" }));
