import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { diagnoseChatGptThumbnailState } from "./chatgpt-thumbnail-diagnostics.mjs";

const CHATGPT_URL = "https://chatgpt.com/";
const DEFAULT_TIMEOUT_MS = 6 * 60 * 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessRunning(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function findChromeExecutable(env = process.env) {
  const candidates = [
    env.HERMES_CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe") : "",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

function createChatGptThumbnailError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.details = details;
  return error;
}

function redactSensitiveDetails(value) {
  return JSON.parse(JSON.stringify(value || {}, (key, item) => {
    if (/cookie|token|authorization|session/i.test(key)) return "[redacted]";
    return item;
  }));
}

async function persistThumbnailFailure({ outputDir, code, reason, message, screenshotPath = "", details = {} }) {
  const resultPath = join(outputDir, "chatgpt-thumbnail-result.json");
  await writeFile(resultPath, JSON.stringify({
    ok: false,
    provider: "chatgpt-authenticated-browser",
    reason,
    failureCode: code,
    actionRequired: ["CHATGPT_AUTH_REQUIRED", "CHATGPT_HUMAN_VERIFICATION_REQUIRED"].includes(code),
    message,
    screenshotPath,
    details: redactSensitiveDetails(details),
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  return resultPath;
}

async function releaseAppManagedAuthWindow(profileDir) {
  const lockPath = join(profileDir, "hermes-profile.lock.json");
  if (!existsSync(lockPath)) return;
  const lock = JSON.parse(await readFile(lockPath, "utf8").catch(() => "{}"));
  if (lock.pid && isProcessRunning(lock.pid)) {
    try {
      process.kill(Number(lock.pid));
    } catch {
      // The auth browser may have already closed.
    }
    for (let i = 0; i < 20; i += 1) {
      if (!isProcessRunning(lock.pid)) break;
      await delay(250);
    }
  }
  await rm(lockPath, { force: true });
}

async function maximizeChromiumWindow(page) {
  const session = await page.context().newCDPSession(page);
  try {
    const { windowId } = await session.send("Browser.getWindowForTarget");
    await session.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "maximized" },
    });
  } finally {
    await session.detach().catch(() => {});
  }
}

async function collectGeneratedImageCandidates(page) {
  return page.evaluate(() => Array.from(document.images)
    .map((img) => {
      const rect = img.getBoundingClientRect();
      const src = img.currentSrc || img.src || "";
      const label = [
        img.alt,
        img.getAttribute("aria-label"),
        img.getAttribute("data-testid"),
        img.className,
      ].filter(Boolean).join(" ");
      return {
        src,
        label,
        width: Math.round(rect.width || 0),
        height: Math.round(rect.height || 0),
        naturalWidth: img.naturalWidth || 0,
        naturalHeight: img.naturalHeight || 0,
        area: Math.round((rect.width || 0) * (rect.height || 0)),
        visible: rect.width > 120 && rect.height > 120 && getComputedStyle(img).visibility !== "hidden",
      };
    })
    .filter((item) => {
      if (!item.src || !item.visible) return false;
      if (/avatar|icon|logo|sprite|favicon|emoji|profile/i.test(`${item.src} ${item.label}`)) return false;
      if (/^data:image\/svg/i.test(item.src) || /\.svg(?:$|[?#])/i.test(item.src)) return false;
      if (item.naturalWidth < 512 || item.naturalHeight < 512) return false;
      return true;
    })
    .sort((a, b) => b.area - a.area));
}

async function findComposer(page) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const composer = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll("textarea,[contenteditable='true'],[role='textbox']"))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            x: Math.round(rect.x + rect.width / 2),
            y: Math.round(rect.y + rect.height / 2),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            text: (el.innerText || el.value || el.textContent || "").trim(),
            aria: el.getAttribute("aria-label") || "",
          };
        })
        .filter((item) => item.width > 180 && item.height > 20)
        .sort((a, b) => b.y - a.y || b.width - a.width);
      return candidates[0] || null;
    });
    if (composer) return composer;
    await delay(1000);
  }
  throw new Error("ChatGPT composer was not found. Authenticate ChatGPT first, then retry thumbnail generation.");
}

