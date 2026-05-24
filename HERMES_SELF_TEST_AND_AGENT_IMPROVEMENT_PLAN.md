# Hermes Self-Test And Agent Improvement Plan

Date: 2026-05-21

## Purpose

This document records what was verified, what is still broken, and what must be implemented for Hermes to behave more like a real autonomous coding agent rather than a passive Telegram chatbot.

The goal is not to keep adding one-off scripts for each request. The goal is to strengthen the common agent loop:

```text
receive request
classify intent
plan strategy
estimate risk and cost
execute tools
observe streaming events
detect bad paths
recover or retry once
persist workflow
report concrete result
```

## Reviewed User Proposal

The user's proposed improvement list is mostly valid:

- P0 inbound test harness
- P0 strategy gate
- P0 streaming event persistence
- P1 mojibake prevention
- P1 queue model and dynamic recovery

One caveat:

- `/goal` and `/schedule` are not currently implemented Hermes bot commands. They should not be documented as available commands. They are valid future feature candidates only.

## Current Verification Results

## Implementation Progress

Updated: 2026-05-21

- Implemented `--simulate-message`, `--simulate-chat-id`, `--simulate-from-id`, `--simulate-message-id`, and `--simulate-no-send`.
- Implemented SQLite `jobs` persistence with job id, status, phase, workflow, cancel flag, start/update/finish timestamps, and error field.
- Implemented `/status`, `/cancel`, `/lastjob`, and `/failures` support against the live in-memory job and persisted SQLite events/jobs.
- Implemented Codex streamed event persistence into `task_events`.
- Implemented a first-pass Strategy Gate for generic Codex tasks, with constraints for slow market-data scans.
- Fixed the routing bug where a count request such as "AI news 1 item" could be misread as a remembered-news follow-up.
- Fixed several mojibake-caused syntax failures in request routing, news summary formatting, remembered-news followups, recovery diagnosis, outgoing progress messages, and Flow video handlers.
- Added `sendLongMessage` so longer generated script/prompt replies can be split and delivered through Telegram.
- Reworked inbound handling so normal requests are enqueued and processed by a background worker instead of blocking the Telegram polling loop.
- Added in-memory FIFO queue plus SQLite `queued` job persistence and startup restoration for queued jobs.
- Added `--simulate-messages "msg1|||msg2"` to test multi-message flows such as request, `/status`, and `/cancel` inside one bot process.
- Fixed cancellation handling so local handlers stop on the next phase transition instead of continuing to send results after `/cancel`.
- Added a watchdog-triggered one-time retry path for generic Codex execution. When a watchdog timeout/abort occurs, Hermes retries once with a smaller constrained prompt, lower tool budget, and shorter timeout before falling back.
- Added `scripts/check-mojibake.mjs` and wired `npm run check` to run syntax check, mojibake check, and SQLite init.
- Added `--test-watchdog-retry`, a deterministic mock test that verifies watchdog retry prompt construction, retry event logging, and workflow phase updates without waiting for a real timeout.
- Included `--test-watchdog-retry` in `npm run check`.
- Added `/jobs` to show recent persisted job status, phase, update time, and request preview.
- Added `/retry` to requeue the latest failed/cancelled job with a valid request body.
- Protected `/jobs` and `/retry` from old corrupted request text. Mojibake request bodies are displayed as unavailable and skipped for retry.
- Forced Python DB helper stdout/stderr to UTF-8 so old replacement-character data cannot break JSON output on Windows cp949 terminals.

Verified commands:

```powershell
node --check .\telegram-flow-news-bot.mjs
python .\bot_db_helper.py init
node .\scripts\check-mojibake.mjs
npm run check
node .\telegram-flow-news-bot.mjs --test-watchdog-retry
node .\telegram-flow-news-bot.mjs --simulate-message "/status" --simulate-no-send
node .\telegram-flow-news-bot.mjs --simulate-message "/cancel" --simulate-no-send
node .\telegram-flow-news-bot.mjs --simulate-message "/jobs" --simulate-no-send
node .\telegram-flow-news-bot.mjs --simulate-message "/retry" --simulate-no-send
node .\telegram-flow-news-bot.mjs --simulate-message "오늘자 AI 뉴스 1개 요약해" --simulate-no-send
node .\telegram-flow-news-bot.mjs --simulate-message "1번 뉴스를 저작권에 위배되지 않게 각색해서 대본과 이미지 프롬프트 생성해" --simulate-no-send
node .\telegram-flow-news-bot.mjs --simulate-message "네이버에 상한가 종목 검색하고 캡쳐해서 정리해줘" --simulate-no-send
node .\telegram-flow-news-bot.mjs --simulate-messages "오늘자 AI 뉴스 1개 요약해|||/status|||취소" --simulate-no-send --simulate-timeout-ms 60000
node .\telegram-flow-news-bot.mjs --test-strategy "한국 코스피,코스닥 종목중에 2026년 올해 가장 많이 상승한 10개 종목 찾아봐"
```

