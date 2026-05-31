import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const plan = readFileSync(resolve(root, "docs/superpowers/plans/2026-05-26-chrome-devtools-mcp-diagnostics-plan.md"), "utf8");

assert.match(plan, /Chrome DevTools MCP Diagnostics Implementation Plan/, "diagnostics plan should have the expected title");
assert.match(plan, /developer-only/i, "diagnostics plan should keep Chrome DevTools MCP developer-only");
assert.match(plan, /npx.*chrome-devtools-mcp/i, "diagnostics plan should include a Windows npx command");
assert.match(plan, /console messages/i, "diagnostics plan should collect console messages");
assert.match(plan, /network/i, "diagnostics plan should collect network evidence");
assert.match(plan, /DOM snapshot/i, "diagnostics plan should collect DOM snapshots");
assert.match(plan, /Do not collect/i, "diagnostics plan should list forbidden artifacts");
assert.match(plan, /cookies/i, "diagnostics plan should forbid cookie capture");

console.log(JSON.stringify({ ok: true, checked: "chrome-devtools-diagnostics-plan" }));
