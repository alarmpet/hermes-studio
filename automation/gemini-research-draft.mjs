import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { normalizeYouTubeDraft, parseJsonMarkdown } from "../youtube-workflow.mjs";
import { buildDesktopYouTubeDraft, fetchArticleSource } from "../electron/services/youtube-draft-service.mjs";
import { assertDraftQuality } from "../scripts/youtube-draft-quality.mjs";
import { assertDraftDurationContract } from "../scripts/youtube-draft-duration.mjs";

export const GEMINI_URL = "https://gemini.google.com/";
export const GEMINI_GEMS_URL = "https://gemini.google.com/gem/500bb37978fe";
const GEMINI_JSON_STABLE_POLLS = 4;
const GEMINI_JSON_MIN_STABLE_MS = 12000;
const GEMS_JSON_STABLE_POLLS = 5;
const GEMS_JSON_MIN_STABLE_MS = 15000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    throw new Error(`Browser viewport is too small for stable Gemini automation: ${JSON.stringify(viewport)}`);
  }
  return { viewport, windowBounds };
}

async function writeJsonAtomic(path, value) {
  const tmpPath = path.endsWith("provider-fallback-chain.json")
    ? path.replace(/provider-fallback-chain\.json$/, "provider-fallback-chain.json.tmp")
    : `${path}.tmp`;
  await writeFile(tmpPath, JSON.stringify(value, null, 2), "utf8");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await rename(tmpPath, path);
      return;
    } catch (error) {
      const retryable = /EACCES|EPERM/i.test(error?.code || error?.message || "");
      if (!retryable || attempt === 3) throw error;
      await delay(100 * attempt);
    }
  }
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

  let article = null;
  if (job.sourceType === "url") {
    try {
      article = await fetchArticleSource(job.sourceValue);
    } catch (e) {
      console.warn("Failed to fetch article source:", e);
    }
  }
  job = { ...job, article };

  const providerChain = [];
  const providerChainPath = join(jobDir, "provider-fallback-chain.json");
  const saveProviderChain = async () => {
    await writeJsonAtomic(providerChainPath, providerChain);
  };
  const recordFailure = async (provider, error, extra = {}) => {
    providerChain.push({
      provider,
      status: "failed",
      failureClass: classifyProviderFailure(error),
      error: error?.message || String(error),
      durationQa: error?.durationQa || error?.qa?.targetSeconds ? (error.durationQa || error.qa) : undefined,
      at: new Date().toISOString(),
      ...extra,
    });
    await saveProviderChain();
  };
  const acceptDraft = async (provider, draft) => {
    try {
      const normalized = normalizeYouTubeDraft(draft);
      assertDraftQuality({ draft: normalized, job, stage: provider, jobDir });
      const durationQa = assertDraftDurationContract({ draft: normalized, job, stage: provider, jobDir });
      providerChain.push({ provider, status: "accepted", durationQa, at: new Date().toISOString() });
      await saveProviderChain();
      return normalized;
    } catch (error) {
      error.draft = draft;
      throw error;
    }
  };
  const tryProvider = async (provider, requestFn) => {
    try {
      return await acceptDraft(provider, await requestFn());
    } catch (error) {
      await recordFailure(provider, error);
      if (!isRepairableProviderFailure(error)) throw error;
      const repairPrompt = buildDurationRepairPrompt(job, error);
      providerChain.push({
        provider,
        status: "retrying",
        repairAttempt: 1,
        failureClass: classifyProviderFailure(error),
        durationQa: error?.durationQa || error?.qa?.targetSeconds ? (error.durationQa || error.qa) : undefined,
        at: new Date().toISOString(),
      });
      await saveProviderChain();
      context.emit?.({
        type: "workflow-warning",
        jobId: job.id,
        phase: "research",
        message: `${provider} draft failed QA; retrying once with repair instructions. ${error.message}`,
        details: { provider, repairAttempt: 1, durationQa: error?.durationQa || error?.qa },
      });
      try {
        return await acceptDraft(provider, await requestFn(repairPrompt));
      } catch (repairError) {
        await recordFailure(provider, repairError, { repairAttempt: 1 });
        throw repairError;
      }
    }
  };

  try {
    try {
      return await tryProvider("gemini-gems", (repairPrompt) => requestGemsDraft(job, context, repairPrompt));
    } catch (error) {
      context.emit?.({
        type: "workflow-warning",
        jobId: job.id,
        phase: "research",
        message: `Gems draft failed; trying normal Gemini. ${error.message}`,
        details: { provider: "gemini-gems", fallbackProvider: "gemini" },
      });
    }
    try {
      return await tryProvider("gemini", (repairPrompt) => requestGeminiDraft(job, context, repairPrompt));
    } catch (error) {
      throw error;
    }
  } catch (error) {
    if (context.allowOpenRouterFallback === false) throw error;
    context.emit?.({
      type: "workflow-warning",
      jobId: job.id,
      phase: "research",
      message: `Gemini draft failed; using OpenRouter fallback. ${error.message}`,
    });
    const draft = await buildDesktopYouTubeDraft(job, context);
    return acceptDraft("openrouter", draft);
  }
}