Current remaining work:

- Expand the mojibake checker over additional documentation after intentional examples are excluded.
- Continue replacing older non-user-facing garbled comments/examples as cleanup.
### Passed: Syntax Check

```powershell
node --check .\telegram-flow-news-bot.mjs
```

Result:

- Passed.

### Passed: Local Codex Agent Execution

Command:

```powershell
$env:HERMES_CODEX_TIMEOUT_MS='120000'
$env:HERMES_PROGRESS_INTERVAL_MS='15000'
node .\telegram-flow-news-bot.mjs --test-generic "?꾩옱 C:\Users\amd\hermes ?대뜑?먯꽌 ?뚯씪 紐⑸줉 3媛쒕쭔 ?뺤씤?섍퀬 ?대뼡 紐낅졊???ㅽ뻾?덈뒗吏 吏㏐쾶 ?쒓뎅?대줈 ?듯빐"
```

Result:

- Backend: `codex-sdk`
- Model: `gpt-5.3-codex-spark`
- Latency: about 15.8 seconds
- Codex executed a local PowerShell command and summarized the result.

Observed command:

```powershell
Get-ChildItem -Name | Select-Object -First 3
```

Observed output:

```text
.aistudio-browser-profile
charts
node_modules
```

Interpretation:

- Hermes can delegate to Codex.
- Codex can execute local commands.
- Basic local-agent execution works.

### Passed: News Dry Run

```powershell
node .\telegram-flow-news-bot.mjs --dry-run
```

Result:

- Google News RSS fetch works.
- Script/prompt construction works.

### Passed: SQLite Helper

```powershell
python .\bot_db_helper.py init
python .\bot_db_helper.py get-recent-failures 5
```

Result:

- `bot_data.db` exists and is usable.
- Failure memory query works.

### Passed: Telegram Outbound Send

Telegram Bot API `sendMessage` was tested.

Result:

- Outbound message delivery works.

Important limitation:

- A Telegram bot token cannot impersonate a normal user and send an inbound message to itself.
- Therefore outbound send success does not prove inbound routing works.

### Worker Status

The worker was started with:

```text
node C:\Users\amd\hermes\telegram-flow-news-bot.mjs --watch
```

Last observed worker PID:

```text
6068
```

## P0 Issues

### P0-1. Inbound Test Harness Is Missing

Problem:

Hermes currently lacks a reliable local way to test the same path as a real Telegram inbound message.

Why it matters:

- Bot-token outbound tests are incomplete.
- Manual Telegram testing is slow and inconsistent.
- Routing regressions are easy to miss.

Required implementation:

```text
--simulate-message <text>
--simulate-chat-id <id>
--simulate-from-id <id>
--simulate-no-send
```

Expected behavior:

- Build a fake Telegram `update` object.
- Call `processUpdate(update)` directly.
- When `--simulate-no-send` is present, replace Telegram API calls with stdout JSON.
- Write workflow and task events to SQLite.

Verification commands:

```powershell
node .\telegram-flow-news-bot.mjs --simulate-message "?ㅻ뒛??AI ?댁뒪 3媛??붿빟?? --simulate-no-send
node .\telegram-flow-news-bot.mjs --simulate-message "?대?吏濡?蹂대궡以? --simulate-no-send
node .\telegram-flow-news-bot.mjs --simulate-message "?쒓뎅 肄붿뒪??肄붿뒪???ы빐 ?곸듅瑜?TOP 10 李얠븘遊? --simulate-no-send
node .\telegram-flow-news-bot.mjs --simulate-message "/status" --simulate-no-send
```

