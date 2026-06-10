import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeYouTubeDraft, parseJsonMarkdown } from "../../youtube-workflow.mjs";
import { SCRIPT_LENGTH_PRESETS } from "../../youtube-job-schema.mjs";
import { assertDraftQuality } from "../../scripts/youtube-draft-quality.mjs";
import { assertDraftDurationContract } from "../../scripts/youtube-draft-duration.mjs";

const OPENROUTER_MODELS = (process.env.HERMES_OPENROUTER_MODELS
  || process.env.HERMES_OPENROUTER_MODEL
  || process.env.OPENROUTER_MODEL
  || "openai/gpt-4o-mini,openai/gpt-oss-20b:free")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

export async function buildDesktopYouTubeDraft(job, context = {}) {
  const key = await readOpenRouterKey(context.paths);
  if (!key) {
    throw new Error("OpenRouter API key is required for desktop script generation. Put openrouter.txt or openrouter.txt.txt in the Hermes app data folder or set OPENROUTER_API_KEY.");
  }

  const source = job.sourceType === "url"
    ? await fetchArticleSource(job.sourceValue)
    : { mode: "keyword", keyword: job.sourceValue };
  const target = resolveScriptTarget(job);
  const prompt = buildDraftPrompt({ job, source, target });

  const errors = [];
  for (const model of OPENROUTER_MODELS) {
    try {
      const draft = await requestDraft({ key, model, prompt });
      if (context.jobDir) {
        const safeModel = model.replace(/[^a-z0-9.-]+/gi, "_");
        await writeFile(join(context.jobDir, `openrouter-response-${safeModel}.json`), JSON.stringify(draft, null, 2), "utf8");
      }
      const normalized = normalizeYouTubeDraft(draft);
      assertDraftMatchesSource(normalized, source);
      assertDraftQuality({ draft: normalized, job, stage: `openrouter:${model}`, jobDir: context.jobDir || "" });
      try {
        assertDraftDurationContract({ draft: normalized, job, stage: `openrouter:${model}`, jobDir: context.jobDir || "" });
      } catch (error) {
        if (error?.code !== "DRAFT_DURATION_TOO_SHORT" && error?.code !== "DRAFT_DURATION_TOO_LONG") throw error;
        const repairPrompt = buildDurationRepairPrompt({
          source,
          target,
          previousDraft: normalized,
          durationQa: error.durationQa || error.qa,
        });
        const repaired = await requestDraft({ key, model, prompt: repairPrompt, maxTokens: 3600 });
        if (context.jobDir) {
          const safeModel = model.replace(/[^a-z0-9.-]+/gi, "_");
          await writeFile(join(context.jobDir, `openrouter-response-${safeModel}-repair.json`), JSON.stringify(repaired, null, 2), "utf8");
        }
        const normalizedRepair = normalizeYouTubeDraft(repaired);
        assertDraftMatchesSource(normalizedRepair, source);
        assertDraftQuality({ draft: normalizedRepair, job, stage: `openrouter:${model}:repair`, jobDir: context.jobDir || "" });
        assertDraftDurationContract({ draft: normalizedRepair, job, stage: `openrouter:${model}:repair`, jobDir: context.jobDir || "" });
        return normalizedRepair;
      }
      return normalized;
    } catch (error) {
      errors.push(`${model}: ${error?.message || String(error)}`);
    }
  }
  throw new Error(`OpenRouter draft generation failed for all configured models. ${errors.join(" | ")}`);
}

async function readOpenRouterKey(paths = {}) {
  const envKey = process.env.OPENROUTER_API_KEY || process.env.HERMES_OPENROUTER_API_KEY;
  if (envKey) return envKey.trim();

  const candidates = [
    paths.userData ? join(paths.userData, "openrouter.txt") : "",
    paths.userData ? join(paths.userData, "openrouter.txt.txt") : "",
    paths.runtimeRoot ? join(paths.runtimeRoot, "openrouter.txt") : "",
    paths.runtimeRoot ? join(paths.runtimeRoot, "openrouter.txt.txt") : "",
    join(process.cwd(), "openrouter.txt"),
    join(process.cwd(), "openrouter.txt.txt"),
    "C:/Users/amd/hermes/openrouter.txt",
    "C:/Users/amd/hermes/openrouter.txt.txt",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const key = (await readFile(candidate, "utf8")).trim();
    if (key) return key;
  }
  return "";
}

