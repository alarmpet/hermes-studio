import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";
import { isFlowPolicyWarningText } from "../electron/services/flow-prompt-safety.mjs";
import { attachFlowIngredients } from "./google-flow-ingredients.mjs";
import {
  flowChipClassifierBrowserSource,
} from "./google-flow-chip-classifier.mjs";
import { configureFlowOutputMode, verifyFlowOutputMode } from "./google-flow-output-mode.mjs";

export const GOOGLE_FLOW_URL = "https://labs.google/fx/ko/tools/flow";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function classifyFlowGenerationFailureText(text = "") {
  const value = String(text || "");
  if (!value.trim()) return null;

  if (/비정상적인\s*활동|unusual\s+activity|suspicious\s+activity|abnormal\s+activity|automated\s+traffic|too\s+many\s+requests|rate\s*limit|temporarily\s+unavailable|try\s+again\s+later|고객센터|鍮꾩젙|媛먯|怨좉컼|쇳꽣/i.test(value)) {
    return {
      code: "FLOW_ABNORMAL_ACTIVITY",
      reason: "flow-abnormal-activity",
      retryable: false,
      actionRequired: true,
      userMessage: "Google Flow reported abnormal activity for this account/session. Change or re-authenticate the Flow account, wait for the account cooldown, then retry the failed scene.",
    };
  }

  if (/(^|\n|\s)(실패|failed)(\n|\s|$)/i.test(value) && /(다시\s*시도|retry|프롬프트\s*재사용|reuse\s+prompt|delete_forever|삭제)/i.test(value)) {
    return {
      code: "FLOW_GENERATION_FAILED",
      reason: "flow-generation-failed",
      retryable: true,
      actionRequired: false,
      userMessage: "Google Flow returned a generation failure card before exposing media.",
    };
  }

  return null;
}

