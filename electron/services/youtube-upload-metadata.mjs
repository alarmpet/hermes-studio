import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, extname, join } from "node:path";

const METADATA_FILE = "youtube-upload-metadata.json";
const STATE_FILE = "youtube-upload-state.json";
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const VALID_PRIVACY = new Set(["private", "unlisted", "public"]);
const VALID_THUMBNAIL_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

export function buildDefaultUploadMetadata(jobRecord = {}, draftAssets = {}) {
  const draft = draftAssets.draft || {};
  const title = draft.title || jobRecord.title || jobRecord.sourceValue || jobRecord.id || "Hermes video";
  const description = [
    draft.summary || "",
    draft.script || "",
    jobRecord.sourceValue ? `Source: ${jobRecord.sourceValue}` : "",
  ].filter(Boolean).join("\n\n");
  return sanitizeUploadMetadata({
    version: "youtube-upload-v1",
    jobId: jobRecord.id || draftAssets.jobId || "",
    videoPath: jobRecord.finalPath || jobRecord.finalVideo || draftAssets.videoPath || "",
    thumbnailPath: jobRecord.thumbnailPath || draftAssets.thumbnailPath || draftAssets.thumbnail?.path || "",
    thumbnailOptimizedPath: "",
    title,
    description,
    tags: buildDefaultTags({ title, sourceValue: jobRecord.sourceValue, draft }),
    privacyStatus: jobRecord.privacyStatus || jobRecord.upload?.privacyStatus || "private",
    categoryId: jobRecord.categoryId || "25",
    madeForKids: false,
    containsSyntheticMedia: true,
    notifySubscribers: false,
    updatedAt: new Date().toISOString(),
  });
}

export function sanitizeUploadMetadata(input = {}) {
  const privacyStatus = VALID_PRIVACY.has(input.privacyStatus) ? input.privacyStatus : "private";
  const tags = Array.from(new Set((Array.isArray(input.tags) ? input.tags : String(input.tags || "").split(","))
    .map((tag) => cleanText(tag).replace(/^#+/, ""))
    .filter(Boolean)))
    .slice(0, 30);
  return {
    version: "youtube-upload-v1",
    jobId: cleanText(input.jobId || ""),
    videoPath: cleanPath(input.videoPath || ""),
    thumbnailPath: cleanPath(input.thumbnailPath || ""),
    thumbnailOptimizedPath: cleanPath(input.thumbnailOptimizedPath || ""),
    title: cleanText(input.title || "Hermes video").slice(0, 100),
    description: cleanText(input.description || "").slice(0, 5000),
    tags,
    privacyStatus,
    categoryId: cleanText(input.categoryId || "25"),
    madeForKids: Boolean(input.madeForKids),
    containsSyntheticMedia: input.containsSyntheticMedia !== false,
    notifySubscribers: Boolean(input.notifySubscribers),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

export function validateUploadMetadata(input = {}) {
  const metadata = sanitizeUploadMetadata(input);
  const errors = [];
  if (!metadata.jobId) errors.push({ field: "jobId", message: "jobId is required." });
  if (!metadata.videoPath) errors.push({ field: "videoPath", message: "videoPath is required." });
  if (!metadata.title) errors.push({ field: "title", message: "Title is required." });
  if (!VALID_PRIVACY.has(metadata.privacyStatus)) {
    errors.push({ field: "privacyStatus", message: "Privacy must be private, unlisted, or public." });
  }
  return {
    ok: errors.length === 0,
    errors,
    metadata,
  };
}

export async function readUploadMetadata(jobDir) {
  const path = join(jobDir, METADATA_FILE);
  if (!existsSync(path)) return null;
  return sanitizeUploadMetadata(JSON.parse(await readFile(path, "utf8")));
}

export async function writeUploadMetadata(jobDir, metadata) {
  const next = sanitizeUploadMetadata({ ...metadata, updatedAt: new Date().toISOString() });
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, METADATA_FILE), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function readUploadState(jobDir) {
  const path = join(jobDir, STATE_FILE);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeUploadState(jobDir, state = {}) {
  const next = {
    version: "youtube-upload-state-v1",
    ...state,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, STATE_FILE), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export async function validateThumbnailForYouTube(thumbnailPath) {
  if (!thumbnailPath) return { ok: true, thumbnailPath: "" };
  if (!existsSync(thumbnailPath)) {
    return { ok: false, code: "YOUTUBE_THUMBNAIL_INVALID", message: `Thumbnail file does not exist: ${thumbnailPath}` };
  }
  const ext = extname(thumbnailPath).toLowerCase();
  if (!VALID_THUMBNAIL_EXTENSIONS.has(ext)) {
    return { ok: false, code: "YOUTUBE_THUMBNAIL_INVALID", message: "YouTube thumbnails must be JPG or PNG." };
  }
  const info = await stat(thumbnailPath);
  if (info.size > MAX_THUMBNAIL_BYTES) {
    return {
      ok: false,
      code: "YOUTUBE_THUMBNAIL_TOO_LARGE",
      message: "YouTube custom thumbnails must be 2MB or smaller.",
      size: info.size,
      maxSize: MAX_THUMBNAIL_BYTES,
    };
  }
  return { ok: true, thumbnailPath, size: info.size };
}

function buildDefaultTags({ title = "", sourceValue = "", draft = {} }) {
  const words = [title, sourceValue, draft.topic || ""]
    .join(" ")
    .split(/[,\s|/]+/u)
    .map((word) => cleanText(word).replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((word) => word.length >= 2)
    .slice(0, 12);
  return Array.from(new Set(["Hermes", "YouTube", ...words])).slice(0, 30);
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPath(value = "") {
  return String(value || "").trim();
}
