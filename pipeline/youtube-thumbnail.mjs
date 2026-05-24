import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { generateChatGptThumbnail } from "../automation/chatgpt-thumbnail-source.mjs";
import { buildThumbnailPrompt } from "./youtube-thumbnail-prompt.mjs";

export async function createThumbnailForJob({ draft, paths, jobDir }) {
  const prompt = buildThumbnailPrompt({
    title: draft.title,
    script: draft.script,
    hookStyle: "smart-curiosity",
  });
  const chatgpt = await generateChatGptThumbnail({
    prompt,
    profileDir: paths.chatgptProfileDir,
    outputDir: jobDir,
  }).catch((error) => ({ ok: false, error: error.message }));
  if (chatgpt.ok) return chatgpt;
  return createLocalCompositedThumbnail({
    title: draft.title,
    script: draft.script,
    jobDir,
    reason: chatgpt.error || chatgpt.message || "ChatGPT thumbnail generation failed",
  });
}

export async function createLocalCompositedThumbnail({ title, script, jobDir, reason }) {
  await mkdir(jobDir, { recursive: true });
  const outputPath = join(jobDir, "thumbnail-local-fallback.png");
  const headline = escapeXml(compactHeadline(title || script || "Hermes Shorts"));
  const subline = escapeXml(compactSubline(script || title || ""));
  const svg = `
    <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#0f766e"/>
          <stop offset="0.52" stop-color="#1f2937"/>
          <stop offset="1" stop-color="#7c2d12"/>
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      <rect x="58" y="72" width="1164" height="576" rx="34" fill="rgba(0,0,0,0.34)"/>
      <text x="104" y="250" font-family="Malgun Gothic, Arial, sans-serif" font-size="82" font-weight="900" fill="#ffffff">${headline}</text>
      <text x="108" y="360" font-family="Malgun Gothic, Arial, sans-serif" font-size="42" font-weight="800" fill="#fde68a">${subline}</text>
      <text x="108" y="600" font-family="Arial, sans-serif" font-size="24" fill="#d1d5db">Local fallback: ${escapeXml(reason || "ChatGPT unavailable")}</text>
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