function resolveScriptTarget(job) {
  const preset = SCRIPT_LENGTH_PRESETS[job.options.scriptLengthPreset] || SCRIPT_LENGTH_PRESETS.standard;
  const seconds = job.options.scriptLengthMode === "custom"
    ? Number(job.options.customDurationSeconds || preset.targetSeconds)
    : preset.targetSeconds;
  return {
    seconds,
    sceneCount: Math.max(3, Math.min(80, Math.ceil(seconds / 6))),
    wordsMin: Math.max(70, Math.round(seconds * 2.2)),
    wordsMax: Math.max(95, Math.round(seconds * 2.8)),
    charsMin: Math.max(220, Math.round(seconds * 6.0)),
    charsMax: Math.max(280, Math.round(seconds * 7.8)),
  };
}

export async function fetchArticleSource(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 Hermes YouTube Studio article fetcher",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Failed to fetch article: HTTP ${response.status} ${response.statusText}`);
  const html = await response.text();
  const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  const paragraphs = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => decodeHtml(match[1].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 30);
  const body = paragraphs.length
    ? paragraphs.join("\n\n").slice(0, 5000)
    : decodeHtml(html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()).slice(0, 5000);
  return { mode: "url", url, title, body };
}

function decodeHtml(value = "") {
  const entities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name.toLowerCase()] || match);
}

function systemPrompt() {
  return [
    "You are a Korean YouTube Shorts production assistant.",
    "Return only one valid JSON object. No markdown, no commentary.",
    "Schema:",
    "{\"title\":\"string\",\"structure\":\"HPSL\",\"hpsl\":{\"hook\":{\"goal\":\"Hook\",\"narration\":\"Korean hook\",\"target_seconds\":7},\"point\":{\"goal\":\"Point\",\"narration\":\"Korean core point\",\"target_seconds\":13},\"story\":{\"goal\":\"Story\",\"narration\":\"Korean context and example\",\"target_seconds\":30},\"lesson\":{\"goal\":\"Lesson\",\"narration\":\"Korean takeaway\",\"target_seconds\":10}},\"character_profile\":\"English stable recurring human presenter/lead description\",\"duration_seconds\":60,\"script\":\"hook + point + story + lesson Korean narration\",\"scenes\":[{\"order\":1,\"narration\":\"Korean spoken line\",\"image_prompt\":\"English 9:16 cinematic video prompt\",\"duration_seconds\":8}]}",
    "Rules:",
    "- Required structure is HPSL: Hook/후킹 creates curiosity in the first 3 seconds, Point/포인트 states the core fact, Story/스토리 explains context with one concrete example or metaphor, Lesson/교훈 leaves a useful takeaway or caution.",
    "- Do not repeat the full HPSL script at the end.",
    "- Total narration must fit the selected duration.",
    "- Write the script in natural spoken Korean.",
    "- The title, script, and every scene must stay tightly focused on the user-provided keyword or article.",
    "- The title is shown at the top of the final video, so write a short hook title that fits within two clean Shorts title lines: 18 Korean characters or fewer excluding spaces.",
    "- For keyword jobs, mention the exact keyword in the Korean title and early narration.",
    "- image_prompt must be English and suitable for Google Flow video generation.",
    "- Do not include subtitles, logos, readable text, captions, or watermarks in image_prompt.",
    "- If a human appears, keep one consistent recurring character across every scene: same ethnicity, gender, approximate age, hairstyle, face, outfit, and role.",
    "- Do not copy article sentences directly. Rewrite and transform.",
  ].join("\n");
}

