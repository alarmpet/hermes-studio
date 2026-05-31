import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const source = readFileSync(resolve(root, "electron/services/secure-token-store.mjs"), "utf8");

assert.match(source, /safeStorage/, "secure token store should use Electron safeStorage");
assert.match(source, /encryptString/, "secure token store should encrypt token payloads");
assert.match(source, /decryptString/, "secure token store should decrypt token payloads");
assert.match(source, /isEncryptionAvailable/, "secure token store should guard unavailable encryption");
assert.doesNotMatch(source, /writeFile\([^,\n]+,\s*JSON\.stringify\(token/i, "token JSON should not be written as plaintext");

console.log(JSON.stringify({ ok: true, checked: "secure-token-store" }));
