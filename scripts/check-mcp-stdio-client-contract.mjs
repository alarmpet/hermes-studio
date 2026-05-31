import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const client = readFileSync(resolve(root, "electron/services/mcp-stdio-client.mjs"), "utf8");
const registry = readFileSync(resolve(root, "electron/services/external-provider-registry.mjs"), "utf8");
const notebook = readFileSync(resolve(root, "electron/services/notebooklm-provider.mjs"), "utf8");
const workspace = readFileSync(resolve(root, "electron/services/workspace-archive-provider.mjs"), "utf8");

assert.match(client, /Content-Length/i, "MCP stdio client should implement JSON-RPC Content-Length framing");
assert.match(client, /initialize/, "MCP stdio client should initialize the server");
assert.match(client, /tools\/call/, "MCP stdio client should call MCP tools");
assert.match(client, /notifications\/initialized/, "MCP stdio client should send initialized notification");
assert.match(client, /close\(\)/, "MCP stdio client should expose close()");
assert.match(registry, /@aaronsb\/google-workspace-mcp/, "Workspace provider should use the npm package name from README");
assert.match(notebook, /ask_question/, "NotebookLM provider should call ask_question");
assert.match(notebook, /source_format:\s*"json"/, "NotebookLM provider should request JSON citations");
assert.match(workspace, /manage_drive/, "Workspace provider should use manage_drive for Drive search");
assert.match(workspace, /operation:\s*"search"/, "Workspace provider should use search operation");

console.log(JSON.stringify({ ok: true, checked: "mcp-stdio-client-contract" }));
