#!/usr/bin/env node
import assert from "node:assert/strict";
import { looksLikeCorruptKorean, validateTtsNarrationScenes } from "../electron/services/korean-text-guard.mjs";

const normalQuestionNarration = "그런데 도대체 왜 이런 오해가 생겼을까요? 승자가 기록을 남겼기 때문일까요? 아닙니다.";
assert.equal(
  looksLikeCorruptKorean(normalQuestionNarration),
  false,
  "normal Korean narration with multiple question marks must not be treated as mojibake",
);

const corruptNarration = "筌ㅼ뮇??AI ??곷뮞 ?癒?カ????쥓?ㅵ칰??類ｂ봺???ュ칰醫롫뮸??덈뼄.";
assert.equal(
  looksLikeCorruptKorean(corruptNarration),
  true,
  "mojibake-heavy narration should still be treated as corrupt",
);

assert.doesNotThrow(() => validateTtsNarrationScenes([
  { order: 1, narration: "우리는 이렇게 배웠죠?" },
  { order: 2, narration: normalQuestionNarration },
]));

assert.throws(
  () => validateTtsNarrationScenes([{ order: 3, narration: corruptNarration }]),
  /DRAFT_NARRATION_CORRUPTED.*scene=3/,
  "corrupt narration should fail before TTS with a clear scene number",
);

console.log(JSON.stringify({ ok: true, checked: "tts-korean-text-guard" }));