function classifyChatGptAccessState(text = "") {
  const value = String(text || "");
  if (/\uC0AC\uB78C\uC778\uC9C0\s*\uD655\uC778|verify\s+you\s+are\s+human|checking\s+if\s+the\s+site\s+connection\s+is\s+secure|cloudflare|human/i.test(value)) {
    return {
      code: "CHATGPT_HUMAN_VERIFICATION_REQUIRED",
      reason: "chatgpt-human-verification-required",
      actionRequired: true,
      message: "ChatGPT requires human verification in the saved browser profile. Open Authenticate ChatGPT and complete the verification, then retry thumbnail generation.",
    };
  }
  if (/log\s*in|sign\s*up|\uB85C\uADF8\uC778|\uAC00\uC785/i.test(value)) {
    return {
      code: "CHATGPT_AUTH_REQUIRED",
      reason: "chatgpt-auth-required",
      actionRequired: true,
      message: "ChatGPT is not authenticated in the saved browser profile. Open Authenticate ChatGPT and sign in, then retry thumbnail generation.",
    };
  }
  if (/사람인지\s*확인|verify\s+you\s+are\s+human|checking\s+if\s+the\s+site\s+connection\s+is\s+secure|cloudflare|human/i.test(value)) {
    return {
      code: "CHATGPT_HUMAN_VERIFICATION_REQUIRED",
      reason: "chatgpt-human-verification-required",
      actionRequired: true,
      message: "ChatGPT requires human verification in the saved browser profile. Open Authenticate ChatGPT and complete the verification, then retry thumbnail generation.",
    };
  }
  if (/log\s*in|sign\s*up|로그인|가입/i.test(value)) {
    return {
      code: "CHATGPT_AUTH_REQUIRED",
      reason: "chatgpt-auth-required",
      actionRequired: true,
      message: "ChatGPT is not authenticated in the saved browser profile. Open Authenticate ChatGPT and sign in, then retry thumbnail generation.",
    };
  }
  return null;
}

async function clickImageCreationTool(page, outputDir) {
  const clickByText = async (patterns, options = {}) => page.evaluate(({ source, exact }) => {
    const patterns = source.map((pattern) => new RegExp(pattern, "i"));
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 8 && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("data-testid"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const candidates = Array.from(document.querySelectorAll("button,[role='button'],[role='menuitem'],a"))
      .filter(visible)
      .map((el) => ({ el, text: textOf(el), rect: el.getBoundingClientRect() }))
      .filter((item) => item.text && patterns.some((pattern) => exact ? pattern.test(item.text.trim()) : pattern.test(item.text)))
      .sort((a, b) => {
        const aClickable = a.el.matches("button,[role='button'],[role='menuitem'],a") ? 1 : 0;
        const bClickable = b.el.matches("button,[role='button'],[role='menuitem'],a") ? 1 : 0;
        return bClickable - aClickable || b.rect.y - a.rect.y;
      });
    const target = candidates[0];
    if (!target) return { ok: false, reason: "not-found" };
    target.el.click();
    return { ok: true, label: target.text };
  }, { source: patterns, exact: Boolean(options.exact) });

  const imageToolPatterns = [
    "\\uC774\\uBBF8\\uC9C0\\s*\\uB9CC\\uB4E4\\uAE30",
    "\\uC774\\uBBF8\\uC9C0\\s*\\uC0DD\\uC131",
    "\\uADF8\\uB9BC\\s*\\uADF8\\uB9AC\\uAE30",
    "\\uC0AC\\uC9C4\\s*\\uB9CC\\uB4E4\\uAE30",
    "이미지\\s*만들기",
    "이미지\\s*생성",
    "그림\\s*그리기",
    "사진\\s*만들기",
    "create\\s*image",
    "image\\s*generation",
    "generate\\s*image",
    "make\\s*image",
    "images?",
  ];
  const direct = await clickByText(imageToolPatterns);
  if (direct.ok) return { ok: true, path: "direct", direct };

  const plus = await clickByText(["^\\+$", "plus", "add", "첨부", "도구", "tools", "more"]);
  await delay(600);
  await page.screenshot({ path: join(outputDir, "chatgpt-thumbnail-tool-menu.png"), fullPage: true }).catch(() => {});
  const afterPlus = await clickByText(imageToolPatterns);
  if (afterPlus.ok) return { ok: true, path: "plus-menu", plus, imageTool: afterPlus };

  await page.screenshot({ path: join(outputDir, "chatgpt-thumbnail-image-tool-not-found.png"), fullPage: true }).catch(() => {});
  return { ok: false, code: "CHATGPT_IMAGE_TOOL_NOT_FOUND", path: "tool-menu-opened", plus, imageTool: afterPlus };
}

async function detectTextModeResponse(page) {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const busy = Boolean(document.querySelector("[aria-busy='true'],[data-testid*='stop'],button[aria-label*='Stop'],button[aria-label*='중지']"));
    const imageCount = Array.from(document.images)
      .filter((img) => (img.naturalWidth || 0) >= 512 && (img.naturalHeight || 0) >= 512)
      .length;
    return {
      textLength: text.length,
      busy,
      imageCount,
      textSample: text.slice(-1000),
    };
  }).catch(() => ({ textLength: 0, busy: false, imageCount: 0, textSample: "" }));
}

