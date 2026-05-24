import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";

export const GOOGLE_FLOW_URL = "https://labs.google/fx/ko/tools/flow";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function configureFlowVideo(page) {
  return page.evaluate(async () => {
    const labels = {
      video: "\ub3d9\uc601\uc0c1",
      asset: "\uc560\uc14b",
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
    const controls = () => Array.from(document.querySelectorAll("button,[role='button'],[role='option'],[aria-label],div,span"))
      .filter(visible)
      .map((el) => ({ el, text: textOf(el), rect: el.getBoundingClientRect() }))
      .filter((item) => item.text);
    const bodyText = () => document.body?.innerText || "";
    const openGeneratorMenu = async () => {
      const menuOpen = bodyText().includes("Veo 3.1 - Lite")
        && bodyText().includes(labels.video)
        && bodyText().includes("16:9")
        && bodyText().includes("x4");
      if (menuOpen) return { ok: true, alreadyOpen: true };

      const candidates = controls().filter((item) => {
        const text = item.text;
        return item.el.matches("button,[role='button']")
          && item.rect.y > window.innerHeight * 0.72
          && (text.includes("Nano Banana")
            || text.includes("Veo")
            || text.includes("crop_9_16")
            || text.includes("1x"));
      }).sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
      const target = candidates[0];
      if (!target) return { ok: false, reason: "Generator settings button not found" };
      target.el.click();
      await wait(500);
      return { ok: true, text: target.text };
    };
    const clickMatch = async (needles, options = {}) => {
      const lowerNeedles = needles.map((needle) => needle.toLowerCase());
      const matches = controls().filter((item) => {
        const text = item.text.toLowerCase();
        const matched = lowerNeedles.some((needle) => options.exact ? text === needle : text.includes(needle));
        if (!matched) return false;
        if (options.minY !== undefined && item.rect.y < options.minY) return false;
        return true;
      }).sort((a, b) => {
        const aClickable = a.el.closest("button,[role='button'],[role='option']") ? 1 : 0;
        const bClickable = b.el.closest("button,[role='button'],[role='option']") ? 1 : 0;
        return bClickable - aClickable || (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height);
      });
      const match = matches[0];
      if (!match) return { ok: false, reason: `No control matched: ${needles.join(", ")}` };
      const clickable = match.el.closest("button,[role='button'],[role='option']") || match.el;
      clickable.click();
      await wait(options.delay ?? 300);
      return { ok: true, text: match.text };
    };
    const opened = await openGeneratorMenu();
    if (!opened.ok) return { ok: false, results: [opened], summary: bodyText().slice(-500) };

    const results = [];
    results.push(await clickMatch([labels.video, "video"]));
    await wait(300);
    await openGeneratorMenu();
    results.push(await clickMatch([labels.asset, "asset"]));
    await wait(300);
    await openGeneratorMenu();
    results.push(await clickMatch(["9:16", "crop_9_16"]));
    await wait(300);
    await openGeneratorMenu();
    results.push(await clickMatch(["1x"], { exact: true }));
    await wait(300);
    await openGeneratorMenu();
    if (bodyText().includes("Veo 3.1 - Lite")) {
      results.push(await clickMatch(["Veo 3.1 - Lite"]));
    }
    const text = bodyText();
    const ok = text.includes(labels.video)
      && (text.includes("9:16") || text.includes("crop_9_16"))
      && (text.includes("Veo") || !text.includes("Nano Banana"));
    return { ok, results, summary: text.slice(-500) };
  });
}

async function findPromptAndCreate(page) {
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
        .filter((item) => !item.disabled && item.r.width > 10 && item.r.height > 10)
        .filter((item) => {
          const text = item.text.toLowerCase();
          return text.includes("arrow_forward")
            || text.includes("create")
            || text.includes("generate")
            || text.includes("\ub9cc\ub4e4\uae30")
            || text.includes("\uc0dd\uc131");
        })
        .sort((a, b) => (b.r.y - a.r.y) || (b.r.x - a.r.x))[0];
      return {
        textbox: textbox ? { x: Math.round(textbox.r.x + textbox.r.width / 2), y: Math.round(textbox.r.y + textbox.r.height / 2) } : null,
        create: create ? { x: Math.round(create.r.x + create.r.width / 2), y: Math.round(create.r.y + create.r.height / 2), text: create.text } : null,
      };
    });
    if (positions.textbox && positions.create) return positions;
    await delay(1000);
  }
  throw new Error("Flow prompt box or create button not found.");
}

