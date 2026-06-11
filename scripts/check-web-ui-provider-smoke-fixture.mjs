#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertProviderMediaResult, createWebUiProviderSuccess } from "../automation/web-ui-provider-contract.mjs";

const tmp = mkdtempSync(join(tmpdir(), "hermes-web-ui-provider-"));

try {
  const emptyPath = join(tmp, "empty.jpg");
  writeFileSync(emptyPath, "");
  assert.throws(() => {
    assertProviderMediaResult(createWebUiProviderSuccess({
      provider: "fixture-provider",
      path: emptyPath,
      bytes: 0,
      contentType: "image/jpeg",
    }));
  }, /WEB_UI_PROVIDER_EMPTY_MEDIA/);

  const imagePath = join(tmp, "image.jpg");
  writeFileSync(imagePath, Buffer.alloc(16_384, 7));
  const result = assertProviderMediaResult(createWebUiProviderSuccess({
    provider: "fixture-provider",
    path: imagePath,
    bytes: statSync(imagePath).size,
    contentType: "image/jpeg",
    evidence: { screenshotPath: join(tmp, "screen.png") },
  }));

  assert.equal(result.ok, true);
  assert.equal(result.providerOrigin, "web-ui");
  assert.equal(result.bytes, 16_384);
  assert.equal(result.contentType, "image/jpeg");
  assert.equal(result.evidence.screenshotPath, join(tmp, "screen.png"));

  console.log(JSON.stringify({ ok: true, checked: "web-ui-provider-smoke-fixture" }));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
