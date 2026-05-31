import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const source = readFileSync(resolve(root, "electron/services/workspace-archive-provider.mjs"), "utf8");
const secureStore = readFileSync(resolve(root, "electron/services/secure-token-store.mjs"), "utf8");

assert.match(source, /GOOGLE_WORKSPACE_SCOPES/, "Workspace provider should document OAuth scopes");
assert.match(source, /drive\.readonly/, "Workspace provider should start with Drive readonly scope");
assert.match(source, /documents\.readonly/, "Workspace provider should document Docs readonly scope");
assert.match(source, /spreadsheets\.readonly/, "Workspace provider should document Sheets readonly scope");
assert.match(source, /readAndDecryptToken/, "Workspace provider should read tokens through secure-token-store");
assert.match(source, /archiveMode[^=]+read-only|readOnly/i, "Workspace provider should default to read-only mode");
assert.match(source, /google-workspace-mcp/, "Workspace provider should use the registry provider id");
assert.doesNotMatch(source, /writeFile\([^,\n]+,\s*JSON\.stringify\(.*token/is, "Workspace provider should not write plaintext tokens");
assert.match(secureStore, /safeStorage/, "secure token store should back Workspace credentials");

console.log(JSON.stringify({ ok: true, checked: "workspace-archive-provider-contract" }));
