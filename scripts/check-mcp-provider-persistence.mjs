#!/usr/bin/env node
import assert from "node:assert/strict";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const defaultJob = normalizeYouTubeJobRequest({ sourceType: "keyword", sourceValue: "테스트" });
assert.equal(defaultJob.options.researchProvider, "gemini-gems-browser");
assert.equal(defaultJob.options.archiveProvider, "local-files");

const longformDefaultJob = normalizeYouTubeJobRequest({
  sourceType: "url",
  sourceValue: "https://example.com/longform-source",
  options: { videoFormat: "longform" },
});
assert.equal(longformDefaultJob.options.researchProvider, "notebooklm-mcp", "longform should default to NotebookLM research");
assert.equal(longformDefaultJob.options.enableLiveMcp, true, "longform NotebookLM research should opt into live MCP by default");

const mcpJob = normalizeYouTubeJobRequest({
  sourceType: "url",
  sourceValue: "https://example.com/article",
  options: {
    researchProvider: "notebooklm-mcp",
    archiveProvider: "google-workspace-mcp",
  },
});
assert.equal(mcpJob.options.researchProvider, "notebooklm-mcp");
assert.equal(mcpJob.options.archiveProvider, "google-workspace-mcp");

assert.throws(
  () => normalizeYouTubeJobRequest({ sourceType: "keyword", sourceValue: "x", options: { researchProvider: "bad" } }),
  /Unknown researchProvider/,
);
assert.throws(
  () => normalizeYouTubeJobRequest({ sourceType: "keyword", sourceValue: "x", options: { archiveProvider: "bad" } }),
  /Unknown archiveProvider/,
);

console.log(JSON.stringify({ ok: true, checked: "mcp-provider-persistence" }));
