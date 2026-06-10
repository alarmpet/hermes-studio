import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../automation/google-flow-output-mode.mjs", import.meta.url), "utf8");

assert.match(source, /function\s+clickableAncestorOf/, "Flow output mode should centralize clickable ancestor resolution");
assert.match(source, /FLOW_UNSAFE_CLICK_TARGET/, "unsafe Flow click targets should produce a specific diagnostic code");
assert.match(source, /non-clickable-label/, "non-clickable Flow labels should be logged instead of clicked");
assert.doesNotMatch(
  source,
  /document\.querySelectorAll\("button,\[role='button'\],\[role='option'\],\[aria-label\],div,span"\)[\s\S]{0,900}page\.mouse\.click/,
  "Flow output mode should not directly click broad div/span selector results"
);
assert.doesNotMatch(
  source,
  /const\s+controls\s*=\s*\(\)\s*=>\s*Array\.from\(document\.querySelectorAll\("button,\[role='button'\],\[role='option'\],\[aria-label\],div,span"\)\)/,
  "Flow clickable controls should not be sourced from broad div/span selectors"
);

console.log("[flow-safe-click-targets] ok");