function classifyProviderFailure(error = {}) {
  const code = error.code || error.qa?.failureCode || "";
  const message = String(error.message || "");
  if (code === "PLACEHOLDER_DRAFT" || /placeholder|schema/i.test(message)) return "placeholder-schema";
  if (code === "CORRUPTED_KOREAN_DRAFT" || /mojibake|corrupted korean/i.test(message)) return "corrupted-korean";
  if (code === "DRAFT_DURATION_TOO_SHORT" || code === "DRAFT_DURATION_TOO_LONG") return "duration-contract";
  if (/invalid JSON|JSON response was not detected/i.test(message)) return "invalid-json";
  if (/interrupted|aborted|provider-run-incomplete|target page.*closed|browser.*closed/i.test(message)) return "provider-run-incomplete";
  return "provider-error";
}

function isRepairableProviderFailure(error = {}) {
  return ["placeholder-schema", "duration-contract"].includes(classifyProviderFailure(error));
}

async function requestGemsDraft(job, context = {}, repairPrompt = "") {
  return requestGeminiBrowserDraft(job, context, {
    url: GEMINI_GEMS_URL,
    provider: "gemini-gems",
    requestFile: repairPrompt ? "gemini-gems-repair-request.txt" : "gemini-gems-request.txt",
    responseFile: repairPrompt ? "gemini-gems-repair-response.txt" : "gemini-gems-response.txt",
    repairPrompt,
  });
}

async function requestGeminiDraft(job, context = {}, repairPrompt = "") {
  return requestGeminiBrowserDraft(job, context, {
    url: GEMINI_URL,
    provider: "gemini",
    requestFile: repairPrompt ? "gemini-repair-request.txt" : "gemini-request.txt",
    responseFile: repairPrompt ? "gemini-repair-response.txt" : "gemini-response.txt",
    repairPrompt,
  });
}

async function requestGeminiBrowserDraft(job, context = {}, target = {}) {
  const chromePath = context.chromePath;
  const profileDir = context.paths?.geminiProfileDir;
  const jobDir = context.jobDir;
  if (!chromePath) throw new Error("Chrome executable is required for Gemini research.");
  if (!profileDir) throw new Error("Gemini profile directory is required.");

  const prompt = target.provider === "gemini-gems"
    ? buildGemsPrompt(job, target.repairPrompt || "")
    : buildGeminiPrompt(job, target.repairPrompt || "");
  await writeFile(join(jobDir, target.requestFile || "gemini-request.txt"), prompt, "utf8");
  await releaseAppManagedAuthWindow(profileDir);

  const browser = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: false,
    viewport: { width: 1920, height: 1080 },
    acceptDownloads: true,
    args: ["--no-first-run", "--no-default-browser-check", "--start-maximized", "--window-size=1920,1080"],
  });

  try {
    const page = browser.pages()[0] || await browser.newPage();
    await ensureLargeViewport(page);
    page.setDefaultTimeout(60000);
    await page.goto(target.url || GEMINI_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await assertGeminiReady(page);
    await submitPrompt(page, prompt);
    const response = await waitForJsonResponse(page, {
      stablePolls: target.provider === "gemini-gems" ? GEMS_JSON_STABLE_POLLS : GEMINI_JSON_STABLE_POLLS,
      minStableMs: target.provider === "gemini-gems" ? GEMS_JSON_MIN_STABLE_MS : GEMINI_JSON_MIN_STABLE_MS,
    });
    await writeFile(join(jobDir, target.responseFile || "gemini-response.txt"), response, "utf8");
    const parsed = parseJsonMarkdown(response);
    if (!parsed) throw new Error(`${target.provider || "Gemini"} returned invalid JSON.`);
    assertUsefulDraft(parsed, job);
    return parsed;
  } finally {
    await browser.close().catch(() => {});
  }
}

