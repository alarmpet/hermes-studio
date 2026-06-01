#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { Codex } from "@openai/codex-sdk";
import ffmpegPath from "ffmpeg-static";
import {
  buildFlowPromptFromDraft as ytBuildFlowPromptFromDraft,
  buildYouTubeDraftPrompt as ytBuildYouTubeDraftPrompt,
  applyConsistentCharacterProfile as ytApplyConsistentCharacterProfile,
  extractTargetUrl as ytExtractTargetUrl,
  normalizeYouTubeDraft as ytNormalizeYouTubeDraft,
  normalizeYoutubeInput as ytNormalizeYoutubeInput,
  parseJsonMarkdown as ytParseJsonMarkdown,
} from "./youtube-workflow.mjs";
import { runYouTubeJob } from "./youtube-job-runner.mjs";
import { createDefaultYouTubeStages } from "./youtube-workflow-stages.mjs";
import { mirrorWorkflowEventToDb } from "./workflow-db-events.mjs";

const ROOT = "C:/Users/amd/hermes";
const OPENCLAW_CONFIG = "C:/Users/amd/.openclaw/openclaw.json";
const LOCAL_CONFIG = `${ROOT}/telegram-flow-news-config.json`;
const OFFSET_FILE = `${ROOT}/telegram-flow-offset.json`;
const STATE_FILE = `${ROOT}/telegram-flow-state.json`;
const TASK_LOG_FILE = `${ROOT}/outputs/telegram-task-events.jsonl`;
const DB_HELPER = `${ROOT}/bot_db_helper.py`;
const OUTPUT_DIR = `${ROOT}/outputs`;
const HEARTBEAT_FILE = `${OUTPUT_DIR}/worker-heartbeat.json`;
const OPENROUTER_KEY_FILE = `${ROOT}/openrouter.txt.txt`;
const BYBIT_GUIDE_FILE = `${ROOT}/bybit.md`;
const BYBIT_SKILL_FILE = `${ROOT}/integrations/bybit/SKILL.md`;
const BYBIT_MCP_PACKAGE = "bybit-official-trading-server@latest";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
function parseOptionalBool(value) {
  if (value == null || String(value).trim() === "") return null;
  return /^(1|true|yes)$/i.test(String(value).trim());
}
const OPENROUTER_ENABLED_OVERRIDE = parseOptionalBool(process.env.HERMES_ENABLE_OPENROUTER);
const CODEX_MODELS = (process.env.HERMES_CODEX_MODELS || "gpt-5.3-codex-spark,gpt-5.3-codex,gpt-5.4")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const CODEX_BLOCK_MS = Number(process.env.HERMES_CODEX_BLOCK_MS || 10 * 60 * 1000);
const CODEX_AUTH_BLOCK_MS = Number(process.env.HERMES_CODEX_AUTH_BLOCK_MS || 30 * 60 * 1000);
const CODEX_CLI_JS = process.env.HERMES_CODEX_CLI_JS || `${ROOT}/node_modules/@openai/codex/bin/codex.js`;
const FLOW_URL = "https://labs.google/fx/ko/tools/flow";
const PROFILE_DIR = `${ROOT}/.aistudio-browser-profile`;
const GEMINI_PROFILE_DIR = `${ROOT}/.gemini-browser-profile`;
const CDP_PORT = 9227;
const SIMULATE_NO_SEND = process.argv.includes("--simulate-no-send");
const WARN_PLAINTEXT_SECRETS = /^(1|true|yes)$/i.test(process.env.HERMES_WARN_PLAINTEXT_SECRETS || "");
let simulatedMessageId = 900000;

const ko = {
  naverUpperAck: "\uC811\uC218: \uB124\uC774\uBC84 \uC99D\uAD8C \uC0C1\uD55C\uAC00 \uD398\uC774\uC9C0\uB97C Playwright\uB85C \uC5F4\uC5B4 \uCEA1\uCC98\uD558\uACE0 \uC885\uBAA9\uC744 \uCD94\uCD9C\uD569\uB2C8\uB2E4.",
  naverUpperDone: "\uB124\uC774\uBC84 \uC0C1\uD55C\uAC00 \uC885\uBAA9 \uCEA1\uCC98/\uCD94\uCD9C \uC644\uB8CC",
  source: "\uCD9C\uCC98",
  currentPrice: "\uD604\uC7AC\uAC00",
  changeRate: "\uB4F1\uB77D\uB960",
  volume: "\uAC70\uB798\uB7C9",
  naverUpperCaption: "\uB124\uC774\uBC84 \uC0C1\uD55C\uAC00 \uD398\uC774\uC9C0 \uCEA1\uCC98",
  naverChartAck: "\uC811\uC218: \uC0C1\uD55C\uAC00 \uC885\uBAA9 \uBAA9\uB85D\uACFC \uB300\uD45C 3\uAC1C \uCC28\uD2B8 \uC774\uBBF8\uC9C0\uB97C \uCEA1\uCC98\uD574 \uBCF4\uB0B4\uB4DC\uB9B4\uAC8C\uC694.",
  naverChartDone: "\uB300\uD45C \uC0C1\uD55C\uAC00 \uC885\uBAA9 \uCC28\uD2B8 \uCEA1\uCC98 \uC644\uB8CC",
  naverChartCaption: "\uC0C1\uD55C\uAC00 \uC885\uBAA9 \uCC28\uD2B8",
  naverDaily3yCaption: "3\uB144 \uC77C\uBD09 \uAE30\uC900 \uCC28\uD2B8",
  imageSendAck: "\uCD5C\uADFC \uC0DD\uC131\uB41C \uC774\uBBF8\uC9C0\uB97C \uD154\uB808\uADF8\uB7A8\uC73C\uB85C \uC804\uC1A1\uD569\uB2C8\uB2E4.",
  imageSendMissing: "\uC804\uC1A1\uD560 \uCD5C\uADFC \uC774\uBBF8\uC9C0 \uD30C\uC77C\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  imageCaption: "\uC774\uBBF8\uC9C0",
  taskRecovered: "\uBB38\uC81C\uAC00 \uC0DD\uACA8 \uBCF5\uAD6C \uACBD\uB85C\uB85C \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4.",
  taskFailed: "\uC694\uCCAD \uCC98\uB9AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  noActiveJob: "\uD604\uC7AC \uC9C4\uD589 \uC911\uC778 \uC791\uC5C5\uC740 \uC5C6\uC2B5\uB2C8\uB2E4. \uC0C8 \uC694\uCCAD\uC744 \uBCF4\uB0B4\uBA74 \uBC14\uB85C \uCC98\uB9AC\uD569\uB2C8\uB2E4.",
  busy: "\uC774\uBBF8 \uB2E4\uB978 \uC694\uCCAD\uC744 \uCC98\uB9AC \uC911\uC785\uB2C8\uB2E4",
  statusHint: "\uC0C1\uD0DC \uD655\uC778: /status",
  naverChartOption3: "\uC885\uBAA9 \uBAA9\uB85D\uC744 \uBA3C\uC800 \uBCF4\uB0C5\uB2C8\uB2E4. \uCC28\uD2B8\uB97C \uBCF4\uACE0 \uC2F6\uC740 \uC885\uBAA9\uBA85\uC744 \uB2E4\uC2DC \uBCF4\uB0B4\uC8FC\uC138\uC694.",
  genericAck: "\uC811\uC218: \uC694\uCCAD\uC744 \uC9C1\uC811 \uCC98\uB9AC\uD574\uBCF4\uACA0\uC2B5\uB2C8\uB2E4. \uC124\uCE58/\uC870\uD68C/\uC2E4\uD589\uC774 \uD544\uC694\uD558\uBA74 \uC81C\uAC00 \uC2E4\uD589\uD558\uACE0 \uACB0\uACFC\uB97C \uC54C\uB824\uB4DC\uB9B4\uAC8C\uC694.",
  heartbeat: "\uCC98\uB9AC \uC911\uC785\uB2C8\uB2E4",
  heartbeatSuffix: "\uCD08 \uACBD\uACFC). \uC124\uCE58/\uBE0C\uB77C\uC6B0\uC800/\uAC80\uC0C9 \uC791\uC5C5\uC740 \uC2DC\uAC04\uC774 \uAC78\uB9B4 \uC218 \uC788\uC5B4\uC694. \uACC4\uC18D \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4.",
  cancelRequested: "\uCDE8\uC18C \uC694\uCCAD\uC744 \uBC1B\uC558\uC2B5\uB2C8\uB2E4. \uD604\uC7AC \uC791\uC5C5\uC744 \uC911\uB2E8\uD558\uACE0 \uC0C1\uD0DC\uB97C \uC815\uB9AC\uD569\uB2C8\uB2E4.",
  cancelNoActive: "\uD604\uC7AC \uCDE8\uC18C\uD560 \uC9C4\uD589 \uC911 \uC791\uC5C5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  jobQueued: "\uC791\uC5C5\uC744 \uB4F1\uB85D\uD588\uC2B5\uB2C8\uB2E4.",
  jobCancelled: "\uC694\uCCAD\uC5D0 \uB530\uB77C \uC791\uC5C5\uC744 \uCDE8\uC18C\uD588\uC2B5\uB2C8\uB2E4.",
};

async function fetchWithRetry(url, options = {}, { attempts = 4, retryDelayMs = 1500, label = "fetch" } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      console.error(`${label} failed (attempt ${attempt}/${attempts}): ${error.message || error}`);
      if (attempt < attempts) await delay(retryDelayMs * attempt);
    }
  }
  throw lastError;
}

function usage() {
  return `Usage:
  node .\\telegram-flow-news-bot.mjs --watch
  node .\\telegram-flow-news-bot.mjs --once
  node .\\telegram-flow-news-bot.mjs --run-now --chat-id -5149180837
  node .\\telegram-flow-news-bot.mjs --test-generic "Bitcoin RSI quick explanation"
  node .\\telegram-flow-news-bot.mjs --test-classify "요청 텍스트"
  node .\\telegram-flow-news-bot.mjs --simulate-message "요청 텍스트"
  node .\\telegram-flow-news-bot.mjs --simulate-messages "요청1|||요청2"
  node .\\telegram-flow-news-bot.mjs --dry-run

What it handles:
  Telegram messages for general replies, latest AI news summaries, and optional Flow video generation.

Requirements:
  - Telegram bot token in C:/Users/amd/.openclaw/openclaw.json
  - OpenRouter key in C:/Users/amd/hermes/openrouter.txt.txt for normal Hermes replies
  - Chrome logged into Google Flow only when Flow video generation is requested:
    ${PROFILE_DIR}
`;
}

function arg(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function decodeHtml(value = "") {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function readConfig() {
  const envToken = process.env.HERMES_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  try {
    const local = JSON.parse(await readFile(LOCAL_CONFIG, "utf8"));
    if (envToken || local.botToken) {
      if (WARN_PLAINTEXT_SECRETS && !envToken && local.botToken) console.error("Security warning: Telegram bot token loaded from plaintext local config. Prefer HERMES_BOT_TOKEN.");
      return {
        token: envToken || local.botToken,
        allowFrom: new Set((local.allowFrom ?? []).map(String)),
        groupAllowFrom: new Set((local.groupAllowFrom ?? local.allowFrom ?? []).map(String)),
        allowedGroups: new Set(Object.keys(local.groups ?? {}).map(String)),
      };
    }
  } catch {
    // Fall back to OpenClaw config for older installs.
  }

  const config = JSON.parse(await readFile(OPENCLAW_CONFIG, "utf8"));
  const telegram = config.channels?.telegram ?? {};
  if (WARN_PLAINTEXT_SECRETS && !envToken && telegram.botToken) console.error("Security warning: Telegram bot token loaded from plaintext OpenClaw config. Prefer HERMES_BOT_TOKEN.");
  if (!envToken && !telegram.botToken) throw new Error("Telegram bot token not found in environment or OpenClaw config.");
  return {
    token: envToken || telegram.botToken,
    allowFrom: new Set((telegram.allowFrom ?? []).map(String)),
    groupAllowFrom: new Set((telegram.groupAllowFrom ?? telegram.allowFrom ?? []).map(String)),
    allowedGroups: new Set(Object.keys(telegram.groups ?? {}).map(String)),
  };
}

async function readOpenRouterKey() {
  const envKey = process.env.OPENROUTER_API_KEY || process.env.HERMES_OPENROUTER_API_KEY;
  if (envKey) return envKey.trim();
  const key = await readFile(OPENROUTER_KEY_FILE, "utf8").then((value) => value.trim()).catch(() => "");
  if (WARN_PLAINTEXT_SECRETS && key) console.error("Security warning: OpenRouter key loaded from plaintext file. Prefer OPENROUTER_API_KEY.");
  return key;
}

async function isOpenRouterEnabled() {
  if (OPENROUTER_ENABLED_OVERRIDE !== null) return OPENROUTER_ENABLED_OVERRIDE;
  const key = await readOpenRouterKey();
  return Boolean(key);
}

async function telegram(method, payload = {}, file) {
  if (SIMULATE_NO_SEND) {
    const result = {
      message_id: simulatedMessageId += 1,
      chat: { id: payload.chat_id ?? "simulate-chat", type: "private" },
      text: payload.text,
      caption: payload.caption,
      method,
      file: file?.path,
    };
    console.log(JSON.stringify({ simulateTelegram: true, method, payload, file: file?.path, result }, null, 2));
    return result;
  }

  const { token } = await readConfig();
  const url = `https://api.telegram.org/bot${token}/${method}`;

  if (file) {
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null) form.append(key, String(value));
    }
    const bytes = await readFile(file.path);
    form.append(file.field, new Blob([bytes], { type: file.mimeType }), basename(file.path));
    const response = await fetchWithRetry(url, { method: "POST", body: form }, { label: `Telegram ${method}` });
    const json = await response.json();
    if (!json.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(json)}`);
    return json.result;
  }

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, { label: `Telegram ${method}` });
  const json = await response.json();
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(json)}`);
  return json.result;
}

async function sendMessage(chatId, text, replyToMessageId) {
  const value = String(text ?? "");
  if (value.length > 3500) {
    const chunks = splitTelegramText(value);
    let lastResult = null;
    for (const chunk of chunks) {
      lastResult = await sendMessage(chatId, chunk, replyToMessageId);
    }
    return lastResult;
  }
  if (typeof text === "string" && (text.includes(String.fromCharCode(0xfffd)))) {
    console.error(`Possible mojibake outgoing message: ${text.slice(0, 300)}`);
  }
  const result = await telegram("sendMessage", {
    chat_id: chatId,
    text: value,
    reply_to_message_id: replyToMessageId,
    disable_web_page_preview: true,
  });
  logChatMessageToDb({
    chatId,
    messageId: result?.message_id,
    role: "assistant",
    text: value,
    meta: { replyToMessageId, telegramMethod: "sendMessage" },
  }).catch(() => {});
  return result;
}

function splitTelegramText(text, maxLength = 3500) {
  const value = String(text || "");
  if (value.length <= maxLength) return [value];
  const chunks = [];
  let remaining = value;
  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf("\n", maxLength);
    if (cut < Math.floor(maxLength * 0.6)) cut = remaining.lastIndexOf(" ", maxLength);
    if (cut < Math.floor(maxLength * 0.6)) cut = maxLength;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks.length ? chunks : [""];
}

async function sendLongMessage(chatId, text, replyToMessageId) {
  const chunks = splitTelegramText(text);
  let lastResult = null;
  for (const chunk of chunks) {
    lastResult = await sendMessage(chatId, chunk, replyToMessageId);
  }
  return lastResult;
}

async function editMessage(chatId, messageId, text) {
  const value = String(text ?? "");
  const safeText = value.length > 3800 ? `${value.slice(0, 3800)}\n\n...메시지 길이 제한으로 일부 생략` : value;
  if (typeof text === "string" && (text.includes(String.fromCharCode(0xfffd)))) {
    console.error(`Possible mojibake outgoing message: ${text.slice(0, 300)}`);
  }
  return telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: safeText,
    disable_web_page_preview: true,
  });
}

async function sendJobAck(chatId, text, replyToMessageId) {
  const ack = await sendMessage(chatId, text, replyToMessageId);
  if (currentJob) {
    currentJob.ackMessageId = ack.message_id;
  }
  return ack;
}

async function sendVideo(chatId, path, caption, replyToMessageId) {
  const result = await telegram("sendVideo", {
    chat_id: chatId,
    caption,
    reply_to_message_id: replyToMessageId,
    supports_streaming: true,
  }, { field: "video", path, mimeType: "video/mp4" });
  await logArtifactToDb({ chatId, messageId: result?.message_id, kind: "video", path, caption, meta: { replyToMessageId } });
  await logChatMessageToDb({ chatId, messageId: result?.message_id, role: "assistant", text: `[video] ${caption || path}`, meta: { path, replyToMessageId } });
  return result;
}

async function sendPhoto(chatId, path, caption, replyToMessageId) {
  const result = await telegram("sendPhoto", {
    chat_id: chatId,
    caption,
    reply_to_message_id: replyToMessageId,
  }, { field: "photo", path, mimeType: "image/png" });
  await logArtifactToDb({ chatId, messageId: result?.message_id, kind: "photo", path, caption, meta: { replyToMessageId } });
  await logChatMessageToDb({ chatId, messageId: result?.message_id, role: "assistant", text: `[photo] ${caption || path}`, meta: { path, replyToMessageId } });
  return result;
}

async function getUpdates(offset, timeout = 0) {
  const { token } = await readConfig();
  const params = new URLSearchParams({
    timeout: String(timeout),
    allowed_updates: JSON.stringify(["message", "callback_query"]),
  });
  if (offset) params.set("offset", String(offset));
  const response = await fetchWithRetry(`https://api.telegram.org/bot${token}/getUpdates?${params}`, {}, { attempts: 3, retryDelayMs: 2000, label: "Telegram getUpdates" });
  const json = await response.json();
  if (!json.ok && json.error_code === 409) {
    return { conflict: true, description: json.description, result: [] };
  }
  if (!json.ok) throw new Error(`getUpdates failed: ${JSON.stringify(json)}`);
  return json.result;
}

async function readOffset() {
  try {
    return JSON.parse(await readFile(OFFSET_FILE, "utf8")).offset;
  } catch {
    return null;
  }
}

async function writeOffset(offset) {
  await writeJsonAtomic(OFFSET_FILE, { offset, updatedAt: new Date().toISOString() });
}

async function writeJsonAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, path);
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return { chats: {} };
  }
}

async function writeState(state) {
  await writeJsonAtomic(STATE_FILE, state);
}

async function logTaskEvent(event) {
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await appendFile(TASK_LOG_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8");
    const jobId = event.jobId || currentJob?.jobId || "";
    await logTaskEventToDb(
      event.type || "event",
      event.taskName || "",
      { chat: { id: event.chatId ?? "" }, message_id: event.messageId ?? "" },
      jobId,
      event,
    );
  } catch (error) {
    console.error(`Task event log failed: ${safeErrorMessage(error)}`);
  }
}

async function rememberChatNews(chatId, items) {
  const session = await readSessionFromDb(chatId);
  session.lastNewsItems = items;
  session.lastNewsAt = new Date().toISOString();
  await writeSessionToDb(chatId, session);

  const state = await readState();
  state.chats ??= {};
  state.chats[String(chatId)] = {
    ...state.chats[String(chatId)],
    lastNewsItems: items,
    lastNewsAt: new Date().toISOString(),
  };
  await writeState(state);
}

async function rememberedChatNews(chatId) {
  const session = await readSessionFromDb(chatId);
  if (Array.isArray(session.lastNewsItems) && session.lastNewsItems.length) return session.lastNewsItems;
  const state = await readState();
  return state.chats?.[String(chatId)]?.lastNewsItems ?? [];
}

function safeErrorMessage(error) {
  return (error?.message || String(error)).replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[redacted]");
}

function isAuthErrorMessage(message) {
  return /auth|login|token|unauthorized|forbidden|credential|sign in|device/i.test(message);
}

async function codexCircuitAllows(model) {
  const state = await readState();
  const record = state.codex?.models?.[model];
  return !record?.blockedUntil || Date.parse(record.blockedUntil) <= Date.now();
}

async function recordCodexSuccess(model, latencyMs) {
  const state = await readState();
  state.codex ??= {};
  state.codex.models ??= {};
  state.codex.models[model] = {
    failures: 0,
    blockedUntil: null,
    lastError: null,
    lastSuccessAt: new Date().toISOString(),
    lastLatencyMs: latencyMs,
  };
  await writeState(state);
}

async function recordCodexFailure(model, error) {
  const message = safeErrorMessage(error);
  const state = await readState();
  state.codex ??= {};
  state.codex.models ??= {};
  const previous = state.codex.models[model] ?? {};
  const failures = (previous.failures ?? 0) + 1;
  const authFailure = isAuthErrorMessage(message);
  const shouldBlock = authFailure || failures >= 3;
  state.codex.models[model] = {
    failures,
    blockedUntil: shouldBlock ? new Date(Date.now() + (authFailure ? CODEX_AUTH_BLOCK_MS : CODEX_BLOCK_MS)).toISOString() : null,
    lastError: message.slice(0, 500),
    lastFailureAt: new Date().toISOString(),
  };
  await writeState(state);
}

function messageText(message) {
  return message.text || message.caption || "";
}

function isShortContinuationRequest(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || trimmed.length > 40) return false;
  return /^(?:\uC9C4\uD589(?:\uD574|\uD574\uC918)?|\uACC4\uC18D(?:\s*\uC9C4\uD589)?(?:\uD574|\uD574\uC918)?|\uB2E4\uC2DC\s*\uC2DC\uC791(?:\uD574|\uD574\uC918)?|\uC7AC\uC2DC\uC791(?:\uD574|\uD574\uC918)?|\uC2DC\uC791(?:\uD574|\uD574\uC918)?|\uC791\uC131(?:\uD574|\uD574\uC918)?|\uD574\uC918|\uD574\uBD10|\uAC00\uC790|\uC751|\uB124|yes|ok|restart|start|[123]\s*\uBC88?)(?:\s|$)/i.test(trimmed);
}

function hasBacktestArchitectureTerms(text) {
  return /(?:backtest|bybit|linear|pattern_agents|SignalOrchestrator|MeanReversionAgent|TrendBreakoutAgent|signal adapter|backtest runner|report layer|auto-trade|quant|trading|\uBC31\uD14C\uC2A4\uD2B8|\uC790\uB3D9\uB9E4\uB9E4|\uD000\uD2B8|\uC804\uB7B5|\uC2E0\uD638|\uD3EC\uC9C0\uC158|\uC218\uC218\uB8CC|\uD380\uB529|\uC774\uCFE0\uD2F0|\uC124\uACC4|\uAD6C\uD604)/i.test(String(text || ""));
}

function isBybitRequest(text) {
  return /\bbybit\b|BYBIT|USDT\s*(?:perp|linear)|linear\s*(?:perp|futures)|BTCUSDT|ETHUSDT|V5 API|backtest|spot|perpetual|portfolio|hedged/i.test(String(text || ""));
}

function isBybitBacktestWorkflowRequest(text) {
  const value = String(text || "");
  const hasDirectionCompare = /(?:\uAC19\uC740\s*\uB370\uC774\uD130|\uBC29\uAE08|\uC774\uC804|same|previous|last).{0,40}(?:\uB871|\uC1FC\uD2B8|long|short|reverse|normal|\uBC18\uB300|\uC5ED\uBC29\uD5A5|\uBE44\uAD50|compare)/i.test(value)
    || /(?:\uB871|\uC1FC\uD2B8|long|short|reverse|normal|\uBC18\uB300|\uC5ED\uBC29\uD5A5).{0,40}(?:\uAC19\uC740\s*\uB370\uC774\uD130|\uBC29\uAE08|\uC774\uC804|same|previous|last|\uBE44\uAD50|compare)/i.test(value);
  if (!isBybitRequest(value) && !hasDirectionCompare) return false;

  const hasExecutionIntent = /(?:\uBC31\uD14C\uC2A4\uD2B8\s*\uD574|\uC7AC\uBC31\uD14C\uC2A4\uD2B8|\uD14C\uC2A4\uD2B8\s*\uD574|\uC2E4\uD589|\uC870\uD68C|\uC218\uC9D1|\uAC80\uC0B0|\uBE44\uAD50|compare|backtest\b|\brun\b|\bfetch\b|\bcollect\b|normal|reverse|\uCD5C\uADFC|\uB871|\uC1FC\uD2B8|long|short|\uBC18\uB300|\uC5ED\uBC29\uD5A5)/i.test(value);
  if (!hasExecutionIntent) return false;

  const hasDesignTerms = /(?:\uC124\uACC4|\uACC4\uD68D|\uC791\uC131|\uCF54\uB4DC|\uC2A4\uD141|\uC778\uD130\uD398\uC774\uC2A4|architecture|plan|stub|write)/i.test(value)
    || /(?:signal_adapter|backtest_runner|summary\s*\+\s*trades\s*\+\s*equity|interface|spec)/i.test(value);
  const isDesignOnly = hasDesignTerms
    && !/(?:\uC2E4\uD589|\uC870\uD68C|\uC218\uC9D1|\uBE44\uAD50|compare|\brun\b|\bfetch\b|\bcollect\b|\uBC31\uD14C\uC2A4\uD2B8\s*\uD574|\uD14C\uC2A4\uD2B8\s*\uD574)/i.test(value);
  return !isDesignOnly;
}

function wantsArtifactContext(text) {
  const value = String(text || "");
  if (isSendLatestImagesRequest(value) || isChartAnnotationFollowupRequest(value) || isKrxYtdTopChartRequest(value)) return true;
  return /(?:\uC774\uBBF8\uC9C0|\uC0AC\uC9C4|\uCC28\uD2B8|\uD30C\uC77C|\uCEA1\uCC98|\uC2A4\uD06C\uB9B0\uC0F7|png|jpe?g|webp)/i.test(value)
    && /(?:\uBCF4\uB0B4|\uC804\uC1A1|\uC62C\uB824|\uCCA8\uBD80|\uB2E4\uC2DC|\uD45C\uC2DC|\uD45C\uAE30|\uB9C8\uD0B9|\uADF8\uB824|\uC218\uC815|\uCC38\uC870)/i.test(value);
}

function wantsNaverToolContext(text) {
  const value = String(text || "");
  return isNaverUpperLimitRequest(value) || isKrxYtdTopChartRequest(value) || /(?:naver|\uB124\uC774\uBC84|\uAD6D\uB0B4\s*\uC8FC\uC2DD|\uD55C\uAD6D\s*\uC8FC\uC2DD|\uC0C1\uD55C\uAC00)/i.test(value);
}

function isAuthorized(message, config) {
  const fromId = String(message.from?.id ?? "");
  const chatId = String(message.chat?.id ?? "");
  if (message.chat?.type === "private") return config.allowFrom.size === 0 || config.allowFrom.has(fromId);
  if (config.allowedGroups.size && !config.allowedGroups.has("*") && !config.allowedGroups.has(chatId)) return false;
  return config.groupAllowFrom.size === 0 || config.groupAllowFrom.has(fromId);
}

function isFlowNewsRequest(text) {
  const lower = text.toLowerCase();
  if (hasFlowNegation(text)) return false;
  if (/(^|\s|@)\/?flownews\b/i.test(lower) || /(^|\s)!flownews\b/i.test(lower)) return true;
  return hasExplicitFlowIntent(text)
    && /(?:ai|artificial intelligence|\uC778\uACF5\uC9C0\uB2A5)/i.test(text)
    && /(?:\uB274\uC2A4|news)/i.test(text);
}

function hasExplicitFlowIntent(text) {
  const lower = String(text || "").toLowerCase();
  const hasCommand = /(^|\s|@)\/?(?:flow|flownews)\b/i.test(lower) || /(^|\s)!(?:flow|flownews)\b/i.test(lower);
  const hasVideoCommand = /(^|\s|@)\/?(?:video|shorts)\b/i.test(lower)
    && /(?:\uC601\uC0C1|\uC1FC\uCE20|shorts|video|generate|create|make|\uB9CC\uB4E4|\uC0DD\uC131)/i.test(text);
  const hasGoogleFlow = /(?:google\s*flow|\uAD6C\uAE00\s*\uD50C\uB85C\uC6B0|\uAD6C\uAE00\s*flow)/i.test(text)
    || /(?:\uD50C\uB85C\uC6B0|flow).{0,12}(?:\uC601\uC0C1|\uC1FC\uCE20|video|shorts|\uB9CC\uB4E4|\uC0DD\uC131)/i.test(text)
    || /(?:\uC601\uC0C1|\uC1FC\uCE20|video|shorts|\uB9CC\uB4E4|\uC0DD\uC131).{0,12}(?:\uD50C\uB85C\uC6B0|flow)/i.test(text);
  return hasCommand
    || hasVideoCommand
    || hasGoogleFlow
    || /(?:\uC601\uC0C1|\uC1FC\uCE20|shorts|video).{0,16}(?:\uB9CC\uB4E4|\uC0DD\uC131|generate|create|make)/i.test(text)
    || /(?:\uB9CC\uB4E4|\uC0DD\uC131|generate|create|make).{0,16}(?:\uC601\uC0C1|\uC1FC\uCE20|shorts|video)/i.test(text);
}

function hasFlowNegation(text) {
  return /(?:\uC601\uC0C1|\uC1FC\uCE20|shorts|video|flow|\uD50C\uB85C\uC6B0).{0,16}(?:\uD558\uC9C0\uB9C8|\uB9D0\uACE0|\uD544\uC694\uC5C6|no|not)/i.test(text)
    || /(?:\uD558\uC9C0\uB9C8|\uB9D0\uACE0|\uD544\uC694\uC5C6|no|not).{0,16}(?:\uC601\uC0C1|\uC1FC\uCE20|shorts|video|flow|\uD50C\uB85C\uC6B0)/i.test(text);
}

function isNewsSummaryRequest(text) {
  const lower = text.toLowerCase();
  if (lower.includes("cookie") || text.includes("\uCFE0\uD0A4")) return false;
  const hasNews = /(?:\uB274\uC2A4|news)/i.test(text);
  const wantsSummary = /(?:\uC694\uC57D|\uC815\uB9AC|\uAC80\uC0C9|\uCC3E\uC544|\uC54C\uB824|brief|summary|summarize|search)/i.test(text);
  return hasNews && wantsSummary;
}

function requestedNewsCount(text, fallback = 3) {
  const match = text.match(/(\d+)\s*(?:\uAC1C|\uAC74|\uAC00\uC9C0)?/);
  if (!match) return fallback;
  return Math.max(1, Math.min(10, Number(match[1]) || fallback));
}

function referencedNewsIndex(text) {
  const digit = text.match(/(?:^|\s)(\d+)\s*(?:\uBC88|\uBC88\uC9F8)\s*(?:\uB274\uC2A4|\uAE30\uC0AC|\uD56D\uBAA9)?|(?:\uB274\uC2A4|\uAE30\uC0AC|\uD56D\uBAA9)\s*(\d+)\s*\uBC88/);
  if (digit) return Number(digit[1] || digit[2]) - 1;
  if (/(?:\uCCAB|\uCCAB\uBC88\uC9F8|1\uBC88|\uD558\uB098)/.test(text)) return 0;
  if (/(?:\uB458|\uB450\uBC88\uC9F8|2\uBC88|\uC774\uBC88)/.test(text)) return 1;
  if (/(?:\uC14B|\uC138\uBC88\uC9F8|3\uBC88|\uC0BC\uBC88)/.test(text)) return 2;
  return -1;
}

function isRememberedNewsFollowup(text) {
  if (hasBacktestArchitectureTerms(text)) return false;
  if (String(text || "").length > 500 && !/(?:\uB274\uC2A4|\uAE30\uC0AC|news|article)/i.test(text)) return false;
  if (referencedNewsIndex(text) < 0) return false;
  return /(?:\uB274\uC2A4|\uAE30\uC0AC|news|article)/i.test(text)
    && /(?:\uB300\uBCF8|\uAC01\uC0C9|\uC774\uBBF8\uC9C0|\uD504\uB86C\uD504\uD2B8|\uC694\uC57D|\uC815\uB9AC|script|prompt)/i.test(text);
}

function isDirectFlowVideoRequest(text) {
  const lower = text.toLowerCase();
  if (hasFlowNegation(text)) return false;
  if (lower.includes("cookie") || text.includes("\uCFE0\uD0A4")) return false;
  return hasExplicitFlowIntent(text);
}

function isYoutubeWorkflowRequest(text) {
  const value = String(text || "");
  const lower = value.toLowerCase();
  if (hasFlowNegation(value)) return false;
  if (lower.includes("cookie") || value.includes("\uCFE0\uD0A4")) return false;
  if (/^\/(?:yturl|yt|youtube)(?:@\w+)?(?:\s|$)/i.test(value.trim())) return true;
  const hasYoutube = /(?:youtube|유튜브|쇼츠|shorts)/i.test(value);
  const wantsDraftOrAutomation = /(?:영상|video|쇼츠|shorts|대본|script|각색|프롬프트|prompt|생성|만들|자동화)/i.test(value);
  return hasYoutube && wantsDraftOrAutomation;
}

function isStartOrHelpRequest(text) {
  return /^\/(?:start|help)(?:@\w+)?(?:\s|$)/i.test(text.trim());
}

function isStatusRequest(text) {
  const trimmed = text.trim();
  if (/^\/status(?:@\w+)?(?:\s|$)/i.test(trimmed)) return true;
  if (trimmed.length > 80) return false;
  if (/(?:\uACC4\uD68D|\uC124\uACC4|\uAD6C\uD604|\uBD84\uC11D|\uBC31\uD14C\uC2A4\uD2B8|\uCF54\uB4DC|\uC791\uC131|\uB9CC\uB4E4|\uCC3E\uC544|\uC870\uD68C|\uBCF4\uB0B4|\uC804\uC1A1|\uC0DD\uC131|\uC694\uCCAD)/i.test(trimmed)) return false;
  return /^(?:\uBA48\uCDB0\??|\uBA48\uCDB4\??|\uBA48\uCD98\s*\uAC70\uC57C\??|\uBA48\uCDA4\??|\uC0B4\uC544\uC788\uC5B4\??|\uB3CC\uC544\uAC00\??|\uC9C0\uAE08\s*(?:\uBB50\s*\uD574|\uC9C4\uD589\s*\uC911\uC774\uC57C)\??|\uC9C4\uD589\s*\uC0C1\uD0DC\s*(?:\uD655\uC778|\uC54C\uB824\uC918)?|status)$/i.test(trimmed);
}

