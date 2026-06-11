import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { isFlowPolicyWarningText } from "../electron/services/flow-prompt-safety.mjs";
import { attachFlowIngredients } from "./google-flow-ingredients.mjs";
import {
  flowChipClassifierBrowserSource,
} from "./google-flow-chip-classifier.mjs";
import { configureFlowOutputMode, verifyFlowOutputMode, verifyGeneratorMenuClosed } from "./google-flow-output-mode.mjs";
import { maximizeChromiumWindow } from "./chromium-window-bounds.mjs";
import {
  createWebUiProviderContext,
  startWebUiTrace,
  stopWebUiTrace,
  writeWebUiEvidence,
} from "./web-ui-provider-harness.mjs";

export const GOOGLE_FLOW_URL = "https://labs.google/fx/ko/tools/flow";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVE_NO_PROGRESS_STALL_MS = Math.max(30_000, Number(process.env.HERMES_FLOW_ACTIVE_NO_PROGRESS_STALL_MS || 120_000));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dismissFlowCookieConsent(page) {
  const clicked = await page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled
        && el.getAttribute("aria-disabled") !== "true"
        && style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 20
        && rect.height > 20;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const candidates = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .map((el) => ({ el, text: textOf(el), rect: el.getBoundingClientRect() }))
      .filter((item) => /(동의함|나중에|모두\s*동의|accept(?:\s+all)?|agree|i\s*agree|reject\s+all|decline)/i.test(item.text))
      .sort((a, b) => {
        const aConsent = /(동의함|accept|agree)/i.test(a.text) ? 0 : 1;
        const bConsent = /(동의함|accept|agree)/i.test(b.text) ? 0 : 1;
        const aBottom = a.rect.y > window.innerHeight * 0.7 ? 0 : 1;
        const bBottom = b.rect.y > window.innerHeight * 0.7 ? 0 : 1;
        return aConsent - bConsent || aBottom - bBottom || b.rect.x - a.rect.x;
      });
    const target = candidates[0];
    if (!target) return null;
    target.el.click();
    return { text: target.text, x: Math.round(target.rect.x), y: Math.round(target.rect.y) };
  }).catch(() => null);
  if (clicked) await delay(700);
  return { clicked: Boolean(clicked), ...clicked };
}