export function buildGeminiPrompt(job, extraInstruction = "") {
  const sourceLabel = job.sourceType === "url" ? "URL" : "keyword";
  const article = job.article;
  const sourceText = article
    ? [
        `Source URL: ${article.url || job.sourceValue}`,
        `Source title: ${article.title || ""}`,
        `Source body:\n${article.body || ""}`,
      ].join("\n")
    : `${sourceLabel}: ${job.sourceValue}`;
  const hybridIntroVideoSceneCount = Math.max(0, Math.min(10, Math.round(Number(job?.options?.hybridIntroVideoSceneCount ?? 2))));
  const aspectRatio = job?.options?.aspectRatio === "16:9" ? "16:9" : "9:16";
  const hybridInstruction = job?.options?.flowOutputMode === "hybrid"
    ? [
        `- Hybrid Mode (hybridIntroVideoSceneCount=${hybridIntroVideoSceneCount}): first ${hybridIntroVideoSceneCount} opening video scenes are Flow video/Veo, remaining scenes are still images.`,
        "- Keep opening video scene narration under 35 Korean characters. Make action visually obvious.",
        "- For image scenes, use clear visual variety and symbols without readable text.",
      ]
    : [];
  return [
    extraInstruction ? `[REPAIR COMMAND]\n${extraInstruction}\n` : "",
    `[SOURCE]\n${sourceText}\n(Instruction: Rewrite and transform the source. Do not copy sentences.)\n`,
    "[OUTPUT FORMAT]\nReturn ONE raw JSON object matching the schema below. No markdown (```), no alternate keys.",
    `{"title":"[Video title in Korean]","structure":"HPSL","hpsl":{"hook":{"goal":"Hook","narration":"[Korean hook narration, 3s curiosity gap]","target_seconds":7},"point":{"goal":"Point","narration":"[Korean core fact narration]","target_seconds":13},"story":{"goal":"Story","narration":"[Korean story context & example narration]","target_seconds":30},"lesson":{"goal":"Lesson","narration":"[Korean lesson takeaway narration]","target_seconds":10}},"character_profile":"[English stable character description, or empty string]","duration_seconds":60,"script":"[Korean full narration text: hook + point + story + lesson]","scenes":[{"order":1,"narration":"[Korean spoken sentence for this scene]","visual_intent":"[Visual scene goal/intent]","main_subject":"[Main visual subject]","action":"[Concrete action or motion]","setting":"[Scene setting]","camera_motion":"[Camera motion description]","image_prompt":"[English cinematic Google Flow ${aspectRatio} prompt for this scene]","duration_seconds":8}]}`,
    "\n[RULES]",
    "- Structure: HPSL (Hook/후킹, Point/포인트, Story/스토리, Lesson/교훈). Do not repeat full HPSL script at the end.",
    "- Total narration must fit the selected duration. Do not use literal placeholder values (e.g. 'Korean sentence') in output.",
    "- CRITICAL: Replace all placeholder values (e.g., 'string', 'Korean hook...', 'Korean narration') with actual content rewritten from the SOURCE. Do NOT copy the template placeholders.",
    "- Script length constraint: The total Korean narration script must be at least 300 Korean characters to satisfy the 60-second duration target without repetition.",
    "- For keyword jobs, mention the exact keyword in the title and first narration sentence.",
    "- Each scene prompt must be English B-roll representing the narration sentence visually.",
    `- Every Flow image_prompt must explicitly target aspect ratio ${aspectRatio}.`,
    "- Do not make every scene a person reading the script. Use concrete B-roll: close-ups, use cases, charts, processes, environment.",
    "- Keep character details (age, hair, clothes) consistent across scenes if a recurring character is used.",
    "- Flow Prompt Safety: No real person likeness, no celebrities, no logos, no readable text, no subtitles, no watermarks.",
    "- Maintain source_grounding: The title, script, and scenes must align with the user source.",
    ...hybridInstruction,
    buildNotebookLmPromptContext(job),
  ].filter(Boolean).join("\n");
}

