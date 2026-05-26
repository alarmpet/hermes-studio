import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { normalizeYouTubeDraft, parseJsonMarkdown } from "../youtube-workflow.mjs";
import { buildDesktopYouTubeDraft } from "../electron/services/youtube-draft-service.mjs";

export const GEMINI_URL = "https://gemini.google.com/";
export const GEMINI_GEMS_URL = "https://gemini.google.com/gem/500bb37978fe";

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

async function releaseAppManagedAuthWindow(profileDir) {
  const lockPath = join(profileDir, "hermes-profile.lock.json");
  if (!existsSync(lockPath)) return;
  const lock = JSON.parse(await readFile(lockPath, "utf8").catch(() => "{}"));
  if (lock.pid && isProcessRunning(lock.pid)) {
    try {
      process.kill(Number(lock.pid));
    } catch {
      // The auth browser may have exited between the liveness check and kill.
    }
    for (let i = 0; i < 20; i += 1) {
      if (!isProcessRunning(lock.pid)) break;
      await delay(250);
    }
  }
  await rm(lockPath, { force: true });
}

export async function buildGeminiResearchDraft(job, context = {}) {
  const jobDir = context.jobDir;
  if (!jobDir) throw new Error("jobDir is required for Gemini research draft.");
  await mkdir(jobDir, { recursive: true });

  try {
    let draft;
    try {
      draft = await requestGemsDraft(job, context);
    } catch (error) {
      context.emit?.({
        type: "workflow-warning",
        jobId: job.id,
        phase: "research",
        message: `Gems draft failed; trying normal Gemini. ${error.message}`,
        details: { provider: "gemini-gems", fallbackProvider: "gemini" },
      });
      draft = await requestGeminiDraft(job, context);
    }
    return normalizeYouTubeDraft(draft);
  } catch (error) {
    if (context.allowOpenRouterFallback === false) throw error;
    context.emit?.({
      type: "workflow-warning",
      jobId: job.id,
      phase: "research",
      message: `Gemini draft failed; using OpenRouter fallback. ${error.message}`,
    });
    return buildDesktopYouTubeDraft(job, context);
  }
}

async function requestGemsDraft(job, context = {}) {
  return requestGeminiBrowserDraft(job, context, {
    url: GEMINI_GEMS_URL,
    provider: "gemini-gems",
    requestFile: "gemini-gems-request.txt",
    responseFile: "gemini-gems-response.txt",
  });
}

async function requestGeminiDraft(job, context = {}) {
  return requestGeminiBrowserDraft(job, context, {
    url: GEMINI_URL,
    provider: "gemini",
    requestFile: "gemini-request.txt",
    responseFile: "gemini-response.txt",
  });
}

async function requestGeminiBrowserDraft(job, context = {}, target = {}) {
  const chromePath = context.chromePath;
  const profileDir = context.paths?.geminiProfileDir;
  const jobDir = context.jobDir;
  if (!chromePath) throw new Error("Chrome executable is required for Gemini research.");
  if (!profileDir) throw new Error("Gemini profile directory is required.");

  const prompt = buildGeminiPrompt(job);
  await writeFile(join(jobDir, target.requestFile || "gemini-request.txt"), prompt, "utf8");
  await releaseAppManagedAuthWindow(profileDir);

  const browser = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: false,
    acceptDownloads: true,
    args: ["--no-first-run", "--no-default-browser-check"],
  });

  try {
    const page = browser.pages()[0] || await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(target.url || GEMINI_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await assertGeminiReady(page);
    await submitPrompt(page, prompt);
    const response = await waitForJsonResponse(page);
    await writeFile(join(jobDir, target.responseFile || "gemini-response.txt"), response, "utf8");
    const parsed = parseJsonMarkdown(response);
    if (!parsed) throw new Error(`${target.provider || "Gemini"} returned invalid JSON.`);
    assertUsefulDraft(parsed, job);
    return parsed;
  } finally {
    await browser.close().catch(() => {});
  }
}

