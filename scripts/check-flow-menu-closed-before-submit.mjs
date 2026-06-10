import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const media = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");
const outputMode = readFileSync(new URL("../automation/google-flow-output-mode.mjs", import.meta.url), "utf8");

assert.match(media, /ensureFlowGeneratorMenuClosedBeforeSubmit/, "Flow media should hard-gate submit on menu closure");
assert.match(media, /FLOW_GENERATOR_MENU_STILL_OPEN/, "open settings menu should have a specific failure code");
assert.match(media, /await\s+ensureFlowGeneratorMenuClosedBeforeSubmit\(\{[\s\S]*?sceneOrder[\s\S]*?\}\);[\s\S]*?submitPromptToFlowAgain/, "menu closure should be verified immediately before prompt submit");
assert.match(outputMode, /export\s+async\s+function\s+verifyGeneratorMenuClosed/, "menu closure verifier should be exported for media submit gate");
assert.match(outputMode, /ok:\s*selectedOutputMode\s*===\s*requested\s*&&\s*imageModelOk\s*&&\s*!generatorMenuOpen/, "mode verification should fail when generator menu is still open");

console.log("[flow-menu-closed-before-submit] ok");
