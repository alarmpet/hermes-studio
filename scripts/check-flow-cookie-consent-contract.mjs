import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const media = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");

assert.match(media, /async function dismissFlowCookieConsent/, "Flow automation should dismiss first-run cookie consent banners");
assert.match(media, /동의함\|나중에\|모두\\s\*동의\|accept/, "Cookie consent guard should match Korean and English consent buttons");
assert.match(media, /await dismissFlowCookieConsent\(page\);\s*await waitForFlowGeneratorReady/, "Cookie consent should be handled before generator readiness checks");

console.log("[flow-cookie-consent-contract] ok");
