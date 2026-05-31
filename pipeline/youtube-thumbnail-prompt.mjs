export function buildThumbnailPrompt({ title, script, hookStyle = "smart-curiosity", aspectRatio = "9:16" }) {
  const headline = String(title || "Hermes Shorts").replace(/\s+/g, " ").trim().slice(0, 36);
  const context = String(script || title || "").replace(/\s+/g, " ").trim().slice(0, 220);
  return [
    "Use ChatGPT image generation. Generate exactly one finished YouTube thumbnail image now. Do not answer with text only.",
    `Canvas aspect ratio: ${aspectRatio}. ${aspectRatio === "16:9" ? "Horizontal longform thumbnail." : "Vertical shorts thumbnail."}`,
    "Use Korean headline text directly in the image.",
    `Headline: ${headline}`,
    `Context: ${context}`,
    `Hook style: ${hookStyle}`,
    "Readable Korean typography, strong contrast, cinematic editorial composition, no brand logos, no watermark.",
  ].join("\n");
}