function isLastJobRequest(text) {
  return /^\/lastjob(?:@\w+)?(?:\s+\S+)?(?:\s|$)/i.test(text.trim());
}

function parseLastJobRequestTarget(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/lastjob(?:@\w+)?(?:\s+([^\s]+))?/i);
  if (!match) return "last";
  const raw = String(match[1] || "last").trim();
  return raw || "last";
}

function isJobsRequest(text) {
  return /^\/jobs(?:@\w+)?(?:\s|$)/i.test(text.trim());
}

function isRetryRequest(text) {
  return /^\/retry(?:@\w+)?(?:\s|$)/i.test(text.trim())
    || /(?:\uB2E4\uC2DC\s*\uC2E4\uD589|\uC7AC\uC2E4\uD589|\uB2E4\uC2DC\s*\uD574|\uB2E4\uC2DC\s*\uCC98\uB9AC)(?:\uD574|\uD574\uC918|\uD574\uBD10)?$/i.test(text.trim());
}

function isFailuresRequest(text) {
  return /^\/failures(?:@\w+)?(?:\s|$)/i.test(text.trim());
}

function isMemoryListRequest(text) {
  return /^\/(?:memory|memories)(?:@\w+)?(?:\s|$)/i.test(text.trim())
    || /(?:\uAE30\uC5B5|\uBA54\uBAA8\uB9AC).{0,10}(?:\uBCF4\uC5EC|\uBAA9\uB85D|\uD655\uC778)/i.test(text.trim());
}

function isContextListRequest(text) {
  return /^\/context(?:@\w+)?(?:\s|$)/i.test(text.trim())
    || /(?:\uB300\uD654\s*\uB9E5\uB77D|\uB9E5\uB77D|\uCD5C\uADFC\s*\uB300\uD654).{0,10}(?:\uBCF4\uC5EC|\uBAA9\uB85D|\uD655\uC778)/i.test(text.trim());
}

function isCapabilitiesRequest(text) {
  return /^\/(?:capabilities|tools)(?:@\w+)?(?:\s|$)/i.test(text.trim())
    || /(?:\uB3C4\uAD6C|\uAE30\uB2A5|\uBB50\s*\uD560\s*\uC218).{0,12}(?:\uBAA9\uB85D|\uBCF4\uC5EC|\uC788)/i.test(text.trim());
}

function isEmbeddingReindexRequest(text) {
  return /^\/(?:reindex|embed|embeddings)(?:@\w+)?(?:\s|$)/i.test(text.trim())
    || /(?:embedding|semantic|\uC784\uBCA0\uB529|\uC2DC\uB9E8\uD2F1).{0,16}(?:\uC7AC\uC0DD\uC131|\uC7AC\uC0DD\uC131|\uC778\uB371\uC2A4|\uAC80\uC0C9|\uBD99\uC5EC|\uAD6C\uCD95)/i.test(text.trim());
}

function isDiagnoseRequest(text) {
  return /^\/diagnose(?:@\w+)?(?:\s|$)/i.test(text.trim());
}

function isSelfTestRequest(text) {
  return /^\/selftest(?:@\w+)?(?:\s|$)/i.test(text.trim());
}

function isCancelRequest(text) {
  const trimmed = text.trim();
  return /^\/(?:cancel|stop)(?:@\w+)?(?:\s|$)/i.test(trimmed)
    || /(?:\uCDE8\uC18C|\uC911\uB2E8|\uBA48\uCDB0|\uADF8\uB9CC|\uC2A4\uD1B1|\uC815\uC9C0)(?:\uD574|\uD574\uC918|\uD558\uC138\uC694)?$/i.test(trimmed);
}

function isYoutubeRequest(text) {
  const trimmed = String(text || "").trim();
  if (/^\/flow(?:news)?\b/i.test(trimmed) || /(?:google\s*flow|구글\s*플로우)/i.test(trimmed)) return false;
  return /^\/yt\b/i.test(trimmed)
    || (/(?:유튜브|youtube|shorts|쇼츠)/i.test(trimmed)
      && /(?:영상|비디오|대본|숏츠|쇼츠)/i.test(trimmed)
      && /(?:만들|생성|제작|렌더|자동화|올려|작성)/i.test(trimmed));
}

function isYouTubeUrlRequest(text) {
  const trimmed = String(text || "").trim();
  return /^\/yturl\b/i.test(trimmed)
    || (extractTargetUrl(trimmed)
      && /(?:유튜브|youtube|shorts|쇼츠|기사)/i.test(trimmed)
      && /(?:영상|비디오|대본|숏츠|쇼츠)/i.test(trimmed)
      && /(?:만들|생성|제작|각색|렌더|작성)/i.test(trimmed));
}

function isYouTubeFinalConfirmRequest(text) {
  const trimmed = String(text || "").replace(/\s+/g, "").trim();
  return /^(?:최종확정|최종확인|확정|렌더확정|최종렌더|최종본생성)$/i.test(trimmed);
}

function isNaverUpperLimitRequest(text) {
  return /(?:naver|\uB124\uC774\uBC84|\uC99D\uAD8C|\uC8FC\uC2DD|\uD55C\uAD6D\s*\uC99D\uC2DC|\uAD6D\uB0B4\s*\uC99D\uC2DC)/i.test(text)
    && /(?:\uC0C1\uD55C\uAC00|\uC0C1\uD55C\uAC00\s*\uC885\uBAA9|\uC0C1\uC2B9\s*\uC81C\uD55C|upper\s*limit)/i.test(text)
    && /(?:\uAC80\uC0C9|\uC870\uD68C|\uCC3E\uC544|\uCEA1\uCC98|\uC815\uB9AC|\uC54C\uB824|\uBE51\uC544|\uC2A4\uD06C\uB9B0\uC0F7)/i.test(text);
}

function isKrxYtdTopChartRequest(text) {
  const hasMarket = /(?:\uD55C\uAD6D\s*\uC8FC\uC2DD|\uAD6D\uB0B4\s*\uC8FC\uC2DD|\uD55C\uAD6D\s*\uC885\uBAA9|\uC8FC\uC2DD\s*\uC885\uBAA9|\uCF54\uC2A4\uD53C|\uCF54\uC2A4\uB2E5|KOSPI|KOSDAQ|KRX)/i.test(text);
  const hasYtd = /(?:2026|\uC62C\uD574|\uC5F0\uCD08|YTD|\uC2DC\uC791\uB418\uACE0\s*\uBD80\uD130|\uC2DC\uC791\s*\uBD80\uD130|\uC5F0\uCD08\uB300\uBE44)/i.test(text);
  const hasRanking = /(?:\uAC00\uC7A5\s*\uB9CE\uC774\s*\uC0C1\uC2B9|\uC0C1\uC2B9\uB960|\uC218\uC775\uB960|top\s*10|10\uAC1C|1\uC704.*10\uC704|1\uC704\uBD80\uD130\s*10\uC704)/i.test(text);
  const hasChart = /(?:3\uB144|\uC0BC\uB144|3\uB144\uCE58|\uC77C\uBD09|\uCC28\uD2B8)/i.test(text);
  const hasSend = /(?:\uBCF4\uB0B4|\uC804\uC1A1|\uC62C\uB824|\uCCA8\uBD80|\uD154\uB808\uADF8\uB7A8)/i.test(text);
  return (hasMarket && hasYtd && hasRanking && hasChart) || (hasYtd && hasRanking && hasChart && hasSend);
}

function isKrxNear3YHighRequest(text) {
  const value = String(text || "");
  if (/\bstocks?\b/i.test(value) && /current\s*price|latest\s*close/i.test(value) && /closest|near/i.test(value) && /3\s*year\s*high/i.test(value) && /top\s*10/i.test(value)) return true;
  const hasMarket = /(?:\uD55C\uAD6D\s*\uC8FC\uC2DD|\uAD6D\uB0B4\s*\uC8FC\uC2DD|\uD55C\uAD6D\s*\uC885\uBAA9|\uC8FC\uC2DD\s*\uC885\uBAA9|\uC885\uBAA9|\uCF54\uC2A4\uD53C|\uCF54\uC2A4\uB2E5|KOSPI|KOSDAQ|KRX|stock|stocks)/i.test(value);
  const hasHigh = /(?:3\uB144|3\uB144|\uC0BC\uB144|three\s*year).{0,16}(?:\uC2E0\uACE0\uAC00|\uCD5C\uACE0\uAC00|high)|(?:\uC2E0\uACE0\uAC00|\uCD5C\uACE0\uAC00|high).{0,16}(?:3\uB144|3\uB144|\uC0BC\uB144|three\s*year)/i.test(value);
  const hasNear = /(?:\uD604\uC7AC\uAC00|\uC885\uAC00|\uCD5C\uADFC\uAC00|current|latest).{0,24}(?:\uAC00\uAE4C\uC6B4|\uADFC\uC811|\uC778\uC811|\uAC70\uB9AC|\uAC2D|near|closest)|(?:\uAC00\uAE4C\uC6B4|\uADFC\uC811|\uC778\uC811|\uAC70\uB9AC|\uAC2D|near|closest).{0,24}(?:\uC2E0\uACE0\uAC00|\uCD5C\uACE0\uAC00|high)/i.test(value);
  const hasRanking = /(?:top\s*10|10\uAC1C|\uC0C1\uC704\s*10|\uAC00\uC7A5\s*\uAC00\uAE4C\uC6B4|\uAC00\uC7A5\s*\uADFC\uC811)/i.test(value);
  return hasMarket && hasHigh && hasNear && hasRanking;
}

function isKrxTargetReclaimRequest(text) {
  const value = String(text || "");
  const hasTarget = parseKrxTargetReclaimPrice(value) !== null;
  const hasLongBelow = /(?:3\s*\uB144|3\uB144|\uC0BC\uB144).{0,40}(?:\uBBF8\uB9CC|\uC544\uB798|\uB0AE|\uBC11|below|under)|(?:\uBBF8\uB9CC|\uC544\uB798|\uB0AE|\uBC11|below|under).{0,40}(?:3\s*\uB144|3\uB144|\uC0BC\uB144)/i.test(value);
  const hasRecentNear = /(?:\uCD5C\uADFC|1\s*\uAC1C\uC6D4|\uD55C\s*\uB2EC|\uC694\uADFC\uB798|recent|month).{0,40}(?:\uADFC\uCC98|\uAC00\uAE4C|\uC704\uCE58|\uB3C4\uB2EC|\uC885\uAC00|near|around)|(?:\uADFC\uCC98|\uAC00\uAE4C|\uC704\uCE58|\uB3C4\uB2EC|near|around).{0,40}(?:\uCD5C\uADFC|1\s*\uAC1C\uC6D4|\uD55C\s*\uB2EC|\uC694\uADFC\uB798|recent|month)/i.test(value);
  const hasStock = /(?:\uC885\uBAA9|\uC8FC\uC2DD|\uCF54\uC2A4\uD53C|\uCF54\uC2A4\uB2E5|KRX|KOSPI|KOSDAQ|stock)/i.test(value);
  return hasTarget && hasLongBelow && hasRecentNear && hasStock;
}

function parseKrxTargetReclaimPrice(text) {
  const value = String(text || "").replace(/,/g, "");
  const numeric = value.match(/(\d+(?:\.\d+)?)\s*(?:\uC6D0|won)/i);
  if (numeric) return Math.round(Number(numeric[1]));
  const man = value.match(/(\d+(?:\.\d+)?)\s*\uB9CC\s*\uC6D0?/);
  if (man) return Math.round(Number(man[1]) * 10000);
  const cheon = value.match(/(\d+(?:\.\d+)?)\s*\uCC9C\s*\uC6D0?/);
  if (cheon) return Math.round(Number(cheon[1]) * 1000);
  if (/(?:\uB9CC\s*\uC6D0|1\s*\uB9CC)/.test(value)) return 10000;
  if (/(?:\uCC9C\s*\uC6D0|1\s*\uCC9C)/.test(value)) return 1000;
  return null;
}

function isSendLatestImagesRequest(text) {
  if (isKrxYtdTopChartRequest(text)) return false;
  if (isChartAnnotationFollowupRequest(text)) return false;
  if (/(?:\uCC3E\uC544|\uC870\uD68C|\uACC4\uC0B0|\uC0DD\uC131|\uB9CC\uB4E4|\uD45C\uC2DC|\uD45C\uAE30|\uB9C8\uD0B9|\uADF8\uB824|\uBCF4\uAE30\s*\uC88B|\uB9E4\uC218|\uC9C4\uC785|\uC190\uC808|\uAD6C\uAC04|\uAC00\uC7A5\s*\uB9CE\uC774\s*\uC0C1\uC2B9|\uC0C1\uC2B9\uB960|\uC218\uC775\uB960|top\s*10|10\uAC1C|2026|\uC62C\uD574|\uC5F0\uCD08|3\uB144\uCE58)/i.test(text)) return false;
  return (
    /(?:\uC774\uBBF8\uC9C0|\uC0AC\uC9C4|\uCC28\uD2B8|png|jpg|jpeg)/i.test(text)
    && /(?:\uBCF4\uB0B4|\uC804\uC1A1|\uC62C\uB824|\uCCA8\uBD80|\uC9C1\uC811|\uD154\uB808\uADF8\uB7A8)/i.test(text)
  ) || /(?:\uC9C1\uC811|\uB098\uD55C\uD14C).*(?:\uBCF4\uB0B4|\uC804\uC1A1|\uC62C\uB824|\uCCA8\uBD80)/i.test(text);
}

function isChartAnnotationFollowupRequest(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.length > 180) return false;
  if (/(?:\uACC4\uD68D|\uC124\uACC4|\uAD6C\uD604|\uBC31\uD14C\uC2A4\uD2B8|\uC544\uD0A4\uD14D\uCC98|\uC2DC\uC2A4\uD15C|\uC5D0\uC774\uC804\uD2B8|\uD30C\uC774\uD504\uB77C\uC778|orchestrator|architecture|backtest|system|agent)/i.test(trimmed)) return false;
  return /(?:\uCC28\uD2B8|\uC774\uBBF8\uC9C0|\uD30C\uC77C)/i.test(text)
    && /(?:\uD45C\uC2DC|\uD45C\uAE30|\uB9C8\uD0B9|\uADF8\uB824|\uBCF4\uAE30\s*\uC88B|\uB9E4\uC218|\uC9C4\uC785|\uC190\uC808|\uAD6C\uAC04)/i.test(text)
    && /(?:\uBCF4\uB0B4|\uC804\uC1A1|\uC62C\uB824|\uCCA8\uBD80|\uD30C\uC77C|png|jpg|jpeg)/i.test(text);
}

function helpMessage() {
  return [
    "\uC5F0\uACB0 \uC644\uB8CC. Hermes \uBCF4\uC870 \uBD07\uC785\uB2C8\uB2E4.",
    "",
    "\uADF8\uB0E5 \uC9C8\uBB38\uD558\uAC70\uB098 \uC694\uCCAD\uC744 \uBCF4\uB0B4\uBA74 \uC9C1\uC811 \uCC98\uB9AC\uD569\uB2C8\uB2E4.",
    "",
    "\uC608:",
    "\uC624\uB298\uC790 AI \uB274\uC2A4 3\uAC1C \uC694\uC57D\uD574",
    "\uB124\uC774\uBC84\uC5D0 \uC0C1\uD55C\uAC00 \uC885\uBAA9 \uAC80\uC0C9\uD558\uACE0 \uCEA1\uCC98\uD574",
    "\uC774\uBBF8\uC9C0\uB85C \uBCF4\uB0B4\uC918",
    "/status - \uD604\uC7AC \uC791\uC5C5 \uD655\uC778",
    "/diagnose - \uB3C4\uAD6C\uACB0\uACFC \uB178\uCD9C / 실패 원인 상세",
    "/cancel - \uD604\uC7AC \uC791\uC5C5 \uCDE8\uC18C",
    "/lastjob - \uCD5C\uADFC Job \uC0AC\uD56D",
    "/jobs - \uCD5C\uADFC Job \uC0C1\uD0DC",
    "/retry - \uB9C8\uC9C0\uB9C9 \uC2E4\uD328/\uCDE8\uC18C Job \uC7AC\uC2E4\uD589",
    "/memory - 저장된 기억(우선순위/규칙) 조회",
    "/context - 최근 대화 맥락/컨텍스트 요약",
    "/selftest - 라우팅/실행 경로 자가 점검",
    "/capabilities - 지원 기능 목록 확인",
    "/reindex - \uC784\uBCA0\uB529 \uC774\uBCA4\uB4DC\uC2A4",
    "",
    "Flow \uC601\uC0C1 \uC0DD\uC131\uC740 Flow, \uD50C\uB85C\uC6B0, \uC601\uC0C1, \uC1FC\uCE20 \uB4F1\uC744 \uBA85\uC2DC\uD588\uC744 \uB54C\uB9CC \uC2E4\uD589\uD569\uB2C8\uB2E4."
  ].join("\n");
}
async function openRouterReply(text, message) {
  const key = await readOpenRouterKey();
  if (!key) throw new Error("OpenRouter key is empty.");
  const name = message.from?.first_name || message.from?.username || "user";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost/hermes-telegram",
      "X-Title": "Hermes Telegram Bot",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "You are Hermes, a helpful Korean Telegram assistant.",
            "Answer the user's message directly and naturally.",
            "Do not assume every request is about video generation.",
            "If the user asks for current news or facts, use available local context and be clear about limitations.",
            "Keep replies concise unless the user asks for detail.",
          ].join(" "),
        },
        { role: "user", content: `${name}: ${text}` },
      ],
      temperature: 0.4,
      max_tokens: 1200,
    }),
  });
  const json = await response.json();
  if (!response.ok || !json.choices?.[0]?.message?.content) {
    throw new Error(`OpenRouter failed: ${json.error?.message || response.statusText}`);
  }
  return json.choices[0].message.content.trim();
}

function strategyConstrainedPrompt(originalText, plan, evaluation) {
  if (!plan || evaluation.allowed) return originalText;
  return [
    "USER REQUEST:",
    originalText,
    "",
    "HERMES STRATEGY GATE:",
    `Planned task type: ${plan.task_type || "unknown"}`,
    `Estimated runtime: ${plan.estimated_runtime_sec || "unknown"} seconds`,
    `Risk: ${plan.risk || "unknown"}`,
    `First action proposed: ${plan.first_action || "unknown"}`,
    "",
    "Execution constraints:",
    ...evaluation.constraints.map((item) => `- ${item}`),
    "",
    "You must follow these constraints.",
    "Use a probe-first path: inspect one direct source or one local script before broad execution.",
    `Hard limits for the first attempt: at most ${evaluation.maxToolCalls || 3} tool calls and about ${evaluation.maxRuntimeSec || 90} seconds.`,
    "Do not brute-force every ticker/item/page. Prefer ranked pages, official summary endpoints, cached local files, or a small sample.",
    "If complete execution is too slow, return partial results with source notes and explain the limitation briefly.",
  ].join("\n");
}

async function prepareGenericExecutionText(text, message) {
  setJobPhase("Strategy gate: building execution plan");
  const plan = await buildStrategyPlan(text, message);
  const evaluation = evaluateStrategyPlan(plan);
  if (currentJob) {
    currentJob.strategyPlan = plan;
    currentJob.strategyEvaluation = evaluation;
  }
  await logTaskEvent({
    type: "strategy_gate",
    taskName: currentJob?.taskName || "generic-codex",
    chatId: message.chat.id,
    messageId: message.message_id,
    plan,
    evaluation,
  });
  if (!evaluation.allowed) {
    setJobPhase(`Strategy gate constrained execution: ${evaluation.constraints[0]}`);
  } else {
    setJobPhase("Strategy gate approved execution");
  }
  return strategyConstrainedPrompt(text, plan, evaluation);
}

function parseJsonObjectFromText(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function heuristicStrategyPlan(text) {
  const lower = String(text || "").toLowerCase();
  const broadKeywords = /\b(top|10|ranking|rank|screen|screener)\b/i;
  const scanIndicator = /\b(scan|scanning|collect|fetch|crawl|scrape|all|entire|every)\b/i;
  const broadScan = broadKeywords.test(lower) || scanIndicator.test(lower);
  const koreanStockScan = /\b(kospi|kosdaq|ytd|korea|stock|market|2026|2025)\b/i.test(text);

  if (broadScan && koreanStockScan) {
    return {
      task_type: "market_data_scan",
      goal: text,
      tools: ["web", "python"],
      estimated_runtime_sec: 240,
      risk: "slow_full_market_scan",
      first_action: "probe one ranked source or recent scan before full coverage",
      fallback: "return partial top candidates with source notes if full coverage is too slow",
    };
  }

  if (broadScan && /\b(stock|coin|market|news|chart|scrape|crawl|install|npm|pip)\b/i.test(lower)) {
    return {
      task_type: "broad_data_scan",
      goal: text,
      tools: ["web", "shell"],
      estimated_runtime_sec: 180,
      risk: "slow_full_scan",
      first_action: "find a ranked/summary source or run one small probe before any loop",
      fallback: "return bounded partial results with exact source and explain what was not scanned",
    };
  }

  if (/install|npm|pip|playwright|browser|scrape|crawl|download|all|entire/.test(lower)) {
    return {
      task_type: "generic_local_execution",
      goal: text,
      tools: ["shell"],
      estimated_runtime_sec: 120,
      risk: "medium",
      first_action: "inspect existing files and run a small probe before broad execution",
      fallback: "report partial findings and next command",
    };
  }

  return {
    task_type: "generic_answer",
    goal: text,
    tools: [],
    estimated_runtime_sec: 30,
    risk: "low",
    first_action: "answer directly or inspect local context if needed",
    fallback: "ask for clarification only if required",
  };
}
function isDestructiveRequest(text, plan) {
  const lowerText = String(text || "").toLowerCase();
  const lowerPlanGoal = String(plan?.goal || "").toLowerCase();
  const lowerPlanRisk = String(plan?.risk || "").toLowerCase();
  const lowerFirstAction = String(plan?.first_action || "").toLowerCase();

  const destructiveKeywords = /\b(rm|del|rmdir|remove|delete|kill|format|format-volume|terminate|wipe|erase)\b/i;
  const destructiveKorean = /\b(delete|remove|format|terminate|erase|clear|reset|wipe|format_volume|reset_db)\b/i;

  if (destructiveKeywords.test(lowerText) || destructiveKorean.test(lowerText)) return true;
  if (destructiveKeywords.test(lowerPlanGoal) || destructiveKorean.test(lowerPlanGoal)) return true;
  if (destructiveKeywords.test(lowerFirstAction) || destructiveKorean.test(lowerFirstAction)) return true;
  if (lowerPlanRisk.includes("unsafe") || lowerPlanRisk.includes("destructive") || lowerPlanRisk.includes("unsafe_command")) return true;
  return false;
}
function evaluateStrategyPlan(plan) {
  const constraints = [];
  let allowed = true;
  let maxToolCalls = 8;
  let maxRuntimeSec = 180;
  
  if (!plan) {
    return { allowed: true, constraints: ["No plan generated. Proceed with caution."] };
  }
  
  const risk = String(plan.risk || "low").toLowerCase();
  const runtime = Number(plan.estimated_runtime_sec || 0);
  const tools = plan.tools || [];
  
  if (isDestructiveRequest(plan.goal || "", plan)) {
    allowed = false;
    constraints.push("Destructive risk detected. Awaiting explicit user approval before execution.");
  }
  if (risk.includes("slow_full_scan") || risk.includes("slow_full_market_scan") || risk.includes("full_scan") || runtime >= 180) {
    allowed = false;
    maxToolCalls = 3;
    maxRuntimeSec = 90;
    constraints.push("Slow or broad scan detected. Use a bounded probe-first strategy instead of full enumeration.");
    constraints.push("Prefer ranked/summary sources, cached local files, or one direct endpoint before loops.");
  } else if (runtime > 120) {
    maxToolCalls = 5;
    maxRuntimeSec = 120;
    constraints.push(`High runtime warning: estimated ${runtime}s. Keep execution bounded.`);
  }
  if (tools.includes("shell") || tools.includes("powershell") || tools.includes("python")) {
    constraints.push("Local execution requested. Do not run destructive commands (rm, del, format, kill) without user approval.");
  }
  
  return { allowed, constraints, maxToolCalls, maxRuntimeSec };
}

async function buildStrategyPlan(text, message) {
  if (process.env.HERMES_STRATEGY_GATE_DISABLED === "1") return null;
  const key = await readOpenRouterKey();
  if (!key || process.env.HERMES_STRATEGY_GATE_OFFLINE === "1") return heuristicStrategyPlan(text);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost/hermes-telegram",
      "X-Title": "Hermes Telegram Strategy Gate",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "You are a strategy gate for a local Telegram coding agent.",
            "Return only a compact JSON object.",
            "Do not solve the task. Plan the execution risk.",
            "Schema keys: task_type, goal, tools, estimated_runtime_sec, risk, first_action, fallback.",
            "Risk should be one of low, medium, slow_full_scan, unsafe, needs_clarification.",
          ].join(" "),
        },
        { role: "user", content: String(text || "").slice(0, 2000) },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!response.ok || !content) return heuristicStrategyPlan(text);
  return parseJsonObjectFromText(content) || heuristicStrategyPlan(text);
}


function formatRecentFailuresForPrompt(failures) {
  if (!failures.length) return "";
  const lines = failures.slice(0, 5).map((failure, index) => {
    const recovered = Number(failure.recovered) ? "recovered" : "not recovered";
    const error = String(failure.error_msg || "").replace(/\s+/g, " ").slice(0, 240);
    return `${index + 1}. task=${failure.task_name}; status=${recovered}; error=${error}`;
  });
  return [
    "",
    "Recent local failure memory:",
    ...lines,
    "Use this memory to avoid repeating the same mistake. If a user asks to send, fetch, capture, install, run, or verify something, inspect local files/processes and execute available tools before claiming it is unsupported.",
  ].join("\n");
}

function formatLocalToolContextForPrompt(text = "") {
  const tools = [["bot_db_helper.py", "Hermes SQLite memory, jobs, events, messages, and artifacts helper"]];
  if (hasExplicitFlowIntent(text)) tools.push(["aistudio-ui-image.mjs", "Google Flow/AI Studio browser automation when explicitly requested"]);
  if (wantsNaverToolContext(text)) {
    tools.push(["naver-upper-limit.mjs", "Naver Finance upper-limit stock list capture/extraction"]);
    tools.push(["naver-stock-charts.mjs", "Naver stock chart capture"]);
  }
  if (wantsArtifactContext(text) && !isShortContinuationRequest(text)) {
    tools.push(["send-latest-chart-images.mjs", "Send latest generated chart images through Telegram only when the newest user message asks to resend recent chart images"]);
  }
  if (isBybitRequest(text)) {
    tools.push(["bybit.md", "Hermes Bybit data collection, MCP/Skill, and backtesting workflow guide"]);
    tools.push(["integrations/bybit/SKILL.md", "Official Bybit AI Trading Skill local mirror for exchange-specific rules"]);
    tools.push(["integrations/bybit/mcp.json", "Bybit MCP server config template for Codex/Claude/Cursor compatible clients"]);
    tools.push(["scripts/run_bybit_linear_trend_backtest.py", "Fetch Bybit linear klines and run the baseline trend breakout backtest"]);
    tools.push(["scripts/analyze_bybit_reverse_losers.py", "Analyze hindsight-only loser reversal against a trades.csv file"]);
  }
  const availableTools = tools.filter(([file]) => existsSync(`${ROOT}/${file}`));
  if (!availableTools.length) return "";
  return [
    "",
    "Available local Hermes tools/scripts:",
    ...availableTools.map(([file, purpose]) => `- ${file}: ${purpose}`),
    "Prefer existing local scripts when they match the request. Inspect them before claiming a capability is unavailable.",
    "Do not call the Telegram Bot API or sendPhoto/sendDocument from inside Codex. The Telegram wrapper sends final replies and dedicated file handlers send files.",
  ].join("\n");
}

