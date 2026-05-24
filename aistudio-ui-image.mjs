#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_URL = "https://aistudio.google.com/app/prompts?newPrompt=image_freeform";
const DEFAULT_PROFILE = ".aistudio-browser-profile";
const DEFAULT_PORT = 9227;

function usage() {
  return `Usage:
  node .\\aistudio-ui-image.mjs --prompt "your image prompt" --out .\\outputs\\image.png

Options:
  --prompt <text>       Required prompt to enter in AI Studio.
  --out <path>          Output PNG path. Default: aistudio-generated.png
  --url <url>           AI Studio URL. Default: ${DEFAULT_URL}
  --browser <path>      Chrome/Edge/Brave executable path.
  --profile <path>      Persistent browser profile dir. Default: ${DEFAULT_PROFILE}
  --port <number>       DevTools port. Default: ${DEFAULT_PORT}
  --timeout <seconds>   Wait time after clicking Generate. Default: 180

Flow:
  1. The script opens a visible browser with a separate local profile.
  2. You log in manually if Google asks.
  3. Press Enter in this terminal.
  4. For Google Flow, it sets: Video, Asset, 9:16, 1x, Veo 3.1 - Lite.
  5. The script fills the prompt, clicks Generate, and saves the displayed result.
`;
}

function parseArgs(argv) {
  const args = {
    out: "aistudio-generated.png",
    url: DEFAULT_URL,
    profile: DEFAULT_PROFILE,
    port: DEFAULT_PORT,
    timeout: 180,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }

    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);

    if (key === "--prompt") args.prompt = value;
    else if (key === "--out") args.out = value;
    else if (key === "--url") args.url = value;
    else if (key === "--browser") args.browser = value;
    else if (key === "--profile") args.profile = value;
    else if (key === "--port") args.port = Number(value);
    else if (key === "--timeout") args.timeout = Number(value);
    else throw new Error(`Unknown option: ${key}`);

    i += 1;
  }

  return args;
}

function findBrowser(explicitPath) {
  const candidates = [
    explicitPath,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  ].filter(Boolean);

  const browser = candidates.find((candidate) => existsSync(candidate));
  if (!browser) {
    throw new Error("Could not find Chrome, Edge, or Brave. Pass --browser \"C:\\path\\to\\browser.exe\".");
  }
  return browser;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function waitForJson(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Browser is still starting.
    }
    await delay(300);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.sessions = new Map();
  }

  async open() {
    await new Promise((resolveOpen, rejectOpen) => {
      this.ws.addEventListener("open", resolveOpen, { once: true });
      this.ws.addEventListener("error", rejectOpen, { once: true });
    });

    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    });
  }

  call(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;

    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));

    return new Promise((resolveCall, rejectCall) => {
      this.pending.set(id, { resolve: resolveCall, reject: rejectCall });
    });
  }

  close() {
    this.ws.close();
  }
}

async function evaluate(cdp, sessionId, expression, timeoutMs = 30000) {
  const result = await cdp.call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs,
  }, sessionId);

  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.text
      ?? "Evaluation failed";
    throw new Error(text);
  }

  return result.result.value;
}

function promptFillExpression(prompt) {
  return `(() => {
    const prompt = ${JSON.stringify(prompt)};
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 80 && rect.height > 20;
    };
    const candidates = Array.from(document.querySelectorAll([
      'textarea',
      'input[type="text"]',
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[aria-label*="prompt" i]',
      '[placeholder*="prompt" i]',
      '[aria-label*="프롬프트" i]',
      '[placeholder*="프롬프트" i]',
      '[aria-label*="무엇" i]',
      '[placeholder*="무엇" i]',
      '[data-testid*="prompt" i]'
    ].join(','))).filter(visible);
    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    });
    const el = candidates[0];
    if (!el) return { ok: false, reason: "Prompt input not found" };
    el.focus();
    if (el.isContentEditable || el.getAttribute("role") === "textbox") {
      el.innerHTML = "";
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, prompt);
      if ((el.innerText || el.textContent || "").trim() !== prompt.trim()) {
        el.textContent = prompt;
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
    } else {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, prompt);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { ok: true, tag: el.tagName, label: el.getAttribute("aria-label") || el.getAttribute("placeholder") || "" };
  })()`;
}

