import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const media = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");

assert.match(media, /async\s+function\s+focusPromptTextboxForFlow/, "Flow media should focus and verify the prompt textbox before typing");
assert.match(media, /FLOW_PROMPT_TEXTBOX_NOT_FOCUSED/, "prompt focus failure should have a specific code");
assert.match(media, /FLOW_PROMPT_INSERT_VERIFY_FAILED/, "prompt insertion verification failure should have a specific code");
assert.match(media, /promptHash\(prompt\)/, "prompt insertion should verify against a stable prompt hash");
assert.match(media, /focusPromptTextboxForFlow\(page,\s*prompt,\s*\{[\s\S]*?jobDir[\s\S]*?sceneOrder/, "submit should pass diagnostics context into prompt focus guard");
assert.match(media, /for\s*\(let attempt = 1;\s*attempt <= 5;\s*attempt \+= 1\)/, "prompt focus guard should retry before hard failing");
assert.match(media, /focusPromptTextboxByDom/, "prompt focus guard should use DOM focus fallback, not only coordinate click");
assert.match(media, /attemptCloseFlowGeneratorMenu\(page\)/, "prompt focus guard should close menus or overlays that can steal focus");
assert.match(media, /flow_prompt_focus_failed\.json/, "prompt focus hard failure should write diagnostics");
assert.match(media, /ensureFlowGeneratorMenuClosedBeforeSubmit\(\{ page, jobDir, sceneOrder \}\);[\s\S]*?submitPromptToFlowAgain\(page, activePrompt, \{ jobDir, sceneOrder \}\)/, "generation-failed retry should close menus before retry submit");
assert.doesNotMatch(
  media,
  /await page\.mouse\.click\(textboxResult\.textbox\.x, textboxResult\.textbox\.y\);\s*await page\.keyboard\.press\(process\.platform === "darwin" \? "Meta\+A" : "Control\+A"\);/,
  "Flow submit should not clear text before verifying textbox focus"
);

console.log("[flow-prompt-focus-guard] ok");