export function buildGeminiPrompt(job) {
  const sourceLabel = job.sourceType === "url" ? "URL" : "keyword";
  const hybridIntroVideoSceneCount = Math.max(0, Math.min(6, Math.round(Number(job?.options?.hybridIntroVideoSceneCount ?? 2))));
  const hybridInstruction = job?.options?.flowOutputMode === "hybrid"
    ? [
        `- Hybrid mode is enabled: hybridIntroVideoSceneCount=${hybridIntroVideoSceneCount}. The first ${hybridIntroVideoSceneCount} opening video scenes will be generated as Flow video/Veo-style clips; all later scenes will be generated as still images with motion in render.`,
        "- For opening video scenes, keep each Korean narration sentence under 35 Korean characters when possible, make the action visually obvious, and avoid packing multiple ideas into one scene.",
        "- For later image scenes, use clear visual variety and concrete symbols that support the narration without needing readable text.",
      ]
    : [];
  return [
    "You are Hermes YouTube Shorts research and production planner.",
    "Research the user's source inside Gemini when useful, then produce one valid JSON object only.",
    "Do not include markdown.",
    "Do not copy the schema example values. Never answer with literal placeholder values such as string, Korean narration, Korean sentence, or English stable character profile.",
    "Schema:",
    "{\"title\":\"string\",\"structure\":\"HPSL\",\"hpsl\":{\"hook\":{\"goal\":\"Hook\",\"narration\":\"Korean hook\",\"target_seconds\":7},\"point\":{\"goal\":\"Point\",\"narration\":\"Korean core point\",\"target_seconds\":13},\"story\":{\"goal\":\"Story\",\"narration\":\"Korean context and example\",\"target_seconds\":30},\"lesson\":{\"goal\":\"Lesson\",\"narration\":\"Korean takeaway\",\"target_seconds\":10}},\"character_profile\":\"English stable character profile or empty string\",\"duration_seconds\":60,\"script\":\"hook + point + story + lesson Korean narration\",\"scenes\":[{\"order\":1,\"narration\":\"Korean sentence\",\"visual_intent\":\"what viewer should understand visually\",\"main_subject\":\"topic-specific object/person/place\",\"action\":\"visible action or demonstration\",\"setting\":\"specific environment\",\"camera_motion\":\"camera direction\",\"image_prompt\":\"English Google Flow 9:16 cinematic B-roll prompt\",\"duration_seconds\":8}]}",
    "Rules:",
    "- Required structure is HPSL: Hook/후킹 creates curiosity in the first 3 seconds, Point/포인트 states the core fact, Story/스토리 explains context with one concrete example or metaphor, Lesson/교훈 leaves a useful takeaway or caution.",
    "- Do not repeat the full HPSL script at the end.",
    "- Total narration must fit the selected duration.",
    "- The Korean script must match the requested topic exactly.",
    "- For keyword jobs, mention the exact keyword in the title and first narration sentence.",
    "- For URL jobs, rewrite and transform the article idea instead of copying.",
    "- Each scene prompt must reflect the corresponding narration sentence.",
    "- Do not make every scene a person presenting or reading the narration.",
    "- Prefer concrete B-roll: product close-ups, real-world use cases, demonstrations, environments, UI-like visual metaphors without readable text, and before/after contrasts.",
    "- Each scene must include a different visual action that reflects the sentence meaning.",
    "- If the topic has an object, technology, place, chart, risk, or process, show that visually.",
    "- Use the recurring character only as a guide, observer, or user when helpful; do not force a talking presenter into every scene.",
    "- If a character appears, keep one consistent age, gender, ethnicity, face, hairstyle, outfit, and role across every scene.",
    "- For Google Flow image_prompt fields, never include names of celebrities, politicians, athletes, influencers, CEOs, founders, journalists, or other identifiable real people.",
    "- If the source article names a real person, keep the name only in Korean narration when factually needed, but describe Flow visuals with generic roles such as a tech executive, a politician, an athlete, an anonymous official, or symbolic B-roll.",
    "- Do not ask Flow to depict, imitate, or resemble any real person's face, body, likeness, or voice.",
    "- Prompts must avoid logos, subtitles, readable text, captions, and watermarks.",
    ...hybridInstruction,
    `${sourceLabel}: ${job.sourceValue}`,
  ].join("\n");
}