async function collectMediaUrls(page) {
  return page.evaluate(() => ({
    videos: Array.from(new Set(Array.from(document.querySelectorAll("video")).map((item) => item.currentSrc || item.src).filter(Boolean))),
    images: Array.from(new Set(Array.from(document.images).map((item) => item.currentSrc || item.src).filter(Boolean))),
    text: document.body?.innerText?.slice(0, 1500) || "",
  }));
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
  const existing = extname(new URL(mediaUrl, "https://labs.google").pathname).replace(".", "");
  if (existing) return existing;
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("png")) return "png";
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
  jobDir,
  sceneOrder = 1,
  chromePath,
  profileDir,
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
    acceptDownloads: true,
    args: ["--no-first-run", "--no-default-browser-check"],
  });

  try {
    const page = await visiblePage(context);
    page.setDefaultTimeout(60000);
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 프로젝트를 여는 중입니다.` });
    await ensureFlowProject(page);
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 설정을 확인하는 중입니다.` });
    await configureFlowVideo(page);

    const before = await collectMediaUrls(page);
    const beforeVideos = new Set(before.videos);
    const positions = await findPromptAndCreate(page);

    onProgress?.({ message: `장면 ${sceneOrder} 프롬프트를 입력하는 중입니다.` });
    await page.mouse.click(positions.textbox.x, positions.textbox.y);
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(prompt);
    await delay(800);
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 생성 버튼을 클릭하는 중입니다.` });
    await page.mouse.click(positions.create.x, positions.create.y);
    await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_submitted.png`), fullPage: true }).catch(() => {});

    const deadline = Date.now() + timeoutMs;
    let last = null;
    let newVideos = [];
    let nextProgressAt = Date.now();
    while (Date.now() < deadline) {
      await delay(5000);
      last = await collectMediaUrls(page);
      newVideos = last.videos.filter((url) => !beforeVideos.has(url));
      const percents = Array.from(String(last.text || "").matchAll(/(\d+)%/g)).map((match) => Number(match[1]));
      if (Date.now() >= nextProgressAt) {
        const remainingSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        onProgress?.({
          message: `장면 ${sceneOrder} Google Flow 생성 대기 중입니다. 감지된 진행률: ${percents.length ? `${Math.max(...percents)}%` : "없음"}`,
          details: {
            sceneOrder,
            elapsedSeconds: Math.round((timeoutMs - (deadline - Date.now())) / 1000),
            remainingSeconds,
            detectedVideoCount: newVideos.length,
            detectedPercents: percents,
          },
        });
        await page.screenshot({ path: join(jobDir, `scene_${sceneOrder}_flow_waiting.png`), fullPage: true }).catch(() => {});
        nextProgressAt = Date.now() + 15000;
      }
      if (newVideos.length > 0 && percents.length === 0) break;
    }

    if (!newVideos.length) {
      const screenshotPath = join(jobDir, `scene_${sceneOrder}_flow_screen.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await writeFile(join(jobDir, `scene_${sceneOrder}_flow_status.json`), JSON.stringify({
        ok: false,
        reason: "no-new-video-url",
        lastText: last?.text || "",
        screenshotPath,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      throw new Error(`Flow did not expose a new video URL. Screenshot: ${screenshotPath}`);
    }

    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 영상을 다운로드하는 중입니다.`, details: { detectedVideoCount: newVideos.length } });
    const saved = await saveMedia({
      page,
      context,
      mediaUrl: newVideos[0],
      outputPathBase: join(jobDir, `scene_${sceneOrder}_flow`),
    });
    onProgress?.({ message: `장면 ${sceneOrder} Google Flow 영상 다운로드가 완료되었습니다.`, details: saved });
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
