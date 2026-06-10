#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const media = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");

assert.match(
  media,
  /modeSelectionMatches[\s\S]*?finalModeVerification\.generatorMenuOpen[\s\S]*?attemptCloseFlowGeneratorMenu/,
  "Flow mode verification should close the generator menu before treating a matching mode as failure",
);
assert.match(
  media,
  /modeStateWithSpecificMenuFailure/,
  "Flow media should normalize menu-open failures separately from output-mode mismatches",
);
assert.match(
  media,
  /FLOW_GENERATOR_MENU_STILL_OPEN/,
  "matching selected mode with an open menu should use a specific menu failure code",
);
assert.match(
  media,
  /failureCode === "FLOW_GENERATOR_MENU_STILL_OPEN" \? "flow-generator-menu-still-open" : "flow-mode-mismatch"/,
  "progress details should not report menu-open failures as mode mismatches",
);
assert.doesNotMatch(
  media,
  /throw new Error\(`Google Flow output mode mismatch\. Requested \$\{outputMode\}, but Flow UI appears to be \$\{finalModeVerification\.selectedOutputMode\}/,
  "mode mismatch throw should not hide matching-mode menu failures behind the old image-vs-image message",
);

console.log("[flow-mode-menu-open-not-mismatch] ok");