async function formatBybitIntegrationContextForPrompt(text = "") {
  if (!isBybitRequest(text)) return "";
  let skillSummary = "";
  try {
    const skill = await readFile(BYBIT_SKILL_FILE, "utf8");
    const version = skill.match(/version:\s*([^\n#]+)/i)?.[1]?.trim() || "unknown";
    const updated = skill.match(/updated:\s*([^\n]+)/i)?.[1]?.trim() || "unknown";
    skillSummary = `Local Bybit skill mirror: integrations/bybit/SKILL.md (version ${version}, updated ${updated}).`;
  } catch {
    skillSummary = "Local Bybit skill mirror is missing; use official Bybit docs and MCP metadata.";
  }
  let guideSummary = "";
  try {
    const guide = await readFile(BYBIT_GUIDE_FILE, "utf8");
    guideSummary = guide
      .split(/\r?\n/)
      .filter((line) => /^#|^- |^\d+\./.test(line.trim()))
      .slice(0, 45)
      .join("\n");
  } catch {
    guideSummary = "bybit.md is missing.";
  }
  return [
    "",
    "Bybit integration available:",
    `- MCP server: bybit via npx -y ${BYBIT_MCP_PACKAGE}. It is registered in Codex global MCP config and mirrored at integrations/bybit/mcp.json.`,
    "- Market-data MCP tools can work without API keys. Authenticated account/trade tools require BYBIT_API_KEY plus BYBIT_API_SECRET or BYBIT_API_PRIVATE_KEY_PATH in the worker environment.",
    "- Default safety mode is BYBIT_TESTNET=true. Do not place/cancel/amend real mainnet orders unless the user explicitly asks and then confirms the exact operation.",
    "- Never print or hardcode API keys, secrets, private key contents, or full private key paths. Use environment variable references in generated commands/code.",
    "- Prefer Bybit MCP tools for live market/account data when available. Prefer the local Bybit skill rules for endpoint selection, signing, confirmation, and safety behavior.",
    `- ${skillSummary}`,
    "- Hermes Bybit workflow guide summary:",
    guideSummary,
    "- Official references used for this integration: https://bybit-exchange.github.io/docs/ , https://github.com/bybit-exchange/skills , https://www.npmjs.com/package/bybit-official-trading-server",
  ].join("\n");
}

async function formatChatContextForPrompt(message) {
  const chatId = message.chat?.id;
  if (!chatId) return "";
  const queryText = messageText(message);
  const shortContinuation = isShortContinuationRequest(queryText);
  const includeArtifacts = wantsArtifactContext(queryText) && !shortContinuation;
  const [session, jobs, memories, messages, semanticMessages, artifacts] = await Promise.all([
    readSessionFromDb(chatId).catch(() => ({})),
    getRecentJobsFromDb(6, chatId).catch(() => []),
    shortContinuation ? Promise.resolve([]) : searchMemoriesFromDb(chatId, queryText, 8).catch(() => []),
    getRecentMessagesFromDb(chatId, 16).catch(() => []),
    shortContinuation ? Promise.resolve([]) : searchMessagesFromDb(chatId, queryText, 8).catch(() => []),
    includeArtifacts ? getRecentArtifactsFromDb(chatId, 6).catch(() => []) : Promise.resolve([]),
  ]);
  const lines = [];
  if (shortContinuation) {
    lines.push("Short continuation request detected.");
    lines.push("Resolve it from the latest relevant recent chat transcript and recent Telegram requests, not from semantic matches, old artifact memories, or unrelated chart/image history.");
  }
  if (memories.length) {
    lines.push("Relevant long-term Hermes memories:");
    for (const [index, memory] of memories.entries()) {
      const tags = memory.tags ? ` | tags=${String(memory.tags).slice(0, 80)}` : "";
      lines.push(`${index + 1}. ${String(memory.text || "").slice(0, 260)}${tags}`);
    }
    lines.push("Treat these memories as durable user/project preferences unless the newest user message overrides them.");
  }

  if (messages.length) {
    if (lines.length) lines.push("");
    lines.push("Recent chat transcript:");
    for (const item of messages.slice(-12)) {
      const role = item.role === "assistant" ? "Hermes" : "User";
      const text = String(item.text || "").replace(/\s+/g, " ").slice(0, 260);
      if (text) lines.push(`${role}: ${text}`);
    }
    lines.push("Use this transcript to resolve short references like 'just now', 'earlier', 'that', numbered items, and follow-up corrections.");
  }

  const semanticOnly = semanticMessages.filter((candidate) => !messages.some((item) => String(item.id) === String(candidate.id))).slice(0, 5);
  if (semanticOnly.length) {
    if (lines.length) lines.push("");
    lines.push("Semantic transcript matches:");
    for (const item of semanticOnly) {
      const role = item.role === "assistant" ? "Hermes" : "User";
      const score = item.semantic_score !== undefined ? ` score=${item.semantic_score}` : "";
      const text = String(item.text || "").replace(/\s+/g, " ").slice(0, 240);
      if (text) lines.push(`${role}${score}: ${text}`);
    }
    lines.push("Use these when the newest request refers to older related context not present in the recent transcript.");
  }

  if (includeArtifacts && artifacts.length) {
    if (lines.length) lines.push("");
    lines.push("Recent generated/sent artifacts:");
    for (const [index, artifact] of artifacts.entries()) {
      lines.push(`${index + 1}. ${artifact.kind}: ${String(artifact.caption || "").slice(0, 120)} | path=${String(artifact.path || "").slice(0, 180)}`);
    }
    lines.push("If the user asks to resend, inspect, modify, or reference an image/video/file, use these artifacts first.");
  }

  const wantsNewsContext = !hasBacktestArchitectureTerms(queryText)
    && (isNewsSummaryRequest(queryText) || isRememberedNewsFollowup(queryText) || /(?:\uB274\uC2A4|\uAE30\uC0AC|news|article)/i.test(queryText));
  const newsItems = wantsNewsContext && Array.isArray(session.lastNewsItems) ? session.lastNewsItems.slice(0, 5) : [];
  if (newsItems.length) {
    if (lines.length) lines.push("");
    lines.push("Recent remembered news items in this chat:");
    for (const [index, item] of newsItems.entries()) {
      lines.push(`${index + 1}. ${String(item.title || "").slice(0, 180)} | source=${String(item.source || "unknown").slice(0, 80)} | link=${String(item.link || "").slice(0, 240)}`);
    }
    lines.push("If the user says numbered-news references such as item 1, item 2, or item 3, or asks to rewrite/summarize/script it, resolve that reference from these remembered news items.");
  }

  const recentRequests = (jobs || [])
    .filter((job) => String(job.request_text || "").trim())
    .slice(0, 5)
    .map((job, index) => {
      const request = String(job.request_text || "").replace(/\s+/g, " ").slice(0, 220);
      const status = String(job.status || "unknown");
      return `${index + 1}. status=${status}; task=${job.task_name || "unknown"}; request=${request}`;
    });
  if (recentRequests.length) {
    lines.push("");
    lines.push("Recent Telegram requests in this chat:");
    lines.push(...recentRequests);
    lines.push("Use this only as short-term context. The newest user message still has priority.");
  }
  return lines.length ? `\n${lines.join("\n")}` : "";
}

async function codexPrompt(text, message) {
  const name = message.from?.first_name || message.from?.username || "user";
  const [recentFailures, chatContext, bybitContext] = await Promise.all([
    getRecentFailuresFromDb(5),
    formatChatContextForPrompt(message),
    formatBybitIntegrationContextForPrompt(text),
  ]);
  return [
    "You are Hermes, a Telegram bot that acts as a local autonomous agent.",
    "Reply in Korean unless the user clearly asks for another language.",
    "When the user asks to install, run, edit files, search, browse, capture, send files/images, or automate a browser, execute the available local tools instead of merely explaining.",
    "Before saying a capability is unsupported, inspect local files, processes, logs, and available scripts. If a Telegram file can be sent through sendPhoto/sendVideo/sendDocument, treat it as supported.",
    "Never send old chart/image artifacts during a generic coding or backtesting follow-up. Only send images/files when the newest user message explicitly asks for images/files/charts to be sent.",
    "For short continuation messages (예: \'지금\', \'바로\', \'계속\', \'좋아요\', 또는 번호형 선택지), continue the most recent actionable project in the recent transcript.",
    "If something fails, diagnose the concrete cause, try a reasonable recovery path, then report what was tried and what happened.",
    "Do not turn a general request into Google Flow/video generation unless the user explicitly mentions Flow, video, shorts, or video generation.",
    "For current news, prefer the bot's RSS/news handlers when available. Do not claim live lookup is impossible if a local handler exists.",
    "For Korean stock/finance ranking requests, use bounded strategies: official/ranked pages, exchange CSV endpoints, one-page screeners, or a tiny probe first. Do not run one HTTP/data download per KRX/KOSPI/KOSDAQ ticker. If the task requires a full-market scan, keep the first attempt under 90 seconds and return partial/source notes rather than hanging.",
    "Do not invent environment requirements such as KRX_ID/KRX_PW. Only say a credential is required when a verified command output or official source says so.",
    "If a command would run a broad loop, install many packages, or make more than about 100 network requests, stop and report the bounded plan instead of launching it.",
    "Keep answers concise unless the user asks for a detailed report.",
    formatRecentFailuresForPrompt(recentFailures),
    formatLocalToolContextForPrompt(text),
    bybitContext,
    chatContext,
    "",
    `${name}: ${text}`,
  ].join("\n");
}
async function codexSdkReply(model, text, message) {
  setJobPhase(`Codex SDK streaming started: ${model}`);
  const started = Date.now();
  const codex = new Codex({
    config: {
      mcp_servers: {
        bybit: {
          command: "npx",
          args: ["-y", BYBIT_MCP_PACKAGE],
          env: {
            BYBIT_TESTNET: process.env.BYBIT_TESTNET || "true",
          },
        },
      },
    },
  });
  const thread = codex.startThread({
    model,
    workingDirectory: ROOT,
    skipGitRepoCheck: true,
    sandboxMode: "danger-full-access",
    approvalPolicy: "never",
    modelReasoningEffort: "low",
    networkAccessEnabled: true,
    webSearchMode: "live",
  });

  const abortController = new AbortController();
  if (currentJob) currentJob.abortController = abortController;
  const overallTimeout = Number(process.env.HERMES_CODEX_TIMEOUT_MS || 240000);
  const timeoutId = setTimeout(() => {
    killRunawayChildProcesses("codex overall timeout").catch(() => {});
    abortController.abort(new Error(`Codex overall execution timed out after ${overallTimeout}ms`));
  }, overallTimeout);

  const watchdog = {
    toolCallCount: 0,
    maxToolCalls: Number(process.env.HERMES_WATCHDOG_MAX_TOOLS || 8),
    currentToolKey: null,
    currentToolStartedAt: null,
    toolTimeoutMs: Number(process.env.HERMES_WATCHDOG_TOOL_TIMEOUT_MS || 90000),
    inactivityTimeoutMs: Number(process.env.HERMES_WATCHDOG_INACTIVITY_TIMEOUT_MS || 35000),
    failureCounts: {},
    lastActiveAt: Date.now(),
  };

  const watchdogInterval = setInterval(() => {
    const idleMs = Date.now() - watchdog.lastActiveAt;
    if (idleMs > watchdog.inactivityTimeoutMs) {
      clearInterval(watchdogInterval);
      clearTimeout(timeoutId);
      killRunawayChildProcesses("watchdog inactivity timeout").catch(() => {});
      abortController.abort(new Error(`Watchdog: Inactivity timeout. No event received for ${Math.round(idleMs / 1000)}s`));
      return;
    }

    if (watchdog.currentToolStartedAt) {
      const elapsed = Date.now() - watchdog.currentToolStartedAt;
      if (elapsed > watchdog.toolTimeoutMs) {
        clearInterval(watchdogInterval);
        clearTimeout(timeoutId);
        killRunawayChildProcesses("watchdog tool timeout").catch(() => {});
        abortController.abort(new Error(`Watchdog: Tool execution timed out after ${Math.round(elapsed / 1000)}s (${watchdog.currentToolKey})`));
      }
    }
  }, 5000);

  let streamed;
  try {
    streamed = await thread.runStreamed(await codexPrompt(text, message), { signal: abortController.signal });
    const items = [];
    let finalResponse = "";
    let usage = null;
    for await (const event of streamed.events) {
      observeCodexEvent(event);
      updateWatchdogState(event, watchdog, abortController);
      
      if (event.type === "item.completed") {
        items.push(event.item);
        if (event.item.type === "agent_message") finalResponse = event.item.text || finalResponse;
      } else if (event.type === "turn.completed") {
        usage = event.usage;
      } else if (event.type === "turn.failed") {
        throw new Error(event.error?.message || "Codex turn failed.");
      } else if (event.type === "error") {
        throw new Error(event.message || "Codex stream failed.");
      }
    }
    clearInterval(watchdogInterval);
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - started;
    await recordCodexSuccess(model, latencyMs);
    return {
      backend: "codex-sdk",
      model,
      latencyMs,
      usage,
      text: finalResponse || items.filter((item) => item.type === "agent_message").map((item) => item.text).join("\n").trim(),
    };
  } catch (error) {
    clearInterval(watchdogInterval);
    clearTimeout(timeoutId);
    throw error;
  } finally {
    if (currentJob?.abortController === abortController) currentJob.abortController = null;
  }
}

function updateWatchdogState(event, watchdog, abortController) {
  if (!event) return;

  // Track activity to prevent inactivity timeouts
  watchdog.lastActiveAt = Date.now();

  const item = event.item;
  if (!item) return;

  const toolKey = getToolKey(item);
  if (event.type === "item.started") {
    if (item.type === "command_execution" || item.type === "mcp_tool_call" || item.type === "file_change") {
      watchdog.toolCallCount += 1;
      if (watchdog.toolCallCount > watchdog.maxToolCalls) {
        abortController.abort(new Error(`Watchdog: Maximum tool call limit exceeded (${watchdog.toolCallCount} calls)`));
        return;
      }
      watchdog.currentToolKey = toolKey;
      watchdog.currentToolStartedAt = Date.now();
    }
  } else if (event.type === "item.completed" || event.type === "item.failed") {
    if (toolKey === watchdog.currentToolKey) {
      watchdog.currentToolKey = null;
      watchdog.currentToolStartedAt = null;
    }
    if (event.type === "item.failed") {
      watchdog.failureCounts[toolKey] = (watchdog.failureCounts[toolKey] || 0) + 1;
      if (watchdog.failureCounts[toolKey] >= 3) {
        abortController.abort(new Error(`Watchdog: Tool repeatedly failed 3 times (${toolKey})`));
        return;
      }
    }
  }
}


function getToolKey(item) {
  if (item.type === "command_execution") {
    return `command:${String(item.command || "").trim().slice(0, 100)}`;
  }
  if (item.type === "mcp_tool_call") {
    return `mcp:${item.server}.${item.tool}`;
  }
  if (item.type === "file_change") {
    const paths = (item.changes || []).map((c) => c.path).join(",");
    return `file_change:${paths.slice(0, 100)}`;
  }
  return `${item.type}`;
}

function itemStatusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (value === "completed" || value === "success") return "completed";
  if (value === "failed" || value === "error") return "failed";
  if (value === "in_progress" || value === "running") return "running";
  return value || "unknown";
}

function summarizeShellCommand(command) {
  const value = String(command || "").replace(/\s+/g, " ").trim();
  if (!value) return "Shell command";
  const lower = value.toLowerCase();
  if (lower.includes("playwright")) return `Playwright: ${value.slice(0, 120)}`;
  if (lower.includes("finance") || lower.includes("yfinance") || lower.includes("pykrx")) return `Market data: ${value.slice(0, 120)}`;
  if (lower.includes("krx_ytd_top10_charts.py")) return `KRX Top10 chart script: ${value.slice(0, 140)}`;
  if (lower.includes("annotate_buy_timing_charts.py")) return `Chart annotation script: ${value.slice(0, 140)}`;
  if (lower.includes("naver")) return `Naver workflow: ${value.slice(0, 140)}`;
  if (lower.includes("ffmpeg")) return `FFmpeg: ${value.slice(0, 140)}`;
  if (lower.includes("python")) return `Python command: ${value.slice(0, 120)}`;
  if (lower.includes("powershell")) return `PowerShell command: ${value.slice(0, 120)}`;
  return value.slice(0, 140);
}

function workflowPhaseLabel(phase) {
  const value = String(phase || "");
  if (!value) return "-";
  let match = value.match(/^Codex (started|completed|failed)?\s*command \(([^)]*)\):\s*(.*)$/i);
  if (match) {
    const status = itemStatusLabel(match[2]);
    return `Codex command [${status}]: ${summarizeShellCommand(match[3])}`;
  }
  match = value.match(/^Codex (started|completed|failed)?\s*tool \(([^)]*)\):\s*(.*)$/i);
  if (match) {
    const status = itemStatusLabel(match[2]);
    return `MCP tool [${status}]: ${match[3]}`;
  }
  match = value.match(/^Codex (started|completed|failed)?\s*web search:\s*(.*)$/i);
  if (match) return `web search: ${match[2].slice(0, 140)}`;
  match = value.match(/^Codex (started|completed|failed)?\s*file change \(([^)]*)\):\s*(.*)$/i);
  if (match) return `file change [${itemStatusLabel(match[2])}]: ${match[3]}`;
  if (/Strategy gate constrained/i.test(value)) return `Strategy gate constrained: ${value.split(":").slice(1).join(":").trim() || "probe-first"}`;
  if (/Strategy gate approved/i.test(value)) return `Strategy gate approved: ${value}`;
  if (/Strategy gate: building/i.test(value)) return `Strategy gate building: ${value}`;
  if (/Codex SDK streaming started/i.test(value)) return value.replace("Codex SDK streaming started", "Codex SDK started streaming");
  if (/Codex is composing/i.test(value)) return "Codex composing";
  if (/Codex turn started/i.test(value)) return "Codex turn started";
  if (/Codex turn completed/i.test(value)) return "Codex turn completed";
  if (/Request classified/i.test(value)) return value.replace("Request classified", "Request classified");
  if (/Task started/i.test(value)) return value.replace("Task started", "Task started");
  if (/Task failed/i.test(value)) return value.replace("Task failed; entering recovery path", "Task failed");
  return value;
}
function observeCodexEvent(event) {
  if (!event) return;
  persistObservedCodexEvent(event).catch((error) => console.error(`Codex event persist failed: ${safeErrorMessage(error)}`));
  if (event.type === "thread.started") {
    setJobPhase(`Codex thread started: ${event.thread_id}`);
    return;
  }
  if (event.type === "turn.started") {
    setJobPhase("Codex turn started");
    return;
  }
  if (event.type === "turn.completed") {
    setJobPhase("Codex turn completed");
    return;
  }
  if (event.type === "turn.failed") {
    setJobPhase(`Codex turn failed: ${event.error?.message || "unknown error"}`);
    return;
  }
  if (event.type === "error") {
    setJobPhase(`Codex stream error: ${event.message || "unknown error"}`);
    return;
  }
  const item = event.item;
  if (!item) return;
  const prefix = event.type.replace("item.", "");
  if (item.type === "command_execution") {
    const command = String(item.command || "").replace(/\s+/g, " ").slice(0, 180);
    setJobPhase(`Codex ${prefix} command (${item.status}): ${command}`);
  } else if (item.type === "mcp_tool_call") {
    setJobPhase(`Codex ${prefix} tool (${item.status}): ${item.server}.${item.tool}`);
  } else if (item.type === "web_search") {
    setJobPhase(`Codex ${prefix} web search: ${item.query}`);
  } else if (item.type === "file_change") {
    const changes = (item.changes || []).map((change) => `${change.kind}:${change.path}`).join(", ").slice(0, 180);
    setJobPhase(`Codex ${prefix} file change (${item.status}): ${changes}`);
  } else if (item.type === "todo_list") {
    const active = (item.items || []).find((todo) => !todo.completed)?.text || (item.items || []).at(-1)?.text || "todo updated";
    setJobPhase(`Codex ${prefix} todo: ${active}`);
  } else if (item.type === "reasoning") {
    const summary = String(item.text || "").replace(/\s+/g, " ").slice(0, 160);
    if (summary) setJobPhase(`Codex reasoning: ${summary}`);
  } else if (item.type === "error") {
    setJobPhase(`Codex item error: ${item.message}`);
  } else if (item.type === "agent_message") {
    setJobPhase("Codex is composing the final answer");
  }
}

