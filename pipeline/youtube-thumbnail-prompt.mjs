export function buildThumbnailPrompt({ title, script, hookStyle = "smart-curiosity" }) {
  return [
    "Create a high-impact YouTube thumbnail image.",
    "Use Korean headline text directly in the image.",
    `Headline: ${title}`,
    `Context: ${String(script || "").slice(0, 1200)}`,
    `Hook style: ${hookStyle}`,
    "Readable Korean typography, strong contrast, no brand logos, no watermark.",
  ].join("\n");
}
