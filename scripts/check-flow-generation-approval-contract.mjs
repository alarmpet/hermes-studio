import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const media = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");

assert.match(
  media,
  /probeFlowGenerationConfirmationState/,
  "Flow approval handling should probe the confirmation state before clicking",
);
assert.match(
  media,
  /page\.mouse\.click\(target\.x, target\.y\)/,
  "Flow approval handling should use a real mouse click on the selected approval button",
);
assert.match(
  media,
  /approval-button-still-visible/,
  "Flow approval handling should report when the approval button remains visible after click attempts",
);
assert.match(
  media,
  /going to generate\|generate a/,
  "Flow approval detection should cover the English generation confirmation copy",
);
assert.doesNotMatch(
  media,
  /\.filter\(\(item\) => \/\?뱀씤\|approve\|confirm\|check\/i\.test\(item\.text\)\)/,
  "Flow approval candidates must not treat a generic check icon as an approval button",
);

console.log("[flow-generation-approval-contract] ok");