export function classifyFlowGenerationFailureText(text = "") {
  const value = String(text || "");
  if (!value.trim()) return null;

  if (/I've\s+cancelled\s+that\s+generation|I\s+have\s+cancelled\s+that\s+generation|generation\s+(?:was\s+)?cancel(?:led|ed)|try\s+again\?|before\s+we\s+try\s+again/i.test(value)) {
    return {
      code: "FLOW_GENERATION_CANCELLED",
      reason: "flow-generation-cancelled",
      retryable: true,
      actionRequired: false,
      userMessage: "Google Flow cancelled generation before exposing media.",
    };
  }

  if (/\uc0dd\uc131\uc774\s*\uc911\ub2e8\ub418\uc5c8\uc2b5\ub2c8\ub2e4|\uc0dd\uc131\uc774\s*\ucde8\uc18c\ub418\uc5c8\uc2b5\ub2c8\ub2e4|generation\s+stalled|generation\s+stopped\s+without\s+media/i.test(value)) {
    return {
      code: "FLOW_GENERATION_STALLED",
      reason: "flow-generation-stalled",
      retryable: true,
      actionRequired: false,
      userMessage: "Google Flow returned to an idle or stalled state before exposing media.",
    };
  }

  if (/비정상적인\s*활동|unusual\s+activity|suspicious\s+activity|abnormal\s+activity|automated\s+traffic|temporarily\s+unavailable|고객센터|鍮꾩젙|媛먯|怨좉컼|쇳꽣/i.test(value)) {
    return {
      code: "FLOW_ABNORMAL_ACTIVITY",
      reason: "flow-abnormal-activity",
      retryable: false,
      actionRequired: true,
      userMessage: "Google Flow reported abnormal activity for this account/session. Change or re-authenticate the Flow account, wait for the account cooldown, then retry the failed scene.",
    };
  }

  if (/(^|\n|\s)(실패|failed)(\n|\s|$)/i.test(value) && /(다시\s*시도|retry|프롬프트\s*재사용|reuse\s+prompt|delete_forever|삭제)/i.test(value) && !/너무\s*빨리|too\s*fast|too\s+many\s+requests|rate\s*limit|requesting\s+generations\s+too\s+fast/i.test(value)) {
    return {
      code: "FLOW_GENERATION_FAILED",
      reason: "flow-generation-failed",
      retryable: true,
      actionRequired: false,
      userMessage: "Google Flow returned a generation failure card before exposing media.",
    };
  }

  if (/너무\s*빨리|잠시\s*후|too\s*fast|too\s+many\s+requests|rate\s*limit|requesting\s+generations\s+too\s+fast|try\s+again\s+later/i.test(value)) {
    return {
      code: "FLOW_RATE_LIMITED",
      reason: "flow-rate-limited",
      retryable: false,
      actionRequired: true,
      userMessage: "Google Flow is rate limiting generation requests. Wait for cooldown, then retry the failed scene.",
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

async function writeFlowFailureDiagnostics({
  page,
  jobDir,
  sceneOrder,
  outputMode,
  accountSlotId = "default",
  failure,
  state,
  source,
  screenshotName = "flow_screen",
}) {
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
    accountSlotId,
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

function isFlowSubmissionActive(state = {}) {
  return Boolean(
    state.hasProgressPercent
    || state.hasVideo
    || state.hasThinkingStatus
    || state.hasStopButton
    || state.failureClassification
  );
}

function classifySubmitIdleState(state = {}, outputMode = "video") {
  const text = String(state.textTail || "");
  if (/close|痍⑥냼|취소|cancel/i.test(text)
    && /arrow_forward|만들기|留뚮뱾湲|create|generate/i.test(text)
    && state.promptStillVisible === false
    && state.hasProgressPercent === false
    && state.hasVideo === false) {
    return {
      code: "FLOW_PROMPT_CARD_CREATED_BUT_NOT_SUBMITTED",
      reason: "prompt-card-created-but-not-submitted",
      userMessage: "Google Flow accepted the prompt card but did not start generation.",
    };
  }
  return {
    code: outputMode === "image" ? "FLOW_IMAGE_SUBMIT_DID_NOT_START" : "FLOW_SUBMIT_DID_NOT_START",
    reason: "flow-submit-did-not-start",
    userMessage: "Google Flow did not start generation after clicking create.",
  };
}

async function ensureLargeViewport(page, { width = 1920, height = 1080 } = {}) {
  await page.setViewportSize({ width, height });
  const windowBounds = await maximizeChromiumWindow(page, { width, height, label: "Google Flow Chrome" });
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

async function killChromeHoldingProfile(profileDir) {
  const { execSync } = await import("node:child_process");
  const normalizedDir = profileDir.replace(/\\/g, "\\\\");
  try {
    // Query all chrome.exe PIDs whose CommandLine contains the profile path
    const raw = execSync(
      `wmic process where "name='chrome.exe' and CommandLine like '%${normalizedDir.replace(/'/g, "''")}%'" get ProcessId /format:value`,
      { encoding: "utf8", timeout: 8000 }
    );
    const pids = [...raw.matchAll(/ProcessId=(\d+)/gi)].map((m) => Number(m[1])).filter(Boolean);
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { timeout: 4000 });
      } catch {
        // process may have already exited
      }
    }
    if (pids.length > 0) {
      // Give the OS time to fully release the profile lock files
      await delay(2000);
    }
  } catch {
    // wmic not available or query failed — proceed without aggressive kill
  }
}


async function visiblePage(context) {
  const existing = context.pages().find((item) => !item.isClosed());
  return existing || context.newPage();
}

export async function ensureFlowProject(page) {
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
        "add_2",
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

export async function waitForFlowGeneratorReady(page, jobDir, sceneOrder) {
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
      const createButton = bottomButtons.find((item) => item.x > window.innerWidth * 0.45 && /arrow_forward|create|generate|\ub9cc\ub4e4\uae30|\uc0dd\uc131/i.test(item.label));
      // The submit (orange circle) button only appears after text is typed.
      // Declare ready when the settings chip AND the prompt textbox are both present,
      // even if the create button is not yet visible.
      const promptTextbox = Array.from(document.querySelectorAll(
        "[role='textbox'][contenteditable='true'],[contenteditable='true'],textarea"
      )).some((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 100 && r.height > 10 && r.y > window.innerHeight * 0.6;
      });
      return {
        ready: Boolean(generatorChip && (createButton || promptTextbox)),
        generatorChip,
        createButton,
        promptTextboxFound: promptTextbox,
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

// Phase 1: find the prompt textbox only (does NOT require create button).
async function findPromptTextbox(page) {
  let lastSnapshot = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await page.evaluate(() => {
      const textbox = Array.from(document.querySelectorAll(
        "[role='textbox'][contenteditable='true'],[contenteditable='true'],textarea"
      ))
        .map((el) => ({ r: el.getBoundingClientRect(), text: (el.innerText || el.textContent || "").trim() }))
        .filter((item) => item.r.width > 100 && item.r.height > 10)
        .sort((a, b) => b.r.y - a.r.y)[0];
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
          : null,
        snapshotButtons,
      };
    });
    lastSnapshot = result;
    if (result.textbox) return result;
    await delay(1000);
  }
  throw new Error(`Flow prompt textbox not found. Last snapshot: ${JSON.stringify(lastSnapshot)}`);
}

// Phase 2: after text has been typed, find the create/submit button.
// The orange circle submit button only appears once there is content in the input.
async function findCreateButtonAfterTyping(page) {
  let lastSnapshot = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await page.evaluate(() => {
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return !el.disabled && el.getAttribute("aria-disabled") !== "true"
          && style.display !== "none" && style.visibility !== "hidden"
          && rect.width > 10 && rect.height > 10;
      };
      const textOf = (el) => [
        el.innerText,
        el.textContent,
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

      const allButtons = Array.from(document.querySelectorAll("button,[role='button']"))
        .filter(visible)
        .map((el) => ({ el, r: el.getBoundingClientRect(), text: textOf(el) }));

      // Primary: labeled create button in bottom-right quadrant
      const labeledCreate = allButtons
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
          return bArrow - aArrow || (b.r.x - a.r.x) || (b.r.y - a.r.y);
        })[0];

      // Fallback: rightmost circular button in the bottom bar (the orange circle)
      const positionalCreate = !labeledCreate && allButtons
        .filter((item) =>
          item.r.y > window.innerHeight * 0.75
          && item.r.x > window.innerWidth * 0.65
          && item.r.width > 20 && item.r.height > 20
          && Math.abs(item.r.width - item.r.height) < item.r.width * 0.8
        )
        .sort((a, b) => (b.r.x + b.r.y) - (a.r.x + a.r.y))[0];

      const create = labeledCreate || positionalCreate || null;

      const bodyText = document.body?.innerText || "";
      const generatorMenuOpen = /crop_landscape|crop_square|crop_portrait|crop_9_16|Nano Banana Pro\s*arrow_drop_down|credits|credit/i.test(bodyText);
      const promptTextboxFocused = Boolean(document.activeElement && (
        document.activeElement.matches?.("[contenteditable='true'],textarea,[role='textbox']")
        || document.activeElement.closest?.("[contenteditable='true'],textarea,[role='textbox']")
      ));
      const promptLength = Array.from(document.querySelectorAll("[contenteditable='true'],textarea,[role='textbox']"))
        .map((el) => (el.innerText || el.value || el.textContent || "").trim().length)
        .sort((a, b) => b - a)[0] || 0;
      const blockingOverlayCandidates = generatorMenuOpen
        ? allButtons
          .filter((item) => /crop_|Nano Banana|Imagen|x2|x3|x4|image|video/i.test(item.text))
          .map(({ text, r }) => ({ text: text.slice(0, 120), x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }))
        : [];

      const snapshotButtons = allButtons
        .filter((item) => item.r.y > window.innerHeight * 0.55)
        .map(({ text, r }) => ({ text: text.slice(0, 120), x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }))
        .slice(-12);

      return {
        create: create
          ? { x: Math.round(create.r.x + create.r.width / 2), y: Math.round(create.r.y + create.r.height / 2), text: create.text, source: labeledCreate ? "labeled" : "positional" }
          : null,
        snapshotButtons,
        generatorMenuOpen,
        promptTextboxFocused,
        promptLength,
        blockingOverlayCandidates,
      };
    });
    lastSnapshot = result;
    if (result.create) return result;
    await delay(500);
  }
  const failureCode = lastSnapshot?.generatorMenuOpen ? "FLOW_CREATE_BUTTON_BLOCKED_BY_SETTINGS_MENU" : "FLOW_CREATE_BUTTON_NOT_FOUND";
  const error = new Error(`${failureCode}: Flow create button not found after typing. Last snapshot: ${JSON.stringify(lastSnapshot)}`);
  error.failureCode = failureCode;
  error.actionRequired = Boolean(lastSnapshot?.generatorMenuOpen);
  error.details = { failureCode, state: lastSnapshot };
  throw error;
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

async function submitPromptToFlowAgain(page, prompt, { jobDir, sceneOrder } = {}) {
  // Phase 1: find the textbox and type the prompt
  const textboxResult = await focusPromptTextboxForFlow(page, prompt, { jobDir, sceneOrder });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(prompt);
  await verifyPromptInserted(page, prompt);
  // Wait for the submit button to appear (it only shows after text is entered)
  await delay(600);
  // Phase 2: now find the create button (visible only after typing)
  let createResult = null;
  let createLookupError = null;
  let keyboardSubmit = null;
  const positions = { textbox: textboxResult.textbox, create: null };
  try {
    createResult = await findCreateButtonAfterTyping(page);
    positions.create = createResult.create;
    await page.mouse.click(positions.create.x, positions.create.y);
    await delay(300);
  } catch (error) {
    createLookupError = error?.message || String(error);
    keyboardSubmit = await submitFlowPromptByKeyboard(page);
  }
  const state = await probeFlowSubmitState(page);
  const alreadySubmitted = isFlowSubmissionActive(state);
  let domClick = { ok: false, reason: "skipped - coordinate click triggered submission" };
  if (!alreadySubmitted) {
    domClick = await clickVisibleCreateButton(page);
  }
  if (createLookupError && !alreadySubmitted && !domClick.ok) {
    domClick = {
      ...domClick,
      reason: `Keyboard fallback attempted but create button still unavailable. ${domClick.reason || ""}`.trim(),
      createLookupError,
      keyboardSubmit,
    };
  }
  return { positions, domClick, keyboardSubmit, createLookupError };
}

async function readPromptFocusState(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const isTextbox = Boolean(active && (
      active.matches?.("[contenteditable='true'],textarea,[role='textbox']")
      || active.closest?.("[contenteditable='true'],textarea,[role='textbox']")
    ));
    const rect = active?.getBoundingClientRect?.();
    return {
      ok: isTextbox,
      tagName: active?.tagName || "",
      role: active?.getAttribute?.("role") || "",
      x: rect ? Math.round(rect.x) : null,
      y: rect ? Math.round(rect.y) : null,
      width: rect ? Math.round(rect.width) : null,
      height: rect ? Math.round(rect.height) : null,
    };
  });
}

async function focusPromptTextboxByDom(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 100
        && rect.height > 10;
    };
    const candidates = Array.from(document.querySelectorAll(
      "[role='textbox'][contenteditable='true'],[contenteditable='true'],textarea"
    ))
      .filter(visible)
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .sort((a, b) => b.rect.y - a.rect.y);
    const target = candidates[0]?.el || null;
    if (!target) return { ok: false, reason: "prompt-textbox-not-found" };
    target.scrollIntoView?.({ block: "center", inline: "center" });
    target.focus?.();
    if (target.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    const active = document.activeElement;
    const ok = Boolean(active && (
      active === target
      || active.matches?.("[contenteditable='true'],textarea,[role='textbox']")
      || active.closest?.("[contenteditable='true'],textarea,[role='textbox']")
    ));
    const rect = target.getBoundingClientRect();
    return {
      ok,
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  });
}