export function buildGemsPrompt(job, extraInstruction = "") {
  const sourceLabel = job.sourceType === "url" ? "URL" : "KEYWORD";
  const article = job.article;
  const sourceText = article
    ? [
        `Source URL: ${article.url || job.sourceValue}`,
        `Source title: ${article.title || ""}`,
        `Source body:\n${article.body || ""}`,
      ].join("\n")
    : `${sourceLabel}: ${job.sourceValue}`;
  const targetSeconds = job?.options?.scriptLengthMode === "custom"
    ? Number(job?.options?.customDurationSeconds || 60)
    : 60;
  const sceneCount = Math.max(3, Math.min(10, Math.round(targetSeconds / 12)));
  const hybridIntroVideoSceneCount = Math.max(0, Math.min(10, Math.round(Number(job?.options?.hybridIntroVideoSceneCount ?? 2))));
  const aspectRatio = job?.options?.aspectRatio === "16:9" ? "16:9" : "9:16";
  const hybridLine = job?.options?.flowOutputMode === "hybrid"
    ? `Hybrid Mode: first ${hybridIntroVideoSceneCount} scenes are video, remaining scenes are still images.`
    : "";
  return [
    extraInstruction ? `[REPAIR COMMAND]\n${extraInstruction}\n` : "",
    `[SOURCE]\n${sourceText}\n(Instruction: Rewrite and transform the source. Do not copy sentences.)\n`,
    "[OUTPUT FORMAT]\nReturn ONE raw JSON object matching the schema below. No markdown (```), no alternate keys.",
    '{"title":"[Video title in Korean]","structure":"HPSL","hpsl":{"hook":{"goal":"Hook","narration":"[Korean hook narration, 3s curiosity gap]","target_seconds":7},"point":{"goal":"Point","narration":"[Korean core fact narration]","target_seconds":13},"story":{"goal":"Story","narration":"[Korean story context & example narration]","target_seconds":30},"lesson":{"goal":"Lesson","narration":"[Korean lesson takeaway narration]","target_seconds":10}},"character_profile":"[English stable character description, or empty string]","duration_seconds":60,"script":"[Korean full narration text: hook + point + story + lesson]","scenes":[{"order":1,"narration":"[Korean spoken sentence for this scene]","visual_intent":"[Visual scene goal/intent]","main_subject":"[Main visual subject]","action":"[Concrete action or motion]","setting":"[Scene setting]","camera_motion":"[Camera motion description]","image_prompt":"[English cinematic Google Flow prompt for this scene]","duration_seconds":8}]}',
    "\n[RULES]",
    "Use saved cinematic storytelling instructions; output must match Hermes Studio exactly.",
    `Target duration: ${targetSeconds} seconds. Target scenes: ${sceneCount}.`,
    "Required keys: title, structure, hpsl, character_profile, duration_seconds, script, scenes.",
    "HPSL: Hook (3s curiosity gap), Point (core fact), Story (context), Lesson (takeaway).",
    "Safety: No real person likeness, logos, text, subtitles, watermarks.",
    `Prompt aspect ratio: ${aspectRatio}.`,
    "- Avoid placeholders: Do NOT copy template values ('string', 'Korean hook').",
    `- Narration script must be at least ${Math.round(targetSeconds * 5)} Korean characters.`,
    "- Maintain source_grounding: must align with the user source.",
    hybridLine,
    buildNotebookLmPromptContext(job),
  ].filter(Boolean).join("\n");
}