function assertUsefulDraft(draft, job) {
  const combined = [
    draft?.title,
    draft?.script,
    draft?.character_profile,
    ...(Array.isArray(draft?.scenes) ? draft.scenes.flatMap((scene) => [scene.narration, scene.image_prompt]) : []),
  ].join(" ");
  const placeholderPattern = /\b(string|Korean narration|Korean sentence|English stable character profile|English Google Flow 9:16 video prompt)\b/i;
  if (placeholderPattern.test(combined)) {
    throw new Error("Gemini returned schema placeholder text instead of a real draft.");
  }
  if (!Array.isArray(draft?.scenes) || draft.scenes.length < 1) {
    throw new Error("Gemini draft did not include scenes.");
  }
  if (job.sourceType === "keyword") {
    const tokens = String(job.sourceValue || "").split(/\s+/).filter((item) => item.length >= 2);
    if (tokens.length && !tokens.some((token) => combined.includes(token))) {
      throw new Error(`Gemini draft did not reflect keyword "${job.sourceValue}".`);
    }
  }
}

async function assertGeminiReady(page) {
  const state = await page.evaluate(() => ({
    href: location.href,
    text: document.body?.innerText?.slice(0, 1200) || "",
  }));
  if (/accounts\.google|signin|login/i.test(`${state.href} ${state.text}`)) {
    throw new Error("Gemini login is required. Use Authenticate Gemini and run again.");
  }
}

async function submitPrompt(page, prompt) {
  const position = await findGeminiPromptBox(page);
  await page.mouse.click(position.x, position.y);
  await page.keyboard.insertText(prompt);
  await page.keyboard.press("Enter");
}

async function findGeminiPromptBox(page) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const position = await page.evaluate(() => {
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none"
          && style.visibility !== "hidden"
          && rect.width > 120
          && rect.height > 20
          && rect.bottom > 0
          && rect.right > 0;
      };
      const candidates = Array.from(document.querySelectorAll("textarea,[contenteditable='true'],div[role='textbox']"))
        .filter(visible)
        .filter((el) => !String(el.className || "").includes("ql-clipboard"))
        .map((el) => ({ rect: el.getBoundingClientRect(), text: (el.innerText || el.textContent || el.value || "").trim() }))
        .sort((a, b) => b.rect.y - a.rect.y);
      const target = candidates[0];
      if (!target) return null;
      return {
        x: Math.round(target.rect.x + target.rect.width / 2),
        y: Math.round(target.rect.y + Math.min(target.rect.height / 2, 28)),
        text: target.text,
      };
    });
    if (position) return position;
    await page.waitForTimeout(1000);
  }
  throw new Error("Gemini prompt box was not found.");
}

export async function waitForJsonResponse(page) {
  const deadline = Date.now() + 180000;
  let lastText = "";
  let lastGoodCandidate = "";
  let stableCount = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000);
    lastText = await page.evaluate(() => document.body?.innerText || "");
    const candidates = findJsonCandidates(lastText).reverse();
    for (const candidate of candidates) {
      const parsed = parseJsonMarkdown(candidate);
      if (!parsed || !Array.isArray(parsed.scenes)) continue;
      if (candidate === lastGoodCandidate) {
        stableCount += 1;
      } else {
        lastGoodCandidate = candidate;
        stableCount = 1;
      }
      if (stableCount >= 2) return candidate;
    }
  }
  throw new Error(`Gemini JSON response was not detected. Last text: ${lastText.slice(-500)}`);
}

function findJsonCandidates(text = "") {
  const candidates = [];
  const raw = String(text);
  for (let start = raw.indexOf("{"); start !== -1; start = raw.indexOf("{", start + 1)) {
    const candidate = raw.slice(start, raw.lastIndexOf("}") + 1);
    if (candidate.includes("\"scenes\"")) candidates.push(candidate);
  }
  return candidates;
}