function generateClickExpression() {
  return `(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled && style.visibility !== "hidden" && style.display !== "none" && rect.width > 10 && rect.height > 10;
    };
    const words = ["generate", "run", "create", "submit", "send", "생성", "만들", "실행"];
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(visible);
    const scored = buttons.map((button) => {
      const text = [
        button.innerText,
        button.textContent,
        button.getAttribute("aria-label"),
        button.getAttribute("title")
      ].filter(Boolean).join(" ").toLowerCase();
      const score = words.reduce((sum, word) => sum + (text.includes(word) ? 10 : 0), 0);
      const rect = button.getBoundingClientRect();
      const rightBottomBonus = rect.x > window.innerWidth * 0.6 && rect.y > window.innerHeight * 0.75 ? 20 : 0;
      const arrowBonus = text.includes("arrow_forward") ? 30 : 0;
      return { button, score: score + rightBottomBonus + arrowBonus + Math.min(5, rect.width / 80), x: rect.x, y: rect.y };
    }).sort((a, b) => (b.score - a.score) || (b.y - a.y) || (b.x - a.x));
    const match = scored.find((item) => item.score >= 10) || scored[0];
    if (!match) return { ok: false, reason: "Generate button not found" };
    match.button.click();
    return {
      ok: true,
      text: match.button.innerText || match.button.getAttribute("aria-label") || match.button.getAttribute("title") || ""
    };
  })()`;
}

function flowNewProjectExpression() {
  return `(() => {
    if (location.pathname.includes("/project/")) {
      return { ok: true, alreadyInProject: true };
    }
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled && style.visibility !== "hidden" && style.display !== "none" && rect.width > 10 && rect.height > 10;
    };
    const controls = Array.from(document.querySelectorAll('button, [role="button"], a')).filter(visible);
    const openProjectWords = [
      "새 프로젝트",
      "new project",
      "create project",
      "get started",
      "시작",
      "시작하기",
      "프로젝트 만들"
    ];
    const match = controls.find((control) => {
      const text = [
        control.innerText,
        control.textContent,
        control.getAttribute("aria-label"),
        control.getAttribute("title")
      ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim().toLowerCase();
      return openProjectWords.some((word) => text.includes(word));
    });
    if (!match) return { ok: false, reason: "Flow project start button not found" };
    match.click();
    return {
      ok: true,
      clicked: true,
      text: match.innerText || match.textContent || match.getAttribute("aria-label") || ""
    };
  })()`;
}

function waitForFlowProjectExpression() {
  return `(() => ({
    ok: location.pathname.includes("/project/"),
    href: location.href,
    text: document.body?.innerText?.replace(/\\s+/g, " ").slice(0, 500) || ""
  }))()`;
}

