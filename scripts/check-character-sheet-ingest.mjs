#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ingestCharacterSheet } from "../electron/services/character-sheet-ingest.mjs";

const root = join(tmpdir(), `hermes-character-ingest-${Date.now()}`);
const sourceDir = join(root, "source");
const jobDir = join(root, "job");
mkdirSync(sourceDir, { recursive: true });
const imagePath = join(sourceDir, "hero.png");
writeFileSync(imagePath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

const result = await ingestCharacterSheet({
  jobDir,
  characterSheet: {
    mode: "image",
    profileText: "A stable presenter.",
    referenceImagePaths: [imagePath],
  },
});

assert.equal(result.referenceImagePaths.length, 1);
assert.ok(result.referenceImagePaths[0].includes("character_sheets"));
assert.ok(existsSync(result.referenceImagePaths[0]));
assert.equal(result.profileText, "A stable presenter.");

rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, checked: "character-sheet-ingest" }));
