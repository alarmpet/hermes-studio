#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "automation/google-flow-output-mode.mjs"), "utf8");

assert.match(source, /async function closeFlowGeneratorMenu/, "Flow output mode config should explicitly close the generator settings menu");
assert.match(source, /verifyGeneratorMenuClosed/, "Flow output mode config should verify the settings menu is closed");
assert.match(source, /menuClosed/, "configureFlowOutputMode diagnostics should report whether the menu closed");
assert.match(source, /await page\.keyboard\.press\("Escape"\)/, "Menu close should use Escape as a stable close path");
assert.match(source, /page\.mouse\.click\(400,\s*200\)/, "Menu close should use a neutral workspace click after Escape, not the left sidebar");
assert.doesNotMatch(source, /page\.mouse\.click\(40,\s*40\)/, "Menu close must not click the upper-left Flow sidebar/navigation area");
assert.match(source, /document\.activeElement.*blur|blur\(\)/s, "Menu close should remove focus from the settings/menu control before submit");

console.log(JSON.stringify({ ok: true, checked: "flow-image-menu-close-contract" }));
