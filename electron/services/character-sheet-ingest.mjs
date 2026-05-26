import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";

const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function ingestCharacterSheet({ jobDir, characterSheet = {} } = {}) {
  const outputDir = join(jobDir, "character_sheets");
  const sourcePaths = Array.isArray(characterSheet.referenceImagePaths)
    ? characterSheet.referenceImagePaths.filter(Boolean).slice(0, 4)
    : [];
  await mkdir(outputDir, { recursive: true });
  const copied = [];
  for (let index = 0; index < sourcePaths.length; index += 1) {
    const sourcePath = sourcePaths[index];
    const ext = extname(sourcePath).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) continue;
    if (!existsSync(sourcePath)) continue;
    const targetPath = join(outputDir, `${String(index + 1).padStart(2, "0")}-${safeBaseName(sourcePath)}`);
    await copyFile(sourcePath, targetPath);
    copied.push(targetPath);
  }
  const profileText = String(characterSheet.profileText || "").trim();
  return {
    ...characterSheet,
    mode: copied.length && profileText ? "text-and-image" : copied.length ? "image" : profileText ? "text" : "none",
    profileText,
    referenceImagePaths: copied,
  };
}

function safeBaseName(path) {
  return basename(path).replace(/[^a-zA-Z0-9._-]/g, "_");
}