Acceptance criteria:

- Simulated messages exercise the same router as real Telegram updates.
- No real Telegram messages are sent in `--simulate-no-send` mode.
- Each simulation writes a task event record.

### P0-2. Strategy Gate Is Missing

Problem:

Generic Codex execution can choose a slow or poor strategy before Hermes has a chance to reject it.

Example:

For a Korean stock YTD top-gainer request, Codex chose a full yfinance scan over all KOSPI/KOSDAQ symbols. This was too slow and did not validate the strategy before execution.

Required implementation:

Before generic Codex execution, ask for a structured plan only:

```json
{
  "task_type": "market_data_scan",
  "goal": "Find top 10 YTD gainers among KOSPI/KOSDAQ",
  "tools": ["web", "python"],
  "estimated_runtime_sec": 300,
  "risk": "slow_full_scan",
  "first_action": "probe one data endpoint",
  "fallback": "return partial results from ranked pages"
}
```

Hermes should evaluate the plan before allowing execution.

Block or modify plans when:

- estimated runtime is too high,
- strategy requires full-market brute force without probing,
- tool count is excessive,
- network/API reliability is uncertain,
- no fallback is defined.

Acceptance criteria:

- High-risk plans are not executed directly.
- Hermes either constrains the plan or asks Codex for a cheaper plan.
- The user sees the selected strategy in progress messages.

### P0-3. Streaming Events Must Be Persisted

Current state:

- `runStreamed()` is used.
- `observeCodexEvent()` can observe command, tool, web search, file change, todo, and error events.

Problem:

- Much of the useful event history is still transient in `currentJob.workflow`.
- After the job ends, Telegram cannot inspect the workflow unless it was separately logged.

Required implementation:

- Persist every observed Codex event to SQLite `task_events`.
- Include:
  - `job_id`
  - `chat_id`
  - `message_id`
  - event type
  - item type
  - command/tool/query/path
  - status
  - exit code when available
  - short output tail when available

Add Telegram commands:

```text
/lastjob
/failures
```

Acceptance criteria:

- `/lastjob` returns the last job's workflow.
- `/failures` returns recent failure summaries.
- A completed job can be audited after the fact.

## P1 Issues

### P1-1. Mojibake Prevention

Problem:

Some bot-facing Korean literals in `telegram-flow-news-bot.mjs` are corrupted. This causes Telegram output like `???` or mojibake.

Required implementation:

- Move all user-facing Korean text to:

```text
C:\Users\amd\hermes\bot_messages.ko.json
```

- Load messages through a helper:

```js
msg("genericAck")
```

- Add a lint script:

```text
scripts/check-mojibake.mjs
```

The checker should fail on likely mojibake markers:

```text
???
??揶?占?
```

Acceptance criteria:

- No hard-coded mojibake strings remain in outgoing bot messages.
- CI/local verification fails if corrupted strings reappear.

### P1-2. Queue Model And Cancel Support

Problem:

Hermes currently uses a simple global `busy` flag.

This causes:

- one long job blocks all other messages,
- follow-up steering is hard,
- cancellation is not clean,
- job status is not persistent.

Required implementation:

Add SQLite job queue table:

```text
jobs
```

Fields:

```text
job_id
chat_id
message_id
request_text
task_name
status
priority
phase
workflow_json
cancel_requested
started_at
updated_at
finished_at
error
```

Add commands:

```text
/status
/cancel
/lastjob
/failures
```

Acceptance criteria:

- `/cancel` can request cancellation of the active job.
- `/status` reports active and queued jobs.
- New messages are queued instead of being dismissed blindly.

### P1-3. Watchdog Recovery Retry

Problem:

The watchdog can stop stuck execution, but recovery is not yet strong enough.

Required implementation:

When watchdog aborts:

1. summarize what Codex attempted,
2. identify the stuck command/tool,
3. record the failure,
4. generate a constrained retry prompt,
5. retry once,
6. return partial result if retry also fails.

Example retry constraint:

```text
Previous attempt was too slow because it attempted a full yfinance scan.
Do not repeat that strategy.
Probe one Naver endpoint first.
Prefer ranked pages or smaller batches.
Hard timeout: 90 seconds.
Return partial results with source notes if full coverage is unavailable.
```