function buildLegacyGemsPrompt(job, extraInstruction = "") {
  const sourceLabel = job.sourceType === "url" ? "URL" : "KEYWORD";
  const targetSeconds = job?.options?.scriptLengthMode === "custom"
    ? Number(job?.options?.customDurationSeconds || 60)
    : 60;
  const hybridIntroVideoSceneCount = Math.max(0, Math.min(10, Math.round(Number(job?.options?.hybridIntroVideoSceneCount ?? 2))));
  const hybridLine = job?.options?.flowOutputMode === "hybrid"
    ? `Hybrid: first ${hybridIntroVideoSceneCount} scene(s) as Google Flow video, remaining scenes as Google Flow images with render motion.`
    : "";
  return [
    `${sourceLabel}: ${job.sourceValue}`,
    "",
    "Use your saved Hermes instructions for this Gem.",
    `Create a copyright-safe Korean YouTube Shorts draft for about ${targetSeconds} seconds (${targetSeconds}초).`,
    "Return the HPSL script/대본 (hook, point, story, lesson) and scene-by-scene Google Flow image/video prompts/영상 프롬프트.",
    "Rewrite and transform the source. Do not copy article sentences.",
    "Keep Flow prompts policy-safe: no real person likeness, no logos, no readable text, no subtitles, no watermarks.",
    hybridLine,
    buildNotebookLmPromptContext(job),
    extraInstruction,
  ].filter(Boolean).join("\n");
}

function buildNotebookLmPromptContext(job = {}) {
  const research = job?.options?.notebooklmResearch || job?.notebooklmResearch;
  if (!research?.notes?.length && !research?.text) return "";
  const notes = Array.isArray(research.notes) ? research.notes : String(research.text || "").split(/\r?\n/);
  const citations = Array.isArray(research.citations) ? research.citations : [];
  return [
    "NotebookLM research notes:",
    ...notes.slice(0, 12).map((note, index) => `- note ${index + 1}: ${String(note).trim()}`),
    citations.length ? "NotebookLM citations:" : "",
    ...citations.slice(0, 8).map((citation, index) => `- citation ${index + 1}: ${String(citation).trim()}`),
    "Use these notes only as source grounding. Still create a transformed, copyright-safe HPSL script.",
  ].filter(Boolean).join("\n");
}

export function buildDurationRepairPrompt(job, error = {}) {
  const qa = error?.durationQa || error?.qa || {};
  const targetSeconds = qa.targetSeconds || (job?.options?.scriptLengthMode === "custom" ? job?.options?.customDurationSeconds : undefined) || 60;
  const direction = qa.failureCode === "DRAFT_DURATION_TOO_LONG" ? "shorten" : "expand";
  const draftPart = error.draft ? `\nPREVIOUS_DRAFT_JSON:\n${JSON.stringify(error.draft)}\n` : "";
  return [
    "- Problem: The previous draft failed duration QA.",
    `- Target narration length: ${targetSeconds} seconds. ${qa.estimatedSeconds ? `(Previous estimated length: ${qa.estimatedSeconds}s)` : ""}`,
    `- Action: ${direction === "expand"
      ? "Expand the Korean HPSL narration naturally with more context, contrast, examples, and takeaway. Do not repeat sentences."
      : "Shorten the Korean HPSL narration while preserving the key facts and HPSL structure."}`,
    "- Constraint: Return a fresh valid JSON object only. Do not repeat schema placeholder text.",
    draftPart,
  ].filter(Boolean).join("\n");
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
    const error = new Error("Gemini returned schema placeholder text instead of a real draft.");
    error.code = "PLACEHOLDER_DRAFT";
    throw error;
  }
  if (!Array.isArray(draft?.scenes) || draft.scenes.length < 1) {
    const error = new Error("Gemini draft did not include scenes.");
    error.code = "EMPTY_DRAFT";
    throw error;
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

export async function waitForJsonResponse(page, options = {}) {
  const deadline = Date.now() + 180000;
  const stablePolls = Math.max(2, Number(options.stablePolls || GEMINI_JSON_STABLE_POLLS));
  const minStableMs = Math.max(3000, Number(options.minStableMs || GEMINI_JSON_MIN_STABLE_MS));
  let lastText = "";
  let lastGoodCandidate = "";
  let lastGoodCandidateAt = 0;
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
        lastGoodCandidateAt = Date.now();
        stableCount = 1;
      }
      if (stableCount >= stablePolls && Date.now() - lastGoodCandidateAt >= minStableMs) return candidate;
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