async function persistObservedCodexEvent(event) {
  const item = event.item;
  const data = { eventType: event.type };
  if (event.thread_id) data.threadId = event.thread_id;
  if (event.usage) data.usage = event.usage;
  if (event.error) data.error = event.error;
  if (event.message) data.message = event.message;
  if (item) {
    data.itemType = item.type;
    data.status = item.status;
    data.id = item.id;
    if (item.type === "command_execution") {
      data.command = item.command;
      data.exitCode = item.exit_code;
      data.outputTail = String(item.aggregated_output || "").slice(-1000);
    } else if (item.type === "mcp_tool_call") {
      data.server = item.server;
      data.tool = item.tool;
      data.arguments = item.arguments;
      data.error = item.error;
    } else if (item.type === "web_search") {
      data.query = item.query;
    } else if (item.type === "file_change") {
      data.changes = item.changes;
    } else if (item.type === "todo_list") {
      data.items = item.items;
    } else if (item.type === "reasoning") {
      data.text = String(item.text || "").slice(0, 1000);
    } else if (item.type === "agent_message") {
      data.text = String(item.text || "").slice(0, 1000);
    } else if (item.type === "error") {
      data.message = item.message;
    }
  }
  await logTaskEventToDb(
    `codex.${event.type}`,
    currentJob?.taskName || "generic-codex",
    { chat: { id: currentJob?.chatId ?? "" }, message_id: currentJob?.messageId ?? "" },
    "",
    data,
  );
}
function runProcess(command, args, { timeoutMs = 120000, killTreeOnTimeout = true, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      if (killTreeOnTimeout) killProcessTree(child.pid).catch(() => {});
      reject(new Error(`Process timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || stdout || `Process exited with code ${code}`).trim()));
    });
  });
}

async function runDbHelper(args, { timeoutMs = 30000, optional = true } = {}) {
  try {
    const result = await runProcess("python", [DB_HELPER, ...args], { timeoutMs });
    const text = result.stdout.trim();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (!optional) throw error;
    console.error(`DB helper failed: ${safeErrorMessage(error)}`);
    return null;
  }
}

async function initDb() {
  return runDbHelper(["init"], { optional: true });
}

async function addQueueJobToDb(jobId, chatId, messageId, status, taskName, pid = null) {
  const args = ["add-queue-job", String(jobId), String(chatId), String(messageId || ""), status, taskName];
  if (pid !== null) {
    args.push("--pid", String(pid));
  }
  return runDbHelper(args, { optional: true });
}

async function updateQueueJobInDb(jobId, status, pid = null) {
  const args = ["update-queue-job", String(jobId), status];
  if (pid !== null) {
    args.push("--pid", String(pid));
  }
  return runDbHelper(args, { optional: true });
}

async function getActiveQueueJobFromDb(chatId) {
  return runDbHelper(["get-active-queue-job", String(chatId)], { optional: true });
}

async function deleteQueueJobFromDb(jobId) {
  return runDbHelper(["delete-queue-job", String(jobId)], { optional: true });
}

async function getAgentReflectionContextFromDb(chatId) {
  return runDbHelper(["get-agent-reflection-context", String(chatId)], { optional: true });
}

async function readSessionFromDb(chatId) {
  return (await runDbHelper(["get-session", String(chatId)], { optional: true })) || {};
}

async function writeSessionToDb(chatId, session) {
  return runDbHelper(["set-session", String(chatId), JSON.stringify(session)], { optional: true });
}

async function logFailureToDb(taskName, message, error, recovered = 0) {
  return runDbHelper([
    "log-failure",
    taskName,
    String(message?.chat?.id ?? ""),
    String(message?.message_id ?? ""),
    safeErrorMessage(error).slice(0, 2000),
    recovered ? "1" : "0",
  ], { optional: true });
}

async function markRecoveredInDb(message, note = "") {
  return runDbHelper([
    "mark-recovered",
    String(message?.chat?.id ?? ""),
    String(message?.message_id ?? ""),
    note.slice(0, 500),
  ], { optional: true });
}

async function getRecentFailuresFromDb(limit = 5) {
  const failures = await runDbHelper(["get-recent-failures", String(limit)], { optional: true });
  return Array.isArray(failures) ? failures : [];
}

async function logTaskEventToDb(eventType, taskName, message, jobId = "", data = {}) {
  const args = [
    "log-event",
    eventType,
    taskName || "",
    String(message?.chat?.id ?? ""),
    String(message?.message_id ?? ""),
    JSON.stringify(data),
  ];

  if (jobId) {
    args.push("--job-id", String(jobId));
  }

  return runDbHelper(args, { optional: true });
}

async function getRecentTaskEventsFromDb(limit = 10, chatId = "", messageId = "", jobId = "") {
  const args = ["get-recent-events", String(limit)];
  if (chatId) args.push(String(chatId));
  if (messageId) args.push(String(messageId));
  if (jobId) args.push("--job-id", String(jobId));
  const events = await runDbHelper(args, { optional: true });
  return Array.isArray(events) ? events : [];
}

async function upsertJobToDb(job) {
  return runDbHelper(["upsert-job", JSON.stringify(job)], { optional: true });
}

async function updateJobInDb(jobId, patch) {
  if (!jobId) return null;
  return runDbHelper(["update-job", String(jobId), JSON.stringify(patch)], { optional: true });
}

async function requestCancelInDb(chatId) {
  return runDbHelper(["request-cancel", String(chatId)], { optional: true });
}

async function getActiveJobFromDb(chatId = "") {
  const args = ["get-active-job"];
  if (chatId) args.push(String(chatId));
  return runDbHelper(args, { optional: true });
}

async function getRecentJobsFromDb(limit = 5, chatId = "") {
  const args = ["get-recent-jobs", String(limit)];
  if (chatId) args.push(String(chatId));
  const jobs = await runDbHelper(args, { optional: true });
  return Array.isArray(jobs) ? jobs : [];
}

async function addMemoryToDb(memory) {
  return runDbHelper(["add-memory", JSON.stringify(memory)], { optional: true });
}

async function searchMemoriesFromDb(chatId, query, limit = 8) {
  const memories = await runDbHelper(["search-memories", String(chatId || ""), String(query || ""), String(limit)], { optional: true });
  return Array.isArray(memories) ? memories : [];
}

async function getRecentMemoriesFromDb(chatId, limit = 10) {
  const memories = await runDbHelper(["get-recent-memories", String(chatId || ""), String(limit)], { optional: true });
  return Array.isArray(memories) ? memories : [];
}

async function logChatMessageToDb({ chatId, messageId, role, text, meta = {}, createdAt = null }) {
  return runDbHelper(["log-message", JSON.stringify({
    chat_id: String(chatId ?? ""),
    message_id: String(messageId ?? ""),
    role,
    text: String(text ?? "").slice(0, 8000),
    meta,
    created_at: createdAt,
  })], { optional: true });
}

async function getRecentMessagesFromDb(chatId, limit = 20) {
  const messages = await runDbHelper(["get-recent-messages", String(chatId || ""), String(limit)], { optional: true });
  return Array.isArray(messages) ? messages : [];
}

async function searchMessagesFromDb(chatId, query, limit = 8) {
  const messages = await runDbHelper(["search-messages", String(chatId || ""), String(query || ""), String(limit)], { optional: true });
  return Array.isArray(messages) ? messages : [];
}

async function logArtifactToDb({ chatId, messageId, kind, path, caption = "", meta = {} }) {
  return runDbHelper(["log-artifact", JSON.stringify({
    chat_id: String(chatId ?? ""),
    message_id: String(messageId ?? ""),
    kind,
    path,
    caption,
    meta,
  })], { optional: true });
}

async function getRecentArtifactsFromDb(chatId, limit = 8) {
  const artifacts = await runDbHelper(["get-recent-artifacts", String(chatId || ""), String(limit)], { optional: true });
  return Array.isArray(artifacts) ? artifacts : [];
}

async function reindexEmbeddingsInDb() {
  return runDbHelper(["reindex-embeddings"], { optional: true, timeoutMs: 120000 });
}

async function getQueuedJobsFromDb(limit = 20) {
  const jobs = await runDbHelper(["get-queued-jobs", String(limit)], { optional: true });
  return Array.isArray(jobs) ? jobs : [];
}

async function getWorkerProcessInfo() {
  try {
    const result = await runProcess("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*telegram-flow-news-bot.mjs*' } | Select-Object ProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress",
    ], { timeoutMs: 10000 });
    const text = result.stdout.trim();
    if (!text) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function readHeartbeat() {
  try {
    return JSON.parse(await readFile(HEARTBEAT_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function writeHeartbeat(offset = null) {
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(HEARTBEAT_FILE, JSON.stringify({
      pid: process.pid,
      updated_at: new Date().toISOString(),
      current_job_id: currentJob?.jobId || null,
      current_task: currentJob?.taskName || null,
      queue_length: taskQueue.length,
      busy,
      queue_running: queueRunning,
      last_update_offset: offset,
    }, null, 2), "utf8");
  } catch (error) {
    console.error(`Failed to write heartbeat: ${error.message || error}`);
  }
}

async function buildDiagnosticBundle(chatId, target = "last") {
  const [activeJob, recentJobs, queuedJobs, baseEvents, failures, messages, artifacts, processes, heartbeat] = await Promise.all([
    getActiveJobFromDb(chatId),
    getRecentJobsFromDb(6, chatId),
    getQueuedJobsFromDb(20),
    getRecentTaskEventsFromDb(20, chatId),
    getRecentFailuresFromDb(5),
    getRecentMessagesFromDb(chatId, 8),
    getRecentArtifactsFromDb(chatId, 5),
    getWorkerProcessInfo(),
    readHeartbeat(),
  ]);
  const job = target && target !== "last"
    ? recentJobs.find((item) => String(item.job_id) === String(target))
    : (activeJob || recentJobs[0] || null);
  const targetEvents = job?.job_id ? await getRecentTaskEventsFromDb(24, chatId, "", job.job_id) : baseEvents;
  const reclassified = job?.request_text ? routeMetadataForText(job.request_text) : null;
  const triage = triageDiagnostic({
    job,
    reclassified,
    routeMismatch: Boolean(job?.task_name && reclassified && job.task_name !== reclassified.name),
    recentFailures: failures,
    processes,
    heartbeat,
    queuedJobs,
  });
  return {
    worker: {
      pid: process.pid,
      processes,
      heartbeat,
      heartbeat_age_sec: heartbeat?.updated_at ? Math.round((Date.now() - new Date(heartbeat.updated_at).getTime()) / 1000) : null,
    },
    queue: {
      busy,
      queueRunning,
      memoryQueueLength: taskQueue.length,
      dbQueuedCount: queuedJobs.length,
    },
    targetJob: job,
    activeJob,
    reclassified,
    routeMismatch: Boolean(job?.task_name && reclassified && job.task_name !== reclassified.name),
    triage,
    recentJobs,
    recentEvents: targetEvents,
    baseEvents,
    recentFailures: failures,
    recentMessages: messages,
    recentArtifacts: artifacts,
  };
}

function triageDiagnostic({ job, reclassified, routeMismatch, recentFailures = [], processes = [], heartbeat = null, queuedJobs = [] }) {
  const evidence = [];
  let failureType = "none";
  let rootCause = "No failure detected in the selected job.";
  let recommendedAction = "No immediate action required.";
  let confidence = 0.5;

  if (!processes.length) {
    failureType = "worker_crash";
    rootCause = "No live telegram-flow-news-bot.mjs worker process was found.";
    recommendedAction = "Restart the worker and inspect stderr logs.";
    evidence.push("worker process list is empty");
    confidence = 0.95;
  } else if (heartbeat?.updated_at && Date.now() - new Date(heartbeat.updated_at).getTime() > 180000) {
    failureType = "worker_stale";
    rootCause = "Worker process exists, but heartbeat is stale.";
    recommendedAction = "Restart the worker or inspect event loop blocking work.";
    evidence.push(`heartbeat updated_at=${heartbeat.updated_at}`);
    confidence = 0.9;
  } else if (routeMismatch) {
    failureType = "intent_misroute";
    rootCause = "The original route differs from the current classifier result.";
    recommendedAction = "Add or update a routing regression case, then patch the route guard.";
    evidence.push(`actual route=${job?.task_name || "-"}`);
    evidence.push(`current route=${reclassified?.name || "-"}`);
    confidence = 0.92;
  } else if (job?.status === "failed" || /failed|failure|reporting error/i.test(String(job?.phase || ""))) {
    const errorText = String(job.error || recentFailures[0]?.error_msg || "");
    if (/fetch failed|telegram|429|too many requests/i.test(errorText)) {
      failureType = "telegram_transport_failure";
      rootCause = "Telegram transport failed while processing or reporting the job.";
      recommendedAction = "Check retry/backoff behavior and Telegram API availability.";
      confidence = 0.85;
    } else if (/FLOW_THUMBNAIL_GENERATION_FAILED|Google Flow thumbnail|flow thumbnail/i.test(errorText)) {
      failureType = "flow_thumbnail_generation_failed";
      rootCause = "Google Flow thumbnail image generation failed while creating the thumbnail background.";
      recommendedAction = "Open Hermes Studio Authentication, verify the Google Flow account/session, check for Flow policy or account limit warnings, then retry thumbnail only.";
      confidence = 0.9;
    } else if (/timed out|timeout|watchdog/i.test(errorText)) {
      failureType = "tool_timeout";
      rootCause = "A tool or model call exceeded its allowed time.";
      recommendedAction = "Use a smaller probe-first strategy or increase handler-specific timeout.";
      confidence = 0.85;
    } else if (/mojibake|\ufffd|\?\?/i.test(errorText)) {
      failureType = "encoding_mojibake";
      rootCause = "Output or source text likely suffered an encoding issue.";
      recommendedAction = "Use UTF-8 files or escaped literals instead of shell inline Korean text.";
      confidence = 0.8;
    } else {
      failureType = "handler_bug";
      rootCause = "The selected handler failed; no more specific deterministic cause was identified.";
      recommendedAction = "Inspect workflow events and command stderr for the handler.";
      confidence = 0.65;
    }
    evidence.push(`job.status=${job.status}`);
    if (errorText) evidence.push(`error=${errorText.slice(0, 200)}`);
  } else if (queuedJobs.length > 0) {
    failureType = "queued_or_busy";
    rootCause = "There are queued jobs waiting to run.";
    recommendedAction = "Use /jobs or /status to inspect the queue; cancel stale jobs if needed.";
    evidence.push(`queued jobs=${queuedJobs.length}`);
    confidence = 0.7;
  }

  return { failureType, confidence, rootCause, evidence, recommendedAction };
}

function formatAutoFailureReport({ taskName, requestText, error, phase = "" }) {
  const errorText = safeErrorMessage(error);
  const reclassified = requestText ? routeMetadataForText(requestText) : null;
  const job = {
    task_name: taskName,
    request_text: requestText,
    status: "failed",
    phase,
    error: errorText,
  };
  const triage = triageDiagnostic({
    job,
    reclassified,
    routeMismatch: Boolean(taskName && reclassified && taskName !== reclassified.name),
    recentFailures: [],
    processes: [{ ProcessId: process.pid }],
    heartbeat: { updated_at: new Date().toISOString() },
    queuedJobs: [],
  });
  const failureLine = `Failure type: ${triage.failureType} (${Math.round((triage.confidence || 0) * 100)}%)`;
  return [
    ko.taskFailed,
    "",
    failureLine,
    `Root cause: ${triage.rootCause}`,
    `Recommended action: ${triage.recommendedAction}`,
    triage.evidence?.length ? `Evidence: ${triage.evidence.join("; ")}` : "",
    `Error: ${errorText.slice(0, 500)}`,
    "",
    "Tip: run /diagnose <job-id|last> to inspect latest execution details.",
  ].filter(Boolean).join("\n");
}

function formatDiagnosticBundle(bundle) {
  const job = bundle.targetJob;
  const workerLine = bundle.worker.processes.length
    ? `alive (${bundle.worker.processes.map((item) => `PID ${item.ProcessId}`).join(", ")})`
    : "not found";
  const heartbeatLine = bundle.worker.heartbeat
    ? `${bundle.worker.heartbeat_age_sec}s ago, job=${bundle.worker.heartbeat.current_job_id || "-"}`
    : "missing";
  const reclassified = bundle.reclassified;
  const routeLine = job
    ? `actual=${job.task_name || "-"}; reclassified=${reclassified?.name || "-"}; mismatch=${bundle.routeMismatch ? "YES" : "no"}`
    : "no target job";
  const routeDetail = reclassified
    ? `Route detail: confidence=${Math.round((reclassified.confidence || 0) * 100)}%, rationale=${reclassified.rationale || "-"}, matched=${(reclassified.matched_rules || []).join(", ")}, blocked=${(reclassified.blocked_rules || []).join(", ") || "-"}`
    : "Route detail: -";
  const scopedEvents = bundle.recentEvents || [];
  const workflowLines = scopedEvents.length
    ? selectRecentWorkflowEvents(scopedEvents, job?.chat_id || "", "", job?.job_id || "", 10)
    : [];
  const eventLines = workflowLines.length
    ? workflowLines
    : scopedEvents.slice(0, 5).map((event, index) => `${index + 1}. ${event.created_at} | ${event.task_name || "-"} | ${event.event_type || "-"}`);
  const failureLines = bundle.recentFailures.slice(0, 3).map((failure, index) => `${index + 1}. ${failure.task_name || "-"} | ${String(failure.error_msg || "").slice(0, 120)}`);
  const triage = bundle.triage || {};
  return [
    "Hermes diagnose",
    `Worker: ${workerLine}`,
    `Heartbeat: ${heartbeatLine}`,
    `Queue: busy=${bundle.queue.busy}; running=${bundle.queue.queueRunning}; memory=${bundle.queue.memoryQueueLength}; db=${bundle.queue.dbQueuedCount}`,
    job ? `Job: ${job.job_id} | status=${job.status} | phase=${job.phase || "-"}` : "Job: none",
    `Route: ${routeLine}`,
    `Failure type: ${triage.failureType || "unknown"} (${Math.round((triage.confidence || 0) * 100)}%)`,
    `Root cause: ${triage.rootCause || "-"}`,
    routeDetail,
    `Action: ${triage.recommendedAction || "-"}`,
    triage.evidence?.length ? `Evidence: ${triage.evidence.join("; ")}` : "",
    job?.request_text ? `Request: ${String(job.request_text).replace(/\\s+/g, " ").slice(0, 260)}` : "",
    "",
    "Recent events:",
    eventLines.length ? eventLines.join("\\n") : "- none",
    "",
    "Recent failures:",
    failureLines.length ? failureLines.join("\\n") : "- none",
  ].filter((line) => line !== "").join("\\n");
}

async function handleDiagnoseMessage(message) {
  const text = messageText(message).trim();
  const target = text.split(/\s+/)[1] || "last";
  const bundle = await buildDiagnosticBundle(message.chat.id, target);
  await sendLongMessage(message.chat.id, formatDiagnosticBundle(bundle), message.message_id);
}

async function handleSelfTestMessage(message) {
  const target = messageText(message).trim().split(/\s+/)[1] || "last";
  const bundle = await buildDiagnosticBundle(message.chat.id, target);
  const request = bundle.targetJob?.request_text;
  if (!request) {
    await sendMessage(message.chat.id, "Selftest target job/request not found.", message.message_id);
    return;
  }
  const task = routeNameForText(request);
  const simResult = await runSelfTestSimulation(request, message.chat.id);
  await sendMessage(message.chat.id, [
    "Hermes selftest",
    `Job: ${bundle.targetJob.job_id}`,
    `Original route: ${bundle.targetJob.task_name || "-"}`,
    `Current route: ${task}`,
    `Mismatch: ${bundle.targetJob.task_name && bundle.targetJob.task_name !== task ? "YES" : "no"}`,
    `Simulation: ${simResult.ok ? "completed" : "failed/limited"}`,
    `Simulation task: ${simResult.task || "-"}`,
    `Telegram methods: ${simResult.methods.length ? simResult.methods.join(", ") : "-"}`,
    simResult.error ? `Error: ${simResult.error.slice(0, 300)}` : "",
  ].join("\n"), message.message_id);
}

async function runSelfTestSimulation(request, chatId) {
  try {
    const result = await runProcess(process.execPath, [
      `${ROOT}/telegram-flow-news-bot.mjs`,
      "--simulate-message", request,
      "--simulate-chat-id", String(chatId),
      "--simulate-from-id", String(chatId),
      "--simulate-no-send",
      "--simulate-timeout-ms", String(process.env.HERMES_SELFTEST_TIMEOUT_MS || 45000),
    ], { timeoutMs: Number(process.env.HERMES_SELFTEST_TIMEOUT_MS || 45000) + 10000 });
    const methods = [];
    let task = "";
    for (const line of result.stdout.split(/\r?\n/)) {
      if (line.includes('"method"')) {
        const match = line.match(/"method"\s*:\s*"([^"]+)"/);
        if (match) methods.push(match[1]);
      }
      if (line.includes("task=") || line.includes("Task:")) {
        // Human-readable progress line; kept as fallback only.
      }
      if (line.includes("Task:") || line.includes("task=")) {
        const match = line.match(/(?:Task:\s*|task=\s*)([^\n"]+)/i);
        if (match) task = match[1].trim();
      }
    }
    const started = result.stdout.match(/"taskName"\s*:\s*"([^"]+)"/);
    if (started) task = started[1];
    const uniqueMethods = [...new Set(methods)];
    return { ok: true, task, methods: uniqueMethods, stdout: result.stdout.slice(0, 1200) };
  } catch (error) {
    return { ok: false, task: "", methods: [], error: safeErrorMessage(error) };
  }
}

function resolveCodexCliTimeoutMs() {
  const explicit = Number(process.env.HERMES_CODEX_CLI_TIMEOUT_MS || "");
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const overall = Number(process.env.HERMES_CODEX_TIMEOUT_MS || 240000);
  if (Number.isFinite(overall) && overall > 0) return Math.min(overall, 120000);
  return 120000;
}

async function codexCliReply(model, text, message) {
  setJobPhase(`Codex CLI fallback started: ${model}`);
  const started = Date.now();
  const outputPath = `${OUTPUT_DIR}/codex-cli-last-message-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;
  await mkdir(OUTPUT_DIR, { recursive: true });
  try {
    await runProcess(process.execPath, [
      CODEX_CLI_JS,
      "exec",
      "--model", model,
      "--dangerously-bypass-approvals-and-sandbox",
      "--skip-git-repo-check",
      "--ephemeral",
      "--output-last-message", outputPath,
      await codexPrompt(text, message),
    ], { timeoutMs: resolveCodexCliTimeoutMs() });
    const final = (await readFile(outputPath, "utf8")).trim();
    const latencyMs = Date.now() - started;
    await recordCodexSuccess(`cli:${model}`, latencyMs);
    return {
      backend: "codex-cli",
      model,
      latencyMs,
      text: final,
    };
  } finally {
    try {
      await unlink(outputPath);
    } catch {
      // Best-effort cleanup only.
    }
  }
}

function isWatchdogAbort(error) {
  const msg = error?.message || String(error);
  return msg.includes("Watchdog:") || msg.includes("timed out") || msg.includes("timeout") || msg.includes("AbortError");
}

function watchdogRetryPrompt(originalText, error) {
  return [
    "USER REQUEST:",
    originalText,
    "",
    "HERMES WATCHDOG RETRY:",
    `Previous attempt was stopped: ${safeErrorMessage(error).slice(0, 400)}`,
    "",
    "Retry once with a smaller, safer strategy:",
    "- Start with one cheap probe or direct source lookup.",
    "- Use at most 3 tool calls.",
    "- Do not install packages unless absolutely required.",
    "- Do not brute-force full datasets.",
    "- If complete execution is too slow, return partial but useful results with source notes.",
    "- Explain briefly what was limited.",
  ].join("\n");
}

async function retryAfterWatchdog(text, message, error, runner = codexSdkReply) {
  if (currentJob?.watchdogRetried) return null;
  if (currentJob) currentJob.watchdogRetried = true;
  const retryModel = process.env.HERMES_WATCHDOG_RETRY_MODEL || CODEX_MODELS.find(Boolean);
  if (!retryModel || !(await codexCircuitAllows(retryModel))) return null;
  setJobPhase(`Watchdog retry started: ${retryModel}`);
  await logTaskEvent({
    type: "watchdog_retry_started",
    taskName: currentJob?.taskName || "generic-codex",
    chatId: message.chat.id,
    messageId: message.message_id,
    retryModel,
    previousError: safeErrorMessage(error),
  });
  const previousMaxTools = process.env.HERMES_WATCHDOG_MAX_TOOLS;
  const previousInactivity = process.env.HERMES_WATCHDOG_INACTIVITY_TIMEOUT_MS;
  const previousOverall = process.env.HERMES_CODEX_TIMEOUT_MS;
  process.env.HERMES_WATCHDOG_MAX_TOOLS = process.env.HERMES_RETRY_MAX_TOOLS || "3";
  process.env.HERMES_WATCHDOG_INACTIVITY_TIMEOUT_MS = process.env.HERMES_RETRY_INACTIVITY_TIMEOUT_MS || "25000";
  process.env.HERMES_CODEX_TIMEOUT_MS = process.env.HERMES_RETRY_CODEX_TIMEOUT_MS || "120000";
  try {
    const result = await runner(retryModel, watchdogRetryPrompt(text, error), message);
    if (result.text) {
      setJobPhase(`Watchdog retry completed: ${retryModel}`);
      await logTaskEvent({
        type: "watchdog_retry_completed",
        taskName: currentJob?.taskName || "generic-codex",
        chatId: message.chat.id,
        messageId: message.message_id,
        retryModel,
      });
      return { ...result, watchdogRetry: true };
    }
    throw new Error("Watchdog retry returned an empty response.");
  } catch (retryError) {
    await logTaskEvent({
      type: "watchdog_retry_failed",
      taskName: currentJob?.taskName || "generic-codex",
      chatId: message.chat.id,
      messageId: message.message_id,
      retryModel,
      error: safeErrorMessage(retryError),
    });
    return null;
  } finally {
    if (previousMaxTools === undefined) delete process.env.HERMES_WATCHDOG_MAX_TOOLS;
    else process.env.HERMES_WATCHDOG_MAX_TOOLS = previousMaxTools;
    if (previousInactivity === undefined) delete process.env.HERMES_WATCHDOG_INACTIVITY_TIMEOUT_MS;
    else process.env.HERMES_WATCHDOG_INACTIVITY_TIMEOUT_MS = previousInactivity;
    if (previousOverall === undefined) delete process.env.HERMES_CODEX_TIMEOUT_MS;
    else process.env.HERMES_CODEX_TIMEOUT_MS = previousOverall;
  }
}

async function hermesReply(text, message) {
  const failures = [];
  setJobPhase("Preparing to delegate request to Codex agent");
  let skipAllCodex = false;

  for (const model of CODEX_MODELS) {
    if (!(await codexCircuitAllows(model))) {
      failures.push(`${model}: circuit-open`);
      continue;
    }
    try {
      const result = await codexSdkReply(model, text, message);
      setJobPhase(`Codex SDK response completed: ${model}`);
      if (result.text) return result;
      throw new Error("Codex returned an empty response.");
    } catch (error) {
      await recordCodexFailure(model, error);
      failures.push(`${model}: ${safeErrorMessage(error)}`);
      if (isWatchdogAbort(error)) {
        const retry = await retryAfterWatchdog(text, message, error);
        if (retry?.text) return retry;
        console.log(`Watchdog abort detected: ${safeErrorMessage(error)}. Retry failed or unavailable; skipping remaining models to trigger fallback.`);
        skipAllCodex = true;
        break;
      }
    }
  }

  const cliModel = process.env.HERMES_CODEX_CLI_MODEL || "gpt-5.4";
  if (!skipAllCodex && existsSync(CODEX_CLI_JS) && await codexCircuitAllows(`cli:${cliModel}`)) {
    try {
      const result = await codexCliReply(cliModel, text, message);
      setJobPhase(`Codex CLI response completed: ${cliModel}`);
      if (result.text) return result;
      throw new Error("Codex CLI returned an empty response.");
    } catch (error) {
      await recordCodexFailure(`cli:${cliModel}`, error);
      failures.push(`cli:${cliModel}: ${safeErrorMessage(error)}`);
    }
  }

  if (!(await isOpenRouterEnabled())) {
    setJobPhase("OpenRouter fallback disabled by configuration");
    throw new Error(`Codex backends failed and OpenRouter fallback is disabled. Failures: ${failures.join(" | ").slice(0, 1200)}`);
  }

  const started = Date.now();
  setJobPhase(`OpenRouter fallback started: ${OPENROUTER_MODEL}`);
  const textResponse = await openRouterReply(text, message);
  return {
    backend: "openrouter",
    model: OPENROUTER_MODEL,
    latencyMs: Date.now() - started,
    fallbackFrom: failures,
    text: textResponse,
  };
}

async function testWatchdogRetry() {
  const message = {
    chat: { id: "watchdog-test", type: "private" },
    from: { id: "watchdog-test", first_name: "watchdog-test" },
    message_id: "watchdog-test-message",
    text: "Find market data but avoid slow full scans.",
  };
  currentJob = {
    jobId: `watchdog-test-${Date.now()}`,
    chatId: message.chat.id,
    messageId: message.message_id,
    text: message.text,
    taskName: "generic-codex",
    startedAt: Date.now(),
    status: "running",
    workflow: [],
    cancelRequested: false,
  };
  await upsertJobToDb({
    job_id: currentJob.jobId,
    chat_id: message.chat.id,
    message_id: message.message_id,
    request_text: message.text,
    task_name: currentJob.taskName,
    status: "running",
    started_at: new Date(currentJob.startedAt).toISOString(),
    workflow: [],
  });
  const retryModel = process.env.HERMES_WATCHDOG_RETRY_MODEL || CODEX_MODELS.find(Boolean);
  if (retryModel) {
    const testState = await readState();
    testState.codex ??= {};
    testState.codex.models ??= {};
    testState.codex.models[retryModel] = {
      ...(testState.codex.models[retryModel] || {}),
      failures: 0,
      blockedUntil: null,
      lastError: null,
    };
    await writeState(testState);
  }
  const calls = [];
  try {
    const result = await retryAfterWatchdog(
      message.text,
      message,
      new Error("Watchdog: Inactivity timeout. No event received for 35s"),
      async (model, prompt) => {
        calls.push({ model, prompt });
        return {
          backend: "mock-codex-sdk",
          model,
          latencyMs: 1,
          text: "Mock retry result: used a probe-first constrained path.",
        };
      },
    );
    await updateJobInDb(currentJob.jobId, {
      status: result?.text ? "completed" : "failed",
      phase: currentJob.phase || "watchdog retry test completed",
      workflow: currentJob.workflow || [],
      finished_at: new Date().toISOString(),
    });
    return {
      ok: Boolean(result?.watchdogRetry && result.text),
      result,
      calls,
      workflow: currentJob.workflow,
    };
  } finally {
    currentJob = null;
  }
}
function buildDirectFlowPrompt(text) {
  const cleaned = text
    .replace(/^\/(?:flow|video|shorts)(?:@\w+)?\s*/i, "")
    .trim();
  return [
    "9:16 vertical short-form video, 8 seconds.",
    `User request: ${cleaned || text}`,
    "Create a coherent cinematic short video based on the request.",
    "Use smooth camera motion, clear subject, strong visual continuity, polished lighting.",
    "No subtitles, no readable text, no logos, no watermarks, no spoken audio.",
  ].join(" ");
}

async function latestAiNews() {
  return (await latestAiNewsItems(1))[0];
}

async function latestAiNewsItems(count = 3) {
  return latestNewsItems("artificial intelligence OR AI", count);
}

function newsQueryFromText(text) {
  if (/(?:sports|\uC2A4\uD3EC\uCE20|\uC57C\uAD6C|\uCD95\uAD6C|\uB18D\uAD6C|\uBC30\uAD6C|\uACE8\uD504|\uD14C\uB2C8\uC2A4|mlb|kbo|nba|epl)/i.test(text)) return "sports";
  if (/(?:ai|\uC778\uACF5\uC9C0\uB2A5|artificial intelligence)/i.test(text)) return "artificial intelligence OR AI";
  if (/(?:\uACBD\uC81C|\uC99D\uC2DC|\uC8FC\uC2DD|\uAE08\uB9AC|\uD658\uC728|business|economy|stock)/i.test(text)) return "economy OR business";
  if (/(?:\uC5F0\uC608|\uC5D4\uD130|\uC601\uD654|\uB4DC\uB77C\uB9C8|celebrity|entertainment)/i.test(text)) return "entertainment";
  return "news";
}
async function latestNewsItems(query, count = 3) {
  const encoded = encodeURIComponent(`${query} when:1d`);
  const feeds = [
    `https://news.google.com/rss/search?q=${encoded}&hl=ko&gl=KR&ceid=KR%3Ako`,
    `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US%3Aen`,
  ];
  const seen = new Set();
  const results = [];
  for (const feed of feeds) {
    const response = await fetch(feed, {
      headers: { "User-Agent": "Mozilla/5.0 Telegram Flow News Bot" },
    });
    if (!response.ok) continue;
    const xml = await response.text();
    const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).map((match) => {
      const item = match[1];
      const title = decodeHtml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
      const link = decodeHtml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
      const pubDate = decodeHtml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "");
      const source = decodeHtml(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "");
      return { title, link, pubDate, source };
    }).filter((item) => item.title && item.link);

    for (const item of items) {
      if (/reddit|blog|opinion|stock price/i.test(item.source + " " + item.title)) continue;
      const key = item.title.toLowerCase().replace(/\s+-\s+[^-]+$/u, "").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
      if (results.length >= count) return results;
    }
  }
  if (results.length) return results;
  throw new Error("Could not fetch AI news items.");
}

function buildScriptAndPrompt(news) {
  const title = news.title.replace(/\s+-\s+[^-]+$/u, "");
  const lower = title.toLowerCase();
  const isHealthcare = /(?:brain|tumor|medical|doctor|hospital|patient|health|cancer|\uC758\uB8CC|\uD658\uC790|\uBCD1\uC6D0|\uC554)/i.test(lower);
  const isInfra = /(?:data center|cloud|server|chip|gpu|electric|power|google|microsoft|\uB370\uC774\uD130\uC13C\uD130|\uD074\uB77C\uC6B0\uB4DC|\uC11C\uBC84|\uBC18\uB3C4\uCCB4|\uC804\uB825)/i.test(lower);
  const isSafety = /(?:security|guardrail|government|military|safety|cyber|\uBCF4\uC548|\uC548\uC804|\uC815\uBD80|\uAD70\uC0AC)/i.test(lower);

  let angle = "\uC778\uACF5\uC9C0\uB2A5\uC774 \uC0B0\uC5C5\uACFC \uC77C\uC0C1\uC5D0 \uB354 \uAE4A\uAC8C \uB4E4\uC5B4\uC624\uACE0 \uC788\uB2E4\uB294 \uD750\uB984";
  let visual = "modern AI workspace, software dashboards, robotics lab lights, and clean futuristic interface visuals";
  if (isHealthcare) {
    angle = "AI\uAC00 \uC758\uB8CC \uD604\uC7A5\uC758 \uC9C4\uB2E8\uACFC \uD658\uC790 \uC9C0\uC6D0\uC744 \uB354 \uC815\uAD50\uD558\uAC8C \uB9CC\uB4E4\uACE0 \uC788\uB2E4\uB294 \uD750\uB984";
    visual = "respectful healthcare technology B-roll, doctors reviewing anonymized medical data, abstract neural network overlays";
  } else if (isInfra) {
    angle = "AI \uACBD\uC7C1\uC774 \uB370\uC774\uD130\uC13C\uD130, \uC804\uB825, \uCE69 \uAC19\uC740 \uC778\uD504\uB77C \uACBD\uC7C1\uC73C\uB85C \uD655\uC7A5\uB418\uACE0 \uC788\uB2E4\uB294 \uD750\uB984";
    visual = "large AI data center, glowing server racks, cooling systems, power infrastructure, cinematic tech news B-roll";
  } else if (isSafety) {
    angle = "\uAC15\uB825\uD55C AI\uB97C \uC5B4\uB5BB\uAC8C \uAC80\uC99D\uD558\uACE0 \uC548\uC804\uD558\uAC8C \uD1B5\uC81C\uD560\uC9C0\uAC00 \uC911\uC694\uD574\uC9C0\uACE0 \uC788\uB2E4\uB294 \uD750\uB984";
    visual = "AI safety control room, transparent security shields around an AI network, analysts reviewing risk dashboards";
  }

  return {
    summary: `\uC624\uB298 AI \uB274\uC2A4 \uD575\uC2EC: ${title}. ${angle}\uC744 \uBCF4\uC5EC\uC8FC\uB294 \uC18C\uC2DD\uC785\uB2C8\uB2E4.`,
    script: [
      "\uC624\uB298\uC758 AI \uB274\uC2A4, \uD575\uC2EC\uB9CC \uBE60\uB974\uAC8C \uC9DA\uC5B4\uBCFC\uAC8C\uC694.",
      `\uD575\uC2EC \uC18C\uC2DD: ${title}`,
      `${angle}\uC774 \uB354\uC6B1 \uB69C\uB837\uD574\uC9C0\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`,
      "\uC774\uC81C AI\uB294 \uC2E4\uD5D8\uC2E4\uC744 \uB118\uC5B4 \uC2E4\uC81C \uC0AC\uC5C5\uACFC \uD604\uC7A5\uC758 \uACB0\uC815\uC744 \uBC14\uAFB8\uACE0 \uC788\uC2B5\uB2C8\uB2E4."
    ].join("\n"),
    flowPrompt: [
      "9:16 vertical AI news shorts video, 8 seconds.",
      `Theme: ${title}`,
      `Visual story: ${visual}.`,
      "Style: realistic, polished tech-news B-roll, smooth camera movement, clean lighting, no logos, no readable text, no subtitles, no spoken audio."
    ].join(" "),
  };
}
function findBrowser() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  ];
  const browser = candidates.find((candidate) => existsSync(candidate));
  if (!browser) throw new Error("Chrome/Edge/Brave executable not found.");
  return browser;
}

function buildTelegramYouTubeStageContext({ chatId, replyToMessageId } = {}) {
  return {
    paths: {
      appRoot: ROOT,
      runtimeRoot: ROOT,
      outputDir: OUTPUT_DIR,
      flowProfileDir: PROFILE_DIR,
      geminiProfileDir: GEMINI_PROFILE_DIR,
    },
    chromePath: findBrowser(),
    ffmpegBin: ffmpegPath,
    emit: (event) => {
      if (event.type === "workflow-warning") {
        sendMessage(chatId, `주의: ${event.message}`, replyToMessageId).catch(() => {});
      }
    },
    onFlowProgress: ({ message }) => {
      if (message) setJobPhase(message);
    },
  };
}

async function waitForCdp(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (response.ok) return await response.json();
    } catch {
      // Chrome not ready.
    }
    await delay(500);
  }
  throw new Error("Chrome CDP port did not open. Start Flow once or let the worker open Chrome.");
}

async function ensureChrome() {
  try {
    return await waitForCdp(2000);
  } catch {
    spawn(findBrowser(), [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      FLOW_URL,
    ], { detached: true, stdio: "ignore" }).unref();
    return await waitForCdp(30000);
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      }
    });
  }
  call(method, params = {}) {
    const id = this.id++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression, timeout = 30000) {
    const result = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Evaluation failed");
    }
    return result.result.value;
  }
  async click(x, y) {
    await this.call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await this.call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
  close() {
    this.ws.close();
  }
}

async function flowTarget() {
  await ensureChrome();
  let targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  let target = targets.find((item) => item.type === "page" && item.url.includes("/tools/flow/project/"))
    ?? targets.find((item) => item.type === "page" && item.url.includes("/tools/flow"));
  if (!target) {
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(FLOW_URL)}`);
    await delay(2000);
    targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    target = targets.find((item) => item.type === "page" && item.url.includes("/tools/flow"));
  }
  if (!target) throw new Error("Could not open Google Flow tab.");
  return target;
}

async function generateFlowVideo(flowPrompt, prefix) {
  const target = await flowTarget();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.call("Runtime.enable");
  await cdp.call("Page.enable");
  await cdp.call("Network.enable");

  try {
    let state = await cdp.eval(`(() => ({ href: location.href, text: document.body.innerText.slice(0, 1000) }))()`);
    if (/accounts\.google|signin|auth\/error/i.test(state.href + " " + state.text)) {
      throw new Error("Google Flow login is required in the opened Chrome profile.");
    }

    if (!state.href.includes("/project/")) {
      const opened = await cdp.eval(`(() => {
        const visible = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return !el.disabled && s.display !== 'none' && s.visibility !== 'hidden' && r.width > 8 && r.height > 8; };
        const btn = Array.from(document.querySelectorAll('button,[role="button"],a')).filter(visible).find(el => {
          const t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').toLowerCase();
          return t.includes('new project') || t.includes('get started') || t.includes('\\uC0C8 \\uD504\\uB85C\\uC81D\\uD2B8') || t.includes('\\uC2DC\\uC791');
        });
        if (!btn) return { ok:false, reason:'new project button not found' };
        btn.click(); return { ok:true };
      })()`);
      if (!opened.ok) throw new Error(opened.reason);
      for (let i = 0; i < 60; i += 1) {
        await delay(1000);
        state = await cdp.eval(`(() => ({ href: location.href, text: document.body.innerText.slice(0, 1000) }))()`);
        if (state.href.includes("/project/")) break;
      }
    }
    if (!state.href.includes("/project/")) throw new Error(`Flow project did not open: ${state.href}`);

    const before = await cdp.eval(`(() => Array.from(new Set(Array.from(document.querySelectorAll('video')).map(v => v.currentSrc || v.src).filter(Boolean))))()`);
    const beforeSet = new Set(before);

    const positions = await cdp.eval(`(() => {
      const textbox = Array.from(document.querySelectorAll('[role="textbox"][contenteditable="true"],[contenteditable="true"],textarea'))
        .map(el => ({ r: el.getBoundingClientRect(), text: (el.innerText || el.textContent || '').trim() }))
        .filter(x => x.r.width > 100 && x.r.height > 10)
        .sort((a, b) => b.r.y - a.r.y)[0];
      const create = Array.from(document.querySelectorAll('button,[role="button"]'))
        .map(el => ({ r: el.getBoundingClientRect(), text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim(), disabled: el.disabled }))
        .filter(x => !x.disabled && x.r.width > 10 && x.r.height > 10 && (x.text.includes('arrow_forward') || x.text.includes('\\uB9CC\\uB4E4\\uAE30') || x.text.toLowerCase().includes('create') || x.text.toLowerCase().includes('generate')))
        .sort((a, b) => (b.r.y - a.r.y) || (b.r.x - a.r.x))[0];
      const bodyText = document.body.innerText || '';
      return {
        settings: { video: bodyText.includes('\\uB3D9\\uC601\\uC0C1'), vertical: bodyText.includes('crop_9_16') || bodyText.includes('9:16'), speed: bodyText.includes('1x') },
        textbox: textbox ? { x: Math.round(textbox.r.x + textbox.r.width / 2), y: Math.round(textbox.r.y + textbox.r.height / 2), text: textbox.text } : null,
        create: create ? { x: Math.round(create.r.x + create.r.width / 2), y: Math.round(create.r.y + create.r.height / 2), text: create.text, disabled: create.disabled } : null
      };
    })()`);
    if (!positions.textbox || !positions.create) throw new Error("Flow prompt box or create button not found.");
    if (!positions.settings.video || !positions.settings.vertical || !positions.settings.speed) {
      throw new Error(`Flow settings are not ready: ${JSON.stringify(positions.settings)}. Set Video / 9:16 / 1x once in Flow.`);
    }

    await cdp.click(positions.textbox.x, positions.textbox.y);
    await cdp.call("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await cdp.call("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await cdp.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    await cdp.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    await cdp.call("Input.insertText", { text: flowPrompt });
    await delay(800);
    await cdp.click(positions.create.x, positions.create.y);

    let last = null;
    for (let i = 0; i < 96; i += 1) {
      await delay(5000);
      last = await cdp.eval(`(() => {
        const text = document.body.innerText || '';
        const percents = Array.from(text.matchAll(/(\\d+)%/g)).map(m => Number(m[1]));
        const videos = Array.from(new Set(Array.from(document.querySelectorAll('video')).map(v => v.currentSrc || v.src).filter(Boolean)));
        return { percents, videos, failed: text.includes('\\uC2E4\\uD328'), text: text.slice(0, 1200) };
      })()`);
      const newUrls = last.videos.filter((url) => !beforeSet.has(url));
      if (newUrls.length > 0 && last.percents.length === 0) break;
      if (last.failed && last.percents.length === 0 && newUrls.length > 0) break;
    }

    const allUrls = await cdp.eval(`(() => Array.from(new Set(Array.from(document.querySelectorAll('video')).map(v => v.currentSrc || v.src).filter(Boolean))))()`);
    const newUrls = allUrls.filter((url) => !beforeSet.has(url));
    if (!newUrls.length) {
      const screenshot = await cdp.call("Page.captureScreenshot", { format: "png", fromSurface: true });
      await mkdir(OUTPUT_DIR, { recursive: true });
      const screenshotPath = `${OUTPUT_DIR}/${prefix}-flow-screen.png`;
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      throw new Error(`Flow did not expose a new video URL. Screenshot: ${screenshotPath}`);
    }

    const cookieResult = await cdp.call("Network.getCookies", { urls: ["https://labs.google", FLOW_URL] });
    const cookie = cookieResult.cookies.map((item) => `${item.name}=${item.value}`).join("; ");
    await mkdir(OUTPUT_DIR, { recursive: true });

    const saved = [];
    for (let i = 0; i < newUrls.length; i += 1) {
      const response = await fetch(newUrls[i], {
        headers: { cookie, "user-agent": "Mozilla/5.0 Chrome Flow downloader", accept: "video/*,*/*" },
        redirect: "follow",
      });
      const contentType = response.headers.get("content-type") || "";
      const bytes = new Uint8Array(await response.arrayBuffer());
      const ext = contentType.includes("webm") ? "webm" : "mp4";
      const path = `${OUTPUT_DIR}/${prefix}-${i + 1}.${ext}`;
      await writeFile(path, bytes);
      saved.push({ path, bytes: bytes.length, contentType, ok: response.ok });
    }
    return saved;
  } finally {
    cdp.close();
  }
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  await sendJobAck(chatId, "\uC811\uC218: AI \uB274\uC2A4 1\uAC1C\uB97C \uCC3E\uACE0 \uC694\uC57D\uD55C \uB4A4 Flow\uC5D0\uC11C \uC1FC\uCE20 \uC601\uC0C1\uC744 \uC0DD\uC131\uD569\uB2C8\uB2E4.", replyTo);

  const news = await latestAiNews();
  await rememberChatNews(chatId, [news]);
  const { summary, script, flowPrompt } = buildScriptAndPrompt(news);
  await sendMessage(chatId, `\uC120\uD0DD\uD55C AI \uB274\uC2A4\n${news.title}\n\uCD9C\uCC98: ${news.source || "Google News"}\n${news.link}\n\n\uC694\uC57D\n${summary}\n\n\uB300\uBCF8\n${script}`, replyTo);

  const prefix = `telegram-ai-news-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const videos = await generateFlowVideo(flowPrompt, prefix);
  for (const [index, video] of videos.entries()) {
    await sendVideo(chatId, video.path, `Flow \uC601\uC0C1 \uC0DD\uC131 \uC644\uB8CC (${index + 1}/${videos.length})\n${news.title}`, replyTo);
  }
}

async function handleDirectFlowMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  const text = messageText(message);
  await sendJobAck(chatId, "\uC811\uC218: \uC694\uCCAD\uD55C \uB0B4\uC6A9\uC73C\uB85C Flow \uC601\uC0C1\uC744 \uC0DD\uC131\uD569\uB2C8\uB2E4.", replyTo);

  const prompt = buildDirectFlowPrompt(text);
  const prefix = `telegram-flow-direct-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const videos = await generateFlowVideo(prompt, prefix);
  for (const [index, video] of videos.entries()) {
    await sendVideo(chatId, video.path, `Flow \uC601\uC0C1 \uC0DD\uC131 \uC644\uB8CC (${index + 1}/${videos.length})`, replyTo);
  }
}

function summarizeNewsItem(item) {
  const title = item.title.replace(/\s+-\s+[^-]+$/u, "").trim();
  const lower = title.toLowerCase();
  if (/(?:data center|cloud|server|chip|gpu|power|energy|\uB370\uC774\uD130\uC13C\uD130|\uD074\uB77C\uC6B0\uB4DC|\uC11C\uBC84|\uBC18\uB3C4\uCCB4|\uC804\uB825)/i.test(lower)) {
    return "AI \uC218\uC694\uAC00 \uD074\uB77C\uC6B0\uB4DC, \uC11C\uBC84, \uC804\uB825 \uAC19\uC740 \uC778\uD504\uB77C \uACBD\uC7C1\uC73C\uB85C \uD655\uC7A5\uB418\uACE0 \uC788\uC2B5\uB2C8\uB2E4.";
  }
  if (/(?:regulation|safety|security|copyright|lawsuit|policy|\uADDC\uC81C|\uC548\uC804|\uBCF4\uC548|\uC800\uC791\uAD8C|\uC18C\uC1A1|\uC815\uCC45)/i.test(lower)) {
    return "AI \uD655\uC0B0\uC5D0 \uB530\uB77C \uC548\uC804, \uBCF4\uC548, \uADDC\uC81C \uB17C\uC758\uAC00 \uB354 \uC911\uC694\uD574\uC9C0\uACE0 \uC788\uC2B5\uB2C8\uB2E4.";
  }
  if (/(?:openai|google|microsoft|meta|anthropic|xai|model|\uBAA8\uB378|\uAE30\uC5C5|\uC11C\uBE44\uC2A4)/i.test(lower)) {
    return "\uC8FC\uC694 \uAE30\uC5C5\uB4E4\uC774 AI \uBAA8\uB378\uACFC \uC11C\uBE44\uC2A4 \uACBD\uC7C1\uC744 \uBE60\uB974\uAC8C \uC774\uC5B4\uAC00\uACE0 \uC788\uC2B5\uB2C8\uB2E4.";
  }
  if (/(?:medical|health|doctor|hospital|cancer|\uC758\uB8CC|\uAC74\uAC15|\uC758\uC0AC|\uBCD1\uC6D0|\uC554)/i.test(lower)) {
    return "AI\uAC00 \uC758\uB8CC \uD604\uC7A5\uC758 \uC9C4\uB2E8, \uC608\uCE21, \uD658\uC790 \uC9C0\uC6D0 \uC601\uC5ED\uC73C\uB85C \uB354 \uAE4A\uAC8C \uB4E4\uC5B4\uAC00\uACE0 \uC788\uC2B5\uB2C8\uB2E4.";
  }
  return "AI\uAC00 \uC0B0\uC5C5, \uAE30\uC220, \uC0DD\uD65C \uBC29\uC2DD\uC5D0 \uBBF8\uCE58\uB294 \uC601\uD5A5\uC774 \uACC4\uC18D \uCEE4\uC9C0\uACE0 \uC788\uC2B5\uB2C8\uB2E4.";
}
async function handleNewsSummaryMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  const count = requestedNewsCount(messageText(message), 3);
  const query = newsQueryFromText(messageText(message));
  const label = query.includes("artificial") ? "AI" : query;
  setJobPhase(`Google News RSS search preparing: ${label}`);
  await sendJobAck(chatId, `\uC811\uC218: ${label} \uB274\uC2A4 ${count}\uAC1C\uB97C Google News RSS\uC5D0\uC11C \uC218\uC9D1\uD558\uACE0 \uC694\uC57D\uD569\uB2C8\uB2E4.`, replyTo);

  const items = await latestNewsItems(query, count);
  setJobPhase(`Collecting ${count} items from Google News RSS`);
  await rememberChatNews(chatId, items);
  setJobPhase("Saving news items to session DB");
  setJobPhase("Formatting and sending news summary");
  const lines = items.map((item, index) => [
    `${index + 1}. ${item.title}`,
    `\uCD9C\uCC98: ${item.source || "Google News"}${item.pubDate ? ` / ${item.pubDate}` : ""}`,
    `\uC694\uC57D: ${summarizeNewsItem(item)}`,
    `\uB9C1\uD06C: ${item.link}`,
  ].join("\n"));
  await sendMessage(chatId, `\uCD5C\uC2E0 ${label} \uB274\uC2A4 \uC694\uC57D\n\n${lines.join("\n\n")}`, replyTo);
}

async function handleNaverUpperLimitMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  setJobPhase("Preparing Naver Finance upper-limit page lookup");
  await sendJobAck(chatId, ko.naverUpperAck, replyTo);

  setJobPhase("Running Playwright Naver capture/extraction script");
  const result = await runProcess(process.execPath, [`${ROOT}/naver-upper-limit.mjs`], { timeoutMs: 120000 });
  setJobPhase("Parsing Naver upper-limit table data");
  const jsonText = result.stdout.slice(result.stdout.indexOf("{")).trim();
  const data = JSON.parse(jsonText);
  const rows = (data.rows || []).slice(0, 12).map((row, index) => {
    const name = row[3] || row[0];
    const price = row[4] || "";
    const change = row[6] || "";
    const volume = row[7] || "";
    return `${index + 1}. ${name} | ${ko.currentPrice} ${price} | ${ko.changeRate} ${change} | ${ko.volume} ${volume}`;
  });

  await sendMessage(
    chatId,
    [
      ko.naverUpperDone,
      `${ko.source}: ${data.finalUrl}`,
      "",
      rows.join("\n"),
    ].join("\n"),
    replyTo,
  );
  if (data.screenshotPath) {
    setJobPhase("Sending Naver page screenshot to Telegram");
    await sendPhoto(chatId, data.screenshotPath, ko.naverUpperCaption, replyTo);
  }
}

function isStandaloneOptionChoice(text) {
  return /^([123])(?:\s+.*)?$/.test(text.trim());
}

function parseOptionChoiceNumber(text) {
  const match = String(text || "").trim().match(/^([123])(?:\s+(.*))?$/);
  if (!match) return null;
  return { number: Number(match[1]), suffix: String(match[2] || "").trim() };
}

function isVagueAssistantContinuationQuestion(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return false;
  return /(?:\uBB34\uC5C7\uC744\s*\uC9C4\uD589|\uAD6C\uCCB4\uC801\uC73C\uB85C\s*\uB9D0\uC500|\uC5B4\uB5A4\s*\uC791\uC5C5)/.test(value)
    || /what.*(?:proceed|continue)|which.*task/i.test(value);
}

function assistantOfferedConcreteContinuation(text) {
  const value = String(text || "");
  if (isVagueAssistantContinuationQuestion(value)) return false;
  return /(?:\uACC4\uC18D\s*\uC9C4\uD589\uD560\uAE4C|\uC9C4\uD589\uD560\uAE4C|\uB2E4\uC2DC\s*\uC2DC\uC791\uD560\uAC8C|\uB2E4\uC2DC\s*\uC2DC\uC791|\uC7AC\uC2DC\uC791|\uBC14\uB85C\s*\uB2E4\uC74C|\uB2E4\uC74C\s*\uB2E8\uACC4|\uC774\uC5B4\uC11C\s*\uCC98\uB9AC|\uCDE8\uC18C\uAE4C\uC9C0\s*\uC774\uC5B4\uC11C|\uC870\uD68C\s*\uD6C4\s*\uCDE8\uC18C|\uC2E4\uC81C\s*running\s*job|running\s*job.*cancel|continue|proceed|next step|restart|start again)/i.test(value);
}

async function resolveRecentContinuation(message) {
  if (!isShortContinuationRequest(messageText(message))) return null;
  const messages = await getRecentMessagesFromDb(message.chat.id, 30).catch(() => []);
  const recent = [...messages].reverse();
  const previousAssistant = recent.find((item) => item.role === "assistant" && assistantOfferedConcreteContinuation(item.text));
  if (!previousAssistant) return null;
  const transcript = messages
    .slice(-8)
    .map((item) => `${item.role === "assistant" ? "Hermes" : "User"}: ${String(item.text || "").replace(/\s+/g, " ").slice(0, 900)}`)
    .join("\n");
  return {
    previousAssistant,
    promptText: [
      "USER CONFIRMED CONTINUATION FROM THE PREVIOUS HERMES MESSAGE.",
      "",
      "Previous actionable Hermes message:",
      String(previousAssistant.text || "").slice(0, 1800),
      "",
      "Recent transcript:",
      transcript,
      "",
      "Instruction: Continue the concrete next step promised in the previous actionable Hermes message. Do not ask what to proceed with unless there is truly no actionable step. If the previous step said to inspect running jobs and cancel stale ones, do that now.",
    ].join("\n"),
  };
}

function extractNumberedOptions(text) {
  const value = String(text || "");
  const lines = value.split(/\r?\n/);
  const options = [];
  for (const line of lines) {
    const match = line.match(/^\s*([123])[\.)]?\s*(?:`([^`]+)`|([^:\\n]+?))(?:\s*(?::|-|\s-\s)\s*(.*))?$/);
    if (!match) continue;
    const number = Number(match[1]);
    const title = String(match[2] || match[3] || "").trim();
    const description = String(match[4] || "").trim();
    if (title) options.push({ number, title, description, raw: line.trim() });
  }
  return options;
}