Acceptance criteria:

- Watchdog failures do not simply end with "failed".
- Hermes attempts one cheaper alternative.
- The retry is explicitly constrained by the observed failure.

## P2 Issues

### P2-1. Tool Registry Is Missing

Problem:

Hermes has deterministic handlers and generic Codex execution, but no unified registry describing available tools.

Required implementation:

Create:

```text
C:\Users\amd\hermes\tools\registry.json
```

Example:

```json
{
  "news_rss": {
    "description": "Fetch and summarize recent news through Google News RSS",
    "examples": ["?ㅻ뒛??AI ?댁뒪 3媛??붿빟??]
  },
  "send_recent_images": {
    "description": "Send recently generated images to Telegram",
    "examples": ["?대?吏濡?蹂대궡以?, "李⑦듃 ?ъ쭊 蹂대궡以?]
  },
  "generic_codex": {
    "description": "General autonomous local agent execution"
  }
}
```

Use it for:

- routing,
- Codex prompt context,
- `/help`,
- strategy gate decisions.

## Future Command Candidates

The proposal mentioned `/goal` and `/schedule`.

Current decision:

- Do not document them as available commands.
- Treat them as future feature candidates.

Possible future meanings:

```text
/goal <objective>
```

Create a durable multi-step objective with queue, status, retries, and final report.

```text
/schedule <cron-like request>
```

Create recurring self-tests or scheduled tasks.

These should only be added after:

- queue table exists,
- synthetic test harness exists,
- event persistence exists,
- cancellation exists.

## Updated Implementation Order

### Phase 1: Inbound Test Harness

Implement:

```text
--simulate-message
--simulate-no-send
```

Reason:

No further confidence is possible without reproducible inbound routing tests.

### Phase 2: Event Persistence And Inspection

Implement:

```text
observeCodexEvent() -> task_events
/lastjob
/failures
```

Reason:

Hermes must remember what happened, not just say it is working.

### Phase 3: Strategy Gate

Implement:

```text
plan-only structured Codex preflight
risk evaluation
execution constraints
```

Reason:

Prevents slow/bad strategies before they waste time.

Status:

- Implemented first version.
- Added `--test-strategy <text>` verification mode.
- Generic Codex requests now pass through a strategy gate before execution.
- High-risk plans are converted into constrained prompts instead of being executed blindly.

Verified:

```powershell
node .\telegram-flow-news-bot.mjs --test-strategy "?덈뀞 ?ㅻ뒛 湲곕텇 ?대븣"
node .\telegram-flow-news-bot.mjs --test-strategy "?쒓뎅 肄붿뒪??肄붿뒪??醫낅ぉ以?2026???ы빐 媛??留롮씠 ?곸듅??10媛?醫낅ぉ 李얠븘遊?
```

Observed:

- Casual greeting is allowed without constraints.
- Korean stock YTD top-gainer request is constrained:
  - avoid full yfinance market download unless a small probe proves it is fast,
  - assume percentage gain from first 2026 trading-day close to latest close,
  - keep first attempt under 90 seconds,
  - return partial candidates with source notes instead of hanging.

### Phase 4: Queue And Cancel

Implement:

```text
jobs table
/cancel
queued jobs
status persistence
```

Reason:

The global `busy` flag is not agent-grade.

### Phase 5: Watchdog Recovery Retry

Implement:

```text
failure summary
constrained retry
partial-result fallback
```

Reason:

Stopping bad execution is not enough; Hermes must recover.

### Phase 6: Mojibake Cleanup

Implement:

```text
bot_messages.ko.json
scripts/check-mojibake.mjs
```

Reason:

Broken Korean output makes the bot feel unreliable and can break routing.

## Non-Goal

Do not solve this by adding a new one-off script for each user request.

One-off deterministic handlers are acceptable only for stable, repeated workflows, but Hermes' core must improve through:

- simulation,
- strategy gating,
- event persistence,
- queueing,
- cancellation,
- watchdog recovery.

## 2026-05-21 Runtime Hardening Update

Applied after the KRX/YTD stock-ranking runaway job.

### Confirmed Root Cause

