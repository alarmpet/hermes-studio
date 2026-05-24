import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeYouTubeDraft, parseJsonMarkdown } from "../../youtube-workflow.mjs";
import { SCRIPT_LENGTH_PRESETS } from "../../youtube-job-schema.mjs";

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
      assertDraftMatchesSource(draft, source);
      return normalizeYouTubeDraft(draft);
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
    sceneCount: Math.max(3, Math.min(10, Math.round(seconds / 12))),
    wordsMin: Math.max(70, Math.round(seconds * 2.2)),
    wordsMax: Math.max(95, Math.round(seconds * 2.8)),
  };
}

async function fetchArticleSource(url) {
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
    "{\"title\":\"string\",\"character_profile\":\"English stable recurring human presenter/lead description\",\"duration_seconds\":90,\"script\":\"Korean spoken narration\",\"scenes\":[{\"order\":1,\"narration\":\"Korean spoken line\",\"image_prompt\":\"English 9:16 cinematic video prompt\",\"duration_seconds\":8}]}",
    "Rules:",
    "- Write the script in natural spoken Korean.",
    "- The title, script, and every scene must stay tightly focused on the user-provided keyword or article.",
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
    "Make scene count proportional to the script. Each scene should have one clear visual beat.",
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

async function requestDraft({ key, model, prompt }) {
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
      max_tokens: 2600,
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
