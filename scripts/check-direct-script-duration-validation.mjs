#!/usr/bin/env node
import assert from "node:assert/strict";
import { estimateDirectScriptDuration } from "../electron/services/direct-script-duration.mjs";

const short = estimateDirectScriptDuration({
  script: "Short.",
  targetSeconds: 60,
});
assert.equal(short.severity, "warning");
assert.match(short.message, /short|brief|짧/i);

const long = estimateDirectScriptDuration({
  script: "This sentence is intentionally long for duration validation. ".repeat(80),
  targetSeconds: 30,
});
assert.equal(long.severity, "warning");
assert.match(long.message, /long|fast|깁|빠/i);

const balanced = estimateDirectScriptDuration({
  script: "This script is long enough for a concise thirty second narrated short. It contains a hook, a core point, a short story, and a practical lesson.",
  targetSeconds: 30,
});
assert.equal(balanced.severity, "ok");

console.log(JSON.stringify({ ok: true, checked: "direct-script-duration-validation" }));