- Hermes was not blocked because the LLM model was inherently incapable.
- The orchestration layer allowed an expensive full-market loop:
  `FinanceDataReader.StockListing('KRX')` plus per-ticker `fdr.DataReader(...)`.
- The Codex stream watchdog aborted the model turn, but the child PowerShell process remained alive and kept the queue blocked.
- Korean status text such as `멈춘거야?` was not recognized as a control/status request, so it was queued as a new generic job.

### Implemented Fixes

- Expanded Korean status routing so `멈춘거야?`, `진행중이야?`, `처리중`, `뭐해`, `돌아가`, and similar phrases answer `/status` immediately.
- Cancelled the stale runaway FinanceDataReader job and the misrouted queued status job in SQLite.
- Added startup stale-job marking so old `running` jobs are not restored as live work.
- Added restoration guard so queued `/status`/help-like control messages are cancelled instead of executed.
- Reduced default Codex overall timeout from 10 minutes to 4 minutes.
- Reduced single-tool timeout from 3 minutes to 90 seconds.
- Added a Windows runaway-process sweep for known slow full-market finance loops.
- Strengthened the strategy gate and Codex prompt:
  - no one-network-request-per-KRX-ticker loops,
  - no broad yfinance/FinanceDataReader full-market downloads without a fast probe,
  - no invented `KRX_ID`/`KRX_PW` requirement unless verified,
  - return bounded partial results with source notes instead of hanging.

### Verification

```powershell
node --check .\telegram-flow-news-bot.mjs
node .\scripts\check-mojibake.mjs
npm.cmd run check
node .\telegram-flow-news-bot.mjs --simulate-message "멈춘거야?" --simulate-no-send --simulate-timeout-ms 10000
node .\telegram-flow-news-bot.mjs --test-strategy "한국 코스피,코스닥 종목중에 2026년 올해 가장 많이 상승한 10개 종목 찾아봐"
```

Result:

- Syntax check passed.
- Mojibake source check passed.
- Watchdog retry test passed.
- `멈춘거야?` now returns current status instead of creating a generic job.
- Korean stock YTD ranking is constrained before execution and is not allowed to launch a blind full-market per-ticker loop.

## 2026-05-21 Memory Layer Update

Reason:

- Hermes was not using an MCP Memory server or any equivalent long-term retrieval layer.
- `C:\Users\amd\.openclaw\memory\main.sqlite` existed, but its memory chunk tables were empty.
- General Codex requests only received the latest message, recent failures, and short session context, so user references such as "방금", "아까", "2번 뉴스", or durable routing rules were easy to lose.

Implemented:

- Added `agent_memories` to `bot_data.db`.
- Added DB helper commands:
  - `add-memory`
  - `search-memories`
  - `get-recent-memories`
- Added Hermes runtime functions:
  - `rememberMessageIfUseful(...)`
  - `searchMemoriesFromDb(...)`
  - `getRecentMemoriesFromDb(...)`
- Generic Codex prompts now include relevant long-term Hermes memories before execution.
- User preference/rule-like messages are automatically saved when they mention durable behavior such as "앞으로", "항상", "하지마", "때만", "기억", "설정", "선호", or Hermes/Flow/Memory-related rules.
- Added `/memory` and `/memories` to inspect current saved memories from Telegram.
- Seeded durable rules for:
  - Flow/video routing only on explicit request,
  - negation blocking Flow/video generation,
  - status questions must not enter the queue,
  - Korean stock ranking must avoid full per-ticker market downloads,
  - user preference for autonomous problem solving rather than template-only answers.

Verified:

```powershell
node .\telegram-flow-news-bot.mjs --test-memory "앞으로 Flow 영상은 사용자가 영상 생성이라고 명시할 때만 실행해" --simulate-chat-id 8151113796
node .\telegram-flow-news-bot.mjs --simulate-message "/memory" --simulate-no-send --simulate-timeout-ms 10000
python .\bot_db_helper.py search-memories 8151113796 "Flow video not requested" 8
npm.cmd run check
```

Result:

- Memory save/search works.
- Relevant memories are injected into `codexPrompt`.
- `/memory` lists stored durable rules.
- Mojibake was found in the first manual seed path, removed, and replaced with ASCII-safe durable rules.

## 2026-05-21 Conversation Context Packer Update

Reason:

