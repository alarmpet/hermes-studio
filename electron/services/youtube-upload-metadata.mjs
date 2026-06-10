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
  const title = buildDiscoverableTitle({
    title: draft.title || jobRecord.title || "",
    script: draft.script || "",
    sourceValue: jobRecord.sourceValue || "",
  });
  const description = buildStructuredDescription({
    summary: draft.summary || "",
    script: draft.script || "",
    sourceValue: jobRecord.sourceValue || "",
    scenes: draft.scenes || [],
  });
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
    categoryId: jobRecord.categoryId || inferYouTubeCategoryId(`${title} ${jobRecord.sourceValue || ""} ${draft.script || ""} ${draft.summary || ""}`),
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
  if (isGenericUploadTitle(metadata.title)) {
    errors.push({ field: "title", message: "Title should include a discoverable topic hook." });
  }
  if (!metadata.description) {
    errors.push({ field: "description", message: "Description should include a useful summary." });
  }
  if (metadata.tags.length < 2) {
    errors.push({ field: "tags", message: "At least two topic tags are required." });
  }
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
  const taxonomy = inferTagTaxonomy(`${title} ${sourceValue} ${draft.topic || ""} ${draft.script || ""} ${draft.summary || ""}`);
  const words = [title, sourceValue, draft.topic || "", draft.script || "", draft.summary || ""]
    .join(" ")
    .split(/[,\s|/]+/u)
    .map((word) => cleanText(word).replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((word) => word.length >= 2 && !UPLOAD_STOPWORDS.has(word))
    .slice(0, 12);
  return Array.from(new Set(["Hermes", "YouTube", ...taxonomy, ...words])).slice(0, 30);
}

const GENERIC_UPLOAD_TITLE_PATTERNS = [
  /^Hermes video$/i,
  /^(우리는|사람들은|요즘|지금|오늘|왜|이게|그게|이것이|그것이)\b/,
  /(이렇게|배웠죠|난리입니다|됐을까요|될까요|궁금합니다)$/i,
];

const UPLOAD_STOPWORDS = new Set([
  "그리고",
  "하지만",
  "때문입니다",
  "때문에",
  "입니다",
  "합니다",
  "있습니다",
  "이유는",
  "우리는",
  "요즘",
  "지금",
  "오늘",
  "진짜",
]);

const UPLOAD_KEYWORDS = [
  "AI",
  "GPU",
  "CUDA",
  "반도체",
  "생태계",
  "전환",
  "기술",
  "금리",
  "채권",
  "시장",
  "유동성",
  "경제",
  "콜럼버스",
  "항해",
  "거리",
  "계산",
  "착오",
  "역사",
  "반전",
  "증명",
];

function buildDiscoverableTitle({ title = "", script = "", sourceValue = "" } = {}) {
  const cleanedTitle = cleanText(title).replace(/[.!?。！？]+$/g, "");
  const source = cleanText(`${title} ${script} ${sourceValue}`);
  const keywords = extractUploadKeywords(source);
  const contrast = findUploadContrast(source, keywords);
  if (contrast) return cleanText(contrast).slice(0, 60);
  if (keywords.length >= 2 && isGenericUploadTitle(cleanedTitle)) {
    return cleanText(`${keywords[0]}의 진짜 이유`).slice(0, 60);
  }
  if (cleanedTitle && !isGenericUploadTitle(cleanedTitle)) return cleanedTitle.slice(0, 60);
  if (keywords.length === 1) return cleanText(`${keywords[0]}의 숨은 변수`).slice(0, 60);
  return "알고 보면 달라지는 이야기";
}

function buildStructuredDescription({ summary = "", script = "", sourceValue = "", scenes = [] } = {}) {
  const core = cleanText(summary || script || sourceValue).slice(0, 450);
  const chapters = buildDescriptionChapters(scenes);
  return [
    core ? `핵심: ${core}` : "",
    chapters,
    "이 영상은 AI 생성 음성/이미지/영상 보조 도구를 사용해 제작되었습니다.",
    "업로드 전 사실관계와 표현은 운영자가 최종 검토해야 합니다.",
  ].filter(Boolean).join("\n\n");
}

function buildDescriptionChapters(scenes = []) {
  if (!Array.isArray(scenes) || scenes.length === 0) return "";
  let elapsed = 0;
  const chapters = scenes.slice(0, 12).map((scene, index) => {
    const label = cleanText(scene.title || scene.narration || `Scene ${index + 1}`).slice(0, 42);
    const line = `${formatChapterTime(elapsed)} ${label || `Scene ${index + 1}`}`;
    elapsed += Number(scene.duration_seconds || scene.duration || 0) || 0;
    return line;
  });
  return chapters.length ? `챕터:\n${chapters.join("\n")}` : "";
}

function extractUploadKeywords(source) {
  const directHits = UPLOAD_KEYWORDS.filter((word) => new RegExp(escapeRegex(word), "i").test(source));
  const tokens = Array.from(source.matchAll(/[\p{L}\p{N}]{2,14}/gu), (match) => match[0])
    .filter((word) => !UPLOAD_STOPWORDS.has(word))
    .filter((word) => !/^(으로|에서|에게|보다|라는|이다|아니라|핵심|기대|커질수록)$/.test(word));
  return Array.from(new Set([...directHits, ...tokens])).slice(0, 10);
}

function findUploadContrast(source, keywords = []) {
  if (!keywords.length) return "";
  if (/아니라|보다|착오|반전|오해|숨은|진짜|핵심/.test(source)) {
    const first = keywords[0];
    const second = keywords.find((word) => word !== first && word.length <= 8);
    return second ? `${first}, 핵심은 ${second}` : `${first}의 숨은 핵심`;
  }
  return "";
}

function inferTagTaxonomy(source) {
  const tags = [];
  if (/콜럼버스|1492|항해|역사|제국|중세|근대/.test(source)) tags.push("역사", "세계사");
  if (/AI|GPU|CUDA|반도체|기술|생태계|플랫폼/.test(source)) tags.push("AI", "기술");
  if (/금리|채권|시장|유동성|경제|투자|환율|주가/.test(source)) tags.push("경제", "시장");
  if (/과학|우주|지구|실험|발견|기후/.test(source)) tags.push("과학");
  return tags;
}

function inferYouTubeCategoryId(source) {
  if (/AI|GPU|CUDA|반도체|기술|과학|우주|실험|발견/.test(source)) return "28";
  if (/콜럼버스|역사|세계사|교육|설명|강의|학습/.test(source)) return "27";
  return "25";
}

function isGenericUploadTitle(value) {
  const text = cleanText(value);
  if (!text) return true;
  return GENERIC_UPLOAD_TITLE_PATTERNS.some((pattern) => pattern.test(text));
}

function formatChapterTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