function buildDraftPrompt({ job, source, target }) {
  const targetText = [
    `Target duration: ${target.seconds} seconds.`,
    `Target scenes: ${target.sceneCount}.`,
    `Target Korean narration length: ${target.wordsMin}-${target.wordsMax} Korean words/spaces-equivalent.`,
    `Target Korean spoken narration length: ${target.charsMin}-${target.charsMax} non-space Korean characters across hook, point, story, and lesson.`,
    "For Korean, prioritize the character-count target over English-style word count. Short one-line sections will fail QA.",
    "Make scene count proportional to the script. Each scene should have one clear visual beat.",
    "Use HPSL timing: Hook short, Point concise, Story expanded, Lesson clear. For custom length, expand the Story beats instead of repeating the same 60-second script.",
  ].join("\n");

  if (source.mode === "url") {
    return [
      "Create a Korean YouTube Shorts draft from this article source.",
      targetText,
      `Source URL: ${source.url}`,
      `Source title: ${source.title}`,
      `Source body:\n${source.body}`,
    ].join("\n\n");
  }

  return [
    "Create a Korean YouTube Shorts draft from this keyword.",
    "The exact keyword must be the main subject. Do not change the topic.",
    targetText,
    `Keyword: ${job.sourceValue}`,
    "Use current, evergreen background knowledge only if no article source was provided. Avoid claiming very recent facts unless the source gives them.",
  ].join("\n\n");
}

function buildDurationRepairPrompt({ source, target, previousDraft, durationQa }) {
  const direction = durationQa?.failureCode === "DRAFT_DURATION_TOO_LONG" ? "shorten" : "expand";
  const sourceContext = source.mode === "url"
    ? [
        `Source URL: ${source.url}`,
        `Source title: ${source.title}`,
        `Source body:\n${source.body}`,
      ].join("\n")
    : `Keyword: ${source.keyword}`;
  return [
    "Repair this Korean YouTube draft and return one valid JSON object only.",
    "Do not include markdown or commentary.",
    `The previous draft failed duration QA. It must ${direction} the Korean narration.`,
    `Target duration: ${target.seconds} seconds.`,
    `Previous estimated narration: ${durationQa?.estimatedSeconds || "unknown"} seconds.`,
    `Allowed narration estimate: ${durationQa?.minSeconds || Math.round(target.seconds * 0.7)}-${durationQa?.maxSeconds || Math.round(target.seconds * (target.seconds >= 600 ? 1.18 : 1.14))} seconds.`,
    `Target Korean spoken narration length: ${target.charsMin}-${target.charsMax} non-space Korean characters.`,
    "Keep HPSL structure. Expand mainly the Story section with concrete context, contrast, example, and consequence. Do not repeat sentences.",
    "Keep the title short enough for the top video overlay: 18 Korean characters or fewer excluding spaces.",
    "For URL jobs, rewrite the source idea in a copyright-safe way instead of copying article sentences.",
    "Keep every scene narration aligned with the repaired HPSL script, and keep Flow prompts policy-safe.",
    "",
    "SOURCE:",
    sourceContext,
    "",
    "PREVIOUS_DRAFT_JSON:",
    JSON.stringify(previousDraft),
  ].join("\n");
}

function assertDraftMatchesSource(draft, source) {
  if (source.mode !== "keyword") return;
  const tokens = String(source.keyword || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  if (!tokens.length) return;
  const haystack = [
    draft.title,
    draft.script,
    ...(Array.isArray(draft.scenes) ? draft.scenes.map((scene) => scene.narration) : []),
  ].join(" ");
  const matched = tokens.some((token) => haystack.includes(token));
  if (!matched) {
    throw new Error(`draft did not reflect keyword "${source.keyword}"`);
  }
}

async function requestDraft({ key, model, prompt, maxTokens = 2600 }) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost/hermes-youtube-studio",
      "X-Title": "Hermes YouTube Studio",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  const json = await response.json().catch(() => ({}));
  const content = json.choices?.[0]?.message?.content;
  if (!response.ok || !content) {
    throw new Error(json.error?.metadata?.raw || json.error?.message || response.statusText || `HTTP ${response.status}`);
  }

  const draft = parseJsonMarkdown(content);
  if (!draft) throw new Error(`empty or invalid draft JSON: ${String(content).slice(0, 300)}`);
  return draft;
}
