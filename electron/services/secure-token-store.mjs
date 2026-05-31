import { safeStorage } from "electron";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function assertSecureStorageAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure OS token storage is not available. Google Workspace archive auth is disabled.");
  }
}

export async function encryptAndSaveToken(filePath, tokenData) {
  assertSecureStorageAvailable();
  await mkdir(dirname(filePath), { recursive: true });
  const encryptedBuffer = safeStorage.encryptString(JSON.stringify(tokenData || {}));
  await writeFile(filePath, encryptedBuffer.toString("base64"), "utf8");
  return { ok: true, filePath, encrypted: true };
}

export async function readAndDecryptToken(filePath) {
  assertSecureStorageAvailable();
  const encryptedText = await readFile(filePath, "utf8");
  const decryptedText = safeStorage.decryptString(Buffer.from(encryptedText, "base64"));
  return JSON.parse(decryptedText);
}

export async function clearSavedToken(filePath) {
  await rm(filePath, { force: true });
  return { ok: true, filePath, cleared: true };
}