function flowConfigureSettingsExpression() {
  return `(async () => {
    const labels = {
      image: "\\uc774\\ubbf8\\uc9c0",
      video: "\\ub3d9\\uc601\\uc0c1",
      asset: "\\uc560\\uc14b"
    };
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled && style.visibility !== "hidden" && style.display !== "none" && rect.width > 8 && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title")
    ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
    const controls = () => Array.from(document.querySelectorAll('button, [role="button"], [role="option"], [aria-label], div, span'))
      .filter(visible)
      .map((el) => ({ el, text: textOf(el), rect: el.getBoundingClientRect() }))
      .filter((item) => item.text);
    const bodyText = () => document.body?.innerText || "";
    const summaryButton = () => controls().find((item) =>
      item.el.matches('button, [role="button"]')
      && item.text.includes(labels.video)
      && item.text.includes("1x")
    );
    const clickMatch = async (needles, options = {}) => {
      const lowerNeedles = needles.map((needle) => needle.toLowerCase());
      const matches = controls().filter((item) => {
        const text = item.text.toLowerCase();
        const matched = lowerNeedles.some((needle) => options.exact ? text === needle : text.includes(needle));
        if (!matched) return false;
        if (options.minY !== undefined && item.rect.y < options.minY) return false;
        if (options.maxY !== undefined && item.rect.y > options.maxY) return false;
        return true;
      }).sort((a, b) => {
        const aClickable = a.el.closest('button, [role="button"], [role="option"]') ? 1 : 0;
        const bClickable = b.el.closest('button, [role="button"], [role="option"]') ? 1 : 0;
        return bClickable - aClickable || (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height);
      });
      const match = matches[0];
      if (!match) return { ok: false, reason: \`No control matched: \${needles.join(", ")}\` };
      const clickable = match.el.closest('button, [role="button"], [role="option"]') || match.el;
      clickable.click();
      await delay(options.delay ?? 250);
      return { ok: true, text: match.text };
    };
    const hasSettingsPanel = () => {
      const text = bodyText();
      return text.includes(labels.image)
        && text.includes(labels.video)
        && text.includes("9:16")
        && text.includes("16:9");
    };
    if (!hasSettingsPanel()) {
      const summary = summaryButton();
      const opened = summary
        ? (summary.el.click(), await delay(500), { ok: true, text: summary.text })
        : await clickMatch([labels.video, "1x", "Veo 3.1"], { minY: Math.floor(window.innerHeight * 0.55) });
      if (!opened.ok) await clickMatch(["tune", "settings", "\\uc124\\uc815"]);
      await delay(500);
    }
    const results = [];
    const clickOrAlready = async (name, needles, options = {}) => {
      const text = bodyText();
      if (needles.some((needle) => text.includes(needle))) {
        const clicked = await clickMatch(needles, options);
        if (clicked.ok) return [name, clicked];
        return [name, { ok: true, alreadyVisible: true, warning: clicked.reason }];
      }
      return [name, await clickMatch(needles, options)];
    };
    results.push(await clickOrAlready("video", [labels.video]));
    results.push(await clickOrAlready("asset", [labels.asset]));
    results.push(await clickOrAlready("aspect", ["9:16", "crop_9_16"]));
    results.push(await clickOrAlready("speed", ["1x"], { exact: true }));
    if (bodyText().includes("Veo 3.1 - Lite")) {
      results.push(["model", { ok: true, text: "Veo 3.1 - Lite" }]);
    } else {
      const openedModel = await clickMatch(["Veo"]);
      const modelResult = openedModel.ok ? await clickMatch(["Veo 3.1 - Lite"], { delay: 400 }) : openedModel;
      if (!modelResult.ok && bodyText().includes(labels.video) && (bodyText().includes("9:16") || bodyText().includes("crop_9_16")) && bodyText().includes("1x")) {
        results.push(["model", { ok: true, warning: modelResult.reason }]);
      } else {
        results.push(["model", modelResult]);
      }
    }
    const summary = summaryButton();
    const summaryOk = summary?.text.includes(labels.video)
      && summary.text.includes("1x")
      && (bodyText().includes("9:16") || bodyText().includes("crop_9_16"));
    return { ok: results.every(([, result]) => result.ok) || Boolean(summaryOk), results, summary: summary?.text || "" };
  })()`;
}