async function focusPromptTextboxForFlow(page, prompt, { jobDir, sceneOrder } = {}) {
  const attempts = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (attempt > 1) {
      await attemptCloseFlowGeneratorMenu(page).catch(() => {});
    }
    const textboxResult = await findPromptTextbox(page);
    await page.mouse.click(textboxResult.textbox.x, textboxResult.textbox.y).catch(() => {});
    await delay(200 + attempt * 100);
    let focusState = await readPromptFocusState(page);
    let domFocusState = null;
    if (!focusState.ok) {
      domFocusState = await focusPromptTextboxByDom(page).catch((error) => ({
        ok: false,
        reason: error?.message || String(error),
      }));
      await delay(200);
      focusState = await readPromptFocusState(page);
    }
    attempts.push({ attempt, textbox: textboxResult.textbox, focusState, domFocusState });
    if (focusState.ok) return { ...textboxResult, focusState, focusAttempts: attempts };

    await page.keyboard.press("Escape").catch(() => {});
    await delay(350);
  }

  const focusState = attempts.at(-1)?.focusState || {};
  let screenshotPath = "";
  if (jobDir && sceneOrder) {
    screenshotPath = join(jobDir, `scene_${sceneOrder}_flow_prompt_focus_failed.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    await writeFile(join(jobDir, `scene_${sceneOrder}_flow_prompt_focus_failed.json`), JSON.stringify({
      ok: false,
      failureCode: "FLOW_PROMPT_TEXTBOX_NOT_FOCUSED",
      promptHash: promptHash(prompt),
      attempts,
      focusState,
      screenshotPath,
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8").catch(() => {});
  }
  if (!focusState.ok) {
    const error = new Error(`FLOW_PROMPT_TEXTBOX_NOT_FOCUSED: Flow prompt textbox did not receive focus. promptHash=${promptHash(prompt)}`);
    error.failureCode = "FLOW_PROMPT_TEXTBOX_NOT_FOCUSED";
    error.actionRequired = true;
    error.details = { failureCode: error.failureCode, focusState, promptHash: promptHash(prompt), attempts, screenshotPath };
    throw error;
  }
  return { textbox: null, focusState, focusAttempts: attempts };
}

async function verifyPromptInserted(page, prompt) {
  const expectedHash = promptHash(prompt);
  await delay(300);
  const state = await page.evaluate(() => {
    const textboxes = Array.from(document.querySelectorAll("[contenteditable='true'], textarea, [role='textbox']"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.innerText || el.value || el.textContent || "").trim(),
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((item) => item.width > 100 && item.height > 10)
      .sort((a, b) => b.text.length - a.text.length);
    const text = textboxes[0]?.text || "";
    return {
      textLength: text.length,
      startsWith: text.slice(0, 40),
      endsWith: text.slice(-40),
    };
  });
  if (state.textLength < Math.min(20, String(prompt || "").trim().length)) {
    const error = new Error(`FLOW_PROMPT_INSERT_VERIFY_FAILED: Flow prompt insertion could not be verified. promptHash=${expectedHash}`);
    error.failureCode = "FLOW_PROMPT_INSERT_VERIFY_FAILED";
    error.actionRequired = true;
    error.details = { failureCode: error.failureCode, promptHash: expectedHash, state };
    throw error;
  }
  return { ok: true, promptHash: expectedHash, state };
}

async function submitFlowPromptByKeyboard(page) {
  const shortcut = process.platform === "darwin" ? "Meta+Enter" : "Control+Enter";
  const attempts = [];
  for (const key of [shortcut, "Enter"]) {
    await page.keyboard.press(key);
    await delay(700);
    const state = await probeFlowSubmitState(page);
    const submitted = isFlowSubmissionActive(state);
    attempts.push({
      key,
      submitted,
      promptStillVisible: state.promptStillVisible,
      createButtonVisible: state.createButtonVisible,
      hasProgressPercent: state.hasProgressPercent,
      hasVideo: state.hasVideo,
      hasThinkingStatus: state.hasThinkingStatus,
      hasStopButton: state.hasStopButton,
      failureCode: state.failureClassification?.code || "",
    });
    if (submitted) {
      return { ok: true, source: "keyboard", key, attempts };
    }
  }
  return { ok: false, source: "keyboard", reason: "Keyboard fallback did not start Flow generation.", attempts };
}

function serializeFlowSubmitAttempt(result = {}) {
  return {
    mouseClick: result.positions?.create
      ? {
        x: result.positions.create.x,
        y: result.positions.create.y,
        text: result.positions.create.text,
        source: result.positions.create.source || "",
      }
      : null,
    keyboardSubmit: result.keyboardSubmit || null,
    domClick: result.domClick || null,
    createLookupError: result.createLookupError || "",
  };
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
    const generatorMenuOpen = /crop_landscape|crop_square|crop_portrait|crop_9_16|Nano Banana Pro\s*arrow_drop_down|credits|credit/i.test(text);
    const hasThinkingStatus = /생각 중|thinking|generating|작업 중|processing/i.test(text);
    const hasStopButton = buttons.some((item) => /stop|중지/i.test(item.text) && !item.disabled);
    const promptTextboxFocused = Boolean(document.activeElement && (
      document.activeElement.matches?.("[contenteditable='true'],textarea,[role='textbox']")
      || document.activeElement.closest?.("[contenteditable='true'],textarea,[role='textbox']")
    ));
    const promptLength = textboxes.map((item) => item.text.length).sort((a, b) => b - a)[0] || 0;
    const blockingOverlayCandidates = generatorMenuOpen
      ? buttons
        .filter((item) => /crop_|Nano Banana|Imagen|x2|x3|x4|image|video/i.test(item.text))
        .map((item) => ({
          text: item.text.slice(0, 120),
          x: Math.round(item.rect.x),
          y: Math.round(item.rect.y),
          width: Math.round(item.rect.width),
          height: Math.round(item.rect.height),
        }))
      : [];
    return {
      promptStillVisible: textboxes.some((item) => item.text.length > 20),
      promptTextboxFocused,
      promptLength,
      createButtonVisible: Boolean(createButton && !createButton.disabled),
      createButtonText: createButton?.text || "",
      blockingOverlayCandidates,
      hasProgressPercent: percents.length > 0,
      maxPercent: percents.length ? Math.max(...percents) : null,
      hasVideo: document.querySelectorAll("video").length > 0,
      hasThinkingStatus,
      hasStopButton,
      generatorMenuOpen,
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

async function probeFlowGenerationConfirmation(page) {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const confirmationOpen = /(크레딧|credit).*(사용|use)|생성을 시작|start generation/i.test(bodyText)
      && /(승인|approve|confirm|거부|reject)/i.test(bodyText);
    if (!confirmationOpen) return { approved: false, reason: "no-generation-confirmation" };
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled
        && el.getAttribute("aria-disabled") !== "true"
        && style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 8
        && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const buttons = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .map((el) => ({ el, text: textOf(el), rect: el.getBoundingClientRect() }))
      .filter((item) => /승인|approve|confirm|check/i.test(item.text))
      .filter((item) => !/다시 묻지 않음|don't ask|dont ask/i.test(item.text))
      .sort((a, b) => (b.rect.x - a.rect.x) || (b.rect.y - a.rect.y));
    const target = buttons[0];
    if (!target) return { approved: false, reason: "approval-button-not-found" };
    target.el.click();
    return {
      approved: true,
      label: target.text,
      x: Math.round(target.rect.x + target.rect.width / 2),
      y: Math.round(target.rect.y + target.rect.height / 2),
    };
  }).catch((error) => ({ approved: false, reason: error?.message || String(error) }));
}

async function probeFlowGenerationConfirmationState(page) {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled
        && el.getAttribute("aria-disabled") !== "true"
        && style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 8
        && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const candidates = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .map((el) => ({ el, text: textOf(el), rect: el.getBoundingClientRect() }))
      .filter((item) => /승인|확인|approve|confirm/i.test(item.text))
      .filter((item) => !/다시 묻지 않음|don't ask|dont ask/i.test(item.text))
      .map((item) => {
        const centerX = item.rect.x + item.rect.width / 2;
        const centerY = item.rect.y + item.rect.height / 2;
        const inRightPanel = viewportWidth ? centerX > viewportWidth * 0.58 : true;
        const lowerPanel = viewportHeight ? centerY > viewportHeight * 0.55 : true;
        const exactApproval = /^(check\s*)?(승인|확인|approve|confirm)$/i.test(item.text);
        return {
          text: item.text,
          x: Math.round(centerX),
          y: Math.round(centerY),
          width: Math.round(item.rect.width),
          height: Math.round(item.rect.height),
          inRightPanel,
          lowerPanel,
          score: (inRightPanel ? 1000 : 0) + (lowerPanel ? 500 : 0) + (exactApproval ? 200 : 0) + Math.round(centerY),
        };
      })
      .sort((a, b) => b.score - a.score);
    const approvalVisible = candidates.some((item) => /승인|approve/i.test(item.text));
    const open = approvalVisible
      && (/크레딧|credit|사용|use|생성을 시작|start generation|going to generate|generate a/i.test(bodyText));
    return {
      open,
      approvalVisible,
      paidCreditVisible,
      target: candidates[0] || null,
      candidates: candidates.slice(0, 5),
    };
  }).catch((error) => ({ open: false, approvalVisible: false, reason: error?.message || String(error) }));
}

async function approveFlowGenerationConfirmation(page) {
  let state = await probeFlowGenerationConfirmationState(page);
  if (state.paidCreditVisible) return { approved: false, reason: "paid-credit-confirmation-not-approved", state };
  if (!state.open) return { approved: false, reason: "no-generation-confirmation", state };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const target = state.target;
    if (!target) return { approved: false, reason: "approval-button-not-found", state };
    await page.mouse.click(target.x, target.y).catch(() => {});
    await delay(900);
    const after = await probeFlowGenerationConfirmationState(page);
    if (after.paidCreditVisible) return { approved: false, reason: "paid-credit-confirmation-not-approved", state: after };
    if (!after.open || !after.approvalVisible) {
      return {
        approved: true,
        label: target.text,
        x: target.x,
        y: target.y,
        attempt,
        after,
      };
    }
    state = after;
  }
  return { approved: false, reason: "approval-button-still-visible", state };
}

async function rejectFlowVideoCreditConfirmation(page) {
  const state = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled
        && el.getAttribute("aria-disabled") !== "true"
        && style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 8
        && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const clickableOf = (el) => el.closest("button,[role='button'],[role='menuitem'],[tabindex]") || el;
    const open = /(\ud06c\ub808\ub527|credit).*(15|15\uac1c).*(\ub3d9\uc601\uc0c1|video)|(\ub3d9\uc601\uc0c1|video).*(\uc0dd\uc131|generation).*(\ud06c\ub808\ub527|credit)/i.test(bodyText);
    if (!open) return { open: false, rejected: false, reason: "no-video-credit-confirmation" };
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const seen = new Set();
    const candidates = Array.from(document.querySelectorAll("button,[role='button'],[role='menuitem'],[tabindex],span,div"))
      .filter(visible)
      .map((el) => {
        const clickable = clickableOf(el);
        const key = clickable;
        if (seen.has(key)) return null;
        seen.add(key);
        return { source: el, el: clickable };
      })
      .filter(Boolean)
      .filter(({ el }) => visible(el))
      .map((el) => {
        const rect = el.el.getBoundingClientRect();
        const text = [textOf(el.el), textOf(el.source)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        return {
          el: el.el,
          text,
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          inRightPanel: viewportWidth ? rect.x + rect.width / 2 > viewportWidth * 0.55 : true,
          lowerPanel: viewportHeight ? rect.y + rect.height / 2 > viewportHeight * 0.55 : true,
        };
      })
      .filter((item) => /(\uac70\ubd80|reject|decline|cancel|dismiss|no\b)/i.test(item.text))
      .sort((a, b) => {
        const exactScore = /^(check\s*)?(\uac70\ubd80|reject|decline|cancel)$/i.test(b.text) - /^(check\s*)?(\uac70\ubd80|reject|decline|cancel)$/i.test(a.text);
        const panelScore = (b.inRightPanel ? 1 : 0) - (a.inRightPanel ? 1 : 0);
        const lowerScore = (b.lowerPanel ? 1 : 0) - (a.lowerPanel ? 1 : 0);
        const approvalPenalty = /(\uc2b9\uc778|approve|confirm)/i.test(a.text) - /(\uc2b9\uc778|approve|confirm)/i.test(b.text);
        return exactScore || approvalPenalty || panelScore || lowerScore || a.x - b.x || b.y - a.y;
      });
    const target = candidates[0];
    if (!target) {
      return {
        open: true,
        rejected: false,
        reason: "reject-button-not-found",
        bodyTail: bodyText.slice(-800),
        candidates: candidates.slice(0, 5).map(({ el, ...item }) => item),
      };
    }
    target.el.click();
    const { el, ...targetInfo } = target;
    return { open: true, rejected: true, target: targetInfo };
  }).catch((error) => ({ open: false, rejected: false, reason: error?.message || String(error) }));
  if (state.rejected) await delay(900);
  return state;
}

async function rejectPaidFlowCreditConfirmation(page) {
  const state = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const paidCreditOpen = /(\ud06c\ub808\ub527|credit).*(\uc0ac\uc6a9|use)|(\uc0dd\uc131|generation).*(\ud06c\ub808\ub527|credit)|15\uac1c|15\s*credits/i.test(bodyText);
    if (!paidCreditOpen) return { open: false, rejected: false, reason: "no-paid-credit-confirmation" };
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled
        && el.getAttribute("aria-disabled") !== "true"
        && style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 8
        && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const clickableOf = (el) => el.closest("button,[role='button'],[role='menuitem'],[tabindex]") || el;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const seen = new Set();
    const candidates = Array.from(document.querySelectorAll("button,[role='button'],[role='menuitem'],[tabindex],span,div"))
      .filter(visible)
      .map((el) => {
        const clickable = clickableOf(el);
        const key = clickable;
        if (seen.has(key)) return null;
        seen.add(key);
        return { source: el, el: clickable };
      })
      .filter(Boolean)
      .filter(({ el }) => visible(el))
      .map((el) => {
        const rect = el.el.getBoundingClientRect();
        const text = [textOf(el.el), textOf(el.source)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        return {
          el: el.el,
          text,
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          inRightPanel: viewportWidth ? rect.x + rect.width / 2 > viewportWidth * 0.55 : true,
          lowerPanel: viewportHeight ? rect.y + rect.height / 2 > viewportHeight * 0.55 : true,
        };
      })
      .filter((item) => /(\uac70\ubd80|reject|decline|cancel|dismiss|no\b)/i.test(item.text))
      .sort((a, b) => {
        const exactScore = /^(check\s*)?(\uac70\ubd80|reject|decline|cancel)$/i.test(b.text) - /^(check\s*)?(\uac70\ubd80|reject|decline|cancel)$/i.test(a.text);
        const panelScore = (b.inRightPanel ? 1 : 0) - (a.inRightPanel ? 1 : 0);
        const lowerScore = (b.lowerPanel ? 1 : 0) - (a.lowerPanel ? 1 : 0);
        const approvalPenalty = /(\uc2b9\uc778|approve|confirm)/i.test(a.text) - /(\uc2b9\uc778|approve|confirm)/i.test(b.text);
        return exactScore || approvalPenalty || panelScore || lowerScore || a.x - b.x || b.y - a.y;
      });
    const target = candidates[0];
    if (!target) {
      return {
        open: true,
        rejected: false,
        reason: "reject-button-not-found",
        bodyTail: bodyText.slice(-800),
        candidates: candidates.slice(0, 5).map(({ el, ...item }) => item),
      };
    }
    target.el.click();
    const { el, ...targetInfo } = target;
    return { open: true, rejected: true, target: targetInfo };
  }).catch((error) => ({ open: false, rejected: false, reason: error?.message || String(error) }));
  if (state.rejected) await delay(900);
  return state;
}

async function verifyFlowSubmissionStarted(page, jobDir, sceneOrder, outputMode = "video", onProgress, accountSlotId = "default") {
  let lastState = null;
  for (let i = 0; i < 20; i += 1) {
    await delay(1000);
    lastState = await probeFlowSubmitState(page);
    const paidCreditRejection = await rejectPaidFlowCreditConfirmation(page);
    if (paidCreditRejection.rejected) {
      const screenshotPath = join(jobDir, `scene_${sceneOrder}_flow_paid_credit_rejected.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_paid_credit_rejected.json`), JSON.stringify({
        ok: true,
        outputMode,
        accountSlotId,
        rejection: paidCreditRejection,
        screenshotPath,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8").catch(() => {});
      onProgress?.({
        message: `Scene ${sceneOrder} Flow paid credit confirmation was rejected; Hermes will not spend credits automatically.`,
        details: {
          eventType: "flow-paid-credit-rejected",
          failureCode: "FLOW_PAID_CREDIT_CONFIRMATION_REJECTED",
          sceneOrder,
          outputMode,
          accountSlotId,
          screenshotPath,
          rejection: paidCreditRejection,
        },
      });
      const error = new Error(`FLOW_PAID_CREDIT_CONFIRMATION_REJECTED: Scene ${sceneOrder} generation requires paid credits and was rejected. Screenshot: ${screenshotPath}`);
      error.failureCode = "FLOW_PAID_CREDIT_CONFIRMATION_REJECTED";
      error.actionRequired = false;
      error.retryable = true;
      error.screenshotPath = screenshotPath;
      error.details = {
        failureCode: "FLOW_PAID_CREDIT_CONFIRMATION_REJECTED",
        actionRequired: false,
        retryable: true,
        sceneOrder,
        outputMode,
        accountSlotId,
        screenshotPath,
        rejection: paidCreditRejection,
      };
      throw error;
    }
    if (outputMode === "video") {
      const rejection = await rejectFlowVideoCreditConfirmation(page);
      if (rejection.rejected) {
        const screenshotPath = join(jobDir, `scene_${sceneOrder}_flow_video_credit_rejected.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        await writeFile(join(jobDir, `scene_${sceneOrder}_flow_video_credit_rejected.json`), JSON.stringify({
          ok: true,
          outputMode,
          accountSlotId,
          rejection,
          screenshotPath,
          updatedAt: new Date().toISOString(),
        }, null, 2), "utf8").catch(() => {});
        onProgress?.({
          message: `Scene ${sceneOrder} Flow video credit confirmation was rejected; falling back without spending video credits.`,
          details: {
            eventType: "flow-video-credit-rejected",
            failureCode: "FLOW_VIDEO_CREDIT_CONFIRMATION_REJECTED",
            sceneOrder,
            outputMode,
            accountSlotId,
            screenshotPath,
            rejection,
          },
        });
        const error = new Error(`FLOW_VIDEO_CREDIT_CONFIRMATION_REJECTED: Scene ${sceneOrder} video generation requires credits and was rejected. Screenshot: ${screenshotPath}`);
        error.failureCode = "FLOW_VIDEO_CREDIT_CONFIRMATION_REJECTED";
        error.actionRequired = false;
        error.retryable = true;
        error.screenshotPath = screenshotPath;
        error.details = {
          failureCode: "FLOW_VIDEO_CREDIT_CONFIRMATION_REJECTED",
          actionRequired: false,
          retryable: true,
          sceneOrder,
          outputMode,
          accountSlotId,
          screenshotPath,
        };
        throw error;
      }
    }
    const approval = await approveFlowGenerationConfirmation(page);
    if (approval.approved) {
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_generation_approval.json`), JSON.stringify({
        ok: true,
        outputMode,
        accountSlotId,
        approval,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8").catch(() => {});
      onProgress?.({
        message: `Scene ${sceneOrder} Flow generation approval was accepted.`,
        details: {
          eventType: "flow-generation-approved",
          sceneOrder,
          outputMode,
          accountSlotId,
          approval,
        },
      });
      await delay(2000);
      continue;
    }
    const hasProgressOrVideo = lastState.hasProgressPercent || lastState.hasVideo;
    if (lastState.failureClassification && !hasProgressOrVideo) {
      const screenshotPath = await writeFlowFailureDiagnostics({
        page,
        jobDir,
        sceneOrder,
        outputMode,
        accountSlotId,
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
      const error = new Error(buildFlowFailureMessage(lastState.failureClassification, screenshotPath));
      error.failureCode = lastState.failureClassification.code;
      error.actionRequired = lastState.failureClassification.actionRequired;
      error.retryable = lastState.failureClassification.retryable;
      error.state = lastState;
      error.screenshotPath = screenshotPath;
      error.details = {
        failureCode: error.failureCode,
        actionRequired: error.actionRequired,
        retryable: error.retryable,
        sceneOrder,
        outputMode,
        screenshotPath,
      };
      throw error;
    }
    if (isFlowSubmissionActive(lastState)) {
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_submit_state.json`), JSON.stringify({
        ok: true,
        state: lastState,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      return lastState;
    }
  }

  const idleFailure = classifySubmitIdleState(lastState, outputMode);
  const screenshotPath = join(jobDir, `scene_${sceneOrder}_flow_submit_failed.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await writeFile(join(jobDir, `scene_${sceneOrder}_flow_submit_state.json`), JSON.stringify({
    ok: false,
    reason: idleFailure.reason,
    failureCode: idleFailure.code,
    state: lastState,
    screenshotPath,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  const error = new Error(`${idleFailure.userMessage} Screenshot: ${screenshotPath}`);
  error.failureCode = idleFailure.code;
  error.retryable = true;
  error.state = lastState;
  error.screenshotPath = screenshotPath;
  throw error;
}

async function retryFlowSubmitAfterIdle({
  page,
  prompt,
  jobDir,
  sceneOrder,
  outputMode = "video",
  onProgress,
  accountSlotId = "default",
}) {
  const attempts = [];
  let lastError = null;
  for (let submitAttempt = 2; submitAttempt <= 3; submitAttempt += 1) {
    onProgress?.({
      message: `Scene ${sceneOrder} Google Flow submit stayed idle; retrying submit attempt ${submitAttempt}.`,
      details: {
        eventType: "flow-submit-idle-self-heal",
        sceneOrder,
        outputMode,
        accountSlotId,
        submitAttempt,
      },
    });
    await page.keyboard.press("Escape").catch(() => {});
    await delay(500);
    await ensureFlowGeneratorMenuClosedBeforeSubmit({ page, jobDir, sceneOrder });
    let retry = null;
    try {
      retry = await submitPromptToFlowAgain(page, prompt, { jobDir, sceneOrder });
      const retryState = await verifyFlowSubmissionStarted(page, jobDir, sceneOrder, outputMode, onProgress, accountSlotId);
      attempts.push({ submitAttempt, ok: true, retry: serializeFlowSubmitAttempt(retry), state: retryState });
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_submit_retry_state.json`), JSON.stringify({
        ok: true,
        submitAttempt,
        attempts,
        retry: serializeFlowSubmitAttempt(retry),
        state: retryState,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8").catch(() => {});
      return { ok: true, state: retryState, attempts };
    } catch (error) {
      lastError = error;
      attempts.push({
        submitAttempt,
        ok: false,
        retry: retry ? serializeFlowSubmitAttempt(retry) : null,
        failureCode: error?.failureCode || "",
        error: error?.message || String(error),
      });
      const retryableIdle = [
        "FLOW_SUBMIT_DID_NOT_START",
        "FLOW_IMAGE_SUBMIT_DID_NOT_START",
        "FLOW_PROMPT_CARD_CREATED_BUT_NOT_SUBMITTED",
      ].includes(error?.failureCode);
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_submit_retry_state.json`), JSON.stringify({
        ok: false,
        submitAttempt,
        attempts,
        retry: retry ? serializeFlowSubmitAttempt(retry) : null,
        failureCode: error?.failureCode || "",
        error: error?.message || String(error),
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8").catch(() => {});
      if (!retryableIdle) break;
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await delay(1500);
      await ensureFlowProject(page);
      await waitForFlowGeneratorReady(page, jobDir, sceneOrder);
    }
  }
  return { ok: false, error: lastError, attempts };
}

async function retryFlowImageSubmitAfterIdle(args) {
  return retryFlowSubmitAfterIdle({ ...args, outputMode: "image" });
}

async function ensureFlowGeneratorMenuClosedBeforeSubmit({ page, jobDir, sceneOrder }) {
  let state = await verifyGeneratorMenuClosed(page);
  if (state.ok) return state;
  state = await attemptCloseFlowGeneratorMenu(page);
  if (state.ok) return state;
  await writeFile(join(jobDir, `scene_${sceneOrder}_flow_menu_still_open.json`), JSON.stringify({
    ok: false,
    failureCode: "FLOW_GENERATOR_MENU_STILL_OPEN",
    state,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8").catch(() => {});
  const error = new Error("FLOW_GENERATOR_MENU_STILL_OPEN: Flow generator settings menu stayed open before prompt submit.");
  error.failureCode = "FLOW_GENERATOR_MENU_STILL_OPEN";
  error.actionRequired = true;
  error.details = { failureCode: error.failureCode, state, sceneOrder };
  throw error;
}

function modeStateWithSpecificMenuFailure(modeState, outputMode, menuState) {
  const selectedModeMatches = modeState.selectedOutputMode === outputMode
    && (outputMode !== "image" || modeState.selectedImageModel !== "unknown");
  if (modeState.ok || !selectedModeMatches) return modeState;
  if (!modeState.generatorMenuOpen && menuState?.ok) return { ...modeState, ok: true };
  return {
    ...modeState,
    ok: false,
    failureCode: "FLOW_GENERATOR_MENU_STILL_OPEN",
    reason: `Flow selected ${outputMode}, but the generator settings menu is still open.`,
    menuState,
  };
}

function modeStateFromSavedSettingsPanel(modeState, outputMode, switchResult = {}) {
  if (modeState.selectedOutputMode !== "unknown" || modeState.generatorMenuOpen) return modeState;
  const selectedImageModel = /Nano Banana Pro/i.test(switchResult.selectedImageModelLabel || "")
    ? "nano-banana-pro"
    : /Nano Banana 2/i.test(switchResult.selectedImageModelLabel || "")
      ? "nano-banana-2"
      : /Imagen/i.test(switchResult.selectedImageModelLabel || "")
        ? "imagen"
        : switchResult.requestedImageModel || modeState.selectedImageModel;
  return {
    ...modeState,
    selectedOutputMode: outputMode,
    selectedImageModel,
    selectedImageModelLabel: switchResult.selectedImageModelLabel || "",
    selectedAspectRatio: /16:9/i.test(switchResult.selectedAspectLabel || "")
      ? "16:9"
      : /9:16/i.test(switchResult.selectedAspectLabel || "")
        ? "9:16"
        : modeState.selectedAspectRatio,
    selectedCountLabel: switchResult.selectedCountLabel || "",
    ok: Boolean(switchResult.ok),
    settingsPanelApplied: true,
    saved: Boolean(switchResult.saved),
    reason: "Google Flow settings panel was applied and saved; verification is based on saved settings evidence.",
  };
}

async function attemptCloseFlowGeneratorMenu(page) {
  let state = null;
  for (const clickPoint of [
    null,
    { x: 400, y: 200 },
    { x: 720, y: 360 },
    { x: 240, y: 360 },
  ]) {
    await page.keyboard.press("Escape").catch(() => {});
    await delay(350);
    if (clickPoint) {
      await page.mouse.click(clickPoint.x, clickPoint.y).catch(() => {});
      await delay(350);
    }
    await page.evaluate(() => {
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
    }).catch(() => {});
    state = await verifyGeneratorMenuClosed(page);
    if (state.ok) return state;
  }
  state = await verifyGeneratorMenuClosed(page);
  return state;
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
  flowPacer,
  flowAccountSlotId = "default",
  jobId = "",
  jobOptions = {},
}) {
  assertRuntime({ chromePath, profileDir, jobDir });
  await mkdir(jobDir, { recursive: true });
  onProgress?.({ message: `장면 ${sceneOrder} Google Flow 프로필을 준비하는 중입니다.` });
  let context;
  let page;
  let tracePath = "";
  let traceStopped = false;

  onProgress?.({ message: `장면 ${sceneOrder} Google Flow 브라우저를 여는 중입니다.` });
  try {
    const webUiContext = await createWebUiProviderContext({
      provider: "google-flow",
      profileDir,
      chromePath,
      jobOptions,
      headless: false,
      viewport: { width: 1920, height: 1080 },
      windowSize: "1920,1080",
    });
    context = webUiContext.context;
    page = await visiblePage(context);
    tracePath = await startWebUiTrace({
      context,
      jobDir,
      sceneOrder,
      provider: "flow",
      enabled: webUiContext.traceEnabled,
    });
    await ensureLargeViewport(page);
    await writeFile(join(jobDir, `scene_${sceneOrder}_browser_window_state.json`), JSON.stringify({
      ok: true,
      viewport: page.viewportSize?.(),
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8").catch(() => {});
    page.setDefaultTimeout(60000);
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 프로젝트를 여는 중입니다.` });
    await ensureFlowProject(page);
    await dismissFlowCookieConsent(page);
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
      await dismissFlowCookieConsent(page);
      await waitForFlowGeneratorReady(page, jobDir, sceneOrder);
      const retrySwitchResult = await configureFlowOutputMode(page, outputMode, aspectRatio, jobOptions);
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
    const modeSwitchResult = await configureFlowOutputMode(page, outputMode, aspectRatio, jobOptions);
    await writeFile(join(jobDir, `scene_${sceneOrder}_flow_mode_switch.json`), JSON.stringify(modeSwitchResult, null, 2), "utf8");
    await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_mode_after_click.png`), fullPage: true }).catch(() => {});
    const modeVerification = await verifyFlowOutputMode(page, outputMode, aspectRatio);
    await writeFile(join(jobDir, `scene_${sceneOrder}_flow_mode_verification.json`), JSON.stringify(modeVerification, null, 2), "utf8");
    let finalModeSwitchResult = modeSwitchResult;
    let finalModeVerification = modeSwitchResult?.settingsPanelApplied && modeSwitchResult?.saved && modeVerification.selectedOutputMode === "unknown" && !modeVerification.generatorMenuOpen
      ? modeStateFromSavedSettingsPanel(modeVerification, outputMode, modeSwitchResult)
      : modeVerification;
    if (!finalModeSwitchResult.ok || !finalModeVerification.ok) {
      const retryResult = await retryFlowOutputModeAfterReload({
        reason: `initial mismatch: requested=${outputMode}, selected=${modeVerification.selectedOutputMode}`,
      });
      finalModeSwitchResult = retryResult.retrySwitchResult;
      finalModeVerification = retryResult.retryVerification;
    }
    if (
      finalModeSwitchResult?.settingsPanelApplied
      && finalModeSwitchResult?.saved
      && finalModeVerification.selectedOutputMode === "unknown"
      && !finalModeVerification.generatorMenuOpen
    ) {
      finalModeVerification = modeStateFromSavedSettingsPanel(finalModeVerification, outputMode, finalModeSwitchResult);
    }
    if (
      finalModeSwitchResult?.settingsPanelApplied
      && finalModeSwitchResult?.saved
      && finalModeVerification.generatorMenuOpen
    ) {
      const menuState = await attemptCloseFlowGeneratorMenu(page);
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_mode_saved_panel_close_verification.json`), JSON.stringify({
        requestedOutputMode: outputMode,
        before: finalModeVerification,
        menuState,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      const closedModeVerification = await verifyFlowOutputMode(page, outputMode, aspectRatio);
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_mode_after_saved_panel_close_verification.json`), JSON.stringify(closedModeVerification, null, 2), "utf8");
      finalModeVerification = modeStateFromSavedSettingsPanel(closedModeVerification, outputMode, finalModeSwitchResult);
    }
    const modeSelectionMatches = finalModeVerification.selectedOutputMode === outputMode
      && (outputMode !== "image" || finalModeVerification.selectedImageModel !== "unknown");
    if (!finalModeVerification.ok && modeSelectionMatches && finalModeVerification.generatorMenuOpen) {
      const menuState = await attemptCloseFlowGeneratorMenu(page);
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_mode_menu_close_verification.json`), JSON.stringify({
        requestedOutputMode: outputMode,
        before: finalModeVerification,
        menuState,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      const closedModeVerification = await verifyFlowOutputMode(page, outputMode, aspectRatio);
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_mode_after_menu_close_verification.json`), JSON.stringify(closedModeVerification, null, 2), "utf8");
      finalModeVerification = modeStateWithSpecificMenuFailure(closedModeVerification, outputMode, menuState);
    }
    if (!finalModeSwitchResult.ok) {
      finalModeVerification = {
        ...finalModeVerification,
        ok: false,
        failureCode: "FLOW_OUTPUT_SETTINGS_NOT_CONFIRMED",
        reason: "Google Flow settings were not fully confirmed before submit.",
        modeSwitchResult: finalModeSwitchResult,
      };
    }
    if (outputMode === "image" && finalModeVerification.ok) {
      const requestedImageModel = jobOptions?.flowImageModel || "nano-banana-pro";
      const imageModelMatches = finalModeVerification.selectedImageModel === requestedImageModel;
      const aspectMatches = finalModeVerification.selectedAspectRatio === aspectRatio;
      const countMatches = /1x|1\s*(?:\uc7a5|image)|single/i.test(finalModeVerification.selectedCountLabel || "");
      if (!imageModelMatches || !aspectMatches || !countMatches) {
        finalModeVerification = {
          ...finalModeVerification,
          ok: false,
          failureCode: "FLOW_IMAGE_SETTINGS_MISMATCH",
          reason: "Google Flow image settings did not match the requested model, aspect ratio, and 1x count.",
          imageSettingsCheck: {
            requestedImageModel,
            selectedImageModel: finalModeVerification.selectedImageModel,
            requestedAspectRatio: aspectRatio,
            selectedAspectRatio: finalModeVerification.selectedAspectRatio,
            selectedCountLabel: finalModeVerification.selectedCountLabel || "",
            imageModelMatches,
            aspectMatches,
            countMatches,
          },
        };
      }
    }
    if (!finalModeVerification.ok) {
      const mismatchPath = join(jobDir, `scene_${sceneOrder}_flow_mode_mismatch.png`);
      await page.screenshot({ path: mismatchPath, fullPage: true }).catch(() => {});
      const failureCode = finalModeVerification.failureCode
        || (finalModeVerification.generatorMenuOpen ? "FLOW_GENERATOR_MENU_STILL_OPEN" : "FLOW_OUTPUT_MODE_MISMATCH");
      const failureMessage = failureCode === "FLOW_GENERATOR_MENU_STILL_OPEN"
        ? `Google Flow generator settings menu stayed open after selecting ${outputMode}.`
        : `Google Flow output mode mismatch. Requested ${outputMode}, but Flow UI appears to be ${finalModeVerification.selectedOutputMode}.`;
      onProgress?.({
        message: failureMessage,
        details: {
          eventType: failureCode === "FLOW_GENERATOR_MENU_STILL_OPEN" ? "flow-generator-menu-still-open" : "flow-mode-mismatch",
          failureCode,
          requestedOutputMode: outputMode,
          selectedOutputMode: finalModeVerification.selectedOutputMode,
          selectedChipLabel: finalModeSwitchResult?.selectedChip?.label || finalModeVerification?.selectedChip?.label || "",
          rejectedChipReasons: finalModeSwitchResult?.rejectedChipReasons || [],
          bottomButtons: finalModeVerification.bottomGeneratorChip || [],
          sceneOrder,
          screenshotPath: mismatchPath,
        },
      });
      const error = new Error(`${failureMessage} Check ${mismatchPath}.`);
      error.failureCode = failureCode;
      error.actionRequired = failureCode === "FLOW_GENERATOR_MENU_STILL_OPEN";
      error.details = {
        failureCode,
        requestedOutputMode: outputMode,
        selectedOutputMode: finalModeVerification.selectedOutputMode,
        generatorMenuOpen: Boolean(finalModeVerification.generatorMenuOpen),
        screenshotPath: mismatchPath,
        sceneOrder,
      };
      throw error;
    }
    await writeFile(join(jobDir, `scene_${sceneOrder}_flow_effective_settings.json`), JSON.stringify({
      requestedOutputMode: outputMode,
      requestedAspectRatio: aspectRatio,
      requestedImageModel: jobOptions?.flowImageModel || "",
      modeSwitchResult: finalModeSwitchResult,
      modeVerification: finalModeVerification,
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8").catch(() => {});
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
      const retry = await submitPromptToFlowAgain(page, activePrompt, { jobDir, sceneOrder });
      await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_policy_retry_submitted.png`), fullPage: true }).catch(() => {});
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_policy_retry_state.json`), JSON.stringify({
        ok: true,
        ...serializeFlowSubmitAttempt(retry),
        deadline: new Date(deadline).toISOString(),
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      await verifyFlowSubmissionStarted(page, jobDir, sceneOrder, outputMode, onProgress, flowAccountSlotId);
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

    let abnormalActivityRetryUsed = false;
    const tryAbnormalActivityFallback = async (failureState, source = "unknown") => {
      const text = failureState?.text || failureState?.textTail || "";
      const failure = classifyFlowGenerationFailureText(text);
      if (!failure || failure.code !== "FLOW_ABNORMAL_ACTIVITY") return false;
      if (abnormalActivityRetryUsed) return false;
      abnormalActivityRetryUsed = true;

      await writeFile(join(jobDir, `scene_${sceneOrder}_abnormal-activity-warning.json`), JSON.stringify({
        sceneOrder,
        source,
        text: String(text).slice(0, 2000),
        at: new Date().toISOString(),
      }, null, 2), "utf8");

      onProgress?.({
        message: `장면 ${sceneOrder} Google Flow 비정상 활동 경고 감지: 페이지를 새로고침하고 6초 후 재시도합니다.`,
        details: {
          eventType: "flow-abnormal-activity-retry",
          sceneOrder,
          retryCount: 1,
          recovered: false,
        },
      });

      // Reload and wait
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await delay(6000);

      // Re-initialize generator
      await ensureFlowProject(page);
      await waitForFlowGeneratorReady(page, jobDir, sceneOrder);

      // Re-configure output mode
      await configureFlowOutputMode(page, outputMode, aspectRatio, jobOptions);
      await verifyFlowOutputMode(page, outputMode, aspectRatio);

      // Submit prompt again
      deadline = extendFlowDeadlineForPolicyRetry({ timeoutMs });
      const retry = await submitPromptToFlowAgain(page, activePrompt, { jobDir, sceneOrder });
      await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_abnormal_retry_submitted.png`), fullPage: true }).catch(() => {});
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_abnormal_retry_state.json`), JSON.stringify({
        ok: true,
        ...serializeFlowSubmitAttempt(retry),
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");

      // Verify submission started
      await verifyFlowSubmissionStarted(page, jobDir, sceneOrder, outputMode, onProgress, flowAccountSlotId);

      onProgress?.({
        message: `장면 ${sceneOrder} Google Flow 비정상 활동 상태를 새로고침 후 복구했습니다.`,
        details: {
          eventType: "flow-abnormal-activity-retry",
          sceneOrder,
          retryCount: 1,
          recovered: true,
        },
      });
      return true;
    };

    // FLOW_GENERATION_FAILED 는 retryable=true: 실패 카드 감지 시 reload 후 1회 자동 재제출
    let generationFailedRetryUsed = false;
    const tryGenerationFailedFallback = async (failureState, source = "unknown") => {
      const text = failureState?.text || failureState?.textTail || "";
      const failure = classifyFlowGenerationFailureText(text);
      if (!failure || failure.code !== "FLOW_GENERATION_FAILED") return false;
      if (!failure.retryable) return false;
      if (generationFailedRetryUsed) return false;
      generationFailedRetryUsed = true;

      await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_generation_failed_before_retry.png`), fullPage: true }).catch(() => {});
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_generation_failed_retry.json`), JSON.stringify({
        sceneOrder,
        source,
        text: String(text).slice(0, 2000),
        at: new Date().toISOString(),
      }, null, 2), "utf8");

      onProgress?.({
        message: `장면 ${sceneOrder} Google Flow 생성 실패 카드 감지: 3초 후 페이지 새로고침 후 자동 재시도합니다.`,
        details: {
          eventType: "flow-generation-failed-retry",
          sceneOrder,
          retryCount: 1,
          recovered: false,
        },
      });

      await delay(3000);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await delay(3000);

      await ensureFlowProject(page);
      await waitForFlowGeneratorReady(page, jobDir, sceneOrder);
      await configureFlowOutputMode(page, outputMode, aspectRatio, jobOptions);
      await verifyFlowOutputMode(page, outputMode, aspectRatio);

      deadline = extendFlowDeadlineForPolicyRetry({ timeoutMs });
      await ensureFlowGeneratorMenuClosedBeforeSubmit({ page, jobDir, sceneOrder });
      const retry = await submitPromptToFlowAgain(page, activePrompt, { jobDir, sceneOrder });
      await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_generation_failed_retry_submitted.png`), fullPage: true }).catch(() => {});
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_generation_failed_retry_state.json`), JSON.stringify({
        ok: true,
        ...serializeFlowSubmitAttempt(retry),
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");

      await verifyFlowSubmissionStarted(page, jobDir, sceneOrder, outputMode, onProgress, flowAccountSlotId);

      onProgress?.({
        message: `장면 ${sceneOrder} Google Flow 생성 실패 상태를 재시도로 복구했습니다.`,
        details: {
          eventType: "flow-generation-failed-retry",
          sceneOrder,
          retryCount: 1,
          recovered: true,
        },
      });
      return true;
    };

    await ensureFlowGeneratorMenuClosedBeforeSubmit({ page, jobDir, sceneOrder });
    await flowPacer?.beforeSubmit?.({ jobId, sceneOrder, outputMode, jobDir, accountSlotId: flowAccountSlotId });
    onProgress?.({ message: `장면 ${sceneOrder} 프롬프트를 입력하는 중입니다.` });
    const submitted = await submitPromptToFlowAgain(page, activePrompt, { jobDir, sceneOrder });
    await flowPacer?.recordSubmit?.({ jobId, sceneOrder, outputMode, jobDir, accountSlotId: flowAccountSlotId });
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 생성 버튼을 클릭하는 중입니다.` });
    await delay(500);
    await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_submitted.png`), fullPage: true }).catch(() => {});
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 생성 시작 여부를 확인하는 중입니다.` });
    await writeFile(join(jobDir, `scene_${sceneOrder}_flow_click_state.json`), JSON.stringify({
      ...serializeFlowSubmitAttempt(submitted),
      accountSlotId: flowAccountSlotId,
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8");
    try {
      await verifyFlowSubmissionStarted(page, jobDir, sceneOrder, outputMode, onProgress, flowAccountSlotId);
    } catch (error) {
      if (error?.failureCode === "FLOW_RATE_LIMITED") {
        await flowPacer?.recordFlowRateLimit?.({ jobId, sceneOrder, outputMode, jobDir, accountSlotId: flowAccountSlotId });
        throw error;
      }
      if ([
        "FLOW_SUBMIT_DID_NOT_START",
        "FLOW_IMAGE_SUBMIT_DID_NOT_START",
        "FLOW_PROMPT_CARD_CREATED_BUT_NOT_SUBMITTED",
      ].includes(error?.failureCode)) {
        const retryState = outputMode === "image"
          ? await retryFlowImageSubmitAfterIdle({ page, prompt: activePrompt, jobDir, sceneOrder, onProgress })
          : await retryFlowSubmitAfterIdle({
            page,
            prompt: activePrompt,
            jobDir,
            sceneOrder,
            outputMode,
            onProgress,
            accountSlotId: flowAccountSlotId,
          });
        if (retryState.ok) {
          await writeFile(join(jobDir, `scene_${sceneOrder}_flow_submit_state.json`), JSON.stringify({
            ok: true,
            state: retryState.state,
            submitAttempt: retryState.attempts?.at(-1)?.submitAttempt || 2,
            attempts: retryState.attempts || [],
            updatedAt: new Date().toISOString(),
          }, null, 2), "utf8").catch(() => {});
        } else {
          throw retryState.error || error;
        }
      } else {
      const warningState = await collectMediaUrls(page);
      let recovered = await tryPolicyFallback(warningState, "submit-start");
      if (!recovered) {
        recovered = await tryAbnormalActivityFallback(warningState, "submit-start");
      }
      if (!recovered) {
        recovered = await tryGenerationFailedFallback(warningState, "submit-start");
      }
      if (!recovered) throw error;
      }
    }

    let last = null;
    let newMedia = [];
    let nextProgressAt = Date.now();
    let activeNoProgressSince = null;
    let noObservableProgressSince = Date.now();
    while (Date.now() < deadline) {
      await delay(5000);
      last = await collectMediaUrls(page);
      let recovered = await tryPolicyFallback(last, "wait-loop");
      if (!recovered) {
        recovered = await tryAbnormalActivityFallback(last, "wait-loop");
      }
      if (recovered) {
        nextProgressAt = Date.now();
        continue;
      }
      const percents = Array.from(String(last?.text || "").matchAll(/(\d+)%/g)).map((match) => Number(match[1]));
      const hasActiveProgress = percents.length > 0;
      const flowFailure = hasActiveProgress ? null : classifyFlowGenerationFailureText(last?.text || "");
      if (flowFailure) {
        // retryable 실패(FLOW_GENERATION_FAILED)는 자동 재시도 먼저 시도
        if (flowFailure.retryable) {
          const recovered = await tryGenerationFailedFallback(last, "wait-loop");
          if (recovered) {
            nextProgressAt = Date.now();
            continue;
          }
        }
        const screenshotPath = await writeFlowFailureDiagnostics({
          page,
          jobDir,
          sceneOrder,
          outputMode,
          accountSlotId: flowAccountSlotId,
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
        const error = new Error(buildFlowFailureMessage(flowFailure, screenshotPath));
        error.failureCode = flowFailure.code;
        error.actionRequired = flowFailure.actionRequired;
        error.retryable = flowFailure.retryable;
        error.screenshotPath = screenshotPath;
        error.details = {
          failureCode: flowFailure.code,
          actionRequired: flowFailure.actionRequired,
          retryable: flowFailure.retryable,
          sceneOrder,
          outputMode,
          screenshotPath,
        };
        if (flowFailure.code === "FLOW_RATE_LIMITED") {
          await flowPacer?.recordFlowRateLimit?.({ jobId, sceneOrder, outputMode, jobDir, accountSlotId: flowAccountSlotId });
        }
        throw error;
      }
      const currentUrls = outputMode === "image" ? last.images : last.videos;
      newMedia = currentUrls.filter((url) => !beforeUrls.has(url));
      const textValue = String(last?.text || "");
      const looksActivelyGenerating = /(\uc0dd\uac01\s*\uc911|\uc911\uc9c0|thinking|stop|generating|creating|processing)/i.test(textValue);
      if (!newMedia.length && !hasActiveProgress) {
        noObservableProgressSince ||= Date.now();
        if (Date.now() - noObservableProgressSince >= ACTIVE_NO_PROGRESS_STALL_MS) {
          const screenshotPath = await writeFlowFailureDiagnostics({
            page,
            jobDir,
            sceneOrder,
            outputMode,
            accountSlotId: flowAccountSlotId,
            failure: {
              code: "FLOW_GENERATION_STALLED",
              reason: "flow-generation-stalled",
              retryable: true,
              actionRequired: false,
              userMessage: "Google Flow did not show progress or media after submit.",
            },
            state: last,
            source: "wait-loop-no-observable-progress",
            screenshotName: "flow_stalled",
          });
          const error = new Error(`Google Flow did not show progress or media after submit. Screenshot: ${screenshotPath}`);
          error.failureCode = "FLOW_GENERATION_STALLED";
          error.actionRequired = false;
          error.retryable = true;
          error.screenshotPath = screenshotPath;
          error.details = {
            failureCode: "FLOW_GENERATION_STALLED",
            actionRequired: false,
            retryable: true,
            sceneOrder,
            outputMode,
            screenshotPath,
            stalledMs: Date.now() - noObservableProgressSince,
          };
          onProgress?.({
            message: error.message,
            details: {
              eventType: "flow-generation-stalled",
              ...error.details,
            },
          });
          throw error;
        }
      } else {
        noObservableProgressSince = null;
      }
      if (!newMedia.length && !hasActiveProgress && looksActivelyGenerating) {
        activeNoProgressSince ||= Date.now();
        if (Date.now() - activeNoProgressSince >= ACTIVE_NO_PROGRESS_STALL_MS) {
          const screenshotPath = await writeFlowFailureDiagnostics({
            page,
            jobDir,
            sceneOrder,
            outputMode,
            accountSlotId: flowAccountSlotId,
            failure: {
              code: "FLOW_GENERATION_STALLED",
              reason: "flow-generation-stalled",
              retryable: true,
              actionRequired: false,
              userMessage: "Google Flow stayed active without visible progress or media.",
            },
            state: last,
            source: "wait-loop-active-no-progress",
            screenshotName: "flow_stalled",
          });
          const error = new Error(`Google Flow stayed active without visible progress or media. Screenshot: ${screenshotPath}`);
          error.failureCode = "FLOW_GENERATION_STALLED";
          error.actionRequired = false;
          error.retryable = true;
          error.screenshotPath = screenshotPath;
          error.details = {
            failureCode: "FLOW_GENERATION_STALLED",
            actionRequired: false,
            retryable: true,
            sceneOrder,
            outputMode,
            screenshotPath,
            stalledMs: Date.now() - activeNoProgressSince,
          };
          onProgress?.({
            message: error.message,
            details: {
              eventType: "flow-generation-stalled",
              ...error.details,
            },
          });
          throw error;
        }
      } else {
        activeNoProgressSince = null;
      }
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
          accountSlotId: flowAccountSlotId,
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
        const error = new Error(buildFlowFailureMessage(flowFailure, screenshotPath));
        error.failureCode = flowFailure.code;
        error.actionRequired = flowFailure.actionRequired;
        error.retryable = flowFailure.retryable;
        error.screenshotPath = screenshotPath;
        error.details = {
          failureCode: flowFailure.code,
          actionRequired: flowFailure.actionRequired,
          retryable: flowFailure.retryable,
          sceneOrder,
          outputMode,
          screenshotPath,
        };
        if (flowFailure.code === "FLOW_RATE_LIMITED") {
          await flowPacer?.recordFlowRateLimit?.({ jobId, sceneOrder, outputMode, jobDir, accountSlotId: flowAccountSlotId });
        }
        throw error;
      }
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_status.json`), JSON.stringify({
        ok: false,
        reason: outputMode === "image" ? "no-new-image-url" : "no-new-video-url",
        outputMode,
        accountSlotId: flowAccountSlotId,
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
    const finalTracePath = await stopWebUiTrace({
      context,
      tracePath,
      saveSuccessfulWebUiTrace: Boolean(jobOptions?.saveSuccessfulWebUiTrace),
    });
    traceStopped = true;
    return {
      ...saved,
      sourceUrl: newMedia[0],
      provider: "google-flow",
      providerOrigin: "web-ui",
      evidence: {
        tracePath: finalTracePath,
      },
    };
  } catch (error) {
    const finalTracePath = await stopWebUiTrace({ context, tracePath, saveTrace: Boolean(tracePath) });
    traceStopped = true;
    const evidence = page
      ? await writeWebUiEvidence({
        page,
        jobDir,
        provider: "flow",
        sceneOrder,
        label: "failure",
        extra: { message: error?.message || "" },
      }).catch(() => ({}))
      : {};
    error.details = {
      ...(error.details || {}),
      provider: "google-flow",
      providerOrigin: "web-ui",
      evidence: {
        ...(error.details?.evidence || {}),
        ...evidence,
        tracePath: finalTracePath,
      },
    };
    error.provider = "google-flow";
    error.providerOrigin = "web-ui";
    error.evidence = error.details.evidence;
    if (/user data directory is already in use|ProcessSingleton|profile.*in use/i.test(error?.message || "")) {
      throw new Error(`Google Flow browser profile is already open. Close the Google Flow authentication Chrome window, then run Generate Final Video again. Details: ${error.message}`);
    }
    throw error;
  } finally {
    if (context && tracePath && !traceStopped) {
      await stopWebUiTrace({ context, tracePath }).catch(() => {});
    }
    await context?.close().catch(() => {});
  }
}