function extractTrailingSequentialOptions(text) {
  const nonEmpty = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const collected = [];
  let expected = null;
  for (let index = nonEmpty.length - 1; index >= 0; index -= 1) {
    const line = nonEmpty[index];
    const match = line.match(/^([123])[\.)]?\s*(?:`([^`]+)`|([^:\n]+?))(?:\s*(?::|-|\s-\s)\s*(.*))?$/);
    if (!match) break;
    const number = Number(match[1]);
    if (expected === null) {
      expected = number;
    } else if (number !== expected - 1) {
      break;
    }
    collected.push({
      number,
      title: String(match[2] || match[3] || "").trim(),
      description: String(match[4] || "").trim(),
      raw: line,
    });
    expected = number;
  }
  const options = collected.reverse();
  if (options.length < 2) return [];
  return options.every((option, index) => option.number === index + 1) ? options : [];
}

function assistantAskedNumberedChoice(text) {
  const value = String(text || "");
  const trailingOptions = extractTrailingSequentialOptions(value);
  if (trailingOptions.length >= 2) return true;
  const options = extractNumberedOptions(value);
  if (options.length < 2) return false;
  if (/\b(?:1\s*[.)]?\s*,?\s*2\s*[.)]?\s*,?\s*3\b|1,\s*2,\s*3)\b/.test(value)) return true;
  return false;
}

async function resolveRecentOptionChoice(message) {
  const choice = parseOptionChoiceNumber(messageText(message));
  if (!choice) return null;
  const messages = await getRecentMessagesFromDb(message.chat.id, 20).catch(() => []);
  const previousAssistant = [...messages].reverse().find((item) => item.role === "assistant" && assistantAskedNumberedChoice(item.text));
  if (!previousAssistant) return null;
  const options = extractTrailingSequentialOptions(previousAssistant.text).length >= 2
    ? extractTrailingSequentialOptions(previousAssistant.text)
    : extractNumberedOptions(previousAssistant.text);
  const selected = options.find((item) => item.number === choice.number);
  if (!selected) return null;
  return {
    choice,
    promptText: [
      "USER SELECTED A NUMBERED OPTION FROM THE PREVIOUS HERMES QUESTION.",
      "",
      "Previous Hermes question/options:",
      String(previousAssistant.text || "").slice(0, 1800),
      "",
      `Selected option: ${choice.number}. ${selected.title}${selected.description ? ` - ${selected.description}` : ""}`,
      choice.suffix ? `User extra note: ${choice.suffix}` : "",
      "",
      "Instruction: Treat this selection as confirmed context. Do not ask the same option question again. Continue the requested implementation or next concrete step using the selected option.",
    ].filter(Boolean).join("\n"),
    selected,
    previousAssistant,
  };
}

async function handleNaverChartChoiceMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  const choice = messageText(message).trim();

  if (choice === "3") {
    await handleNaverUpperLimitMessage(message);
    await sendMessage(chatId, ko.naverChartOption3, replyTo);
    return;
  }

  const chartCount = choice === "1" ? 10 : 3;
  setJobPhase(`Preparing upper-limit list and ${chartCount} three-year daily charts`);
  await sendJobAck(chatId, ko.naverChartAck, replyTo);

  setJobPhase("Running Naver list extraction and chart downloads in parallel");
  const [upperResult, chartResult] = await Promise.all([
    runProcess(process.execPath, [`${ROOT}/naver-upper-limit.mjs`], { timeoutMs: 120000 }),
    runProcess(process.execPath, [`${ROOT}/naver-stock-charts.mjs`, String(chartCount)], { timeoutMs: 180000 }),
  ]);

  const upperJsonText = upperResult.stdout.slice(upperResult.stdout.indexOf("{")).trim();
  setJobPhase("Parsing upper-limit list result");
  const upperData = JSON.parse(upperJsonText);
  const rows = (upperData.rows || []).slice(0, 12).map((row, index) => {
    const name = row[3] || row[0];
    const price = row[4] || "";
    const change = row[6] || "";
    const volume = row[7] || "";
    return `${index + 1}. ${name} | ${ko.currentPrice} ${price} | ${ko.changeRate} ${change} | ${ko.volume} ${volume}`;
  });

  await sendMessage(
    chatId,
    [
      ko.naverUpperDone,
      `${ko.source}: ${upperData.finalUrl}`,
      "",
      rows.join("\n"),
    ].join("\n"),
    replyTo,
  );

  setJobPhase("Sending upper-limit list to Telegram");
  const chartJsonText = chartResult.stdout.slice(chartResult.stdout.indexOf("{")).trim();
  setJobPhase("Parsing and sending three-year daily chart images");
  const chartData = JSON.parse(chartJsonText);
  await sendMessage(chatId, ko.naverChartDone, replyTo);
  for (const capture of chartData.captures || []) {
    setJobPhase(`Sending three-year daily chart: ${capture.name}`);
    await sendPhoto(chatId, capture.path, `${ko.naverDaily3yCaption}: ${capture.name} (${capture.code})`, replyTo);
  }
}

function parseJsonFromProcessStdout(stdout) {
  const text = String(stdout || "").trim();
  if (!text) throw new Error("Process returned empty stdout.");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error(`JSON payload not found in process stdout: ${text.slice(0, 300)}`);
    return JSON.parse(text.slice(start, end + 1));
  }
}

function parseBybitWorkflowParams(text) {
  const value = String(text || "");
  const upperSymbol = value.match(/\b([A-Z0-9]{2,20}USDT)\b/i)?.[1]?.toUpperCase() || "BTCUSDT";
  let interval = "60";
  if (/(?:1\s*\uBD84|1m|\b1\s*min)/i.test(value)) interval = "1";
  else if (/(?:5\s*\uBD84|5m|\b5\s*min)/i.test(value)) interval = "5";
  else if (/(?:15\s*\uBD84|15m|\b15\s*min)/i.test(value)) interval = "15";
  else if (/(?:30\s*\uBD84|30m|\b30\s*min)/i.test(value)) interval = "30";
  else if (/(?:2\s*\uC2DC\uAC04|2h|120)/i.test(value)) interval = "120";
  else if (/(?:4\s*\uC2DC\uAC04|4h|240)/i.test(value)) interval = "240";
  else if (/(?:1\s*\uC2DC\uAC04|1h|60|\uC2DC\uAC04\uBD09)/i.test(value)) interval = "60";
  else if (/(?:\uC77C\uBD09|1d|daily|D\b)/i.test(value)) interval = "D";
  const limitMatch = value.match(/(?:\uCD5C\uADFC\s*)?(\d{2,5})\s*(?:\uAC1C|bars?|candles?|\uCE94\uB4E4|\uBD09)/i)
    || value.match(/limit\s*=?\s*(\d{1,5})/i);
  const limit = Math.max(1, Math.min(5000, Number(limitMatch?.[1] || 1000)));
  return { symbol: upperSymbol, interval, limit };
}

function latestBybitBacktestDir() {
  try {
    const candidates = readdirSync(OUTPUT_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^bybit_.*trend|^bybit_linear_trend/i.test(entry.name))
      .map((entry) => {
        const path = join(OUTPUT_DIR, entry.name);
        return { path, mtimeMs: statSync(path).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates[0]?.path || null;
  } catch {
    return null;
  }
}

function parseKeyValueOutput(stdout) {
  const data = {};
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const match = line.match(/^([^=:\n]+)[=:]\s*(.*)$/);
    if (match) data[match[1].trim()] = match[2].trim();
  }
  return data;
}

async function readBybitRunMetadata(outDir) {
  try {
    const rawPath = join(outDir, "raw_response.json");
    if (!existsSync(rawPath)) return {};
    const raw = JSON.parse(await readFile(rawPath, "utf8"));
    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    const starts = rows.map((row) => Number(row?.[0])).filter((value) => Number.isFinite(value));
    const oldest = starts.length ? new Date(Math.min(...starts)).toISOString() : null;
    const newest = starts.length ? new Date(Math.max(...starts)).toISOString() : null;
    return {
      fetchedAt: raw.fetched_at_utc || null,
      rowCount: rows.length,
      oldest,
      newest,
    };
  } catch {
    return {};
  }
}

async function handleBybitBacktestWorkflowMessageLegacy(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  const text = messageText(message);
  const params = parseBybitWorkflowParams(text);
  const wantsRefresh = /(?:\uCD5C\uADFC|\uCD5C\uC2E0|\uC0C8(?:\uB85C|\uB85C\uC6B4)|refresh|fetch|collect|download|\uC218\uC9D1|\uC870\uD68C)/i.test(text);
  const wantsReverse = /(?:reverse|normal|\uBC18\uB300|\uC5ED\uBC29\uD5A5|\uB871|\uC1FC\uD2B8|long|short|\uC190\uC2E4\s*\uAC70\uB798|\uBE44\uAD50)/i.test(text);
  const sameData = /(?:\uAC19\uC740|\uBC29\uAE08|\uC774\uC804|\uB2E4\uC2DC|\uC7AC\uBC31\uD14C\uC2A4\uD2B8|same|previous|last)/i.test(text);

  await sendJobAck(chatId, "\uC811\uC218: Bybit \uB370\uC774\uD130/\uBC31\uD14C\uC2A4\uD2B8 \uC6CC\uD06C\uD50C\uB85C\uC6B0\uB85C \uCC98\uB9AC\uD569\uB2C8\uB2E4.", replyTo);

  let outDir = sameData && !wantsRefresh ? latestBybitBacktestDir() : null;
  if (!outDir || wantsRefresh || !existsSync(join(outDir, "report", "trades.csv"))) {
    outDir = join(OUTPUT_DIR, `bybit_${params.symbol.toLowerCase()}_linear_${params.interval}m_${params.limit}_${new Date().toISOString().replace(/[:.]/g, "-")}`);
    setJobPhase(`Fetching Bybit klines and running baseline: ${params.symbol} ${params.interval} limit=${params.limit}`);
    await runProcess("python", [
      `${ROOT}/scripts/run_bybit_linear_trend_backtest.py`,
      "--symbol", params.symbol,
      "--interval", params.interval,
      "--limit", String(params.limit),
      "--output-dir", outDir,
    ], { timeoutMs: Number(process.env.HERMES_BYBIT_BACKTEST_TIMEOUT_MS || 180000) });
  } else {
    setJobPhase(`Using latest saved Bybit dataset: ${outDir}`);
  }

  const summaryPath = join(outDir, "report", "summary.md");
  const tradesPath = join(outDir, "report", "trades.csv");
  const summary = existsSync(summaryPath) ? await readFile(summaryPath, "utf8") : "";
  const tradeStats = await runProcess("python", [
    `${ROOT}/scripts/analyze_bybit_reverse_losers.py`,
    "--trades", tradesPath,
  ], { timeoutMs: 30000 });
  const stats = parseKeyValueOutput(tradeStats.stdout);

  const lines = [
    "Bybit backtest completed.",
    "",
    `- Output directory: ${outDir}` ,
    `- summary: ${summaryPath}` ,
    `- trades: ${tradesPath}` ,
    "",
    summary.trim(),
    "",
    "Validation summary:",
    `- closed trade PnL: ${stats.original_closed_trade_pnl ?? "-"}` ,
    `- losing trades: ${stats.losers ?? "-"}/${stats.trades ?? "-"}` ,
  ];
  if (wantsReverse) {
    lines.push(
      "",
      "Reverse scenario comparison:",
      `- reverse_long_entries: ${stats.reverse_long_entries_total_pnl ?? "-"}` ,
      `- reverse_all_entries: ${stats.reverse_all_entries_total_pnl ?? "-"}` ,
      `- counterfactual_reverse_losers: ${stats.closed_trade_pnl_with_losers_reversed ?? "-"}` ,
      "- Note: counterfactual_reverse_losers is an analytical replay, not an executable strategy.",
    );
  }
  lines.push("", "Reference: bybit.md");
  await sendLongMessage(chatId, lines.filter(Boolean).join("\n"), replyTo);
}

async function handleBybitBacktestWorkflowMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  const text = messageText(message);
  const params = parseBybitWorkflowParams(text);
  const wantsRefresh = /(?:latest|new|refresh|fetch|collect|download|query|lookup|rerun|restart)/i.test(text);
  const wantsReverse = /(?:reverse|mirror|flip|long|short|trend|compare|counter|loss)/i.test(text);
  const sameData = /(?:same|previous|last|again|reuse|cache)/i.test(text);

  await sendJobAck(chatId, "Processing Bybit workflow: running backtest or reusing latest dataset.", replyTo);

  let outDir = sameData && !wantsRefresh ? latestBybitBacktestDir() : null;
  if (!outDir || wantsRefresh || !existsSync(join(outDir, "report", "trades.csv"))) {
    outDir = join(OUTPUT_DIR, `bybit_${params.symbol.toLowerCase()}_linear_${params.interval}m_${params.limit}_${new Date().toISOString().replace(/[:.]/g, "-")}`);
    setJobPhase(`Fetching Bybit klines and running baseline: ${params.symbol} ${params.interval} limit=${params.limit}`);
    await runProcess("python", [
      `${ROOT}/scripts/run_bybit_linear_trend_backtest.py`,
      "--symbol", params.symbol,
      "--interval", params.interval,
      "--limit", String(params.limit),
      "--output-dir", outDir,
    ], { timeoutMs: Number(process.env.HERMES_BYBIT_BACKTEST_TIMEOUT_MS || 180000) });
  } else {
    setJobPhase(`Using latest saved Bybit dataset: ${outDir}`);
  }

  const summaryPath = join(outDir, "report", "summary.md");
  const tradesPath = join(outDir, "report", "trades.csv");
  const summary = existsSync(summaryPath) ? await readFile(summaryPath, "utf8") : "";
  const tradeStats = await runProcess("python", [
    `${ROOT}/scripts/analyze_bybit_reverse_losers.py`,
    "--trades", tradesPath,
  ], { timeoutMs: 30000 });
  const stats = parseKeyValueOutput(tradeStats.stdout);
  const baselinePnl = stats.original_closed_trade_pnl ?? "-";
  const reverseLongPnl = stats.reverse_long_entries_total_pnl ?? "-";
  const reverseAllPnl = stats.reverse_all_entries_total_pnl ?? "-";
  const hindsightPnl = stats.closed_trade_pnl_with_losers_reversed ?? "-";
  const meta = await readBybitRunMetadata(outDir);

  const lines = [
    "Bybit workflow backtest completed.",
    "",
    `- Output directory: ${outDir}` ,
    `- summary: ${summaryPath}` ,
    `- trades: ${tradesPath}` ,
    "",
    "Baseline validation summary:",
    `- closed trade PnL: ${baselinePnl}` ,
    `- losing trades: ${stats.losers ?? "-"}/${stats.trades ?? "-"}` ,
  ];
  if (wantsReverse) {
    lines.push(
      "",
      "Reverse scenario comparison:",
      `- reverse_long_entries: ${reverseLongPnl}` ,
      `- reverse_all_entries: ${reverseAllPnl}` ,
      `- counterfactual_reverse_losers: ${hindsightPnl}` ,
      "- Note: counterfactual_reverse_losers is an analytical replay, not an executable strategy.",
    );
  } else {
    lines.push("- Trend breakout run executed (reverse comparison was not requested).", "");
  }

  lines.push(
    "Workflow metadata:",
    `- Dataset source: ${sameData && !wantsRefresh ? "cached" : "Bybit public klines"}` ,
    meta.fetchedAt ? `- Fetched UTC: ${meta.fetchedAt}` : null,
    meta.rowCount ? `- Row count: ${meta.rowCount}` : null,
    meta.oldest && meta.newest ? `- Date range UTC: ${meta.oldest} -> ${meta.newest}` : null,
    "",
    `- full summary text:\n${(summary.trim() || "No summary.md content found.")}`,
    "",
    "Reference: bybit.md",
  );

  await sendLongMessage(chatId, lines.filter(Boolean).join("\n"), replyTo);
}
function formatKrxYtdSummary(data) {
  const rows = (data.top || []).map((item) => {
    const ret = Number(item.ytd_return_pct).toFixed(2);
    const first = Number(item.first_close).toLocaleString("ko-KR");
    const latest = Number(item.latest_close).toLocaleString("ko-KR");
    return `${item.rank}. ${item.name} (${item.code}, ${item.market}) | ${ret}% | ${item.first_date} ${first} -> ${item.latest_date} ${latest}`;
  });
  return [
    `2026 YTD Top 10 (${data.year || 2026})`,
    `Method: ${data.method}`,
    `Source: ${data.source}`,
    `Ranked: ${data.ranked_count}/${data.universe_count}`,
    data.failed_chunks ? `- Warning: ${data.failed_chunks} chunk(s) failed` : null,
    "",
    rows.join("\\n"),
  ].filter(Boolean).join("\\n");
}

function formatKrxNear3YHighSummary(data) {
  const rows = (data.top || []).map((item) => {
    const latest = Number(item.latest_close).toLocaleString("ko-KR");
    const high = Number(item.three_year_high).toLocaleString("ko-KR");
    const gap = Number(item.gap_to_high_pct).toFixed(2);
    return `${item.rank}. ${item.name} (${item.code}, ${item.market}) | Gap to 3Y high: ${gap}% | Latest ${latest} / 3Y High ${high} (${item.three_year_high_date})`;
  });
  return [
    "Closest to 3Y high (Top 10)",
    `Method: ${data.method}`,
    `Source: ${data.source}`,
    `Ranked: ${data.ranked_count}/${data.universe_count}`,
    data.failed_chunks ? `- Warning: ${data.failed_chunks} chunk(s) failed` : null,
    "",
    rows.join("\\n"),
  ].filter(Boolean).join("\\n");
}

function formatKrxTargetReclaimSummary(data) {
  const titleTarget = Number(data.target_price || data.top?.[0]?.target_price || 0).toLocaleString("ko-KR");
  const rows = (data.top || []).map((item) => {
    const latest = Number(item.latest_close).toLocaleString("ko-KR");
    const historicalMax = Number(item.historical_max_before_recent).toLocaleString("ko-KR");
    const target = Number(item.target_price).toLocaleString("ko-KR");
    const distance = Number(item.distance_to_target_pct).toFixed(2);
    return `${item.rank}. ${item.name} (${item.code}, ${item.market}) | Latest: ${latest} | Target: ${target} (${distance}%) | Historical max before recent: ${historicalMax} | First near-date: ${item.first_recent_near_date}`;
  });
  return [
    `3Y target reclaim (${titleTarget || "-"} KRW) - Top 10`,
    `Method: ${data.method}`,
    `Source: ${data.source}`,
    `Ranked: ${data.ranked_count}/${data.universe_count}`,
    data.failed_chunks ? `- Warning: ${data.failed_chunks} chunk(s) failed` : null,
    "",
    rows.length ? rows.join("\\n") : "No reclaim candidates found.",
  ].filter(Boolean).join("\\n");
}

async function handleKrxTargetReclaimMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  const targetPrice = parseKrxTargetReclaimPrice(messageText(message)) || 10000;
  const targetLabel = Number(targetPrice).toLocaleString("ko-KR");
  setJobPhase("Preparing KRX target reclaim screen");
  await sendJobAck(chatId, `${targetLabel}원 기준 3년 이내 근접 구간 Top10 후보를 계산합니다.`, replyTo);

  const outDir = `${OUTPUT_DIR}/krx-target-reclaim-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  setJobPhase("Running KRX/YFinance target reclaim helper");
  const args = [
    `${ROOT}/scripts/krx_target_reclaim.py`,
    "--top", "10",
    "--years", "3",
    "--target", String(targetPrice),
    "--recent-days", "31",
    "--near-pct", process.env.HERMES_KRX_TARGET_RECLAIM_NEAR_PCT || "0.08",
    "--out-dir", outDir,
  ];
  if (process.env.HERMES_KRX_TARGET_RECLAIM_MAX_CODES) {
    args.push("--max-codes", process.env.HERMES_KRX_TARGET_RECLAIM_MAX_CODES);
  }
  const result = await runProcess("python", args, { timeoutMs: Number(process.env.HERMES_KRX_TARGET_RECLAIM_TIMEOUT_MS || 420000) });
  if (result.stderr?.trim()) {
    console.log(result.stderr.trim());
  }
  const data = parseJsonFromProcessStdout(result.stdout);
  if (!Array.isArray(data.top)) {
    throw new Error("KRX target reclaim helper returned invalid result.");
  }

  setJobPhase("Sending KRX target reclaim Top10 summary to Telegram");
  await sendMessage(chatId, formatKrxTargetReclaimSummary(data), replyTo);
}

async function handleKrxNear3YHighMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  setJobPhase("Preparing KRX near 3-year-high ranking");
  await sendJobAck(chatId, `KRX 3년 신고가 근접 Top10 계산을 시작합니다.`, replyTo);

  const outDir = `${OUTPUT_DIR}/krx-near-3y-high-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  setJobPhase("Running KRX/YFinance 3-year high proximity helper");
  const args = [
    `${ROOT}/scripts/krx_near_3y_high.py`,
    "--top", "10",
    "--years", "3",
    "--out-dir", outDir,
  ];
  if (process.env.HERMES_KRX_NEAR_HIGH_MAX_CODES) {
    args.push("--max-codes", process.env.HERMES_KRX_NEAR_HIGH_MAX_CODES);
  }
  const result = await runProcess("python", args, { timeoutMs: Number(process.env.HERMES_KRX_NEAR_HIGH_TIMEOUT_MS || 420000) });
  if (result.stderr?.trim()) {
    console.log(result.stderr.trim());
  }
  const data = parseJsonFromProcessStdout(result.stdout);
  if (!data.ok || !Array.isArray(data.top) || !data.top.length) {
    throw new Error("KRX 3-year-high proximity helper returned no stocks.");
  }

  setJobPhase("Sending KRX near 3-year-high Top10 summary to Telegram");
  await sendMessage(chatId, formatKrxNear3YHighSummary(data), replyTo);
}

async function handleKrxYtdTopChartsMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  setJobPhase("Preparing KRX YTD Top10 ranking and 3-year daily charts");
  await sendJobAck(chatId, `KRX 2026 YTD 상위 10개와 3년 일봉 차트 생성을 시작합니다.`, replyTo);

  const outDir = `${OUTPUT_DIR}/krx-ytd-top10-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  setJobPhase("Running bounded KRX/YFinance grouped ranking helper");
  const args = [
    `${ROOT}/scripts/krx_ytd_top10_charts.py`,
    "--top", "10",
    "--year", "2026",
    "--out-dir", outDir,
  ];
  if (process.env.HERMES_KRX_YTD_MAX_CODES) {
    args.push("--max-codes", process.env.HERMES_KRX_YTD_MAX_CODES);
  }
  const result = await runProcess("python", args, { timeoutMs: Number(process.env.HERMES_KRX_YTD_TIMEOUT_MS || 420000) });
  if (result.stderr?.trim()) {
    console.log(result.stderr.trim());
  }
  const data = parseJsonFromProcessStdout(result.stdout);
  if (!data.ok || !Array.isArray(data.top) || !data.top.length) {
    throw new Error("KRX YTD ranking helper returned no top stocks.");
  }

  setJobPhase("Sending KRX YTD Top10 summary to Telegram");
  await sendMessage(chatId, formatKrxYtdSummary(data), replyTo);

  setJobPhase("Sending 3-year daily chart images for Top10");
  for (const item of data.top) {
    if (!item.chart_path) {
      await sendMessage(chatId, `차트 생성 실패: ${item.rank}. ${item.name} (${item.code}) - ${item.chart_error || "unknown error"}`, replyTo);
      continue;
    }
    setJobPhase(`Sending KRX YTD chart ${item.rank}/10: ${item.name} (${item.code})`);
    await sendPhoto(
      chatId,
      item.chart_path,
      `${item.rank}. ${item.name} (${item.code}) | 2026 YTD ${Number(item.ytd_return_pct).toFixed(2)}% | 3년 일봉 차트`,
      replyTo,
    );
  }
}

async function recentImageFiles(limit = 3, chatId = "") {
  if (chatId) {
    const artifacts = await getRecentArtifactsFromDb(chatId, Math.max(limit * 4, 12));
    const artifactFiles = artifacts
      .filter((item) => item.path && /\.(?:png|jpe?g|webp)$/i.test(item.path) && existsSync(item.path))
      .map((item) => ({
        path: item.path,
        name: basename(item.path),
        mtimeMs: new Date(item.created_at || 0).getTime(),
      }));
    if (artifactFiles.length) return artifactFiles.slice(0, limit);
  }
  const directories = [`${ROOT}/charts`, OUTPUT_DIR];
  const extensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  const files = [];
  async function collect(directory, depth = 0) {
    try {
      for (const name of await readdir(directory)) {
        const path = join(directory, name);
        const info = await stat(path);
        if (info.isDirectory()) {
          if (depth < 4) await collect(path, depth + 1);
          continue;
        }
        if (!extensions.has(extname(name).toLowerCase())) continue;
        files.push({ path, name, mtimeMs: info.mtimeMs });
      }
    } catch {
      // The directory may not exist yet.
    }
  }
  for (const directory of directories) {
    await collect(directory);
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const chartFiles = files.filter((file) => /chart|daily|3y|buy_timing|marked|KEC|KOREA|BOHAE/i.test(file.name));
  return (chartFiles.length ? chartFiles : files).slice(0, limit);
}

async function handleSendLatestImagesMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  setJobPhase("Searching recent generated image files");
  await sendJobAck(chatId, ko.imageSendAck, replyTo);
  const files = await recentImageFiles(3, chatId);
  if (!files.length) {
    await sendMessage(chatId, ko.imageSendMissing, replyTo);
    return;
  }
  for (const file of files) {
    setJobPhase(`Sending Telegram photo: ${file.name}`);
    await sendPhoto(chatId, file.path, `${ko.imageCaption}: ${file.name}`, replyTo);
  }
}

function extractBuyTimingSpecsFromText(text) {
  const specs = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (!/^\s*\|/.test(line)) continue;
    if (!/\([0-9]{6}\)/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const match = cells[0].match(/^(.+?)\(([0-9]{6})\)/);
    if (!match) continue;
    specs.push({
      name: match[1].replace(/\*/g, "").trim(),
      code: match[2],
      first_point: cells[1] || "",
      second_point: cells[2] || "",
      price_range: cells[3] || "",
      signal: cells[4] || "",
    });
  }
  return specs;
}

async function findRecentBuyTimingSpecs(chatId) {
  const [recent, semantic] = await Promise.all([
    getRecentMessagesFromDb(chatId, 30),
    searchMessagesFromDb(chatId, "latest assistant output containing buy/sell point discussion", 12),
  ]);
  const candidates = [...recent, ...semantic]
    .filter((item) => item.role === "assistant")
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  for (const item of candidates) {
    const specs = extractBuyTimingSpecsFromText(item.text);
    if (specs.length) return specs.slice(0, 6);
  }
  return [];
}

async function handleChartAnnotationFollowupMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  setJobPhase("Preparing chart annotation follow-up from recent conversation");
  await sendJobAck(
    chatId,
    "I will re-check recent assistant buy-timing analysis messages and create charts for the matching entries.",
    replyTo,
  );

  const specs = await findRecentBuyTimingSpecs(chatId);
  if (!specs.length) {
    await sendMessage(
      chatId,
      "No usable prior buy-timing message found yet. Please ask again after generating a buy-timing table in chat.",
      replyTo,
    );
    return;
  }

  const outDir = `${OUTPUT_DIR}/buy-timing-marked-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(outDir, { recursive: true });
  const specsFile = `${outDir}/specs.json`;
  await writeFile(specsFile, JSON.stringify(specs, null, 2), "utf8");
  setJobPhase(`Generating annotated buy-timing charts (${specs.length})`);
  const result = await runProcess("python", [
    `${ROOT}/scripts/annotate_buy_timing_charts.py`,
    "--specs-file", specsFile,
    "--out-dir", outDir,
  ], { timeoutMs: 180000, env: { PYTHONIOENCODING: "utf-8" } });
  if (result.stderr?.trim()) console.log(result.stderr.trim());
  const data = parseJsonFromProcessStdout(result.stdout);
  const items = Array.isArray(data.items) ? data.items : [];
  const okItems = items.filter((item) => item.ok && item.path);
  if (!okItems.length) {
    throw new Error(`Annotated chart generation failed: ${JSON.stringify(items).slice(0, 500)}`);
  }

  setJobPhase("Sending annotated buy-timing chart images");
  for (const item of okItems) {
    setJobPhase(`Sending annotated chart: ${item.name} (${item.code})`);
    await sendPhoto(chatId, item.path, `${item.name} (${item.code}) annotated buy-timing chart`, replyTo);
  }
  const failures = items.filter((item) => !item.ok);
  if (failures.length) {
    await sendMessage(chatId, `Some chart generation items failed: ${failures.map((item) => `${item.name || item.code}: ${item.error}`).join("; ")}`, replyTo);
  }
}
async function handleRememberedNewsFollowup(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  const text = messageText(message);
  const index = referencedNewsIndex(text);
  const session = await readSessionFromDb(chatId);
  const items = Array.isArray(session.lastNewsItems) ? session.lastNewsItems : (Array.isArray(session.recentNews) ? session.recentNews : []);
  const item = items[index];
  if (!item) {
    await sendMessage(chatId, "\uAE30\uC5B5\uD55C \uB274\uC2A4 \uBAA9\uB85D\uC5D0\uC11C \uD574\uB2F9 \uBC88\uD638\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uB274\uC2A4 \uC694\uC57D\uC744 \uB2E4\uC2DC \uC694\uCCAD\uD574\uC8FC\uC138\uC694.", replyTo);
    return;
  }

  await sendJobAck(chatId, `\uC811\uC218: ${index + 1}\uBC88 \uB274\uC2A4\uB97C \uAE30\uC900\uC73C\uB85C \uC800\uC791\uAD8C\uC5D0 \uC704\uBC30\uB418\uC9C0 \uC54A\uAC8C \uAC01\uC0C9\uD558\uACE0 \uBB38\uC7A5\uBCC4 \uC774\uBBF8\uC9C0 \uD504\uB86C\uD504\uD2B8\uB97C \uC0DD\uC131\uD569\uB2C8\uB2E4.`, replyTo);
  const key = await readOpenRouterKey();
  const prompt = [
    "You are a Korean short-form scriptwriter.",
    "Do not copy the article. Transform the idea into original wording.",
    "Return: 1) safe adaptation angle, 2) 30-second Korean script, 3) image prompt for each sentence in 9:16 ratio.",
    "",
    `Title: ${item.title}`,
    `Source: ${item.source || "Google News"}`,
    `Published: ${item.pubDate || ""}`,
    `Link: ${item.link}`,
    `Known summary: ${summarizeNewsItem(item)}`,
  ].join("\n");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost/hermes-telegram",
      "X-Title": "Hermes Telegram Bot",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: "You are a Korean short-form scriptwriter. Avoid copyright infringement by paraphrasing and transforming ideas instead of copying source text." },
        { role: "user", content: prompt },
      ],
      temperature: 0.45,
      max_tokens: 1800,
    }),
  });
  const json = await response.json();
  if (!response.ok || !json.choices?.[0]?.message?.content) {
    throw new Error(`OpenRouter failed: ${json.error?.message || response.statusText}`);
  }
  await sendLongMessage(chatId, json.choices[0].message.content.trim(), replyTo);
}
async function handleGenericMessage(message) {
  const text = messageText(message).trim();
  setJobPhase("Generic request received; preparing strategy gate");
  const ack = await sendJobAck(message.chat.id, ko.genericAck, message.message_id);
  const previousMaxTools = process.env.HERMES_WATCHDOG_MAX_TOOLS;
  const previousTimeout = process.env.HERMES_CODEX_TIMEOUT_MS;
  try {
    const optionResolution = await resolveRecentOptionChoice(message);
    if (optionResolution) {
      setJobPhase(`Resolved numbered option: ${optionResolution.choice.number}. ${optionResolution.selected.title}`);
      await logTaskEvent({
        type: "option_choice_resolved",
        taskName: currentJob?.taskName || "generic-codex",
        chatId: message.chat.id,
        messageId: message.message_id,
        choice: optionResolution.choice.number,
        selected: optionResolution.selected,
      });
    }
    const continuationResolution = optionResolution ? null : await resolveRecentContinuation(message);
    if (continuationResolution) {
      setJobPhase("Resolved short continuation against previous Hermes action");
      await logTaskEvent({
        type: "continuation_resolved",
        taskName: currentJob?.taskName || "generic-codex",
        chatId: message.chat.id,
        messageId: message.message_id,
        previousAssistantMessageId: continuationResolution.previousAssistant?.message_id,
      });
    }
    const executionText = await prepareGenericExecutionText(optionResolution?.promptText || continuationResolution?.promptText || text, message);
    if (currentJob?.strategyEvaluation && !currentJob.strategyEvaluation.allowed) {
      process.env.HERMES_WATCHDOG_MAX_TOOLS = String(currentJob.strategyEvaluation.maxToolCalls || 3);
      process.env.HERMES_CODEX_TIMEOUT_MS = String((currentJob.strategyEvaluation.maxRuntimeSec || 90) * 1000);
      await editMessage(message.chat.id, ack.message_id, [
        "요청이 넓은 탐색이라 실행 전에 안전 모드로 전환합니다.",
        `제약: ${currentJob.strategyEvaluation.constraints?.[0] || "broad/slow task"}`,
        "우선 소규모 탐색(Probe) 후 필요 시 점진적으로 확장합니다."
      ].join("\n")).catch(() => {});
    }
    setJobPhase("Generating answer with Codex/Hermes");
    const response = await hermesReply(executionText, message);
    setJobPhase("Sending final answer to Telegram");
    await sendMessage(message.chat.id, response.text, message.message_id);
    console.log(JSON.stringify({
      type: "hermes_reply",
      backend: response.backend,
      model: response.model,
      latencyMs: response.latencyMs,
      fallback: Boolean(response.fallbackFrom?.length),
      watchdogAborted: /watchdog/i.test(response.text || ""),
      strategyConstrained: Boolean(currentJob?.strategyEvaluation && !currentJob.strategyEvaluation.allowed),
    }));
  } catch (error) {
    setJobPhase("Generic request failed; reporting error");
    if (currentJob) {
      currentJob.status = "failed";
      currentJob.error = safeErrorMessage(error).slice(0, 2000);
    }
    await logFailureToDb("generic-codex", message, error, 0);
    const isWatchdog = /watchdog/i.test(safeErrorMessage(error));
    const userMsg = isWatchdog
      ? `Codex execution was stopped by watchdog. Reason: ${safeErrorMessage(error).slice(0, 300)}\nSend the same request again and Hermes will try a constrained alternative path.`
      : formatAutoFailureReport({
        taskName: "generic-codex",
        requestText: messageText(message),
        error,
        phase: currentJob?.phase || "Generic request failed; reporting error",
      });
    await sendMessage(message.chat.id, userMsg, message.message_id);
  } finally {
    if (previousMaxTools === undefined) delete process.env.HERMES_WATCHDOG_MAX_TOOLS;
    else process.env.HERMES_WATCHDOG_MAX_TOOLS = previousMaxTools;
    if (previousTimeout === undefined) delete process.env.HERMES_CODEX_TIMEOUT_MS;
    else process.env.HERMES_CODEX_TIMEOUT_MS = previousTimeout;
  }
}

function memoryCandidateFromMessage(message) {
  const text = messageText(message).trim();
  if (!text || text.length < 8) return null;
  if (/^\//.test(text)) return null;
  if (/^\/(?:status|jobs|lastjob|failures|retry|cancel|stop|start|help)(?:@\w+)?(?:\s|$)/i.test(text)) return null;

  const preferencePattern = /(?:\uC55E\uC73C\uB85C|\uD56D\uC0C1|\uBC18\uB4DC\uC2DC|\uAE30\uC5B5|\uC800\uC7A5|\uC774\uD6C4|\uB2E4\uC74C\uBD80\uD130|\uD560\s*\uB54C\uB9CC|\uB54C\uB9CC|\uD558\uC9C0\s*\uB9C8|\uD558\uBA74\s*\uC548|\uAE08\uC9C0|\uC6D0\uD574|\uC88B\uC544|\uC2EB\uC5B4|\uADDC\uCE59|\uC124\uC815|\uC120\uD638|only|always|never|remember|preference|rule)/i;
  const hermesPattern = /(?:hermes|\uD5E4\uB974\uBA54\uC2A4|\uD154\uB808\uADF8\uB7A8|\uBD07|flow|codex|openrouter|mcp|memory|\uBA54\uBAA8\uB9AC|\uAE30\uC5B5)/i;
  if (!preferencePattern.test(text) && !hermesPattern.test(text)) return null;

  let kind = "fact";
  let importance = 2;
  const tags = [];
  if (preferencePattern.test(text)) {
    kind = "preference";
    importance = 4;
    tags.push("preference");
  }
  if (/(?:\uD558\uC9C0\s*\uB9C8|\uD558\uBA74\s*\uC548|\uAE08\uC9C0|never|only|\uB54C\uB9CC)/i.test(text)) {
    kind = "rule";
    importance = 5;
    tags.push("rule", "routing");
  }
  if (/(?:flow|\uD50C\uB85C\uC6B0|\uC601\uC0C1|\uC1FC\uCE20)/i.test(text)) tags.push("flow-video");
  if (/(?:\uB274\uC2A4|news)/i.test(text)) tags.push("news");
  if (/(?:\uC0C1\uD0DC|\uC9C4\uD589|\uBA48\uCDB0|\uBA48\uCD98|status)/i.test(text)) tags.push("status");

  return {
    chat_id: String(message.chat?.id ?? ""),
    scope: "chat",
    kind,
    text: text.slice(0, 1000),
    tags: [...new Set(tags)].join(","),
    importance,
    source_message_id: String(message.message_id ?? ""),
  };
}

async function rememberMessageIfUseful(message) {
  const candidate = memoryCandidateFromMessage(message);
  if (!candidate) return null;
  const saved = await addMemoryToDb(candidate);
  if (saved?.ok) {
    const context = {
      memoryId: saved.id,
      kind: candidate.kind,
      tags: candidate.tags,
      deduped: Boolean(saved.deduped),
    };
    await logTaskEventToDb("memory.saved", "memory", message, "", context);
  }
  return saved;
}

async function rememberJobOutcome(job, status, error = "") {
  if (!job?.chatId || !job?.text) return null;
  const workflow = Array.isArray(job.workflow) ? job.workflow.slice(-6).map((item) => item.phase).filter(Boolean) : [];
  const text = [
    `Job outcome: ${status}`,
    `Task: ${job.taskName || "unknown"}`,
    `Request: ${String(job.text || "").replace(/\s+/g, " ").slice(0, 500)}`,
    `Final phase: ${job.phase || status}`,
    workflow.length ? `Recent workflow: ${workflow.join(" -> ")}` : "",
    error ? `Error: ${String(error).replace(/\s+/g, " ").slice(0, 500)}` : "",
  ].filter(Boolean).join("\n");
  return addMemoryToDb({
    chat_id: String(job.chatId),
    scope: "chat",
    kind: status === "completed" ? "job_summary" : "job_failure",
    text,
    tags: `job,${job.taskName || "unknown"},${status}`,
    importance: status === "completed" ? 2 : 4,
    source_message_id: String(job.messageId ?? ""),
  });
}

function routeMetadataForText(text) {
  if (isStartOrHelpRequest(text)) return {
    name: "help",
    handler: null,
    confidence: 1,
    matched_rules: ["command:help"],
    blocked_rules: [],
    rationale: "control/FAQ command recognized",
  };
  if (isStatusRequest(text)) return {
    name: "status",
    handler: null,
    confidence: 1,
    matched_rules: ["command:status"],
    blocked_rules: [],
    rationale: "status command recognized",
  };
  if (isCancelRequest(text)) return {
    name: "cancel",
    handler: null,
    confidence: 1,
    matched_rules: ["command:cancel"],
    blocked_rules: [],
    rationale: "cancel command recognized",
  };
  if (isLastJobRequest(text)) return {
    name: "lastjob",
    handler: null,
    confidence: 1,
    matched_rules: ["command:lastjob"],
    blocked_rules: [],
    rationale: "workflow command recognized",
  };
  if (isJobsRequest(text)) return {
    name: "jobs",
    handler: null,
    confidence: 1,
    matched_rules: ["command:jobs"],
    blocked_rules: [],
    rationale: "workflow command recognized",
  };
  if (isRetryRequest(text)) return {
    name: "retry",
    handler: null,
    confidence: 1,
    matched_rules: ["command:retry"],
    blocked_rules: [],
    rationale: "workflow command recognized",
  };
  if (isFailuresRequest(text)) return {
    name: "failures",
    handler: null,
    confidence: 1,
    matched_rules: ["command:failures"],
    blocked_rules: [],
    rationale: "workflow command recognized",
  };
  if (isDiagnoseRequest(text)) return {
    name: "diagnose",
    handler: handleDiagnoseMessage,
    confidence: 1,
    matched_rules: ["command:diagnose"],
    blocked_rules: [],
    rationale: "workflow command recognized",
  };
  if (isSelfTestRequest(text)) return {
    name: "selftest",
    handler: handleSelfTestMessage,
    confidence: 1,
    matched_rules: ["command:selftest"],
    blocked_rules: [],
    rationale: "workflow command recognized",
  };
  if (isMemoryListRequest(text)) return {
    name: "memory",
    handler: null,
    confidence: 1,
    matched_rules: ["command:memory"],
    blocked_rules: [],
    rationale: "workflow command recognized",
  };
  if (isContextListRequest(text)) return {
    name: "context",
    handler: null,
    confidence: 1,
    matched_rules: ["command:context"],
    blocked_rules: [],
    rationale: "workflow command recognized",
  };
  if (isCapabilitiesRequest(text)) return {
    name: "capabilities",
    handler: null,
    confidence: 1,
    matched_rules: ["command:capabilities"],
    blocked_rules: [],
    rationale: "workflow command recognized",
  };
  if (isEmbeddingReindexRequest(text)) return {
    name: "embedding-reindex",
    handler: null,
    confidence: 1,
    matched_rules: ["command:embedding-reindex"],
    blocked_rules: [],
    rationale: "workflow command recognized",
  };

  if (isYouTubeFinalConfirmRequest(text)) return {
    name: "youtube-final-confirm",
    handler: handleYouTubeFinalConfirmMessage,
    confidence: 0.99,
    matched_rules: ["rule:youtube-final-confirm"],
    blocked_rules: [],
    rationale: "detected YouTube final render confirmation",
  };

  if (isYoutubeRequest(text) || isYouTubeUrlRequest(text)) return {
    name: "youtube-workflow",
    handler: handleYouTubeWorkflowMessage,
    confidence: 0.98,
    matched_rules: ["rule:youtube-workflow"],
    blocked_rules: [],
    rationale: "detected YouTube automation workflow command",
  };

  if (isFlowNewsRequest(text)) return {
    name: "flow-news",
    handler: handleMessage,
    confidence: 0.97,
    matched_rules: ["rule:flow-news"],
    blocked_rules: [],
    rationale: "detected Flow-news request intent",
  };
  if (isDirectFlowVideoRequest(text)) return {
    name: "flow-video",
    handler: handleDirectFlowMessage,
    confidence: 0.96,
    matched_rules: ["rule:flow-video"],
    blocked_rules: [],
    rationale: "detected Flow video request intent",
  };
  if (isBybitBacktestWorkflowRequest(text)) return {
    name: "bybit-backtest",
    handler: handleBybitBacktestWorkflowMessage,
    confidence: 0.95,
    matched_rules: ["rule:bybit-backtest"],
    blocked_rules: [],
    rationale: "detected Bybit backtest workflow request",
  };
  if (isKrxTargetReclaimRequest(text)) return {
    name: "krx-target-reclaim",
    handler: handleKrxTargetReclaimMessage,
    confidence: 0.95,
    matched_rules: ["rule:krx-target-reclaim"],
    blocked_rules: [],
    rationale: "detected KRX target reclaim request",
  };
  if (isKrxNear3YHighRequest(text)) return {
    name: "krx-near-3y-high",
    handler: handleKrxNear3YHighMessage,
    confidence: 0.95,
    matched_rules: ["rule:krx-near-3y-high"],
    blocked_rules: [],
    rationale: "detected KRX 3-year high proximity request",
  };
  if (isKrxYtdTopChartRequest(text)) return {
    name: "krx-ytd-top10-charts",
    handler: handleKrxYtdTopChartsMessage,
    confidence: 0.95,
    matched_rules: ["rule:krx-ytd-top10-charts"],
    blocked_rules: [],
    rationale: "detected KRX YTD top10 chart request",
  };
  if (isNaverUpperLimitRequest(text)) return {
    name: "naver-upper-limit",
    handler: handleNaverUpperLimitMessage,
    confidence: 0.94,
    matched_rules: ["rule:naver-upper-limit"],
    blocked_rules: [],
    rationale: "detected Naver upper-limit request",
  };
  if (/^[123]$/.test(String(text || "").trim())) return {
    name: "generic-codex",
    handler: handleGenericMessage,
    confidence: 0.9,
    matched_rules: ["rule:numbered-choice"],
    blocked_rules: [],
    rationale: "single-digit selection after Hermes guidance",
  };
  if (isChartAnnotationFollowupRequest(text)) return {
    name: "chart-annotation-followup",
    handler: handleChartAnnotationFollowupMessage,
    confidence: 0.96,
    matched_rules: ["rule:chart-annotation-followup"],
    blocked_rules: [],
    rationale: "detected chart follow-up request",
  };
  if (isSendLatestImagesRequest(text)) return {
    name: "send-latest-images",
    handler: handleSendLatestImagesMessage,
    confidence: 0.95,
    matched_rules: ["rule:send-latest-images"],
    blocked_rules: [],
    rationale: "detected image-send follow-up request",
  };
  if (isRememberedNewsFollowup(text)) return {
    name: "news-followup",
    handler: handleRememberedNewsFollowup,
    confidence: 0.95,
    matched_rules: ["rule:news-followup"],
    blocked_rules: [],
    rationale: "detected remembered news follow-up",
  };
  if (isNewsSummaryRequest(text)) return {
    name: "news-summary",
    handler: handleNewsSummaryMessage,
    confidence: 0.95,
    matched_rules: ["rule:news-summary"],
    blocked_rules: [],
    rationale: "detected news summary request",
  };
  return {
    name: "generic-codex",
    handler: handleGenericMessage,
    confidence: 0.7,
    matched_rules: ["rule:fallback-generic"],
    blocked_rules: [],
    rationale: "no specific route matched; defaulting to generic codex",
  };
}

function classifyTask(text) {
  const routed = routeMetadataForText(text);
  return {
    name: routed.name,
    handler: routed.handler || handleGenericMessage,
  };
}

function routeNameForText(text) {
  const routed = routeMetadataForText(text);
  return routed.name || "generic-codex";
}

async function recoverTask(taskName, message, error) {
  const text = messageText(message);
  if (taskName === "send-latest-images" || isSendLatestImagesRequest(text)) {
    const files = await recentImageFiles(3, message.chat.id);
    if (!files.length) return false;
    await sendMessage(message.chat.id, ko.taskRecovered, message.message_id);
    for (const file of files) {
      await sendPhoto(message.chat.id, file.path, `${ko.imageCaption}: ${file.name}`, message.message_id);
    }
    return true;
  }

  if (taskName === "naver-chart-choice") {
    const files = await recentImageFiles(3, message.chat.id);
    if (!files.length) return false;
    await sendMessage(message.chat.id, ko.taskRecovered, message.message_id);
    for (const file of files) {
      await sendPhoto(message.chat.id, file.path, `${ko.imageCaption}: ${file.name}`, message.message_id);
    }
    return true;
  }

  if (taskName === "naver-upper-limit") {
    try {
      await handleNaverChartChoiceMessage({ ...message, text: "2" });
      return true;
    } catch (recoveryError) {
      await logTaskEvent({
        type: "recovery_failed",
        taskName,
        error: safeErrorMessage(error),
        recoveryError: safeErrorMessage(recoveryError),
      });
    }
  }

  // LLM-driven dynamic recovery: analyze the error and suggest alternatives
  try {
    setJobPhase("LLM recovery diagnosis started");
    const diagnosis = await llmDiagnoseError(taskName, text, error);
    if (diagnosis) {
      await sendMessage(
        message.chat.id,
        `\uC790\uB3D9 \uC624\uB958 \uBD84\uC11D \uACB0\uACFC:\n${diagnosis}`,
        message.message_id,
      );
      await logTaskEvent({
        type: "llm_recovery_diagnosis",
        taskName,
        chatId: message.chat.id,
        diagnosis: diagnosis.slice(0, 500),
      });
      // Diagnosis was sent but the original task was not recovered
      // Return false so the caller still reports the failure
      return false;
    }
  } catch (diagError) {
    console.error(`LLM diagnosis failed: ${safeErrorMessage(diagError)}`);
  }

  return false;
}

async function llmDiagnoseError(taskName, userText, error) {
  try {
    const key = await readOpenRouterKey();
    if (!key) return null;
    const recentFailures = await getRecentFailuresFromDb(3);
    const failureContext = recentFailures.length
      ? recentFailures.map((f, i) => `${i + 1}. task=${f.task_name} error=${String(f.error_msg || "").slice(0, 150)}`).join("\n")
       : "none";
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost/hermes-telegram",
        "X-Title": "Hermes Telegram Bot",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content: [
              `Task type: ${taskName}`,
              `User request: ${userText.slice(0, 300)}`,
              `Error: ${safeErrorMessage(error).slice(0, 500)}`,
              `Recent failures:\n${failureContext}`,
              "",
              "Analyze the concrete cause and suggest the next recoverable action in Korean.",
            ].join("\n"),          },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.choices?.[0]?.message?.content) return null;
    return json.choices[0].message.content.trim();
  } catch {
    return null;
  }
}

let lastEditTime = 0;
let editTimeout = null;

async function updateJobProgressMessage(force = false) {
  if (!currentJob || !currentJob.ackMessageId) return;
  const elapsed = Math.round((Date.now() - currentJob.startedAt) / 1000);
  const workflow = currentWorkflowTextClean();
  const text = `\uD83D\uDD04 \uC9C4\uD589 \uC911 (${elapsed}\uCD08 \uACBD\uACFC)\n\n${workflow}`;
  
  if (currentJob.lastProgressText === text) return;
  currentJob.lastProgressText = text;

  const now = Date.now();
  const throttleMs = 2000; // Minimum 2 seconds between edits
  const timeSinceLastEdit = now - lastEditTime;

  if (force || timeSinceLastEdit >= throttleMs) {
    if (editTimeout) {
      clearTimeout(editTimeout);
      editTimeout = null;
    }
    lastEditTime = now;
    try {
      await editMessage(currentJob.chatId, currentJob.ackMessageId, text);
    } catch (error) {
      console.error(`Failed to edit progress message: ${safeErrorMessage(error)}`);
    }
  } else {
    // Schedule an edit if not already scheduled
    if (!editTimeout) {
      editTimeout = setTimeout(() => {
        editTimeout = null;
        updateJobProgressMessage(true).catch(console.error);
      }, throttleMs - timeSinceLastEdit);
    }
  }
}

async function runTaskWithRecovery(taskName, message, fn) {
  const startedAt = Date.now();
  const progressTimer = setInterval(() => {
    updateJobProgressMessage(true).catch((error) => console.error(`Task progress failed: ${safeErrorMessage(error)}`));
  }, Number(process.env.HERMES_PROGRESS_INTERVAL_MS || 15000));

  try {
    setJobPhase(`Task started: ${taskName}`);
    await logTaskEvent({
      type: "task_started",
      taskName,
      chatId: message.chat.id,
      messageId: message.message_id,
      text: messageText(message).slice(0, 500),
    });
    const result = await fn(message);
    if (currentJob && !["failed", "cancelled"].includes(String(currentJob.status || "").toLowerCase())) {
      currentJob.status = currentJob.cancelRequested ? "cancelled" : "completed";
    }
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (currentJob && currentJob.ackMessageId && currentJob.status === "completed") {
      if (editTimeout) clearTimeout(editTimeout);
      editTimeout = null;
      try {
        await editMessage(currentJob.chatId, currentJob.ackMessageId, `\u2705 \uCC98\uB9AC \uC644\uB8CC (\uCD1D ${elapsed}\uCD08)`);
      } catch (e) {
        console.error(`Failed to set final progress success: ${safeErrorMessage(e)}`);
      }
    }
    await logTaskEvent({
      type: currentJob?.status === "failed" ? "task_failed_reported" : "task_completed",
      taskName,
      chatId: message.chat.id,
      messageId: message.message_id,
      latencyMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    if (currentJob) currentJob.status = currentJob.cancelRequested ? "cancelled" : "failed";
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (currentJob && currentJob.ackMessageId) {
      if (editTimeout) clearTimeout(editTimeout);
      editTimeout = null;
      try {
        await editMessage(currentJob.chatId, currentJob.ackMessageId, currentJob.cancelRequested ? `\uCDE8\uC18C\uB428 (${elapsed}\uCD08 \uACBD\uACFC)` : `\u274C \uCC98\uB9AC \uC2E4\uD328 (${elapsed}\uCD08 \uACBD\uACFC)`);
      } catch (e) {
        console.error(`Failed to set final progress failure: ${safeErrorMessage(e)}`);
      }
    }
    if (currentJob?.cancelRequested || /cancelled by user/i.test(safeErrorMessage(error))) {
      await logTaskEvent({
        type: "task_cancelled",
        taskName,
        chatId: message.chat.id,
        messageId: message.message_id,
        latencyMs: Date.now() - startedAt,
      });
      return;
    }
    setJobPhase(`Task failed; entering recovery path: ${taskName}`);
    await logTaskEvent({
      type: "task_failed",
      taskName,
      chatId: message.chat.id,
      messageId: message.message_id,
      latencyMs: Date.now() - startedAt,
      error: safeErrorMessage(error),
    });
    await logFailureToDb(taskName, message, error, 0);

    const recovered = await recoverTask(taskName, message, error);
    setJobPhase(recovered ? "Recovery succeeded" : "Recovery failed; reporting error");
    if (recovered) await markRecoveredInDb(message, "Recovered by local recovery handler.");
    await logTaskEvent({
      type: recovered ? "task_recovered" : "task_unrecovered",
      taskName,
      chatId: message.chat.id,
      messageId: message.message_id,
      latencyMs: Date.now() - startedAt,
    });
    if (recovered) return;

    await sendLongMessage(message.chat.id, formatAutoFailureReport({
      taskName,
      requestText: messageText(message),
      error,
      phase: currentJob?.phase || `Task failed; entering recovery path: ${taskName}`,
    }), message.message_id);
  } finally {
    clearInterval(progressTimer);
    if (editTimeout) {
      clearTimeout(editTimeout);
      editTimeout = null;
    }
  }
}

let busy = false;
let currentJob = null;
const taskQueue = [];
let queueRunning = false;

function buildPhaseContext(phase, details = {}) {
  const normalizedPhase = String(phase || "");
  const baseTool = String(details.tool || "").trim();
  const baseTarget = String(details.target || "").trim();
  const baseRetry = details.retry_hint ? String(details.retry_hint).trim() : "";
  const baseEta = Number.isFinite(Number(details.eta_seconds)) ? Number(details.eta_seconds) : null;

  const inferred = {
    tool: baseTool || null,
    target: baseTarget || null,
    eta_seconds: baseEta,
    retry_hint: baseRetry || null,
  };

  const commandMatch = normalizedPhase.match(/^Codex \w+ command \([^)]*\):\s*(.*)$/i);
  if (!inferred.tool && commandMatch) {
    inferred.tool = "shell";
    inferred.target = inferred.target || summarizeShellCommand(commandMatch[1]);
  }
  if (!inferred.tool && /MCP tool/i.test(normalizedPhase)) inferred.tool = "mcp";
  if (!inferred.tool && /web search/i.test(normalizedPhase)) inferred.tool = "web-search";
  if (!inferred.tool && /Playwright/i.test(normalizedPhase)) inferred.tool = "playwright";
  if (!inferred.tool && /Naver|naver/i.test(normalizedPhase)) inferred.tool = "browser";
  if (!inferred.tool && /Bybit|KRX|yfinance|FinanceData/i.test(normalizedPhase)) inferred.tool = "market-data";

  if (!inferred.target) {
    if (/Google News RSS/i.test(normalizedPhase)) inferred.target = "Google News RSS";
    else if (/Naver|네이버/i.test(normalizedPhase)) inferred.target = "Naver Finance";
    else if (/KRX|KOSPI|KOSDAQ/i.test(normalizedPhase)) inferred.target = "KRX / KRX/YFinance";
    else if (/Bybit/i.test(normalizedPhase)) inferred.target = "Bybit market endpoint";
    else if (/Flow/i.test(normalizedPhase)) inferred.target = "Google Flow";
  }

  if (!inferred.eta_seconds || inferred.eta_seconds <= 0) {
    if (/Bybit|백테스트/i.test(normalizedPhase)) inferred.eta_seconds = 75;
    else if (/Naver|네이버|Playwright|크롤|크랩/i.test(normalizedPhase)) inferred.eta_seconds = 150;
    else if (/KRX|market|주가|종가|상한가/i.test(normalizedPhase)) inferred.eta_seconds = 120;
    else if (/Codex|CLI|OpenRouter|GPT|tool/i.test(normalizedPhase)) inferred.eta_seconds = 60;
    else inferred.eta_seconds = null;
  }

  return {
    tool: inferred.tool || "unknown",
    target: inferred.target || "unknown",
    eta_seconds: inferred.eta_seconds,
    retry_hint: inferred.retry_hint || null,
  };
}

function refinePhaseContext(phase, baseContext = {}) {
  const normalizedPhase = String(phase || "");
  const context = {
    tool: String(baseContext.tool || "").trim() || "unknown",
    target: String(baseContext.target || "").trim() || "unknown",
    eta_seconds: Number.isFinite(Number(baseContext.eta_seconds)) ? Number(baseContext.eta_seconds) : null,
    retry_hint: String(baseContext.retry_hint || "").trim() || null,
  };

  if (context.tool === "unknown") {
    if (/MCP tool/i.test(normalizedPhase)) context.tool = "mcp";
    else if (/web search/i.test(normalizedPhase)) context.tool = "web-search";
    else if (/Playwright/i.test(normalizedPhase)) context.tool = "playwright";
    else if (/Naver|naver|네이버/i.test(normalizedPhase)) context.tool = "browser";
    else if (/Bybit|KRX|yfinance|FinanceData|market/i.test(normalizedPhase)) context.tool = "market-data";
    else if (/Codex|CLI|OpenRouter|GPT|tool/i.test(normalizedPhase)) context.tool = "llm";
    else if (/shell|command|powershell/i.test(normalizedPhase)) context.tool = "shell";
  }

  if (context.target === "unknown") {
    if (/Google News RSS/i.test(normalizedPhase)) context.target = "Google News RSS";
    else if (/Naver|naver|네이버/i.test(normalizedPhase)) context.target = "Naver Finance";
    else if (/KRX|KOSPI|KOSDAQ/i.test(normalizedPhase)) context.target = "KRX / KRX/YFinance";
    else if (/Bybit/i.test(normalizedPhase)) context.target = "Bybit market endpoint";
    else if (/Flow/i.test(normalizedPhase)) context.target = "Google Flow";
  }

  if (!context.eta_seconds || context.eta_seconds <= 0) {
    if (/Bybit|bybit/i.test(normalizedPhase)) context.eta_seconds = 75;
    else if (/Naver|naver|네이버|Playwright/i.test(normalizedPhase)) context.eta_seconds = 150;
    else if (/KRX|KOSPI|KOSDAQ|market|yfinance|FinanceData/i.test(normalizedPhase)) context.eta_seconds = 120;
    else if (/Codex|CLI|OpenRouter|GPT|tool/i.test(normalizedPhase)) context.eta_seconds = 60;
    else context.eta_seconds = null;
  }
  return context;
}

function formatWorkflowEventLine(event, index = null) {
  const data = event?.data || {};
  const phase = String(data.phase || event?.event_type || "phase");
  const tool = data.tool || data.phase_tool || "unknown";
  const target = data.target || data.phase_target || "unknown";
  const eta = Number.isFinite(Number(data.eta_seconds)) ? `${Math.round(Number(data.eta_seconds))}s` : null;
  const retryHint = data.retry_hint ? ` / retry=${data.retry_hint}` : "";
  const prefix = index != null ? `${index}. ` : "";
  return `${prefix}${phase} | tool=${tool} | target=${target}${eta ? ` | eta=${eta}` : ""}${retryHint}`;
}

function selectRecentWorkflowEvents(events, chatId, messageId, jobId = "", max = 4) {
  if (!Array.isArray(events) || !events.length) return [];
  const scoped = events.filter((event) => {
    if (jobId && String(event.job_id ?? "") !== String(jobId ?? "")) return false;
    return String(event.chat_id ?? "") === String(chatId ?? "")
      && String(event.message_id ?? "") === String(messageId ?? "");
  });
  if (scoped.length) return scoped.slice(0, max).map((event, index) => formatWorkflowEventLine(event, index + 1));
  if (jobId) {
    const byJob = events.filter((event) => String(event.job_id ?? "") === String(jobId ?? ""));
    if (byJob.length) return byJob.slice(0, max).map((event, index) => formatWorkflowEventLine(event, index + 1));
  }
  return events.filter((event) => String(event.chat_id ?? "") === String(chatId ?? "")).slice(0, max).map((event, index) => formatWorkflowEventLine(event, index + 1));
}

function setJobPhase(phase, details = {}) {
  if (!currentJob) return;
  if (currentJob.cancelRequested && phase !== "Cancel requested by user") {
    throw new Error("Cancelled by user");
  }
  const context = refinePhaseContext(phase, buildPhaseContext(phase, details));
  currentJob.phase = phase;
  currentJob.workflow ??= [];
  const previous = currentJob.workflow.at(-1);
  if (previous?.phase !== phase) {
    currentJob.workflow.push({
      phase,
      at: new Date().toISOString(),
      context,
    });
    if (currentJob.workflow.length > 12) currentJob.workflow.shift();
  }
  currentJob.lastPhaseContext = context;
  updateJobInDb(currentJob.jobId, {
    status: currentJob.cancelRequested ? "cancelling" : "running",
    phase,
    workflow: currentJob.workflow,
    cancel_requested: Boolean(currentJob.cancelRequested),
  }).catch(console.error);
  logTaskEventToDb("job_phase", currentJob.taskName || "generic-codex", {
    chat: { id: currentJob.chatId },
    message_id: currentJob.messageId,
  }, currentJob.jobId, {
    phase: String(phase || ""),
    taskName: currentJob.taskName || "generic-codex",
    ...context,
  }).catch(console.error);
  updateJobProgressMessage().catch(console.error);
}

function currentWorkflowText() {
  return currentWorkflowTextClean();
}

function currentWorkflowTextClean() {
  if (!currentJob) return "";
  const lines = [];
  if (currentJob.jobId) lines.push(`Job ID: ${currentJob.jobId}`);
  if (currentJob.taskName) lines.push(`\uC791\uC5C5 \uC720\uD615: ${currentJob.taskName}`);
  if (currentJob.phase) lines.push(`\uD604\uC7AC \uB2E8\uACC4: ${workflowPhaseLabel(currentJob.phase)}`);
  const context = currentJob.lastPhaseContext || {};
  if (context.tool) lines.push(`\uB3C4\uAD6C: ${context.tool}`);
  if (context.target) lines.push(`\ub300\uc0c1: ${context.target}`);
  if (context.eta_seconds) lines.push(`\ubcf4\uace0 ETA: ${context.eta_seconds}\ucd08`);
  if (context.retry_hint) lines.push(`\uc7ac\uc2dc\ub3c4 \uc548\ub0b4: ${context.retry_hint}`);
  if (currentJob.cancelRequested) lines.push("\uCDE8\uC18C \uC694\uCCAD: \uC811\uC218\uB428");
  if (currentJob.workflow?.length) {
    const recent = currentJob.workflow.slice(-5).map((item, index) => {
      const summary = workflowPhaseLabel(item.phase);
      const meta = [];
      if (item.context?.tool) meta.push(`tool=${item.context.tool}`);
      if (item.context?.target) meta.push(`target=${String(item.context.target).slice(0, 48)}`);
      return `${index + 1}. ${summary}${meta.length ? ` (${meta.join(", ")})` : ""}`;
    });
    lines.push(`\uCD5C\uADFC \uD750\uB984:\n${recent.join("\n")}`);
  }
  return lines.join("\n");
}

function queueStatusText() {
  if (!taskQueue.length) return "";
  const preview = taskQueue.slice(0, 5).map((job, index) => `${index + 1}. ${job.taskName}: ${job.text.slice(0, 80)}`);
  return `\uB300\uAE30 \uC791\uC5C5: ${taskQueue.length}\uAC1C\n${preview.join("\n")}`;
}

function hasLikelyMojibakeText(text) {
  const value = String(text || "");
  return value.includes(String.fromCharCode(0xfffd))
    || /\?{4,}/.test(value)
    || /\?{2,}/.test(value)
    || /[\\uFFFD]{2,}/.test(value);
}

function safeJobRequestText(text, fallback = "\uAE68\uC9C4 \uC6D0\uBB38\uC774\uB77C \uD45C\uC2DC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4") {
  const value = String(text || "").trim();
  if (!value) return "-";
  if (hasLikelyMojibakeText(value)) return fallback;
  return value;
}

function formatJobList(jobs) {
  if (!jobs.length) return "\uCD5C\uADFC Job\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.";
  return jobs.map((job, index) => [
    `${index + 1}. ${job.status} | ${job.task_name || "-"}`,
    `Job ID: ${job.job_id}`,
    `\uC694\uCCAD: ${safeJobRequestText(job.request_text).slice(0, 120)}`,
    `\uB2E8\uACC4: ${workflowPhaseLabel(job.phase || "-")}`,
    `\uC5C5\uB370\uC774\uD2B8: ${job.updated_at || "-"}`,
  ].join("\n")).join("\n\n");
}

function retryableJob(jobs) {
  return jobs.find((job) => {
    const request = String(job.request_text || "").trim();
    return ["failed", "cancelled"].includes(String(job.status || "").toLowerCase())
      && request
      && !hasLikelyMojibakeText(request);
  });
}

async function killProcessTree(pid) {
  if (!pid || process.platform !== "win32") return { killed: 0 };
  const script = `Stop-Process -Id ${Number(pid)} -Force -ErrorAction SilentlyContinue`;
  try {
    await runProcess("powershell.exe", ["-NoProfile", "-Command", script], { timeoutMs: 10000, killTreeOnTimeout: false });
    return { killed: 1 };
  } catch {
    return { killed: 0 };
  }
}

async function killRunawayChildProcesses(reason = "watchdog") {
  if (process.platform !== "win32") return [];
  const minAgeMs = Number(process.env.HERMES_RUNAWAY_MIN_AGE_MS || 5 * 60 * 1000);
  const patterns = [
    "FinanceDataReader",
    "fdr.DataReader",
    "StockListing('KRX')",
    "StockListing(\\\"KRX\\\")",
    "get_market_ohlcv_by_ticker",
  ];
  const psPatterns = patterns.map((pattern) => `($_.CommandLine -like '*${pattern.replace(/'/g, "''")}*')`).join(" -or ");
  const script = `
$now = Get-Date
$items = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -in @('powershell.exe','python.exe') -and (${psPatterns})
} | ForEach-Object {
  $created = $_.CreationDate
  if ($created -and (($now - $created).TotalMilliseconds -ge ${minAgeMs})) {
    [PSCustomObject]@{ ProcessId=$_.ProcessId; Name=$_.Name; AgeSeconds=[int](($now - $created).TotalSeconds); CommandLine=$_.CommandLine }
  }
}
$items | ConvertTo-Json -Compress
`;
  let targets = [];
  try {
    const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", script], { timeoutMs: 15000 });
    const text = result.stdout.trim();
    if (text) {
      const parsed = JSON.parse(text);
      targets = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch (error) {
    console.error(`Runaway process scan failed: ${safeErrorMessage(error)}`);
    return [];
  }
  for (const target of targets) {
    await killProcessTree(target.ProcessId);
  }
  if (targets.length) {
    const summary = targets.map((target) => `${target.Name}:${target.ProcessId}:${target.AgeSeconds}s`).join(", ");
    console.error(`Killed runaway child process(es) for ${reason}: ${summary}`);
    if (currentJob) {
      setJobPhase(`Watchdog killed runaway child process: ${summary}`);
    }
  }
  return targets;
}

async function markStaleJobsOnStartup() {
  const maxAgeMs = Number(process.env.HERMES_STALE_JOB_MS || 2 * 60 * 1000);
  const jobs = await runDbHelper(["get-recent-jobs", "50"], { optional: true }) || [];
  const now = Date.now();
  let marked = 0;
  for (const job of jobs) {
    if (job.status !== "running") continue;
    const updatedAt = Date.parse(job.updated_at || job.started_at || "");
    if (!updatedAt || now - updatedAt < maxAgeMs) continue;
    await updateJobInDb(job.job_id, {
      status: "failed",
      phase: "Marked stale on Hermes startup",
      finished_at: new Date().toISOString(),
      error: `No progress event for ${Math.round((now - updatedAt) / 1000)}s before startup`,
    });
    marked += 1;
  }
  if (marked) console.log(`Marked ${marked} stale running job(s) on startup.`);
  return marked;
}

async function retryLastJobForChat(chatId, replyToMessageId) {
  const jobs = await getRecentJobsFromDb(20, chatId);
  const job = retryableJob(jobs);
  if (!job) {
    await sendMessage(chatId, "\uC7AC\uC2E4\uD589\uD560 \uC2E4\uD328/\uCDE8\uC18C Job\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", replyToMessageId);
    return;
  }
  const retryMessage = {
    chat: { id: chatId, type: String(chatId).startsWith("-") ? "group" : "private" },
    from: { id: chatId, is_bot: false, first_name: "retry" },
    message_id: replyToMessageId,
    text: job.request_text,
  };
  const queuedJob = await enqueueMessageJob(retryMessage);
  await logTaskEvent({
    type: "job_retry_queued",
    taskName: queuedJob.taskName,
    chatId,
    messageId: replyToMessageId,
    originalJobId: job.job_id,
    retryJobId: queuedJob.jobId,
  });
  await sendMessage(chatId, [
    "\uC7AC\uC2E4\uD589\uC744 \uD050\uC5D0 \uB123\uC5C8\uC2B5\uB2C8\uB2E4.",
    `Original Job ID: ${job.job_id}`,
    `Retry Job ID: ${queuedJob.jobId}`,
    `\uC694\uCCAD: ${safeJobRequestText(job.request_text).slice(0, 160)}`,
  ].join("\n"), replyToMessageId);
}

async function hasOriginalYouTubeSceneVideos(jobDir) {
  if (!jobDir || !existsSync(jobDir)) return false;
  const entries = await readdir(jobDir).catch(() => []);
  return entries.some((entry) => /^scene_\d+\.mp4$/i.test(entry));
}

async function getYouTubeJobMediaStatus(jobDir) {
  if (!jobDir || !existsSync(jobDir)) return { ok: false, missingScenes: [], existingScenes: [] };
  const draft = await readFile(`${jobDir}/draft.json`, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => null);
  const expectedScenes = Array.isArray(draft?.scenes)
    ? draft.scenes.map((scene, index) => Number(scene.order || index + 1)).filter(Number.isFinite)
    : [];
  const entries = await readdir(jobDir).catch(() => []);
  const existingScenes = entries
    .map((entry) => entry.match(/^scene_(\d+)\.mp4$/i)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
  const missingScenes = expectedScenes.filter((order) => !existingScenes.includes(order));
  return {
    ok: expectedScenes.length > 0 && missingScenes.length === 0,
    missingScenes,
    existingScenes,
    expectedScenes,
  };
}

async function findLatestYouTubeJobForChat(chatId) {
  const jobs = await getRecentJobsFromDb(30, chatId);
  for (const job of jobs) {
    const taskName = job.task_name || job.taskName;
    if (taskName !== "youtube-workflow") continue;
    const jobId = job.job_id || job.jobId;
    const jobDir = `${OUTPUT_DIR}/youtube/${jobId}`;
    const mediaStatus = await getYouTubeJobMediaStatus(jobDir);
    if (mediaStatus.ok) return { jobId, jobDir, source: "db", mediaStatus };
    return { jobId, jobDir, source: "db", mediaStatus, incomplete: true };
  }

  const youtubeRoot = `${OUTPUT_DIR}/youtube`;
  const entries = await readdir(youtubeRoot).catch(() => []);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.includes(`-${chatId}-`)) continue;
    const jobDir = `${youtubeRoot}/${entry}`;
    if (!await hasOriginalYouTubeSceneVideos(jobDir)) continue;
    const mediaStatus = await getYouTubeJobMediaStatus(jobDir);
    const info = await stat(jobDir).catch(() => null);
    candidates.push({ jobId: entry, jobDir, source: "filesystem", mtimeMs: info?.mtimeMs || 0, mediaStatus, incomplete: !mediaStatus.ok });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0] || null;
}