- Long-term memory alone is not enough. To behave like Codex/Claude-style agents, Hermes must also preserve the recent transcript and generated artifacts.
- Without this, follow-ups such as "방금 것", "아까 답변", "그 이미지 다시 보내줘", or "2번을 대본으로 바꿔" can be misrouted.

Implemented:

- Added `chat_messages` table.
- Added `artifacts` table.
- Added DB helper commands:
  - `log-message`
  - `get-recent-messages`
  - `log-artifact`
  - `get-recent-artifacts`
- Telegram inbound messages are logged after authorization.
- Telegram outbound text messages are logged through `sendMessage`.
- Sent photos/videos are logged as both assistant messages and artifacts.
- `formatChatContextForPrompt(...)` now injects:
  - relevant long-term memories,
  - recent chat transcript,
  - recent generated/sent artifacts,
  - remembered news items,
  - recent job requests.
- Added `/context` to inspect recent transcript/artifacts from Telegram.
- Tightened status routing after `기억하고 있어?` was incorrectly matched as a status question.

Verified:

```powershell
npm.cmd run check
python .\bot_db_helper.py get-recent-messages 8151113796 6
python .\bot_db_helper.py get-recent-artifacts 8151113796 5
```

Result:

- Syntax, mojibake, DB init, and watchdog retry checks passed.
- Message logging works.
- Artifact table is ready and will populate when Hermes sends images/videos.

## 2026-05-21 Completion Memory And Tool Registry Update

Reason:

- Hermes should not only remember user preferences and recent chat; it should also remember what each job attempted and how it ended.
- The agent also needs a compact registry of local scripts so it does not forget available capabilities and incorrectly say something is unsupported.

Implemented:

- Added local tool registry context to Codex prompts:
  - `aistudio-ui-image.mjs`
  - `naver-upper-limit.mjs`
  - `naver-stock-charts.mjs`
  - `send-latest-chart-images.mjs`
  - `bot_db_helper.py`
- Added `/tools` and `/capabilities` Telegram commands.
- Added `rememberJobOutcome(...)`.
- Queue execution now stores a `job_summary` or `job_failure` memory after each queued job finishes.
- Failed jobs now carry their error into the job outcome memory.

Verified:

```powershell
npm.cmd run check
node .\telegram-flow-news-bot.mjs --simulate-message "/tools" --simulate-no-send --simulate-timeout-ms 10000
node .\telegram-flow-news-bot.mjs --simulate-message "/context" --simulate-no-send --simulate-timeout-ms 10000
```

Result:

- Checks passed.
- `/tools` lists local Hermes capabilities.
- `/context` shows recent transcript.
- Job outcome memory is wired into queue completion.

## 2026-05-21 Semantic Embedding Search Update

Reason:

- Keyword-only memory search misses related prior context when the user phrases a follow-up differently.
- Hermes needs semantic-style retrieval across durable memories and older transcript messages, not just recent chronological context.

Implemented:

- Added local embedding index table:
  - `embeddings(target_type, target_id, model, dims, embedding_json, updated_at)`
- Added deterministic local vectorizer:
  - model: `local-hash-ngram-v1`
  - dims: `384`
  - features: English/Korean tokens plus character n-grams
  - no external API key required
- `add-memory`, `log-message`, and `log-artifact` now automatically write embeddings.
- `search-memories` now uses hybrid semantic cosine score + lexical score + importance.
- Added `search-messages` for semantic transcript retrieval.
- Context packer now injects `Semantic transcript matches` in addition to recent transcript.
- Added `/embeddings`, `/embed`, `/reindex` command to rebuild the index from Telegram.

Verified:

```powershell
python .\bot_db_helper.py reindex-embeddings
python .\bot_db_helper.py search-memories 8151113796 "video generation should not start for normal questions" 8
python .\bot_db_helper.py search-messages 8151113796 "previous conversation memory" 8
node .\telegram-flow-news-bot.mjs --simulate-message "/embeddings" --simulate-no-send --simulate-timeout-ms 20000
npm.cmd run check
```

Result:

- Embedding reindex completed.
- Memory search returns semantic scores.
- Transcript search returns older related messages even without exact Korean keyword overlap.
- Syntax, Python compile, mojibake, DB init, and watchdog retry checks passed.
