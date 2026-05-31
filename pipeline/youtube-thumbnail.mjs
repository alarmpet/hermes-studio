import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { generateChatGptThumbnail } from "../automation/chatgpt-thumbnail-source.mjs";
import { buildThumbnailPrompt } from "./youtube-thumbnail-prompt.mjs";

export async function createThumbnailForJob({ draft, paths, jobDir, chromePath, aspectRatio = "9:16", emit }) {
  const prompt = buildThumbnailPrompt({
    title: draft.title,
    script: draft.script,
    hookStyle: "smart-curiosity",
    aspectRatio,
  });
  const chatgpt = await generateChatGptThumbnail({
    prompt,
    profileDir: paths.chatgptProfileDir,
    outputDir: jobDir,
    chromePath,
    aspectRatio,
    emit,
  }).catch((error) => ({
    ok: false,
    code: error.code || error.details?.code || "CHATGPT_UNKNOWN_FAILURE",
    error: error.message,
    details: error.details || {},
  }));
  if (chatgpt.ok) return chatgpt;
  const fallback = await createLocalCompositedThumbnail({
    title: draft.title,
    script: draft.script,
    jobDir,
    aspectRatio,
    reason: chatgpt.error || chatgpt.message || "ChatGPT thumbnail generation failed",
  });
  return {
    ...fallback,
    primaryProvider: "chatgpt-authenticated-browser",
    primaryProviderFailure: {
      ok: false,
      code: chatgpt.code || "CHATGPT_UNKNOWN_FAILURE",
      message: chatgpt.error || chatgpt.message || "",
      actionRequired: isChatGptActionRequired(chatgpt.code),
      resultPath: join(jobDir, "chatgpt-thumbnail-result.json"),
      details: chatgpt.details || {},
    },
  };
}

function isChatGptActionRequired(code = "") {
  return ["CHATGPT_AUTH_REQUIRED", "CHATGPT_HUMAN_VERIFICATION_REQUIRED"].includes(String(code || ""));
}

export async function createLocalCompositedThumbnail({ title, script, jobDir, aspectRatio = "9:16", reason }) {
  await mkdir(jobDir, { recursive: true });
  const outputPath = join(jobDir, "thumbnail-local-fallback.png");
  const width = aspectRatio === "16:9" ? 1280 : 1080;
  const height = aspectRatio === "16:9" ? 720 : 1920;
  const headline = escapeXml(compactHeadline(title || script || "Hermes Shorts"));
  const subline = escapeXml(compactSubline(script || title || ""));
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#0f766e"/>
          <stop offset="0.52" stop-color="#1f2937"/>
          <stop offset="1" stop-color="#7c2d12"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect x="${Math.round(width * 0.045)}" y="${Math.round(height * 0.1)}" width="${Math.round(width * 0.91)}" height="${Math.round(height * 0.8)}" rx="34" fill="rgba(0,0,0,0.34)"/>
      <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.35)}" font-family="Malgun Gothic, Arial, sans-serif" font-size="${aspectRatio === "16:9" ? 82 : 92}" font-weight="900" fill="#ffffff">${headline}</text>
      <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.5)}" font-family="Malgun Gothic, Arial, sans-serif" font-size="${aspectRatio === "16:9" ? 42 : 48}" font-weight="800" fill="#fde68a">${subline}</text>
      <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.85)}" font-family="Arial, sans-serif" font-size="24" fill="#d1d5db">Local fallback: ${escapeXml(reason || "ChatGPT unavailable")}</text>
    </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  return {
    ok: true,
    provider: "local-composited",
    path: outputPath,
    reason,
  };
}

function compactHeadline(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 18);
}

function compactSubline(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 28);
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