async function writeFlowFailureDiagnostics({ page, jobDir, sceneOrder, outputMode, failure, state, source, screenshotName = "flow_screen" }) {
  const screenshotPath = join(jobDir, `scene_${sceneOrder}_${screenshotName}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await writeFile(join(jobDir, `scene_${sceneOrder}_flow_status.json`), JSON.stringify({
    ok: false,
    reason: failure?.reason || "flow-generation-failed",
    failureCode: failure?.code || "FLOW_GENERATION_FAILED",
    actionRequired: Boolean(failure?.actionRequired),
    retryable: Boolean(failure?.retryable),
    source,
    outputMode,
    userMessage: failure?.userMessage || "",
    lastText: state?.text || state?.textTail || "",
    screenshotPath,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  return screenshotPath;
}

function buildFlowFailureMessage(failure, screenshotPath) {
  const prefix = failure?.code ? `${failure.code}: ` : "";
  return `${prefix}${failure?.userMessage || "Google Flow generation failed."} Screenshot: ${screenshotPath}`;
}

async function maximizeChromiumWindow(page) {
  const session = await page.context().newCDPSession(page);
  try {
    const { windowId } = await session.send("Browser.getWindowForTarget");
    await session.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "maximized" },
    });
    const bounds = await session.send("Browser.getWindowBounds", { windowId });
    if (bounds?.bounds?.windowState !== "maximized") {
      throw new Error(`Chrome window did not enter maximized state: ${JSON.stringify(bounds?.bounds || {})}`);
    }
    return bounds?.bounds || {};
  } finally {
    await session.detach().catch(() => {});
  }
}

async function ensureLargeViewport(page, { width = 1920, height = 1080 } = {}) {
  await page.setViewportSize({ width, height });
  const windowBounds = await maximizeChromiumWindow(page);
  const viewport = page.viewportSize?.();
  if (!viewport || viewport.width < width || viewport.height < height) {
    throw new Error(`Browser viewport is too small for stable Google Flow automation: ${JSON.stringify(viewport)}`);
  }
  return { viewport, windowBounds };
}

function assertRuntime({ chromePath, profileDir, jobDir }) {
  if (!chromePath) throw new Error("Chrome executable is required for Google Flow automation.");
  if (!profileDir) throw new Error("Google Flow profile directory is required.");
  if (!jobDir) throw new Error("Job directory is required for Google Flow output.");
}

function isProcessRunning(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function releaseAppManagedAuthWindow(profileDir) {
  const lockPath = join(profileDir, "hermes-profile.lock.json");
  if (!existsSync(lockPath)) return;
  const lock = JSON.parse(await readFile(lockPath, "utf8").catch(() => "{}"));
  if (lock.pid && isProcessRunning(lock.pid)) {
    try {
      process.kill(Number(lock.pid));
    } catch {
      // The browser may have already exited between the liveness check and kill.
    }
    for (let i = 0; i < 20; i += 1) {
      if (!isProcessRunning(lock.pid)) break;
      await delay(250);
    }
  }
  await rm(lockPath, { force: true });
}

async function visiblePage(context) {
  const existing = context.pages().find((item) => !item.isClosed());
  return existing || context.newPage();
}

async function ensureFlowProject(page) {
  await page.goto(GOOGLE_FLOW_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

  const authState = await page.evaluate(() => ({
    href: location.href,
    text: document.body?.innerText?.slice(0, 1200) || "",
  }));
  if (/accounts\.google|signin|auth\/error/i.test(`${authState.href} ${authState.text}`)) {
    throw new Error("Google Flow login is required. Use Authenticate Google Flow, finish login, close the auth browser window, then run again.");
  }

  if (page.url().includes("/project/")) return;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const opened = await page.evaluate(() => {
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return !el.disabled && style.display !== "none" && style.visibility !== "hidden" && rect.width > 8 && rect.height > 8;
      };
      const words = [
        "new project",
        "create project",
        "get started",
        "\uc0c8 \ud504\ub85c\uc81d\ud2b8",
        "\uc2dc\uc791",
        "\uc2dc\uc791\ud558\uae30",
      ];
      const button = Array.from(document.querySelectorAll("button,[role='button'],a"))
        .filter(visible)
        .find((el) => {
          const text = [
            el.innerText,
            el.textContent,
            el.getAttribute("aria-label"),
            el.getAttribute("title"),
          ].filter(Boolean).join(" ").replace(/\s+/g, " ").toLowerCase();
          return words.some((word) => text.includes(word));
        });
      if (!button) return { ok: false, reason: "Flow project start button not found" };
      button.click();
      return { ok: true };
    });
    if (opened.ok) break;
    await delay(1000);
  }

  for (let i = 0; i < 60; i += 1) {
    if (page.url().includes("/project/")) return;
    await delay(1000);
  }
  throw new Error(`Flow project did not open: ${page.url()}`);
}

async function dismissFlowBlockingNotices(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled && style.visibility !== "hidden" && style.display !== "none" && rect.width > 8 && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const bodyText = document.body?.innerText || "";
    const noticeOpen = /Flow\s*에이전트가\s*활성화|Flow\s*agent\s*is\s*enabled/i.test(bodyText);
    if (!noticeOpen) return { dismissed: false, reason: "no-flow-agent-notice" };
    const buttons = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .map((el) => ({ el, text: textOf(el), rect: el.getBoundingClientRect() }))
      .filter((item) => /확인|닫기|got it|ok|close/i.test(item.text))
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    const target = buttons[0];
    if (!target) return { dismissed: false, reason: "notice-confirm-button-not-found" };
    target.el.click();
    return { dismissed: true, label: target.text };
  }).catch((error) => ({ dismissed: false, reason: error?.message || String(error) }));
}

async function waitForFlowGeneratorReady(page, jobDir, sceneOrder) {
  let lastState = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const noticeState = await dismissFlowBlockingNotices(page);
    if (noticeState.dismissed) {
      await delay(500);
    }
    lastState = await page.evaluate((classifierSource) => {
      const {
        chooseFlowGeneratorChip: chooseChip,
        rejectedFlowChipReasons: rejectedReasons,
      } = Function(`${classifierSource}; return { chooseFlowGeneratorChip, rejectedFlowChipReasons };`)();
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 8 && rect.height > 8;
      };
      const textOf = (el) => [
        el.innerText,
        el.textContent,
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const buttons = Array.from(document.querySelectorAll("button,[role='button']"))
        .filter(visible)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: textOf(el),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        });
      const bottomButtons = buttons.filter((item) => item.y > window.innerHeight * 0.64);
      const generatorChip = chooseChip(bottomButtons);
      const createButton = bottomButtons.find((item) => item.x > window.innerWidth * 0.45 && /arrow_forward|create|generate|\ub9cc\ub4e4\uae30/i.test(item.label));
      return {
        ready: Boolean(generatorChip && createButton),
        generatorChip,
        createButton,
        bottomButtons,
        rejectedChipReasons: rejectedReasons(bottomButtons),
        textTail: (document.body?.innerText || "").slice(-800),
      };
    }, flowChipClassifierBrowserSource()).catch((error) => ({
      ready: false,
      failureCode: "FLOW_CHIP_CLASSIFIER_EVAL_FAILED",
      reason: `Browser-side classifier evaluation crash: ${error?.message || error}`,
      stack: error?.stack || "",
    }));
    if (lastState.ready) {
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_generator_ready.json`), JSON.stringify({
        ok: true,
        state: lastState,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8").catch(() => {});
      return lastState;
    }
    await delay(1000);
  }
  const screenshotPath = join(jobDir, `scene_${sceneOrder}_flow_generator_not_ready.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await writeFile(join(jobDir, `scene_${sceneOrder}_flow_generator_ready.json`), JSON.stringify({
    ok: false,
    state: lastState,
    screenshotPath,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8").catch(() => {});
  throw new Error(`Google Flow generator controls were not ready. Screenshot: ${screenshotPath}`);
}

async function findPromptAndCreate(page) {
  let lastSnapshot = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const positions = await page.evaluate(() => {
      const textbox = Array.from(document.querySelectorAll("[role='textbox'][contenteditable='true'],[contenteditable='true'],textarea"))
        .map((el) => ({ r: el.getBoundingClientRect(), text: (el.innerText || el.textContent || "").trim() }))
        .filter((item) => item.r.width > 100 && item.r.height > 10)
        .sort((a, b) => b.r.y - a.r.y)[0];
      const create = Array.from(document.querySelectorAll("button,[role='button']"))
        .map((el) => ({
          r: el.getBoundingClientRect(),
          text: [
            el.innerText,
            el.textContent,
            el.getAttribute("aria-label"),
            el.getAttribute("title"),
          ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
          disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
        }))
        .filter((item) => item.r.width > 10 && item.r.height > 10)
        .filter((item) => {
          const text = item.text.toLowerCase();
          const isCreateLike = text.includes("arrow_forward")
            || text.includes("create")
            || text.includes("generate")
            || text.includes("\ub9cc\ub4e4\uae30")
            || text.includes("\uc0dd\uc131");
          const isAddButton = text.includes("add_2") || text.includes("add ");
          const isBottomRight = item.r.y > window.innerHeight * 0.65 && item.r.x > window.innerWidth * 0.45;
          return isCreateLike && !isAddButton && isBottomRight;
        })
        .sort((a, b) => {
          const aArrow = a.text.includes("arrow_forward") ? 1 : 0;
          const bArrow = b.text.includes("arrow_forward") ? 1 : 0;
          const aBottom = a.r.y > window.innerHeight * 0.65 ? 1 : 0;
          const bBottom = b.r.y > window.innerHeight * 0.65 ? 1 : 0;
          return bArrow - aArrow || bBottom - aBottom || (b.r.x - a.r.x) || (b.r.y - a.r.y);
        })[0];
      const snapshotButtons = Array.from(document.querySelectorAll("button,[role='button']"))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            text: [
              el.innerText,
              el.textContent,
              el.getAttribute("aria-label"),
              el.getAttribute("title"),
            ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 120),
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
            disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
          };
        })
        .filter((item) => item.width > 8 && item.height > 8 && item.y > window.innerHeight * 0.55)
        .slice(-12);
      return {
        textbox: textbox
          ? { x: Math.round(textbox.r.x + textbox.r.width / 2), y: Math.round(textbox.r.y + textbox.r.height / 2), source: "editable" }
          : (create ? { x: Math.round(window.innerWidth * 0.5), y: Math.round(create.r.y + create.r.height / 2), source: "composer-fallback" } : null),
        create: create ? { x: Math.round(create.r.x + create.r.width / 2), y: Math.round(create.r.y + create.r.height / 2), text: create.text } : null,
        snapshotButtons,
      };
    });
    lastSnapshot = positions;
    if (positions.textbox && positions.create) return positions;
    await delay(1000);
  }
  throw new Error(`Flow prompt box or create button not found. Last snapshot: ${JSON.stringify(lastSnapshot)}`);
}

async function collectMediaUrls(page) {
  return page.evaluate(() => {
    const minGeneratedImageSize = 512;
    const imageCandidates = Array.from(document.images)
      .map((item) => {
        const rect = item.getBoundingClientRect();
        const src = item.currentSrc || item.src || "";
        return {
          src,
          alt: item.alt || "",
          className: String(item.className || ""),
          naturalWidth: item.naturalWidth || 0,
          naturalHeight: item.naturalHeight || 0,
          width: Math.round(rect.width || 0),
          height: Math.round(rect.height || 0),
          visible: rect.width > 0 && rect.height > 0 && getComputedStyle(item).visibility !== "hidden",
        };
      })
      .filter((item) => {
        if (!item.src || !item.visible) return false;
        if (/^data:image\/svg/i.test(item.src) || /\.svg(?:$|[?#])/i.test(item.src)) return false;
        if (/favicon|sprite|icon|logo|material|avatar/i.test(`${item.src} ${item.alt} ${item.className}`)) return false;
        if (item.naturalWidth < minGeneratedImageSize || item.naturalHeight < minGeneratedImageSize) return false;
        if (item.width < 180 || item.height < 180) return false;
        return true;
      });
    return {
      videos: Array.from(new Set(Array.from(document.querySelectorAll("video")).map((item) => item.currentSrc || item.src).filter(Boolean))),
      images: Array.from(new Set(imageCandidates.map((item) => item.src))),
      imageCandidates,
      text: document.body?.innerText?.slice(0, 1500) || "",
    };
  });
}

function promptHash(prompt = "") {
  return createHash("sha256").update(String(prompt || ""), "utf8").digest("hex").slice(0, 16);
}

function extendFlowDeadlineForPolicyRetry({ timeoutMs }) {
  const extensionMs = Math.max(5 * 60 * 1000, Number(timeoutMs || 0));
  return Date.now() + extensionMs;
}

async function submitPromptToFlowAgain(page, prompt) {
  const positions = await findPromptAndCreate(page);
  await page.mouse.click(positions.textbox.x, positions.textbox.y);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(prompt);
  await delay(800);
  await page.mouse.click(positions.create.x, positions.create.y);
  const domClick = await clickVisibleCreateButton(page);
  return { positions, domClick };
}

async function probeFlowSubmitState(page) {
  const state = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const textboxes = Array.from(document.querySelectorAll("[contenteditable='true'], textarea"))
      .map((el) => ({
        text: (el.innerText || el.value || el.textContent || "").trim(),
        rect: el.getBoundingClientRect(),
      }))
      .filter((item) => item.rect.width > 100 && item.rect.height > 10);
    const buttons = Array.from(document.querySelectorAll("button,[role='button']"))
      .map((el) => ({
        text: [el.innerText, el.textContent, el.getAttribute("aria-label"), el.getAttribute("title")]
          .filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
        disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
        rect: el.getBoundingClientRect(),
      }))
      .filter((item) => item.rect.width > 10 && item.rect.height > 10);
    const percents = Array.from(text.matchAll(/(\d+)%/g)).map((match) => Number(match[1]));
    const createButton = buttons
      .filter((item) => {
        const text = item.text.toLowerCase();
        const isCreateLike = /arrow_forward|create|generate|만들기|생성/i.test(item.text);
        const isAddButton = text.includes("add_2") || text.includes("add ");
        const isBottomRight = item.rect.y > window.innerHeight * 0.65 && item.rect.x > window.innerWidth * 0.45;
        return isCreateLike && !isAddButton && isBottomRight;
      })
      .sort((a, b) => {
        const aArrow = a.text.includes("arrow_forward") ? 1 : 0;
        const bArrow = b.text.includes("arrow_forward") ? 1 : 0;
        const aBottom = a.rect.y > window.innerHeight * 0.65 ? 1 : 0;
        const bBottom = b.rect.y > window.innerHeight * 0.65 ? 1 : 0;
        return bArrow - aArrow || bBottom - aBottom || (b.rect.x - a.rect.x) || (b.rect.y - a.rect.y);
      })[0];
    return {
      promptStillVisible: textboxes.some((item) => item.text.length > 20),
      createButtonVisible: Boolean(createButton && !createButton.disabled),
      createButtonText: createButton?.text || "",
      hasProgressPercent: percents.length > 0,
      maxPercent: percents.length ? Math.max(...percents) : null,
      hasVideo: document.querySelectorAll("video").length > 0,
      textTail: text.slice(-1000),
    };
  });
  const failureClassification = classifyFlowGenerationFailureText(state.textTail);
  return {
    ...state,
    hasFailureCard: Boolean(failureClassification),
    failureClassification,
  };
}

async function verifyFlowSubmissionStarted(page, jobDir, sceneOrder, outputMode = "video", onProgress) {
  let lastState = null;
  for (let i = 0; i < 20; i += 1) {
    await delay(1000);
    lastState = await probeFlowSubmitState(page);
    const hasProgressOrVideo = lastState.hasProgressPercent || lastState.hasVideo;
    if (lastState.failureClassification && !hasProgressOrVideo) {
      const screenshotPath = await writeFlowFailureDiagnostics({
        page,
        jobDir,
        sceneOrder,
        outputMode,
        failure: lastState.failureClassification,
        state: lastState,
        source: "submit-start",
        screenshotName: "flow_submit_failed",
      });
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_submit_state.json`), JSON.stringify({
        ok: false,
        reason: lastState.failureClassification.reason,
        failureCode: lastState.failureClassification.code,
        actionRequired: lastState.failureClassification.actionRequired,
        retryable: lastState.failureClassification.retryable,
        state: lastState,
        screenshotPath,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      onProgress?.({
        message: buildFlowFailureMessage(lastState.failureClassification, screenshotPath),
        details: {
          eventType: lastState.failureClassification.reason,
          failureCode: lastState.failureClassification.code,
          actionRequired: lastState.failureClassification.actionRequired,
          retryable: lastState.failureClassification.retryable,
          sceneOrder,
          outputMode,
          screenshotPath,
        },
      });
      throw new Error(buildFlowFailureMessage(lastState.failureClassification, screenshotPath));
    }
    if (!lastState.promptStillVisible || !lastState.createButtonVisible || lastState.hasProgressPercent || lastState.hasVideo) {
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_submit_state.json`), JSON.stringify({
        ok: true,
        state: lastState,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      return lastState;
    }
  }

  const screenshotPath = join(jobDir, `scene_${sceneOrder}_flow_submit_failed.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await writeFile(join(jobDir, `scene_${sceneOrder}_flow_submit_state.json`), JSON.stringify({
    ok: false,
    reason: "flow-submit-did-not-start",
    state: lastState,
    screenshotPath,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  throw new Error(`Google Flow did not start generation after clicking create. Screenshot: ${screenshotPath}`);
}

async function clickVisibleCreateButton(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled
        && el.getAttribute("aria-disabled") !== "true"
        && style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 10
        && rect.height > 10;
    };
    const candidates = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .map((el) => ({
        el,
        text: [el.innerText, el.textContent, el.getAttribute("aria-label"), el.getAttribute("title")]
          .filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
        rect: el.getBoundingClientRect(),
      }))
      .filter((item) => {
        const text = item.text.toLowerCase();
        const isCreateLike = /arrow_forward|create|generate|만들기|생성/i.test(item.text);
        const isAddButton = text.includes("add_2") || text.includes("add ");
        const isBottomRight = item.rect.y > window.innerHeight * 0.65 && item.rect.x > window.innerWidth * 0.45;
        return isCreateLike && !isAddButton && isBottomRight;
      })
      .sort((a, b) => {
        const aArrow = a.text.includes("arrow_forward") ? 1 : 0;
        const bArrow = b.text.includes("arrow_forward") ? 1 : 0;
        const aBottom = a.rect.y > window.innerHeight * 0.65 ? 1 : 0;
        const bBottom = b.rect.y > window.innerHeight * 0.65 ? 1 : 0;
        return bArrow - aArrow || bBottom - aBottom || (b.rect.x - a.rect.x) || (b.rect.y - a.rect.y);
      });
    const target = candidates[0];
    if (!target) return { ok: false, reason: "create button not found" };
    target.el.click();
    return { ok: true, text: target.text };
  });
}

async function blobOrDataUrlToBuffer(page, mediaUrl) {
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
  if (!match) throw new Error("Generated blob media could not be converted to a data URL.");
  return { buffer: Buffer.from(match[2], "base64"), contentType: match[1] };
}

async function httpUrlToBuffer(context, mediaUrl) {
  const cookies = await context.cookies([GOOGLE_FLOW_URL, "https://labs.google"]);
  const cookie = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
  const response = await fetch(mediaUrl, {
    headers: { cookie, "user-agent": "Mozilla/5.0 Chrome Flow downloader", accept: "*/*" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Flow media download failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { buffer: Buffer.from(bytes), contentType: response.headers.get("content-type") || "" };
}

function mediaExtension(contentType, mediaUrl) {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("png")) return "png";
  const existing = extname(new URL(mediaUrl, "https://labs.google").pathname).replace(".", "");
  if (existing && !/redirect|url/i.test(existing)) return existing;
  return "mp4";
}

async function saveMedia({ page, context, mediaUrl, outputPathBase }) {
  const payload = mediaUrl.startsWith("blob:") || mediaUrl.startsWith("data:")
    ? await blobOrDataUrlToBuffer(page, mediaUrl)
    : await httpUrlToBuffer(context, mediaUrl);
  const ext = mediaExtension(payload.contentType, mediaUrl);
  const outputPath = `${outputPathBase}.${ext}`;
  await writeFile(outputPath, payload.buffer);
  return { path: outputPath, bytes: payload.buffer.length, contentType: payload.contentType, ok: true };
}

export async function generateGoogleFlowVideoFromPrompt({
  prompt,
  safeFallbackPrompt,
  jobDir,
  sceneOrder = 1,
  chromePath,
  profileDir,
  outputMode = "video",
  aspectRatio = "9:16",
  ingredientImagePaths = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onProgress,
}) {
  assertRuntime({ chromePath, profileDir, jobDir });
  await mkdir(jobDir, { recursive: true });
  onProgress?.({ message: `장면 ${sceneOrder} Google Flow 프로필을 준비하는 중입니다.` });
  await releaseAppManagedAuthWindow(profileDir);

  onProgress?.({ message: `장면 ${sceneOrder} Google Flow 브라우저를 여는 중입니다.` });
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: false,
    viewport: { width: 1920, height: 1080 },
    locale: "ko-KR",
    acceptDownloads: true,
    args: ["--no-first-run", "--no-default-browser-check", "--start-maximized", "--window-size=1920,1080"],
  });

  try {
    const page = await visiblePage(context);
    await ensureLargeViewport(page);
    await writeFile(join(jobDir, `scene_${sceneOrder}_browser_window_state.json`), JSON.stringify({
      ok: true,
      viewport: page.viewportSize?.(),
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8").catch(() => {});
    page.setDefaultTimeout(60000);
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 프로젝트를 여는 중입니다.` });
    await ensureFlowProject(page);
    await waitForFlowGeneratorReady(page, jobDir, sceneOrder);
    const retryFlowOutputModeAfterReload = async ({ reason }) => {
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_mode_retry.json`), JSON.stringify({
        reason,
      requestedOutputMode: outputMode,
      requestedAspectRatio: aspectRatio,
      updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await ensureFlowProject(page);
      await waitForFlowGeneratorReady(page, jobDir, sceneOrder);
      const retrySwitchResult = await configureFlowOutputMode(page, outputMode, aspectRatio);
      const retryVerification = await verifyFlowOutputMode(page, outputMode, aspectRatio);
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_mode_retry_verification.json`), JSON.stringify({
        retrySwitchResult,
        retryVerification,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      return { retrySwitchResult, retryVerification };
    };
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 설정을 확인하는 중입니다.` });
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow ${outputMode === "image" ? "이미지" : "영상"} 설정을 확인하는 중입니다.`, details: { outputMode } });
    const modeSwitchResult = await configureFlowOutputMode(page, outputMode, aspectRatio);
    await writeFile(join(jobDir, `scene_${sceneOrder}_flow_mode_switch.json`), JSON.stringify(modeSwitchResult, null, 2), "utf8");
    await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_mode_after_click.png`), fullPage: true }).catch(() => {});
    const modeVerification = await verifyFlowOutputMode(page, outputMode, aspectRatio);
    await writeFile(join(jobDir, `scene_${sceneOrder}_flow_mode_verification.json`), JSON.stringify(modeVerification, null, 2), "utf8");
    let finalModeSwitchResult = modeSwitchResult;
    let finalModeVerification = modeSwitchResult?.settingsPanelApplied && modeSwitchResult?.saved && modeVerification.selectedOutputMode === "unknown"
      ? {
          ...modeVerification,
          selectedOutputMode: outputMode,
          ok: true,
          settingsPanelApplied: true,
          saved: true,
          reason: "Google Flow Agent settings panel was applied and saved; the current Flow UI does not expose a separate video/image bottom chip after save.",
        }
      : modeVerification;
    if (!finalModeSwitchResult.ok || !finalModeVerification.ok) {
      const retryResult = await retryFlowOutputModeAfterReload({
        reason: `initial mismatch: requested=${outputMode}, selected=${modeVerification.selectedOutputMode}`,
      });
      finalModeSwitchResult = retryResult.retrySwitchResult;
      finalModeVerification = retryResult.retryVerification;
    }
    if (!finalModeVerification.ok) {
      const mismatchPath = join(jobDir, `scene_${sceneOrder}_flow_mode_mismatch.png`);
      await page.screenshot({ path: mismatchPath, fullPage: true }).catch(() => {});
      onProgress?.({
        message: `Google Flow output mode mismatch. Requested ${outputMode}, but Flow UI appears to be ${finalModeVerification.selectedOutputMode}.`,
        details: {
          eventType: "flow-mode-mismatch",
          requestedOutputMode: outputMode,
          selectedOutputMode: finalModeVerification.selectedOutputMode,
          selectedChipLabel: finalModeSwitchResult?.selectedChip?.label || finalModeVerification?.selectedChip?.label || "",
          rejectedChipReasons: finalModeSwitchResult?.rejectedChipReasons || [],
          bottomButtons: finalModeVerification.bottomGeneratorChip || [],
          sceneOrder,
          screenshotPath: mismatchPath,
        },
      });
      throw new Error(`Google Flow output mode mismatch. Requested ${outputMode}, but Flow UI appears to be ${finalModeVerification.selectedOutputMode}. Check ${mismatchPath}.`);
    }
    await page.keyboard.press("Escape").catch(() => {});
    await delay(250);
    const viewport = page.viewportSize?.() || await ensureLargeViewport(page);
    await page.mouse.click(Math.round(viewport.width * 0.42), Math.round(viewport.height * 0.42)).catch(() => {});
    await delay(300);
    try {
      const ingredientResult = await attachFlowIngredients(page, ingredientImagePaths || []);
      if (ingredientResult.attached) {
        await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_ingredients_attached.png`), fullPage: true });
      }
    } catch (error) {
      await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_ingredients_failed.png`), fullPage: true }).catch(() => {});
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_ingredients_error.json`), JSON.stringify({
        message: error.message,
        ingredientImagePaths,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
    }

    const before = await collectMediaUrls(page);
    const beforeUrls = new Set(outputMode === "image" ? before.images : before.videos);
    let activePrompt = prompt;
    let policyRetryUsed = false;
    let deadline = Date.now() + timeoutMs;
    const tryPolicyFallback = async (warningState, source = "unknown") => {
      if (!isFlowPolicyWarningText(warningState?.text || "")) return false;
      await writeFile(join(jobDir, `scene_${sceneOrder}_policy-warning.json`), JSON.stringify({
        sceneOrder,
        source,
        text: String(warningState?.text || "").slice(0, 2000),
        originalPromptHash: promptHash(activePrompt),
        sanitizedPromptHash: promptHash(safeFallbackPrompt || ""),
        hasSafeFallbackPrompt: Boolean(safeFallbackPrompt),
        at: new Date().toISOString(),
      }, null, 2), "utf8");
      onProgress?.({
        message: `장면 ${sceneOrder} Flow 정책 경고 감지: 안전 프롬프트로 재시도합니다.`,
        details: {
          eventType: "flow-policy-warning",
          warning: "policy-warning",
          sceneOrder,
          warningText: String(warningState?.text || "").slice(0, 1000),
          originalPromptHash: promptHash(activePrompt),
          sanitizedPromptHash: promptHash(safeFallbackPrompt || ""),
          retryCount: 1,
          recovered: false,
        },
      });
      if (!safeFallbackPrompt || safeFallbackPrompt === activePrompt || policyRetryUsed) return false;
      policyRetryUsed = true;
      deadline = extendFlowDeadlineForPolicyRetry({ timeoutMs });
      activePrompt = safeFallbackPrompt;
      const retry = await submitPromptToFlowAgain(page, activePrompt);
      await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_policy_retry_submitted.png`), fullPage: true }).catch(() => {});
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_policy_retry_state.json`), JSON.stringify({
        ok: true,
        mouseClick: { x: retry.positions.create.x, y: retry.positions.create.y, text: retry.positions.create.text },
        domClick: retry.domClick,
        deadline: new Date(deadline).toISOString(),
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      await verifyFlowSubmissionStarted(page, jobDir, sceneOrder, outputMode, onProgress);
      onProgress?.({
        message: `장면 ${sceneOrder} Flow 정책 경고를 안전 프롬프트로 복구했습니다.`,
        details: {
          eventType: "flow-policy-warning",
          warning: "policy-warning",
          sceneOrder,
          retryCount: 1,
          recovered: true,
          remainingSeconds: Math.max(0, Math.round((deadline - Date.now()) / 1000)),
        },
      });
      return true;
    };

    onProgress?.({ message: `장면 ${sceneOrder} 프롬프트를 입력하는 중입니다.` });
    const submitted = await submitPromptToFlowAgain(page, activePrompt);
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 생성 버튼을 클릭하는 중입니다.` });
    await delay(500);
    await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_submitted.png`), fullPage: true }).catch(() => {});
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 생성 시작 여부를 확인하는 중입니다.` });
    await writeFile(join(jobDir, `scene_${sceneOrder}_flow_click_state.json`), JSON.stringify({
      mouseClick: { x: submitted.positions.create.x, y: submitted.positions.create.y, text: submitted.positions.create.text },
      domClick: submitted.domClick,
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8");
    try {
      await verifyFlowSubmissionStarted(page, jobDir, sceneOrder, outputMode, onProgress);
    } catch (error) {
      const warningState = await collectMediaUrls(page);
      const recovered = await tryPolicyFallback(warningState, "submit-start");
      if (!recovered) throw error;
    }

    let last = null;
    let newMedia = [];
    let nextProgressAt = Date.now();
    while (Date.now() < deadline) {
      await delay(5000);
      last = await collectMediaUrls(page);
      const recovered = await tryPolicyFallback(last, "wait-loop");
      if (recovered) {
        nextProgressAt = Date.now();
        continue;
      }
      const percents = Array.from(String(last?.text || "").matchAll(/(\d+)%/g)).map((match) => Number(match[1]));
      const hasActiveProgress = percents.length > 0;
      const flowFailure = hasActiveProgress ? null : classifyFlowGenerationFailureText(last?.text || "");
      if (flowFailure) {
        const screenshotPath = await writeFlowFailureDiagnostics({
          page,
          jobDir,
          sceneOrder,
          outputMode,
          failure: flowFailure,
          state: last,
          source: "wait-loop",
        });
        onProgress?.({
          message: buildFlowFailureMessage(flowFailure, screenshotPath),
          details: {
            eventType: flowFailure.reason,
            failureCode: flowFailure.code,
            actionRequired: flowFailure.actionRequired,
            retryable: flowFailure.retryable,
            sceneOrder,
            outputMode,
            screenshotPath,
          },
        });
        throw new Error(buildFlowFailureMessage(flowFailure, screenshotPath));
      }
      const currentUrls = outputMode === "image" ? last.images : last.videos;
      newMedia = currentUrls.filter((url) => !beforeUrls.has(url));
      if (Date.now() >= nextProgressAt) {
        const remainingSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        onProgress?.({
          message: `장면 ${sceneOrder} Google Flow 생성 대기 중입니다. 감지된 진행률: ${percents.length ? `${Math.max(...percents)}%` : "없음"}`,
          details: {
            sceneOrder,
            elapsedSeconds: Math.round((timeoutMs - (deadline - Date.now())) / 1000),
            remainingSeconds,
            outputMode,
            detectedMediaCount: newMedia.length,
            detectedVideoCount: outputMode === "video" ? newMedia.length : 0,
            detectedImageCount: outputMode === "image" ? newMedia.length : 0,
            detectedPercents: percents,
          },
        });
        await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_waiting.png`), fullPage: true }).catch(() => {});
        nextProgressAt = Date.now() + 15000;
      }
      if (newMedia.length > 0 && percents.length === 0) break;
    }

    if (!newMedia.length) {
      const screenshotPath = join(jobDir, `scene_${sceneOrder}_flow_screen.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const warningState = last || await collectMediaUrls(page);
      const recovered = await tryPolicyFallback(warningState, outputMode === "image" ? "no-new-image-url" : "no-new-video-url");
      if (recovered) {
        while (Date.now() < deadline) {
          await delay(5000);
          last = await collectMediaUrls(page);
          const currentUrls = outputMode === "image" ? last.images : last.videos;
          newMedia = currentUrls.filter((url) => !beforeUrls.has(url));
          const percents = Array.from(String(last.text || "").matchAll(/(\d+)%/g)).map((match) => Number(match[1]));
          if (newMedia.length > 0 && percents.length === 0) break;
        }
      }
    }

    if (!newMedia.length) {
      const screenshotPath = join(jobDir, `scene_${sceneOrder}_flow_screen.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      const flowFailure = classifyFlowGenerationFailureText(last?.text || "");
      if (flowFailure) {
        await writeFlowFailureDiagnostics({
          page,
          jobDir,
          sceneOrder,
          outputMode,
          failure: flowFailure,
          state: last,
          source: "no-new-media-final",
        });
        onProgress?.({
          message: buildFlowFailureMessage(flowFailure, screenshotPath),
          details: {
            eventType: flowFailure.reason,
            failureCode: flowFailure.code,
            actionRequired: flowFailure.actionRequired,
            retryable: flowFailure.retryable,
            sceneOrder,
            outputMode,
            screenshotPath,
          },
        });
        throw new Error(buildFlowFailureMessage(flowFailure, screenshotPath));
      }
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_status.json`), JSON.stringify({
        ok: false,
        reason: outputMode === "image" ? "no-new-image-url" : "no-new-video-url",
        outputMode,
        lastText: last?.text || "",
        screenshotPath,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      throw new Error(`Flow did not expose a new ${outputMode} URL. Screenshot: ${screenshotPath}`);
    }

    onProgress?.({ message: `장면 ${sceneOrder} Google Flow ${outputMode === "image" ? "이미지" : "영상"}를 다운로드하는 중입니다.`, details: { outputMode, detectedMediaCount: newMedia.length } });
    const saved = await saveMedia({
      page,
      context,
      mediaUrl: newMedia[0],
      outputPathBase: join(jobDir, `scene_${sceneOrder}_flow`),
    });
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow ${outputMode === "image" ? "이미지" : "영상"} 다운로드가 완료되었습니다.`, details: { ...saved, outputMode } });
    if (outputMode === "image" && (/svg/i.test(saved.contentType || "") || /\.svg$/i.test(saved.path || "") || saved.bytes < 10_000)) {
      throw new Error(`Flow image mode captured a non-generated UI asset instead of a full image: ${saved.path} (${saved.bytes} bytes, ${saved.contentType || "unknown content type"})`);
    }
    return saved;
  } catch (error) {
    if (/user data directory is already in use|ProcessSingleton|profile.*in use/i.test(error?.message || "")) {
      throw new Error(`Google Flow browser profile is already open. Close the Google Flow authentication Chrome window, then run Generate Final Video again. Details: ${error.message}`);
    }
    throw error;
  } finally {
    await context.close().catch(() => {});
  }
}
