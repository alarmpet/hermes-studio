import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function diagnoseChatGptThumbnailState({ page, outputDir, phase = "unknown" }) {
  const screenshotPath = join(outputDir, "chatgpt-thumbnail-diagnostics.png");
  const reportPath = join(outputDir, "chatgpt-thumbnail-diagnostics.json");
  const snapshot = await page.evaluate((currentPhase) => {
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("data-testid"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== "none" && style.visibility !== "hidden";
    };
    const buttons = Array.from(document.querySelectorAll("button,[role='button'],[role='menuitem'],a"))
      .filter(visible)
      .map((el) => ({ text: textOf(el).slice(0, 160), tag: el.tagName, role: el.getAttribute("role") || "" }))
      .filter((item) => item.text)
      .slice(0, 80);
    const composerFound = Boolean(document.querySelector("textarea,[contenteditable='true'],[role='textbox']"));
    const pageText = (document.body?.innerText || "").slice(0, 2000);
    const imageToolFound = buttons.some((item) => /이미지|image|picture|photo|그림|사진/i.test(item.text));
    const accountLabel = Array.from(document.querySelectorAll("[aria-label],button"))
      .map(textOf)
      .find((text) => /pro|plus|team|free|계정|account/i.test(text)) || "";
    return {
      url: location.href,
      title: document.title,
      phase: currentPhase,
      composerFound,
      imageToolFound,
      accountLabel,
      buttons,
      pageText,
    };
  }, phase);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  const report = {
    ok: true,
    provider: "chatgpt-diagnostics",
    screenshotPath,
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  return { ...report, reportPath };
}