async function renderAndSendYouTubeFinalVideo({ chatId, replyTo, jobId, jobDir, taskName = "youtube-workflow" }) {
  setJobPhase(`Rendering final YouTube video: ${jobId}`);
  const finalName = `final-youtube-${Date.now()}.mp4`;
  const renderResult = await runProcess(process.execPath, [
    join(ROOT, "scripts/render-youtube-with-tts.mjs"),
    jobDir,
  ], {
    timeoutMs: Number(process.env.HERMES_YOUTUBE_RENDER_TIMEOUT_MS || 15 * 60 * 1000),
    env: { PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", HERMES_YOUTUBE_FINAL_NAME: finalName },
  });

  const renderOutput = renderResult.stdout.trim().match(/\{[\s\S]*\}\s*$/)?.[0] || "{}";
  let parsed = {};
  try {
    parsed = JSON.parse(renderOutput);
  } catch {
    parsed = {};
  }

  const finalPath = parsed.finalPath || join(jobDir, finalName);
  if (!existsSync(finalPath)) {
    throw new Error(`Final rendered video was not found: ${finalPath}`);
  }

  await logTaskEvent({
    type: "youtube_final_render_completed",
    taskName,
    chatId,
    messageId: replyTo,
    jobDir,
    finalPath,
    finalDuration: parsed.finalDuration,
    subtitleEnd: parsed.subtitleEnd,
  });

  await sendVideo(
    chatId,
    finalPath,
    `최종 영상 렌더링 완료\n길이: ${parsed.finalDuration || "확인됨"}초\nJob: ${jobId}`,
    replyTo,
  );
}

async function enqueueMessageJob(message) {
  const text = messageText(message);
  const task = classifyTask(text);
  const jobId = `${Date.now()}-${message.chat.id}-${message.message_id}`;
  const queuedJob = {
    jobId,
    chatId: message.chat.id,
    messageId: message.message_id,
    message,
    text,
    taskName: task.name,
    handler: task.handler,
    queuedAt: Date.now(),
  };
  taskQueue.push(queuedJob);
  await upsertJobToDb({
    job_id: jobId,
    chat_id: message.chat.id,
    message_id: message.message_id,
    request_text: text.slice(0, 2000),
    task_name: task.name,
    status: "queued",
    phase: "Queued",
    workflow: [{ phase: "Queued", at: new Date().toISOString() }],
  });
  startQueueWorker();
  return queuedJob;
}

function enqueuePersistedJob(row) {
  if (!row?.job_id || !row?.request_text) return null;
  if (taskQueue.some((job) => job.jobId === row.job_id)) return null;
  const text = row.request_text;
  if (isStatusRequest(text) || isStartOrHelpRequest(text)) {
    updateJobInDb(row.job_id, {
      status: "cancelled",
      phase: "Not restored because it is a status/help message",
      finished_at: new Date().toISOString(),
      cancel_requested: true,
      error: "Control message should not run as a background job",
    }).catch(console.error);
    return null;
  }
  const task = classifyTask(text);
  const chatId = Number.isFinite(Number(row.chat_id)) ? Number(row.chat_id) : row.chat_id;
  const messageId = Number.isFinite(Number(row.message_id)) ? Number(row.message_id) : row.message_id;
  const message = {
    chat: { id: chatId, type: String(chatId).startsWith("-") ? "group" : "private" },
    from: { id: chatId, is_bot: false, first_name: "restored" },
    message_id: messageId,
    text,
  };
  const queuedJob = {
    jobId: row.job_id,
    chatId,
    messageId,
    message,
    text,
    taskName: task.name,
    handler: task.handler,
    queuedAt: Date.now(),
    restored: true,
  };
  taskQueue.push(queuedJob);
  return queuedJob;
}

async function restoreQueuedJobsFromDb() {
  const rows = await getQueuedJobsFromDb(Number(process.env.HERMES_RESTORE_QUEUED_LIMIT || 20));
  let restored = 0;
  for (const row of rows) {
    if (enqueuePersistedJob(row)) restored += 1;
  }
  if (restored) {
    console.log(`Restored ${restored} queued Hermes job(s) from SQLite.`);
    startQueueWorker();
  }
  return restored;
}

function cancelQueuedJobsForChat(chatId) {
  let cancelled = 0;
  for (let index = taskQueue.length - 1; index >= 0; index -= 1) {
    const job = taskQueue[index];
    if (String(job.chatId) === String(chatId)) {
      taskQueue.splice(index, 1);
      cancelled += 1;
      updateJobInDb(job.jobId, {
        status: "cancelled",
        phase: "Cancelled while queued",
        finished_at: new Date().toISOString(),
        cancel_requested: true,
      }).catch(console.error);
    }
  }
  return cancelled;
}

function startQueueWorker() {
  if (queueRunning) return;
  queueRunning = true;
  setTimeout(async () => {
    try {
      while (taskQueue.length) {
        const queuedJob = taskQueue.shift();
        await executeQueuedJob(queuedJob);
      }
    } catch (error) {
      console.error(`Queue worker failed: ${safeErrorMessage(error)}`);
    } finally {
      queueRunning = false;
      if (taskQueue.length) startQueueWorker();
    }
  }, 0);
}

async function executeQueuedJob(queuedJob) {
  busy = true;
  currentJob = {
    jobId: queuedJob.jobId,
    chatId: queuedJob.chatId,
    messageId: queuedJob.messageId,
    text: queuedJob.text,
    taskName: queuedJob.taskName,
    startedAt: Date.now(),
    status: "running",
    workflow: [],
    cancelRequested: false,
  };
  try {
    await updateJobInDb(queuedJob.jobId, {
      status: "running",
      started_at: new Date(currentJob.startedAt).toISOString(),
      phase: `Request classified: ${queuedJob.taskName}`,
      workflow: [{ phase: `Request classified: ${queuedJob.taskName}`, at: new Date().toISOString() }],
    });
    setJobPhase(`Request classified: ${queuedJob.taskName}`);
    await runTaskWithRecovery(queuedJob.taskName, queuedJob.message, queuedJob.handler);
    if (currentJob && !currentJob.status) currentJob.status = "completed";
  } catch (error) {
    if (currentJob) currentJob.status = currentJob.cancelRequested ? "cancelled" : "failed";
    if (currentJob) currentJob.error = safeErrorMessage(error).slice(0, 2000);
    const cancelled = currentJob?.cancelRequested || /cancelled by user/i.test(safeErrorMessage(error));
    await updateJobInDb(currentJob?.jobId || queuedJob.jobId, {
      status: cancelled ? "cancelled" : "failed",
      finished_at: new Date().toISOString(),
      error: safeErrorMessage(error).slice(0, 2000),
    });
    if (!cancelled) {
      await sendLongMessage(queuedJob.chatId, formatAutoFailureReport({
        taskName: queuedJob.taskName,
        requestText: queuedJob.text,
        error,
        phase: currentJob?.phase || "Queued job failed",
      }), queuedJob.messageId);
    }
  } finally {
    const jobSnapshot = currentJob ? { ...currentJob, workflow: [...(currentJob.workflow || [])] } : null;
    if (currentJob) {
      await updateJobInDb(currentJob.jobId, {
        status: currentJob.status || (currentJob.cancelRequested ? "cancelled" : "completed"),
        finished_at: new Date().toISOString(),
        phase: currentJob.phase || currentJob.status || "completed",
        workflow: currentJob.workflow || [],
        cancel_requested: Boolean(currentJob.cancelRequested),
      });
    }
    if (jobSnapshot) {
      const finalStatus = jobSnapshot.status || (jobSnapshot.cancelRequested ? "cancelled" : "completed");
      await rememberJobOutcome(jobSnapshot, finalStatus, finalStatus === "failed" ? jobSnapshot.error || "" : "").catch(() => {});
    }
    busy = false;
    currentJob = null;
  }
}

async function waitForQueueIdle(timeoutMs = 120000) {
  const started = Date.now();
  while ((queueRunning || taskQueue.length || currentJob) && Date.now() - started < timeoutMs) {
    await delay(250);
  }
}
async function processUpdate(update) {
  if (!update.message) return;
  const config = await readConfig();
  const text = messageText(update.message);
  if (!isAuthorized(update.message, config)) return;
  await logChatMessageToDb({
    chatId: update.message.chat.id,
    messageId: update.message.message_id,
    role: "user",
    text,
    meta: {
      fromId: update.message.from?.id,
      username: update.message.from?.username,
      updateId: update.update_id,
    },
    createdAt: update.message.date ? new Date(update.message.date * 1000).toISOString() : null,
  });
  await rememberMessageIfUseful(update.message);
  if (isStartOrHelpRequest(text)) {
    await sendMessage(update.message.chat.id, helpMessage(), update.message.message_id);
    return;
  }
  if (isCancelRequest(text)) {
    const dbCancel = await requestCancelInDb(update.message.chat.id);
    const queuedCancelled = cancelQueuedJobsForChat(update.message.chat.id);
    if (currentJob && String(currentJob.chatId) === String(update.message.chat.id)) {
      currentJob.cancelRequested = true;
      currentJob.abortController?.abort(new Error("Cancelled by user"));
      setJobPhase("Cancel requested by user");
      await sendMessage(update.message.chat.id, ko.cancelRequested, update.message.message_id);
    } else if (queuedCancelled > 0 || dbCancel?.updated > 0) {
      await sendMessage(update.message.chat.id, `${ko.jobCancelled}\n\uCDE8\uC18C\uB41C \uB300\uAE30 \uC791\uC5C5: ${queuedCancelled}\uAC1C`, update.message.message_id);
    } else {
      await sendMessage(update.message.chat.id, ko.cancelNoActive, update.message.message_id);
    }
    return;
  }
  if (isStatusRequest(text)) {
    if (!currentJob) {
      const activeJob = await getActiveJobFromDb(update.message.chat.id);
      if (!activeJob) {
        await sendMessage(update.message.chat.id, ko.noActiveJob, update.message.message_id);
      } else {
        const activeEvents = await getRecentTaskEventsFromDb(24, update.message.chat.id, "", activeJob.job_id);
        const workflowLines = selectRecentWorkflowEvents(
          activeEvents,
          activeJob.chat_id || "",
          activeJob.message_id || "",
          activeJob.job_id || "",
          8,
        );
        const lastEvent = activeEvents[0] || {};
        const lastData = lastEvent.data || {};
        await sendMessage(update.message.chat.id, [
          "\uD604\uC7AC DB\uC5D0 \uB0A8\uC544 \uC788\uB294 \uC9C4\uD589 \uC791\uC5C5\uC785\uB2C8\uB2E4.",
          `Job ID: ${activeJob.job_id}`,
          `\uC0C1\uD0DC: ${activeJob.status}`,
          `\uC791\uC5C5 \uC720\uD615: ${activeJob.task_name || "-"}`,
          `\uD604\uC7AC \uB2E8\uACC4: ${activeJob.phase || "-"}`,
          `\uD234: ${lastData.tool || "unknown"}`,
          `\uB300\uC0C1: ${lastData.target || lastData.phase_target || "-"}`,
          `ETA: ${lastData.eta_seconds ? `${Math.round(Number(lastData.eta_seconds))}s` : "-"}`,
          `Retry: ${lastData.retry_hint || "-"}`,
          workflowLines.length ? `\uCD5C\uADFC \uD750\uB984:\n${workflowLines.join("\n")}` : "\uCD5C\uADFC \uD750\uB984: -",
        ].join("\n"), update.message.message_id);
      }
      return;
    }
    const elapsed = Math.round((Date.now() - currentJob.startedAt) / 1000);
    const inMemoryEvents = selectRecentWorkflowEvents(
      currentJob.workflow?.map((item) => ({
        created_at: item.at,
        task_name: currentJob.taskName,
        data: { ...item.context },
        chat_id: String(currentJob.chatId || ""),
        message_id: String(currentJob.messageId || ""),
        event_type: item.phase,
      })) || [],
      currentJob.chatId || "",
      currentJob.messageId || "",
      currentJob.jobId,
      8,
    );
    const statusLines = [
      `\uD604\uC7AC \uCC98\uB9AC \uC911\uC785\uB2C8\uB2E4 (${elapsed}\uCD08 \uACBD\uACFC).`,
      `\uC791\uC5C5: ${currentJob.text.slice(0, 120)}`,
      `\uC791\uC5C5 \uD56D\uBAA9: ${currentJob.taskName || "-"}`,
      `\uB193\uC740 \uD3EC\uC2A4:\n${currentWorkflowTextClean()}`,
      inMemoryEvents.length ? `Workflow:\n${inMemoryEvents.join("\n")}` : "",
      queueStatusText(),
    ].filter(Boolean).join("\n");
    await sendMessage(update.message.chat.id, statusLines, update.message.message_id);
    return;
  }
  if (isLastJobRequest(text)) {
    const target = parseLastJobRequestTarget(text);
    if (target === "last" || target === "latest") {
      const events = await getRecentTaskEventsFromDb(20, update.message.chat.id);
      const lines = events.map((event, index) => formatWorkflowEventLine(event, index + 1));
      await sendMessage(update.message.chat.id, lines.length ? `Last job events:\n${lines.join("\n")}` : "No recent task events.", update.message.message_id);
      return;
    }
    const jobs = await getRecentJobsFromDb(20, update.message.chat.id);
    const selected = jobs.find((item) => String(item.job_id) === String(target));
    if (!selected) {
      await sendMessage(update.message.chat.id, `No job found for "${target}".`, update.message.message_id);
      return;
    }
    const events = await getRecentTaskEventsFromDb(24, update.message.chat.id, "", selected.job_id);
    const lines = selectRecentWorkflowEvents(
      events,
      selected.chat_id || "",
      selected.message_id || "",
      selected.job_id || "",
      12,
    );
    await sendMessage(update.message.chat.id, [
      `Job: ${selected.job_id}`,
      `Status: ${selected.status || "-"}`,
      `Request: ${safeJobRequestText(selected.request_text || "").slice(0, 220)}`,
      `Phase: ${selected.phase || "-"}`,
      "",
      lines.length ? lines.join("\n") : "No workflow events.",
    ].join("\n"), update.message.message_id);
    return;
  }
  if (isJobsRequest(text)) {
    const jobs = await getRecentJobsFromDb(8, update.message.chat.id);
    await sendMessage(update.message.chat.id, `\uCD5C\uADFC Job \uC0C1\uD0DC\n\n${formatJobList(jobs)}`, update.message.message_id);
    return;
  }
  if (isRetryRequest(text)) {
    await retryLastJobForChat(update.message.chat.id, update.message.message_id);
    return;
  }
  if (isFailuresRequest(text)) {
    const failures = await getRecentFailuresFromDb(10);
    const lines = failures.map((failure, index) => `${index + 1}. ${failure.created_at} | ${failure.task_name} | ${String(failure.error_msg || "").slice(0, 180)}`);
    await sendMessage(update.message.chat.id, lines.length ? `Recent failures:\n${lines.join("\n")}` : "No recent failures.", update.message.message_id);
    return;
  }
  if (isDiagnoseRequest(text)) {
    await handleDiagnoseMessage(update.message);
    return;
  }
  if (isSelfTestRequest(text)) {
    await handleSelfTestMessage(update.message);
    return;
  }
  if (isMemoryListRequest(text)) {
    const query = text.replace(/^\/(?:memory|memories)(?:@\w+)?/i, "").trim();
    const memories = query
      ? await searchMemoriesFromDb(update.message.chat.id, query, 12)
      : await getRecentMemoriesFromDb(update.message.chat.id, 12);
    const lines = memories.map((memory, index) => {
      const score = memory.semantic_score !== undefined ? ` score=${memory.semantic_score}` : "";
      return `${index + 1}. [${memory.kind}]${score} ${String(memory.text || "").replace(/\s+/g, " ").slice(0, 220)}${memory.tags ? ` (${memory.tags})` : ""}`;
    });
    const title = query ? `Hermes memory search: ${query.slice(0, 80)}` : "Hermes memory";
    await sendMessage(update.message.chat.id, lines.length ? `${title}\n\n${lines.join("\n")}` : "Hermes memory에 저장된 항목이 없습니다.", update.message.message_id);
    return;
  }
  if (isContextListRequest(text)) {
    const query = text.replace(/^\/context(?:@\w+)?/i, "").trim();
    const [messages, semanticMessages, artifacts] = await Promise.all([
      getRecentMessagesFromDb(update.message.chat.id, 12),
      query ? searchMessagesFromDb(update.message.chat.id, query, 8) : Promise.resolve([]),
      getRecentArtifactsFromDb(update.message.chat.id, 6),
    ]);
    const messageLines = messages.map((item, index) => `${index + 1}. ${item.role}: ${String(item.text || "").replace(/\s+/g, " ").slice(0, 180)}`);
    const semanticLines = semanticMessages.map((item, index) => `${index + 1}. ${item.role}${item.semantic_score !== undefined ? ` score=${item.semantic_score}` : ""}: ${String(item.text || "").replace(/\s+/g, " ").slice(0, 180)}`);
    const artifactLines = artifacts.map((item, index) => `${index + 1}. ${item.kind}: ${String(item.caption || item.path || "").slice(0, 160)}`);
    await sendMessage(update.message.chat.id, [
      query ? `Hermes context search: ${query.slice(0, 80)}` : "Hermes context",
      "",
      "Recent messages:",
      messageLines.length ? messageLines.join("\n") : "- none",
      "",
      "Semantic matches:",
      semanticLines.length ? semanticLines.join("\n") : "- none",
      "",
      "Recent artifacts:",
      artifactLines.length ? artifactLines.join("\n") : "- none",
    ].join("\n"), update.message.message_id);
    return;
  }
  if (isCapabilitiesRequest(text)) {
    await sendMessage(update.message.chat.id, formatLocalToolContextForPrompt().trim() || "Hermes 로컬 도구 목록과 상태를 불러왔지만, 출력 가능한 항목이 없습니다.", update.message.message_id);
    return;
  }
  if (isEmbeddingReindexRequest(text)) {
    const result = await reindexEmbeddingsInDb();
    await sendMessage(update.message.chat.id, `Embedding index rebuilt\n${JSON.stringify(result, null, 2)}`, update.message.message_id);
    return;
  }
  if (busy || queueRunning || taskQueue.length) {
    const queuedJob = await enqueueMessageJob(update.message);
    const position = taskQueue.findIndex((job) => job.jobId === queuedJob.jobId) + 1;
    await sendMessage(update.message.chat.id, `${ko.jobQueued}\nJob ID: ${queuedJob.jobId}\n\uB300\uAE30 \uC21C\uBC88: ${position}\n/status\uB85C \uC9C4\uD589 \uC0C1\uD0DC\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`, update.message.message_id);
    return;
  }
  await enqueueMessageJob(update.message);
}

function extractTargetUrl(text) {
  const trimmed = String(text || "").trim();
  let content = trimmed;
  if (/^\/yturl\s+/i.test(trimmed)) {
    content = trimmed.replace(/^\/yturl\s+/i, "");
  }
  const match = content.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

function normalizeYoutubeInput(text) {
  const trimmed = String(text || "").trim();
  if (/^\/yturl\s+/i.test(trimmed)) {
    return trimmed.replace(/^\/yturl\s+/i, "").trim();
  }
  if (/^\/yt\s+/i.test(trimmed)) {
    return trimmed.replace(/^\/yt\s+/i, "").trim();
  }
  return trimmed;
}

async function fetchArticleByUrl(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "ko,en-US;q=0.7,en;q=0.3"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch article: HTTP ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtml(titleMatch[1]).trim() : "";
  
  const paragraphMatches = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi));
  let body = paragraphMatches
    .map(match => match[1].replace(/<[^>]*>/g, "").trim())
    .filter(text => text.length > 20)
    .join("\n\n");
    
  if (body.length < 100) {
    const cleanText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    body = cleanText.slice(0, 3000);
  } else {
    body = body.slice(0, 3500);
  }

  return { title, body };
}

function parseJsonMarkdown(text) {
  let cleaned = String(text || "").trim();
  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/```$/, "");
  cleaned = cleaned.trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerError) {
        throw new Error(`Failed to parse extracted JSON block: ${innerError.message}. Original text: ${text}`);
      }
    }
    throw error;
  }
}

async function buildYouTubeDraftFromKeyword({ keyword }) {
  const key = await readOpenRouterKey();
  if (!key) throw new Error("OpenRouter key is empty.");
  
  const systemPrompt = `You are a YouTube Shorts production assistant. Your goal is to write a YouTube Shorts video script based on a keyword.
You must output a single valid JSON object following this JSON Schema exactly:
{
  "title": "string (engaging YouTube title in Korean)",
  "character_profile": "string (English stable recurring human presenter/lead description: ethnicity, gender, approximate age, hairstyle, outfit, and role; use the same identity across all scenes)",
  "duration_seconds": "integer (between 60 and 120)",
  "script": "string (the full combined voiceover script in Korean)",
  "scenes": [
    {
      "order": "integer (starting from 1)",
      "narration": "string (the exact voiceover narration/lines for this scene, in spoken Korean e.g. ~입니다, ~해요, ~하죠)",
      "image_prompt": "string (detailed English image prompt for Google Flow to generate a 9:16 vertical scene. Avoid text, logos, subtitles. Keep it cinematic, B-roll style)",
      "duration_seconds": "integer (approximate scene duration in seconds, e.g. 5 to 15)"
    }
  ]
}
Ensure:
1. No text or markdown around the JSON, only the JSON block (or inside markdown \`\`\`json block).
2. The image_prompt is strictly in English.
3. The narration is in professional yet engaging Korean.
4. The scenes list should contain between 3 to 6 scenes.
5. All text in narration must be spoken words (no sound effects inside brackets).
6. If any human character appears, keep one consistent recurring character across all image_prompt values. Do not change race, gender, age, hairstyle, face, or outfit between scenes.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost/hermes-youtube",
      "X-Title": "Hermes YouTube Assistant",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Create a YouTube Shorts draft for this keyword: ${keyword}` },
      ],
      temperature: 0.6,
      max_tokens: 2000,
      response_format: { type: "json_object" }
    }),
  });

  const json = await response.json();
  if (!response.ok || !json.choices?.[0]?.message?.content) {
    throw new Error(`OpenRouter failed: ${json.error?.message || response.statusText}`);
  }

  const rawText = json.choices[0].message.content.trim();
  return parseJsonMarkdown(rawText);
}

async function buildYouTubeDraftFromArticle({ title, sourceUrl, body }) {
  const key = await readOpenRouterKey();
  if (!key) throw new Error("OpenRouter key is empty.");
  
  const systemPrompt = `You are a YouTube Shorts production assistant. Your goal is to write a YouTube Shorts video script based on a fetched news article.
You must ethically rewrite and restructure the article's contents (avoid direct plagiarism) to create an engaging spoken script.
You must output a single valid JSON object following this JSON Schema exactly:
{
  "title": "string (engaging YouTube title in Korean)",
  "character_profile": "string (English stable recurring human presenter/lead description: ethnicity, gender, approximate age, hairstyle, outfit, and role; use the same identity across all scenes)",
  "duration_seconds": "integer (between 60 and 120)",
  "script": "string (the full combined voiceover script in Korean)",
  "scenes": [
    {
      "order": "integer (starting from 1)",
      "narration": "string (the exact voiceover narration/lines for this scene, in spoken Korean e.g. ~입니다, ~해요, ~하죠)",
      "image_prompt": "string (detailed English image prompt for Google Flow to generate a 9:16 vertical scene. Avoid text, logos, subtitles. Keep it cinematic, B-roll style)",
      "duration_seconds": "integer (approximate scene duration in seconds, e.g. 5 to 15)"
    }
  ]
}
Ensure:
1. No text or markdown around the JSON, only the JSON block (or inside markdown \`\`\`json block).
2. The image_prompt is strictly in English.
3. The narration is in professional yet engaging Korean.
4. The scenes list should contain between 3 to 6 scenes.
5. All text in narration must be spoken words (no sound effects inside brackets).
6. If any human character appears, keep one consistent recurring character across all image_prompt values. Do not change race, gender, age, hairstyle, face, or outfit between scenes.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost/hermes-youtube",
      "X-Title": "Hermes YouTube Assistant",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Article Title: ${title}\nSource URL: ${sourceUrl}\nBody:\n${body}` },
      ],
      temperature: 0.6,
      max_tokens: 2500,
      response_format: { type: "json_object" }
    }),
  });

  const json = await response.json();
  if (!response.ok || !json.choices?.[0]?.message?.content) {
    throw new Error(`OpenRouter failed: ${json.error?.message || response.statusText}`);
  }

  const rawText = json.choices[0].message.content.trim();
  return parseJsonMarkdown(rawText);
}