function extractImageExpression() {
  return `(async () => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width >= 128 && rect.height >= 128;
    };
    const toDataUrlFromBlob = (blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const videoElements = Array.from(document.querySelectorAll("video"))
      .filter((video) => visible(video) && (video.videoWidth >= 128 || video.clientWidth >= 128) && (video.videoHeight >= 128 || video.clientHeight >= 128))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.width * br.height) - (ar.width * ar.height);
      });
    for (const video of videoElements) {
      const src = video.currentSrc || video.src;
      if (!src) continue;
      if (src.startsWith("data:video/")) return { ok: true, dataUrl: src, source: "video-data-url" };
      try {
        const response = await fetch(src);
        if (response.ok) return { ok: true, dataUrl: await toDataUrlFromBlob(await response.blob()), source: "video-fetch" };
      } catch {}
    }
    const imageElements = Array.from(document.images)
      .filter((img) => visible(img) && (img.naturalWidth >= 128 || img.width >= 128) && (img.naturalHeight >= 128 || img.height >= 128))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.width * br.height) - (ar.width * ar.height);
      });
    for (const img of imageElements) {
      const src = img.currentSrc || img.src;
      if (!src) continue;
      if (src.startsWith("data:image/")) return { ok: true, dataUrl: src, source: "img-data-url" };
      try {
        const response = await fetch(src);
        if (response.ok) return { ok: true, dataUrl: await toDataUrlFromBlob(await response.blob()), source: "img-fetch" };
      } catch {}
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        return { ok: true, dataUrl: canvas.toDataURL("image/png"), source: "img-canvas" };
      } catch {}
    }
    const canvases = Array.from(document.querySelectorAll("canvas")).filter(visible).sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    });
    for (const canvas of canvases) {
      try {
        return { ok: true, dataUrl: canvas.toDataURL("image/png"), source: "canvas" };
      } catch {}
    }
    return { ok: false, reason: "No visible generated media found yet" };
  })()`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.prompt) throw new Error("Missing required --prompt.\n\n" + usage());

  const browser = findBrowser(args.browser);
  const userDataDir = resolve(args.profile);
  const chromeArgs = [
    `--remote-debugging-port=${args.port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    args.url,
  ];

  console.log(`Opening browser: ${browser}`);
  console.log(`Profile: ${userDataDir}`);
  const child = spawn(browser, chromeArgs, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const version = await waitForJson(`http://127.0.0.1:${args.port}/json/version`);
  const cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.open();

  const target = await cdp.call("Target.createTarget", { url: args.url });
  const attached = await cdp.call("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.call("Runtime.enable", {}, sessionId);
  await cdp.call("Page.enable", {}, sessionId);

  const rl = createInterface({ input, output });
  await rl.question("Log in manually in the opened browser if needed, switch to the image prompt page, then press Enter here...");
  rl.close();

  if (args.url.includes("labs.google") && args.url.includes("/flow")) {
    console.log("Opening or creating a Flow project...");
    const projectResult = await evaluate(cdp, sessionId, flowNewProjectExpression());
    if (!projectResult.ok) throw new Error(projectResult.reason);

    const projectDeadline = Date.now() + 60000;
    let projectReady;
    while (Date.now() < projectDeadline) {
      projectReady = await evaluate(cdp, sessionId, waitForFlowProjectExpression());
      if (projectReady.ok) break;
      await delay(1000);
    }
    if (!projectReady?.ok) {
      throw new Error(`Flow project page did not open. Current page: ${projectReady?.href ?? "unknown"}`);
    }

    console.log("Applying Flow settings: Video, Asset, 9:16, 1x, Veo 3.1 - Lite...");
    const settingsResult = await evaluate(cdp, sessionId, flowConfigureSettingsExpression(), 60000);
    if (!settingsResult.ok) {
      throw new Error(`Flow settings failed: ${JSON.stringify(settingsResult.results)}`);
    }
  }

  console.log("Filling prompt...");
  const fillResult = await evaluate(cdp, sessionId, promptFillExpression(args.prompt));
  if (!fillResult.ok) throw new Error(fillResult.reason);

  console.log("Clicking Generate...");
  const clickResult = await evaluate(cdp, sessionId, generateClickExpression());
  if (!clickResult.ok) throw new Error(clickResult.reason);

  console.log(`Waiting up to ${args.timeout}s for generated media...`);
  const deadline = Date.now() + args.timeout * 1000;
  let extracted;
  while (Date.now() < deadline) {
    extracted = await evaluate(cdp, sessionId, extractImageExpression(), 30000);
    if (extracted.ok) break;
    await delay(3000);
  }

  const outputPath = resolve(args.out);
  await mkdir(dirname(outputPath), { recursive: true });

  if (extracted?.ok) {
    const match = /^data:((?:image|video)\/[^;]+);base64,(.+)$/i.exec(extracted.dataUrl);
    if (!match) throw new Error("Generated media was found, but it was not a base64 image/video data URL.");
    await writeFile(outputPath, Buffer.from(match[2], "base64"));
    console.log(`Saved generated ${match[1]} (${extracted.source}) to ${outputPath}`);
  } else {
    console.log("Media extraction failed; saving a page screenshot instead.");
    const screenshot = await cdp.call("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
    await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
    console.log(`Saved page screenshot to ${outputPath}`);
  }

  cdp.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