async function submitPrompt(page, prompt) {
  const composer = await findComposer(page);
  await page.mouse.click(composer.x, composer.y);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
  await page.keyboard.insertText(String(prompt || ""));
  await delay(500);
  const send = await page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled
        && el.getAttribute("aria-disabled") !== "true"
        && style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 8
        && rect.height > 8;
    };
    const buttons = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .map((el) => ({
        el,
        text: [
          el.innerText,
          el.textContent,
          el.getAttribute("aria-label"),
          el.getAttribute("title"),
          el.getAttribute("data-testid"),
        ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
        rect: el.getBoundingClientRect(),
      }))
      .filter((item) => /send|submit|arrow_upward|전송|보내기/i.test(item.text) || (item.rect.y > window.innerHeight * 0.65 && item.rect.x > window.innerWidth * 0.45))
      .sort((a, b) => b.rect.x - a.rect.x || b.rect.y - a.rect.y);
    const target = buttons[0];
    if (!target) return { ok: false, reason: "send-button-not-found" };
    target.el.click();
    return { ok: true, label: target.text };
  });
  if (!send.ok) await page.keyboard.press("Enter");
  return { composer, send };
}

async function mediaUrlToBuffer(page, context, mediaUrl) {
  if (mediaUrl.startsWith("blob:") || mediaUrl.startsWith("data:")) {
    const dataUrl = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }, mediaUrl);
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
    if (!match) throw new Error("ChatGPT image could not be converted to a data URL.");
    return { buffer: Buffer.from(match[2], "base64"), contentType: match[1] };
  }

  const cookies = await context.cookies([CHATGPT_URL, "https://oaidalleapiprodscus.blob.core.windows.net", "https://cdn.oaistatic.com"]);
  const cookie = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
  const response = await fetch(mediaUrl, {
    headers: { cookie, "user-agent": "Mozilla/5.0 Chrome ChatGPT thumbnail downloader", accept: "image/*,*/*" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`ChatGPT thumbnail download failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { buffer: Buffer.from(bytes), contentType: response.headers.get("content-type") || "" };
}

function mediaExtension(contentType, mediaUrl) {
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  const pathname = (() => {
    try {
      return new URL(mediaUrl).pathname;
    } catch {
      return "";
    }
  })();
  const ext = extname(pathname).replace(".", "");
  return ext || "png";
}

export async function generateChatGptThumbnail({
  prompt,
  profileDir,
  outputDir,
  chromePath,
  aspectRatio = "9:16",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  emit,
} = {}) {
  if (!profileDir) throw new Error("ChatGPT profile directory is required for authenticated thumbnail generation.");
  await mkdir(outputDir, { recursive: true });
  await releaseAppManagedAuthWindow(profileDir);

  const executablePath = chromePath || findChromeExecutable();
  if (!executablePath) throw new Error("Chrome executable was not found for ChatGPT thumbnail generation.");

  emit?.({ type: "thumbnail-chatgpt-started", provider: "chatgpt-authenticated-browser" });
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: false,
    viewport: { width: 1920, height: 1080 },
    locale: "ko-KR",
    acceptDownloads: true,
    args: ["--no-first-run", "--no-default-browser-check", "--start-maximized", "--window-size=1920,1080"],
  });

  try {
    const page = context.pages().find((item) => !item.isClosed()) || await context.newPage();
    await maximizeChromiumWindow(page).catch(() => {});
    page.setDefaultTimeout(60000);
    await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    try {
      await findComposer(page);
    } catch (error) {
      const pageText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
      const pageTitle = await page.title().catch(() => "");
      const pageUrl = page.url();
      const diagnostics = await diagnoseChatGptThumbnailState({
        page,
        outputDir,
        phase: "composer-search",
      }).catch(() => null);
      const accessState = classifyChatGptAccessState(`${pageTitle}\n${pageUrl}\n${pageText}`)
        || (!String(pageText || "").trim() && /chatgpt\.com/i.test(pageUrl)
          ? {
              code: "CHATGPT_HUMAN_VERIFICATION_REQUIRED",
              reason: "chatgpt-empty-access-gate",
              actionRequired: true,
              message: "ChatGPT did not expose the composer and the page body was empty. This usually means Cloudflare human verification or another access gate is blocking the saved browser profile. Open Authenticate ChatGPT, complete the check, then retry thumbnail generation.",
            }
          : null);
      const code = accessState?.code || "CHATGPT_COMPOSER_NOT_FOUND";
      const screenshotPath = diagnostics?.screenshotPath || join(outputDir, "chatgpt-thumbnail-auth-or-access-failure.png");
      if (!diagnostics) await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      await persistThumbnailFailure({
        outputDir,
        code,
        reason: accessState?.reason || "composer-not-found",
        message: accessState?.message || error.message,
        screenshotPath,
        details: {
          diagnosticsPath: diagnostics?.reportPath,
          pageTitle,
          pageUrl,
          pageText: String(pageText || "").slice(0, 2000),
        },
      });
      throw createChatGptThumbnailError(code, `${accessState?.message || error.message} Screenshot: ${screenshotPath}`, {
        screenshotPath,
        diagnosticsPath: diagnostics?.reportPath,
      });
    }

    const before = new Set((await collectGeneratedImageCandidates(page)).map((item) => item.src));
    const toolState = await clickImageCreationTool(page, outputDir);
    if (!toolState.ok) {
      const diagnostics = await diagnoseChatGptThumbnailState({
        page,
        outputDir,
        phase: "image-tool-selection",
      });
      await persistThumbnailFailure({
        outputDir,
        code: "CHATGPT_IMAGE_TOOL_NOT_FOUND",
        reason: "chatgpt-image-tool-not-found",
        message: "ChatGPT loaded, but Hermes could not find or select the image creation tool.",
        screenshotPath: diagnostics.screenshotPath,
        details: { toolState, diagnosticsPath: diagnostics.reportPath },
      });
      throw createChatGptThumbnailError("CHATGPT_IMAGE_TOOL_NOT_FOUND", "ChatGPT image creation tool was not found.", {
        diagnosticsPath: diagnostics.reportPath,
        screenshotPath: diagnostics.screenshotPath,
      });
    }
    const submitted = await submitPrompt(page, prompt);
    await writeFile(join(outputDir, "chatgpt-thumbnail-submit-state.json"), JSON.stringify({
      ok: true,
      provider: "chatgpt-authenticated-browser",
      toolState,
      submitted,
      prompt,
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8");

    const deadline = Date.now() + timeoutMs;
    let lastCandidates = [];
    while (Date.now() < deadline) {
      await delay(5000);
      lastCandidates = await collectGeneratedImageCandidates(page);
      const fresh = lastCandidates.filter((item) => !before.has(item.src));
      if (fresh.length) {
        const selected = fresh[0];
        let payload;
        try {
          payload = await mediaUrlToBuffer(page, context, selected.src);
        } catch (error) {
          const screenshotPath = join(outputDir, "chatgpt-thumbnail-download-failure.png");
          await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
          await persistThumbnailFailure({
            outputDir,
            code: "CHATGPT_IMAGE_DOWNLOAD_FAILED",
            reason: "chatgpt-image-download-failed",
            message: error?.message || "ChatGPT generated an image, but Hermes could not download it.",
            screenshotPath,
            details: { selected },
          });
          throw createChatGptThumbnailError("CHATGPT_IMAGE_DOWNLOAD_FAILED", error?.message || "ChatGPT thumbnail download failed.", { selected });
        }
        const rawExt = mediaExtension(payload.contentType, selected.src);
        const rawPath = join(outputDir, `thumbnail-chatgpt-source.${rawExt}`);
        const outputPath = join(outputDir, "thumbnail-chatgpt.png");
        const outputWidth = aspectRatio === "16:9" ? 1280 : 1080;
        const outputHeight = aspectRatio === "16:9" ? 720 : 1920;
        await writeFile(rawPath, payload.buffer);
        await sharp(payload.buffer)
          .resize(outputWidth, outputHeight, { fit: "cover", position: "center" })
          .png()
          .toFile(outputPath);
        await writeFile(join(outputDir, "chatgpt-thumbnail-result.json"), JSON.stringify({
          ok: true,
          provider: "chatgpt-authenticated-browser",
          method: toolState.ok ? "chatgpt-image-tool" : "chatgpt-prompted-image-generation",
          toolState,
          rawPath,
          path: outputPath,
          aspectRatio,
          outputWidth,
          outputHeight,
          sourceContentType: payload.contentType,
          selected,
          updatedAt: new Date().toISOString(),
        }, null, 2), "utf8");
        emit?.({ type: "thumbnail-chatgpt-completed", imagePath: outputPath, rawPath });
        return {
          ok: true,
          provider: "chatgpt-authenticated-browser",
          method: toolState.ok ? "chatgpt-image-tool" : "chatgpt-prompted-image-generation",
          path: outputPath,
          rawPath,
          prompt,
          toolState,
        };
      }
      await page.screenshot({ path: join(outputDir, "chatgpt-thumbnail-waiting.png"), fullPage: true }).catch(() => {});
    }

    const screenshotPath = join(outputDir, "chatgpt-thumbnail-failure.png");
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    const responseState = await detectTextModeResponse(page);
    const timeoutCode = responseState.textLength > 0 && responseState.imageCount === 0
      ? "CHATGPT_TEXT_RESPONSE_INSTEAD_OF_IMAGE"
      : "CHATGPT_IMAGE_TIMEOUT";
    await persistThumbnailFailure({
      outputDir,
      code: timeoutCode,
      reason: timeoutCode === "CHATGPT_TEXT_RESPONSE_INSTEAD_OF_IMAGE"
        ? "text-response-instead-of-image"
        : "no-new-generated-image",
      message: timeoutCode === "CHATGPT_TEXT_RESPONSE_INSTEAD_OF_IMAGE"
        ? "ChatGPT did not expose a new generated image; it appears to be in text response mode."
        : "ChatGPT did not expose a new generated thumbnail image before timeout.",
      screenshotPath,
      details: {
        toolState,
        candidates: lastCandidates.slice(0, 8),
        responseState,
      },
    });
    throw createChatGptThumbnailError(timeoutCode, `ChatGPT did not expose a new generated thumbnail image. Screenshot: ${screenshotPath}`, {
      screenshotPath,
      responseState,
    });
  } finally {
    await context.close().catch(() => {});
  }
}