function flowConfigureSettingsExpression(mode) {
  return `(async () => {
    const labels = {
      image: "\\uc774\\ubbf8\\uc9c0",
      video: "\\ub3d9\\uc601\\uc0c1",
      asset: "\\uc560\\uc14b"
    };
    const isVideo = ${mode === "video"};
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

    const disableFlowAudio = async () => {
      const body = bodyText().toLowerCase();
      const hasAudioControls = body.includes("\\uc624\\ub514\\uc624") || body.includes("audio") || body.includes("\\uc74c\\uc131");
      if (!hasAudioControls) return { ok: true, skipped: true, reason: "audio controls not visible" };

      const opened = await clickMatch(["\\uc624\\ub514\\uc624", "audio", "\\uc74c\\uc131"], { delay: 300 });
      await delay(300);

      const silent = await clickMatch([
        "\\ubb34\\uc74c",
        "\\uc18c\\ub9ac \\uc5c6\\uc74c",
        "\\uc0ac\\uc6a9 \\uc548 \\ud568",
        "silent",
        "mute",
        "no audio",
        "off"
      ], { delay: 300 });

      if (silent.ok) return { ok: true, opened, silent };

      const toggled = await clickMatch(["toggle_off", "volume_off", "\\ub044\\uae30"], { delay: 300 });
      return { ok: toggled.ok || opened.ok, opened, silent, toggled };
    };
    
    const hasSettingsPanel = () => {
      const text = bodyText();
      return text.includes(labels.image)
        && text.includes(labels.video)
        && text.includes("9:16")
        && text.includes("16:9");
    };
    
    if (!hasSettingsPanel()) {
      const opened = await clickMatch(["tune", "settings", "\\uc124\\uc815"]);
      if (!opened.ok) return { ok: false, reason: "Settings icon not clickable" };
      await delay(500);
    }
    
    const results = [];
    if (isVideo) {
      results.push(await clickMatch([labels.video]));
      results.push(await clickMatch([labels.asset]));
      results.push(await clickMatch(["9:16", "crop_9_16"]));
      results.push(await clickMatch(["1x"], { exact: true }));
      results.push(await disableFlowAudio());
    } else {
      results.push(await clickMatch([labels.image]));
      results.push(await clickMatch(["9:16", "crop_9_16"]));
    }
    
    return { ok: results.every((r) => r.ok), results };
  })()`;
}

async function generateFlowMedia(flowPrompt, mode, prefix) {
  const target = await flowTarget();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.call("Runtime.enable");
  await cdp.call("Page.enable");
  await cdp.call("Network.enable");

  try {
    let state = await cdp.eval(`(() => ({ href: location.href, text: (document.body ? document.body.innerText : "").slice(0, 1000) }))()`);
    if (/accounts\.google|signin|auth\/error/i.test(state.href + " " + state.text)) {
      throw new Error("Google Flow login is required in the opened Chrome profile.");
    }

    if (!state.href.includes("/project/")) {
      let opened = { ok: false, reason: "new project button not found" };
      for (let attempt = 0; attempt < 20; attempt += 1) {
        opened = await cdp.eval(`(() => {
          const visible = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return !el.disabled && s.display !== 'none' && s.visibility !== 'hidden' && r.width > 8 && r.height > 8; };
          const btn = Array.from(document.querySelectorAll('button,[role="button"],a')).filter(visible).find(el => {
            const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').toLowerCase();
            return t.includes('new project') || t.includes('get started') || t.includes('새 프로젝트') || t.includes('시작');
          });
          if (!btn) return { ok:false, reason:'new project button not found' };
          btn.click(); return { ok:true };
        })()`);
        if (opened.ok) break;
        await delay(1000);
      }
      if (!opened.ok) throw new Error(opened.reason);

      for (let i = 0; i < 60; i += 1) {
        await delay(1000);
        state = await cdp.eval(`(() => ({ href: location.href, text: (document.body ? document.body.innerText : "").slice(0, 1000) }))()`);
        if (state.href.includes("/project/")) break;
      }
    }
    if (!state.href.includes("/project/")) throw new Error(`Flow project did not open: ${state.href}`);

    // Wait until prompt box and create button are fully loaded and rendered
    let positions = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      positions = await cdp.eval(`(() => {
        const textbox = Array.from(document.querySelectorAll('[role="textbox"][contenteditable="true"],[contenteditable="true"],textarea'))
          .map(el => ({ r: el.getBoundingClientRect(), text: (el.innerText || el.textContent || '').trim() }))
          .filter(x => x.r.width > 100 && x.r.height > 10)
          .sort((a, b) => b.r.y - a.r.y)[0];
        const create = Array.from(document.querySelectorAll('button,[role="button"]'))
          .map(el => ({ r: el.getBoundingClientRect(), text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(), disabled: el.disabled }))
          .filter(x => !x.disabled && x.r.width > 10 && x.r.height > 10 && (x.text.includes('arrow_forward') || x.text.includes('만들기') || x.text.toLowerCase().includes('create') || x.text.toLowerCase().includes('generate')))
          .sort((a, b) => (b.r.y - a.r.y) || (b.r.x - a.r.x))[0];
        return {
          textbox: textbox ? { x: Math.round(textbox.r.x + textbox.r.width / 2), y: Math.round(textbox.r.y + textbox.r.height / 2), text: textbox.text } : null,
          create: create ? { x: Math.round(create.r.x + create.r.width / 2), y: Math.round(create.r.y + create.r.height / 2), text: create.text, disabled: create.disabled } : null
        };
      })()`);
      if (positions.textbox && positions.create) break;
      await delay(1000);
    }
    if (!positions.textbox || !positions.create) throw new Error("Flow prompt box or create button not found.");

    // Configure settings (like video mode or aspect ratio) after verifying the editor page is fully loaded
    await cdp.eval(flowConfigureSettingsExpression(mode));
    await delay(1000);

    const getMediaUrlsExpr = `(() => {
      const v = Array.from(document.querySelectorAll('video')).map(el => el.currentSrc || el.src).filter(Boolean);
      const img = Array.from(document.images).map(el => el.currentSrc || el.src).filter(Boolean);
      return { videos: Array.from(new Set(v)), images: Array.from(new Set(img)) };
    })()`;

    const before = await cdp.eval(getMediaUrlsExpr);
    const beforeVideos = new Set(before.videos);
    const beforeImages = new Set(before.images);

    // Refresh position coordinates just in case UI changed after settings config
    const finalPositions = await cdp.eval(`(() => {
      const textbox = Array.from(document.querySelectorAll('[role="textbox"][contenteditable="true"],[contenteditable="true"],textarea'))
        .map(el => ({ r: el.getBoundingClientRect(), text: (el.innerText || el.textContent || '').trim() }))
        .filter(x => x.r.width > 100 && x.r.height > 10)
        .sort((a, b) => b.r.y - a.r.y)[0];
      const create = Array.from(document.querySelectorAll('button,[role="button"]'))
        .map(el => ({ r: el.getBoundingClientRect(), text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(), disabled: el.disabled }))
        .filter(x => !x.disabled && x.r.width > 10 && x.r.height > 10 && (x.text.includes('arrow_forward') || x.text.includes('만들기') || x.text.toLowerCase().includes('create') || x.text.toLowerCase().includes('generate')))
        .sort((a, b) => (b.r.y - a.r.y) || (b.r.x - a.r.x))[0];
      return {
        textbox: textbox ? { x: Math.round(textbox.r.x + textbox.r.width / 2), y: Math.round(textbox.r.y + textbox.r.height / 2), text: textbox.text } : null,
        create: create ? { x: Math.round(create.r.x + create.r.width / 2), y: Math.round(create.r.y + create.r.height / 2), text: create.text, disabled: create.disabled } : null
      };
    })()`);

    if (!finalPositions.textbox || !finalPositions.create) throw new Error("Flow prompt box or create button went missing after settings configuration.");

    await cdp.click(finalPositions.textbox.x, finalPositions.textbox.y);
    await cdp.call("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await cdp.call("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await cdp.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    await cdp.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    await cdp.call("Input.insertText", { text: flowPrompt });
    await delay(800);
    await cdp.click(finalPositions.create.x, finalPositions.create.y);

    let last = null;
    let foundUrls = [];
    const isVideo = mode === "video";
    for (let i = 0; i < 96; i += 1) {
      await delay(5000);
      last = await cdp.eval(`(() => {
        const text = (document.body ? document.body.innerText : "") || '';
        const percents = Array.from(text.matchAll(/(\\d+)%/g)).map(m => Number(m[1]));
        const videos = Array.from(new Set(Array.from(document.querySelectorAll('video')).map(v => v.currentSrc || v.src).filter(Boolean)));
        const images = Array.from(new Set(Array.from(document.images).map(img => img.currentSrc || img.src).filter(Boolean)));
        return { percents, videos, images, failed: text.includes('실패'), text: text.slice(0, 1200) };
      })()`);
      
      const newUrls = isVideo 
        ? last.videos.filter(url => !beforeVideos.has(url))
        : last.images.filter(url => !beforeImages.has(url));
        
      if (newUrls.length > 0 && last.percents.length === 0) {
        foundUrls = newUrls;
        break;
      }
      if (last.failed && last.percents.length === 0 && newUrls.length > 0) {
        foundUrls = newUrls;
        break;
      }
    }

    if (!foundUrls.length) {
      const screenshot = await cdp.call("Page.captureScreenshot", { format: "png", fromSurface: true });
      await mkdir(OUTPUT_DIR, { recursive: true });
      const screenshotPath = `${OUTPUT_DIR}/${prefix}-flow-screen.png`;
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      const visibleText = String(last?.text || "");
      const audioGenerationFailed = /오디오를 생성할 수 없습니다|audio/i.test(visibleText);
      const failureHint = audioGenerationFailed
        ? "Flow audio generation failed; silent video mode was requested but the UI may not have applied it."
        : "Flow did not expose a new media URL.";
      throw new Error(`${failureHint} Screenshot: ${screenshotPath}`);
    }

    const cookieResult = await cdp.call("Network.getCookies", { urls: ["https://labs.google", FLOW_URL] });
    const cookie = cookieResult.cookies.map((item) => `${item.name}=${item.value}`).join("; ");
    await mkdir(OUTPUT_DIR, { recursive: true });

    const saved = [];
    for (let i = 0; i < foundUrls.length; i += 1) {
      const mediaUrl = foundUrls[i];
      if (mediaUrl.startsWith("data:")) {
        const match = /^data:([^;]+);base64,(.+)$/i.exec(mediaUrl);
        if (match) {
          const ext = match[1].includes("video") ? (match[1].includes("webm") ? "webm" : "mp4") : "png";
          const path = `${OUTPUT_DIR}/${prefix}-${i + 1}.${ext}`;
          await writeFile(path, Buffer.from(match[2], "base64"));
          saved.push({ path, bytes: match[2].length, contentType: match[1], ok: true });
        }
        continue;
      }
      
      const response = await fetch(mediaUrl, {
        headers: { cookie, "user-agent": "Mozilla/5.0 Chrome Flow downloader", accept: "*/*" },
        redirect: "follow",
      });
      const contentType = response.headers.get("content-type") || "";
      const bytes = new Uint8Array(await response.arrayBuffer());
      const ext = isVideo 
        ? (contentType.includes("webm") ? "webm" : "mp4")
        : (contentType.includes("gif") ? "gif" : (contentType.includes("jpeg") ? "jpg" : "png"));
      const path = `${OUTPUT_DIR}/${prefix}-${i + 1}.${ext}`;
      await writeFile(path, bytes);
      saved.push({ path, bytes: bytes.length, contentType, ok: response.ok });
    }
    return saved;
  } finally {
    cdp.close();
  }
}

async function handleYouTubeFinalConfirmMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  await sendJobAck(chatId, "최신 YouTube 작업을 확인하고 최종 영상 렌더링을 시작합니다.", replyTo);

  const latest = await findLatestYouTubeJobForChat(chatId);
  if (!latest) {
    await sendMessage(chatId, "최종 렌더링할 YouTube 작업을 찾지 못했습니다. 먼저 `/yt 키워드` 또는 기사 URL로 쇼츠 작업을 생성해주세요.", replyTo);
    return;
  }
  if (latest.incomplete) {
    const missing = latest.mediaStatus?.missingScenes?.length ? latest.mediaStatus.missingScenes.join(", ") : "확인 필요";
    const existing = latest.mediaStatus?.existingScenes?.length ? latest.mediaStatus.existingScenes.join(", ") : "없음";
    await sendMessage(
      chatId,
      `최신 YouTube 작업의 장면 파일이 완전하지 않아 최종 렌더링을 중단합니다.\nJob: ${latest.jobId}\n생성된 장면: ${existing}\n누락 장면: ${missing}\n\n같은 기사/키워드로 다시 요청하면 새 오디오 비활성화 설정과 장면 재시도 로직으로 다시 생성합니다.`,
      replyTo,
    );
    return;
  }

  await renderAndSendYouTubeFinalVideo({
    chatId,
    replyTo,
    jobId: latest.jobId,
    jobDir: latest.jobDir,
    taskName: "youtube-final-confirm",
  });
}

function buildTelegramYouTubeJobRequest(message) {
  const rawText = messageText(message);
  const url = extractTargetUrl(rawText);
  const targetInput = normalizeYoutubeInput(rawText) || url || rawText.trim() || "YouTube Shorts";
  const isUrl = isYouTubeUrlRequest(rawText) && Boolean(url);
  return {
    id: currentJob?.jobId,
    sourceType: isUrl ? "url" : "keyword",
    sourceValue: isUrl ? url : targetInput,
    originalText: rawText,
    requestedBy: "telegram",
    options: {
      scriptLengthPreset: "standard",
      voiceId: "M1",
      speechSpeed: 1.08,
      subtitleStyleId: "bold-shorts",
      thumbnailMode: "auto",
      sendIntermediateMedia: false,
    },
  };
}

function emitYouTubeRunnerEvent(event = {}) {
  if (event.type === "job-started") setJobPhase(`YouTube runner started: ${event.job?.id || "pending"}`);
  if (event.type === "assets-ready") setJobPhase(`YouTube assets ready: ${event.jobId || "unknown"}`);
  if (event.type === "job-completed") setJobPhase(`YouTube runner completed: ${event.jobId || "unknown"}`);
}

async function handleYouTubeWorkflowMessage(message) {
  const chatId = message.chat.id;
  const replyTo = message.message_id;
  const rawText = messageText(message);
  const isUrl = isYouTubeUrlRequest(rawText);
  const targetInput = normalizeYoutubeInput(rawText);
  const jobRequest = buildTelegramYouTubeJobRequest(message);
  const jobDir = `${OUTPUT_DIR}/youtube/${currentJob.jobId}`;
  const sharedStages = createDefaultYouTubeStages(buildTelegramYouTubeStageContext({ chatId, replyToMessageId: replyTo }));

  await runYouTubeJob(jobRequest, {
    ...sharedStages,
    jobDir,
    outputDir: OUTPUT_DIR,
    emit: (event) => {
      mirrorWorkflowEventToDb(event, {
        dbHelper: DB_HELPER,
        chatId,
        messageId: replyTo,
        taskName: "youtube-workflow",
      });
      emitYouTubeRunnerEvent(event);
    },
    buildDraft: async () => {
      let draft = null;
      if (isUrl) {
        const url = extractTargetUrl(rawText);
        if (!url) {
          await sendJobAck(chatId, "URL 모드로 진입했으나 유효한 링크를 찾지 못했습니다. 일반 키워드 모드로 대본을 생성합니다.", replyTo);
          setJobPhase("Fallback: keyword draft generation start");
          draft = await buildYouTubeDraftFromKeyword({ keyword: targetInput });
        } else {
          await sendJobAck(chatId, `링크를 확인하였습니다: ${url}\n기사를 요약하고 대본/씬 프롬프트를 구성합니다.`, replyTo);
          setJobPhase(`Fetching article from: ${url}`);
          try {
            const article = await fetchArticleByUrl(url);
            setJobPhase("Rewriting article into YouTube Shorts draft");
            draft = await buildYouTubeDraftFromArticle({ title: article.title, sourceUrl: url, body: article.body });
          } catch (error) {
            console.error(`Article scraping failed: ${error.message}. Falling back to keyword mode.`);
            await sendMessage(chatId, `기사 수집에 실패했습니다 (${error.message}). 입력한 주소의 텍스트를 분석하여 키워드 모드로 대본을 생성합니다.`, replyTo);
            setJobPhase("Fallback: keyword draft generation after fetch error");
            draft = await buildYouTubeDraftFromKeyword({ keyword: targetInput });
          }
        }
      } else {
        await sendJobAck(chatId, `키워드를 기반으로 YouTube Shorts 대본을 생성합니다: "${targetInput}"`, replyTo);
        setJobPhase(`Generating keyword draft for: ${targetInput}`);
        draft = await buildYouTubeDraftFromKeyword({ keyword: targetInput });
      }

      if (!draft || !draft.scenes || !draft.scenes.length) {
        throw new Error("YouTube Shorts 대본 생성 결과가 올바르지 않거나 씬 목록이 비어있습니다.");
      }
      draft = ytApplyConsistentCharacterProfile(draft);

      await logTaskEvent({
        type: "youtube_draft_created",
        taskName: "youtube-workflow",
        chatId,
        messageId: replyTo,
        draft,
      });

      const scriptMsg = [
        `🎬 **YouTube Shorts 대본 초안 생성 완료**`,
        `제목: ${draft.title}`,
        `예상 길이: ${draft.duration_seconds}초`,
        `총 장면 수: ${draft.scenes.length}개`,
        `---`,
        `📝 **대본 전체 내용:**\n${draft.script}`,
        `---`,
        `이제 Google Flow를 통해 각 장면의 비디오 생성을 시작합니다...`,
      ].join("\n");
      await sendMessage(chatId, scriptMsg, replyTo);
      return draft;
    },
    generateSceneMedia: async ({ scene, draft }) => {
      const progressText = `Flow 씬 ${scene.order}/${draft.scenes.length} 생성 중... (프롬프트: ${scene.image_prompt.slice(0, 60)}...)`;
      setJobPhase(progressText);

      await logTaskEvent({
        type: "flow_scene_started",
        taskName: "youtube-workflow",
        chatId,
        messageId: replyTo,
        sceneOrder: scene.order,
      });

      let sceneError = null;
      for (let sceneAttempt = 1; sceneAttempt <= 2; sceneAttempt += 1) {
        try {
          const prefix = `youtube-${currentJob.jobId}-scene-${scene.order}-attempt-${sceneAttempt}`;
          const results = await generateFlowMedia(scene.image_prompt, "video", prefix);
          if (!results || results.length === 0) {
            throw new Error(`Scene ${scene.order} did not return any media files.`);
          }

          const fileInfo = results[0];
          const destPath = `${jobDir}/scene_${scene.order}${extname(fileInfo.path)}`;
          await rename(fileInfo.path, destPath);

          await logTaskEvent({
            type: "flow_scene_completed",
            taskName: "youtube-workflow",
            chatId,
            messageId: replyTo,
            sceneOrder: scene.order,
            savedPath: destPath,
            attempt: sceneAttempt,
          });
          return {
            path: destPath,
            narration: scene.narration,
            attempt: sceneAttempt,
          };
        } catch (error) {
          sceneError = error;
          console.error(`Error generating scene ${scene.order} attempt ${sceneAttempt}: ${error.message}`);
          await logTaskEvent({
            type: "flow_scene_failed",
            taskName: "youtube-workflow",
            chatId,
            messageId: replyTo,
            sceneOrder: scene.order,
            attempt: sceneAttempt,
            error: safeErrorMessage(error).slice(0, 1000),
          });
          if (sceneAttempt < 2) {
            await sendMessage(chatId, `⚠️ 장면 ${scene.order} 생성 오류가 발생하여 무음 설정을 다시 적용하고 재시도합니다: ${safeErrorMessage(error).slice(0, 300)}`, replyTo);
            await delay(2000);
          }
        }
      }
      await sendMessage(chatId, `⚠️ 장면 ${scene.order} 생성 중 오류가 반복되어 건너뜁니다: ${safeErrorMessage(sceneError).slice(0, 500)}`, replyTo);
      return { skipped: true, error: safeErrorMessage(sceneError) };
    },
    renderFinalVideo: async (_job, assets) => {
      await logTaskEvent({
        type: "youtube_workflow_completed",
        taskName: "youtube-workflow",
        chatId,
        messageId: replyTo,
        jobDir: assets.jobDir,
      });

      const mediaStatus = await getYouTubeJobMediaStatus(assets.jobDir);
      if (!mediaStatus.ok) {
        const missing = mediaStatus.missingScenes.length ? mediaStatus.missingScenes.join(", ") : "확인 필요";
        throw new Error(`YouTube scene generation incomplete. Missing scenes: ${missing}`);
      }

      await sendMessage(chatId, "모든 장면 생성이 완료되었습니다. 최종 영상 렌더링을 시작합니다.", replyTo);
      await renderAndSendYouTubeFinalVideo({
        chatId,
        replyTo,
        jobId: currentJob.jobId,
        jobDir: assets.jobDir,
        taskName: "youtube-workflow",
      });
      return { sentToTelegram: true, jobDir: assets.jobDir };
    },
  });
}
async function initializeOffsetIfMissing() {
  const existing = await readOffset();
  if (existing) return existing;
  const updates = await getUpdates(null, 0);
  if (updates.conflict) return null;
  const latest = updates.at(-1)?.update_id;
  const next = latest ? latest + 1 : null;
  if (next) await writeOffset(next);
  return next;
}

async function main() {
  await initDb();
  await markStaleJobsOnStartup();
  setInterval(() => {
    killRunawayChildProcesses("periodic runaway sweep").catch(() => {});
  }, Number(process.env.HERMES_RUNAWAY_SWEEP_MS || 30000)).unref?.();
  if (arg("--help") || arg("-h")) {
    console.log(usage());
    return;
  }
  if (arg("--dry-run")) {
    const news = await latestAiNews();
    const built = buildScriptAndPrompt(news);
    console.log(JSON.stringify({ news, ...built }, null, 2));
    return;
  }

  if (arg("--test-generic")) {
    const text = process.argv.slice(process.argv.indexOf("--test-generic") + 1).join(" ") || "Hermes test message";
    const result = await hermesReply(text, {
      from: { first_name: "local-test", username: "local-test" },
      chat: { id: "local-test", type: "private" },
      message_id: undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (arg("--test-prompt")) {
    const text = process.argv.slice(process.argv.indexOf("--test-prompt") + 1).join(" ") || "Hermes test prompt";
    const prompt = await codexPrompt(text, {
      from: { first_name: "local-test", username: "local-test" },
      chat: { id: "8151113796", type: "private" },
      message_id: "prompt-test",
      text,
    });
    console.log(prompt);
    return;
  }

  if (arg("--test-strategy")) {
    const text = process.argv.slice(process.argv.indexOf("--test-strategy") + 1).join(" ") || "strategy test";
    const fakeMessage = {
      from: { first_name: "local-test", username: "local-test" },
      chat: { id: "local-test", type: "private" },
      message_id: "strategy-test",
    };
    const plan = await buildStrategyPlan(text, fakeMessage);
    const evaluation = evaluateStrategyPlan(plan);
    console.log(JSON.stringify({ text, plan, evaluation, constrainedPrompt: strategyConstrainedPrompt(text, plan, evaluation) }, null, 2));
    return;
  }

  if (arg("--test-classify")) {
    const text = process.argv.slice(process.argv.indexOf("--test-classify") + 1).join(" ") || "classification test";
    let taskName = "";
    if (isStartOrHelpRequest(text)) taskName = "help";
    else if (isStatusRequest(text)) taskName = "status";
    else if (isCancelRequest(text)) taskName = "cancel";
    else if (isLastJobRequest(text)) taskName = "lastjob";
    else if (isJobsRequest(text)) taskName = "jobs";
    else if (isRetryRequest(text)) taskName = "retry";
    else if (isFailuresRequest(text)) taskName = "failures";
    else if (isDiagnoseRequest(text)) taskName = "diagnose";
    else if (isSelfTestRequest(text)) taskName = "selftest";
    else taskName = classifyTask(text).name;
    console.log(JSON.stringify({ text, task: taskName }, null, 2));
    return;
  }

  if (arg("--test-watchdog-retry")) {
    const result = await testWatchdogRetry();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (arg("--test-auto-failure-report")) {
  const requestText = argValue("--request", "simulate request for auto failure report path");
  const taskName = argValue("--task", "flow-video");
  const errorText = argValue("--error", "new project button not found");
  const report = formatAutoFailureReport({
    taskName,
    requestText,
    error: new Error(errorText),
    phase: "Recovery failed; reporting error",
  });
  console.log(JSON.stringify({
    ok: report.includes("Recovery failed; reporting error"),
    report,
  }, null, 2));
  return;
}

if (arg("--test-workflow-labels")) {
  const samples = [
    "Codex started command (in_progress): \"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -Command \"python - <<'PY' import yfinance as yf; print('x') PY\"",
    "Codex completed tool (completed): brave.brave_web_search",
    "Strategy gate constrained execution: Slow or broad scan detected. Use a bounded probe-first strategy instead of full enumeration.",
  ];
  const labels = samples.map(workflowPhaseLabel);
  console.log(JSON.stringify({
    ok: labels.every((item) => item && !/^Codex /.test(item)),
    labels,
  }, null, 2));
  return;
}

if (arg("--test-send-long-message")) {
  const result = await sendMessage("long-message-test", "A".repeat(8200), "long-message-reply");
  console.log(JSON.stringify({ ok: Boolean(result?.message_id), lastMessageId: result?.message_id }, null, 2));
  return;
}

if (arg("--test-option-choice") && arg("--assistant-text")) {
  const chatId = argValue("--simulate-chat-id", `option-test-${Date.now()}`);
  const assistantText = argValue("--assistant-text", "1. first option\n2. second option\n3. third option");
  const choiceText = argValue("--choice", "1");
  await logChatMessageToDb({
    chatId,
    messageId: `${chatId}-assistant`,
    role: "assistant",
    text: assistantText,
  });
  const message = {
    chat: { id: chatId, type: "private" },
    from: { id: chatId, is_bot: false, first_name: "option-test" },
    message_id: `${chatId}-user`,
    text: choiceText,
  };
  const resolved = await resolveRecentOptionChoice(message);
  console.log(JSON.stringify({
    ok: Boolean(resolved),
    choice: resolved?.choice,
    selected: resolved?.selected,
    promptText: resolved?.promptText,
  }, null, 2));
  return;
}

if (arg("--test-option-choice")) {
  const chatId = argValue("--simulate-chat-id", "8151113796");
  const text = argValue("--choice", "1");
  const message = {
    chat: { id: Number.isFinite(Number(chatId)) ? Number(chatId) : chatId, type: "private" },
    from: { id: Number.isFinite(Number(chatId)) ? Number(chatId) : chatId, is_bot: false, first_name: "option-test" },
    message_id: "option-test-message",
    text,
  };
  const resolved = await resolveRecentOptionChoice(message);
  console.log(JSON.stringify({
    ok: Boolean(resolved),
    choice: resolved?.choice,
    selected: resolved?.selected,
    promptText: resolved?.promptText,
  }, null, 2));
  return;
}

if (arg("--test-continuation") && arg("--assistant-text")) {
  const chatId = argValue("--simulate-chat-id", "continuation-test");
  const marker = `continuation-test-${Date.now()}`;
  const assistantText = argValue("--assistant-text", "") || "continuation test assistant message with marker injection";
  const userText = argValue("--user-text", "continue from previous message");
  await logChatMessageToDb({
    chatId,
    messageId: `${marker}-assistant`,
    role: "assistant",
    text: assistantText.includes(marker) ? assistantText : `${assistantText} ${marker}`,
  });
  const message = {
    chat: { id: chatId, type: "private" },
    from: { id: chatId, is_bot: false, first_name: "continuation-test" },
    message_id: `${marker}-user`,
    text: userText,
  };
  const resolved = await resolveRecentContinuation(message);
  console.log(JSON.stringify({
    ok: Boolean(resolved) && String(resolved?.promptText || "").includes(marker),
    promptText: resolved?.promptText,
  }, null, 2));
  return;
}

if (arg("--test-continuation")) {
  const chatId = argValue("--simulate-chat-id", "continuation-test");
  const marker = `continuation-test-${Date.now()}`;
  await logChatMessageToDb({
    chatId,
    messageId: `${marker}-assistant`,
    role: "assistant",
    text: `continuation assistant message ${marker}`,
  });
  const message = {
    chat: { id: chatId, type: "private" },
    from: { id: chatId, is_bot: false, first_name: "continuation-test" },
    message_id: `${marker}-user`,
    text: "continuation user message",
  };
  const resolved = await resolveRecentContinuation(message);
  console.log(JSON.stringify({
    ok: Boolean(resolved) && String(resolved?.promptText || "").includes(marker) && String(resolved?.promptText || "").includes("running jobs and cancel stale ones"),
    promptText: resolved?.promptText,
  }, null, 2));
  return;
}

  if (arg("--test-memory")) {
    const chatId = argValue("--simulate-chat-id", "8151113796");
    const start = process.argv.indexOf("--test-memory") + 1;
    const end = process.argv.findIndex((item, index) => index >= start && item.startsWith("--"));
    const textArgs = process.argv.slice(start, end === -1 ? undefined : end);
    const text = textArgs.join(" ") || "memory test message";
    const message = {
      chat: { id: chatId, type: "private" },
      from: { id: chatId, is_bot: false, first_name: "memory-test" },
      message_id: "memory-test-message",
      text,
    };
    const saved = await rememberMessageIfUseful(message);
    const found = await searchMemoriesFromDb(chatId, text, 5);
    const context = await formatChatContextForPrompt(message);
    console.log(JSON.stringify({ saved, found, context }, null, 2));
    return;
  }
if (arg("--simulate-message")) {
    const text = argValue("--simulate-message", "");
    const chatId = argValue("--simulate-chat-id", "8151113796");
    const fromId = argValue("--simulate-from-id", String(chatId));
    const update = {
      update_id: Date.now(),
      message: {
        message_id: Number(argValue("--simulate-message-id", "700001")),
        date: Math.floor(Date.now() / 1000),
        text,
        chat: {
          id: Number.isFinite(Number(chatId)) ? Number(chatId) : chatId,
          type: String(chatId).startsWith("-") ? "group" : "private",
          first_name: "simulate",
        },
        from: {
          id: Number.isFinite(Number(fromId)) ? Number(fromId) : fromId,
          is_bot: false,
          first_name: "simulate",
          username: "simulate-user",
        },
      },
    };
    console.log(JSON.stringify({ simulateUpdate: update }, null, 2));
    await processUpdate(update);
    await waitForQueueIdle(Number(argValue("--simulate-timeout-ms", "120000")));
    return;
  }

  if (arg("--simulate-messages")) {
    const raw = argValue("--simulate-messages", "");
    const chatId = argValue("--simulate-chat-id", "8151113796");
    const fromId = argValue("--simulate-from-id", String(chatId));
    const texts = raw.split("|||").map((item) => item.trim()).filter(Boolean);
    for (const [index, text] of texts.entries()) {
      const update = {
        update_id: Date.now() + index,
        message: {
          message_id: Number(argValue("--simulate-message-id", "700001")) + index,
          date: Math.floor(Date.now() / 1000),
          text,
          chat: {
            id: Number.isFinite(Number(chatId)) ? Number(chatId) : chatId,
            type: String(chatId).startsWith("-") ? "group" : "private",
            first_name: "simulate",
          },
          from: {
            id: Number.isFinite(Number(fromId)) ? Number(fromId) : fromId,
            is_bot: false,
            first_name: "simulate",
            username: "simulate-user",
          },
        },
      };
      console.log(JSON.stringify({ simulateUpdate: update }, null, 2));
      await processUpdate(update);
    }
    await waitForQueueIdle(Number(argValue("--simulate-timeout-ms", "120000")));
    return;
  }

  if (arg("--run-now")) {
    const chatId = argValue("--chat-id", "-5149180837");
    const fakeMessage = {
      chat: { id: chatId, type: String(chatId).startsWith("-") ? "group" : "private" },
      message_id: undefined,
    };
    await handleMessage(fakeMessage);
    return;
  }

  await restoreQueuedJobsFromDb();

  let offset = await initializeOffsetIfMissing();
  console.log(`Telegram Flow News Bot started. Offset=${offset ?? "none"}`);
  await writeHeartbeat(offset);
  setInterval(() => {
    writeHeartbeat(offset).catch(() => {});
  }, Number(process.env.HERMES_HEARTBEAT_MS || 10000)).unref?.();

  do {
    try {
      const updates = await getUpdates(offset, arg("--once") ? 0 : 20);
      if (updates.conflict) {
        console.error(`Telegram polling conflict: ${updates.description}. Retrying in 10s.`);
        await delay(10000);
        continue;
      }
      for (const update of updates) {
        offset = update.update_id + 1;
        await writeOffset(offset);
        await writeHeartbeat(offset);
        try {
          await processUpdate(update);
        } catch (error) {
          console.error(`processUpdate failed for update ${update.update_id}: ${error.stack || error.message}`);
        }
      }
    } catch (error) {
      console.error(`Telegram watch loop error: ${error.stack || error.message}. Retrying in 10s.`);
      await delay(10000);
    }
    if (arg("--once")) break;
  } while (arg("--watch"));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});


