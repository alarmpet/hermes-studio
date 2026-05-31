import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const source = readFileSync(resolve(root, "electron/services/external-provider-registry.mjs"), "utf8");

for (const id of ["chrome-devtools-mcp", "notebooklm-mcp", "google-workspace-mcp"]) {
  assert.match(source, new RegExp(id), `registry should include ${id}`);
}

assert.match(source, /defaultEnabled:\s*false/g, "providers should be disabled by default");
assert.match(source, /activeMcpProcesses|activeProviderProcesses/, "registry should track active processes");
assert.match(source, /stopProvider/, "registry should export stopProvider");
assert.match(source, /stopAllProviders/, "registry should export stopAllProviders");
assert.match(source, /taskkill|treeKill|killProcessTree/i, "registry should clean process trees on Windows");

console.log(JSON.stringify({ ok: true, checked: "external-provider-registry" }));
