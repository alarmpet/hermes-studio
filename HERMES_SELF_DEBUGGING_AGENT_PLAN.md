# Hermes Self-Debugging Agent Plan

Date: 2026-05-22

Source reviewed:

- `HERMES_SELF_DEBUGGING_AGENT_COMPREHENSIVE_REVIEW.md`
- `telegram-flow-news-bot.mjs`
- `bot_db_helper.py`
- `package.json`
- existing Hermes job/message/artifact DB behavior

Note: the comprehensive review file was mojibake-corrupted in the terminal output, but its structure, tables, code references, and recommendations were still readable enough to extract the valid engineering points. Sensitive values mentioned there, such as bot tokens, are intentionally not copied into this plan.

## Executive Summary

Hermes has improved from a simple Telegram bot into a partially agentic worker with:

- queueing,
- job persistence,
- Codex/OpenRouter fallback,
- watchdog retry,
- message memory,
- artifact logging,
- semantic hash search,
- routing fixes,
- Telegram transport retry,
- and simulation tooling.

However, recent failures show the system is still structurally fragile. The main problem is not only LLM quality. The larger problem is that Hermes lacks a reliable self-debugging control loop around the LLM.

The required loop is:

```text
Observe -> Classify -> Inspect Evidence -> Reproduce -> Patch -> Verify -> Restart -> Report
```

The comprehensive review adds several important points that must be reflected in the plan:

- security cleanup is urgent,
- the monolithic `telegram-flow-news-bot.mjs` file is now a maintenance risk,
- routing must be confidence-based and regression-tested,
- `/diagnose` and `/selftest last` are P0/P1 features,
- DB access through repeated Python subprocesses is slow and fragile,
- SQLite needs WAL and busy timeout,
- worker heartbeat is missing,
- silent `.catch(() => {})` patterns hide important failures,
- recovery must produce structured failure types, not generic LLM apologies,
- and self-healing should begin with safe rule/config updates, not arbitrary source rewriting.

## Current Failure Pattern

Observed failures:

1. Long architecture request misclassified as `/status`.
2. Long architecture request containing "system flow" misclassified as Google Flow video generation.
3. Chart annotation follow-up misclassified as "send latest images".
4. "Send latest image" selected stale images from old folders.
5. Telegram `fetch failed` killed or silenced the worker.
6. Recovery explanation blamed unrelated UI problems instead of identifying the real route bug.

Root causes:

- broad regex routing,
- no structured route confidence or explanation,
- no routing regression test suite,
- no automatic diagnostic bundle,
- no route sanity check before LLM recovery,
- weak artifact prioritization,
- transport errors not isolated enough from the watch loop,
- and too much logic concentrated in one large file.

## Design Principles

### 1. Evidence First

Hermes must not say "unsupported", "no active job", "Flow failed", or "image cannot be sent" until it checks:

- worker process,
- stdout/stderr logs,
- Telegram offset,
- latest DB jobs,
- latest DB messages,
- queued jobs,
- recent task events,
- classifier output,
- recent artifacts,
- relevant scripts,
- and whether the same request can be reproduced with `--simulate-message`.

### 2. Generic Codex Is The Safe Fallback

Specialized handlers are useful only when intent is clear.

If a natural-language request is long, ambiguous, or contains architecture/planning terms, the fallback should be `generic-codex`, not Flow, status, or image resend.

### 3. Recovery Must Be Diagnostic, Not Apologetic

Current LLM recovery can produce generic, wrong explanations.

Recovery must first run deterministic triage and only then use an LLM to summarize the evidence.

### 4. Self-Healing Must Be Bounded

Hermes should not freely rewrite its own source for every failure.

Safe auto-fix scope:

- routing rule weights,
- regression test additions,
- artifact selection rules,
- config-driven thresholds,
- retry/backoff settings,
- known low-risk handler guards.

Manual approval or explicit user request should be required for:

- broad refactors,
- dependency changes,
- auth/security changes,
- destructive filesystem changes,
- trading execution logic,
- and source rewrites outside the routing/test layer.

## P0: Security Stabilization

The comprehensive review correctly identifies token/key exposure as a critical issue.

### Tasks

- Move Telegram bot token out of `telegram-flow-news-config.json`.
- Read token from `HERMES_BOT_TOKEN` first, config file second only as legacy fallback.
- Move OpenRouter key to `OPENROUTER_API_KEY`; keep file fallback only temporarily.
- Add secret-like local files to `.gitignore`.
- Add a startup warning if token/key is loaded from plaintext file.
- Add `scripts/check-secrets.mjs` to fail checks if obvious token patterns appear in tracked source/docs.
- Rotate any bot/API token that has been copied into generated review documents or shared outside the local machine.

### Files

- `.gitignore`
- `telegram-flow-news-bot.mjs`
- `scripts/check-secrets.mjs`
- `package.json`

### Success Criteria

- `npm run check` includes secret scan.
- No plan/review document contains full token strings.
- Hermes can start with only environment variables.

## P0: Routing Guardrails

### Problem

`classifyTask()` currently returns only `{ name, handler }`. It does not expose confidence, matched rules, negative rules, or why a route won.

The current chain is order-sensitive. A broad special route can hijack the request before memory or the generic agent is used.

### Target Route Object

```json
{
  "name": "generic-codex",
  "confidence": 0.92,
  "matched_rules": ["long_design_request", "contains_plan_keyword"],
  "negative_rules": ["not_explicit_google_flow", "not_status_request"],
  "reason": "Long architecture request asks for a plan; no explicit video/Flow generation command."
}
```

### Routing Policy

- Explicit slash commands win.
- Short status questions can route to `/status`.
- Explicit Google Flow/video generation can route to Flow.
- Follow-up image modification can route to chart annotation only when recent context exists.
- Image resend should prefer recent DB artifacts and should not catch "generate/create/mark/analyze" requests.
- Any low-confidence special route should fall back to `generic-codex`.

### Regression Test Cases

Create `tests/routing_cases.json` with at least 30 cases:

- Korean architecture request with "system flow" -> `generic-codex`
- Korean long planning request containing "status/regime/state" -> `generic-codex`
- "멈춘거야?" -> status
- `/status` -> status
- `/flow latest AI news shorts` -> `flow-news`
- "구글 플로우에서 영상 생성해줘" -> `flow-video`
- "시스템 플로우 설계해줘" -> `generic-codex`
- "차트로 보기좋게 표시해서 이미지 파일로 보내줘" -> `chart-annotation-followup`
- "방금 만든 이미지 보내줘" -> `send-latest-images`
- "오늘자 AI 뉴스 3개 요약해" -> `news-summary`
- "2번 뉴스를 대본으로 각색해" -> `news-followup`
- Korean stock YTD Top10 chart request -> `krx-ytd-top10-charts`

### Script

Add:

```text
scripts/check-routing-cases.mjs
```

It should run the internal classifier and compare expected route.

### Success Criteria

- `npm run check` fails on route regressions.
- Every route bug gets a new regression case before the fix is considered complete.

## P0: Failure Triage Agent

### Problem

When a handler fails, Hermes currently risks asking an LLM to explain the failure without enough evidence. This caused bad explanations such as blaming a "new project button" when the real issue was an intent misroute.

### Target Function

```javascript
async function triageFailure({ job, error }) {
  return {
    failure_type: "intent_misroute",
    confidence: 0.95,
    root_cause: "...",
    evidence: [
      "job.task_name=flow-video",
      "request contains architecture planning terms",
      "classifier after patch returns generic-codex"
    ],
    recommended_action: "...",
    can_auto_fix: true,
    verification: [
      "node --test-classify ...",
      "npm run check"
    ]
  };
}
```

### Failure Types

- `intent_misroute`
- `telegram_transport_failure`
- `worker_crash`
- `stale_artifact_selection`
- `missing_context`
- `tool_timeout`
- `data_source_failure`
- `llm_bad_answer`
- `encoding_mojibake`
- `handler_bug`
- `security_config_issue`
- `db_lock_or_ipc_failure`

### Recovery Order

1. Build diagnostic bundle.
2. Reclassify original request.
3. Compare expected route vs actual route.
4. Check Telegram transport errors.
5. Check worker/process health.
6. Check handler command exit codes and artifacts.
7. Only then ask LLM to summarize or suggest a fix.

### Success Criteria

- Recovery report cites real job id, route, workflow, and evidence.
- LLM recovery cannot invent unrelated generic advice without diagnostic context.

## P0: Diagnostic Command

Add:

```text
/diagnose
/diagnose last
/diagnose <job_id>
```

### Diagnostic Bundle

Collect:

- PID and command line for live worker,
- worker heartbeat age,
- stdout/stderr tail,
- `telegram-flow-offset.json`,
- active job,
- last 5 jobs,
- queued jobs,
- last 20 task events,
- last 10 messages,
- recent artifacts,
- current route classification for the original request,
- route mismatch status,
- current DB health,
- and whether Telegram API can send a small probe message when explicitly requested.

### Output

```text
Diagnosis
- Worker: alive PID 18000
- Last job: 177...
- Original route: flow-video
- Reclassified now: generic-codex
- Failure type: intent_misroute
- Evidence: request asks for architecture plan; no explicit Google Flow video intent
- Suggested fix: narrow Flow intent matcher
```

### Success Criteria

- User can ask "왜 답이 없어?" and Hermes can answer with evidence, not guesswork.

## P1: Self-Test Harness

Add:

```text
/selftest last
/selftest <job_id>
```

### Behavior

- Fetch original request from DB.
- Run classifier.
- Run simulated update with `--simulate-no-send`.
- Compare expected vs actual route.
- Report whether it would send messages/photos/files.
- Do not mutate live state except logging the self-test result.

### Success Criteria

- Any route bug can be reproduced without waiting for Telegram.
- Simulation is part of every bug fix.

## P1: Worker Health Guard

### Current State

Telegram `fetch failed` retry and watch-loop survival have been added, but Hermes still needs an external heartbeat signal.

### Tasks

- Write `outputs/worker-heartbeat.json` every 10 seconds:

```json
{
  "pid": 18000,
  "started_at": "...",
  "updated_at": "...",
  "current_job_id": "...",
  "queue_length": 0,
  "last_update_offset": 247633393
}
```

- `/status` should include heartbeat age.
- Add `scripts/restart-worker.ps1`.
- Add stale heartbeat detection:
  - stale over 60 seconds: warning,
  - stale over 180 seconds: restart recommended.

### Success Criteria

- User can distinguish "no response because working" from "worker dead".

## P1: SQLite Reliability

The comprehensive review correctly identifies SQLite concurrency risk.

### Tasks

Update `bot_db_helper.py connect()`:

```python
conn = sqlite3.connect(DB_PATH, timeout=10)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA busy_timeout=5000")
conn.execute("PRAGMA synchronous=NORMAL")
conn.execute("PRAGMA foreign_keys=ON")
```

Batch embedding reindex:

- Do not `fetchall()` all messages/artifacts at once.
- Process in chunks of 500 or 1000.

### Success Criteria

- DB lock failures are reduced.
- Reindex can run on large chat history without memory spike.

## P1: Replace Silent Error Swallowing

### Problem

Patterns like `.catch(() => {})` hide failures in memory logging, artifact logging, and job outcome persistence.

### Tasks

- Add:

```javascript
function logSilentError(context, error) {
  console.error(`[silent-error] ${context}: ${error.stack || error.message || error}`);
}
```

- Replace silent catches with context-rich logging.
- Persist important silent failures as task events when a current job exists.

### Success Criteria

- If memory/artifact logging fails, `/diagnose` can show it.

## P1: Artifact And Context Policy

### Rules

- "방금", "아까", "이전", "그거", "이 3개" must search recent messages and artifacts first.
- Image resend must prefer DB artifacts over filesystem scans.
- Filesystem fallback must recurse under `outputs`, then only use old `charts` as a final fallback.
- If recent context is missing, ask a specific clarification instead of sending unrelated old files.

### Success Criteria

- Stale HMNEX/BOHAE/KOREA chart resend bug cannot reappear.

## P1: Safer Self-Healing

### Safe Auto-Fix Areas

- routing rule config,
- routing test cases,
- artifact selection filters,
- retry/backoff settings,
- diagnostic report formatting,
- heartbeat thresholds.

### Unsafe Without Approval

- deleting files,
- rotating tokens,
- changing auth,
- changing trading execution,
- broad refactors,
- installing new dependencies,
- modifying large unrelated code areas.

### Required Auto-Fix Flow

```text
diagnose -> propose patch -> apply only if safe -> run checks -> restart -> report
```

### Success Criteria

- Hermes fixes small repeated route bugs without making the codebase more unstable.

## P2: Modularization

The comprehensive review is correct: one large `telegram-flow-news-bot.mjs` is now a major maintenance risk.

### Target Structure

```text
src/
  config.mjs
  telegram.mjs
  router.mjs
  routes/
    flow.mjs
    news.mjs
    stocks.mjs
    charts.mjs
    images.mjs
    control.mjs
    generic.mjs
  codex/
    sdk.mjs
    cli.mjs
    prompt.mjs
    strategy_gate.mjs
    watchdog.mjs
  db/
    client.mjs
    memory.mjs
    jobs.mjs
    artifacts.mjs
  recovery/
    diagnose.mjs
    triage.mjs
    selftest.mjs
  queue.mjs
  heartbeat.mjs
telegram-flow-news-bot.mjs
```

The root `telegram-flow-news-bot.mjs` should become a thin entrypoint under 150 lines.

### Incremental Approach

Do not big-bang refactor.

Order:

1. Extract router and routing tests.
2. Extract Telegram transport.
3. Extract control commands.
4. Extract diagnostics/recovery.
5. Extract handlers one domain at a time.
6. Extract DB client after WAL changes are stable.

### Success Criteria

- Each module has focused tests.
- Routing changes no longer risk breaking Telegram transport or handlers.

## P2: Direct Node SQLite Or Persistent DB Service

The review notes that every DB call currently spawns Python. This works, but is inefficient on Windows.

### Options

Option A: Node SQLite client

- `node:sqlite` if available and stable.
- `better-sqlite3` if native build works reliably.

Option B: persistent Python DB service

- one long-lived Python process,
- JSON-RPC over stdio or local pipe,
- avoids process startup cost while keeping current Python embedding/scoring code.

### Recommendation

Do not rush this before routing and diagnostics are stable.

Short term:

- add WAL/busy timeout,
- reduce DB calls where easy,
- batch queries.

Medium term:

- evaluate Node SQLite vs persistent Python service with a benchmark.

### Success Criteria

- `formatChatContextForPrompt()` DB overhead is measured and reduced.
- No 6-Python-process burst per normal message.

## P2: Embedding Upgrade

Current `local-hash-ngram-v1` is useful as a no-key fallback, but it is not true semantic embedding.

### Plan

- Keep hash embedding as fallback.
- Add optional better local embedding:
  - `@xenova/transformers` with a small MiniLM model, or
  - a local Python sentence-transformers path if already installed.
- Store model name in `embeddings.model`.
- Reindex in batches.

### Success Criteria

- Korean paraphrase context retrieval improves.
- Memory search helps follow-up requests without hand-coded special cases.

## P2: Rate Limits And Backoff

### Tasks

- Telegram API 429 handling:
  - read `retry_after`,
  - delay before retry,
  - avoid sending 10 photos too quickly.
- Data source rate limit classification:
  - yfinance,
  - Bithumb,
  - Naver,
  - OpenRouter,
  - Codex.

### Success Criteria

- Rate limit errors are reported as rate limits, not generic failures.

## Updated Roadmap

### Phase 0: Security And Stability

Priority: immediate

- secret migration to env vars,
- `.gitignore` updates,
- secret scan,
- SQLite WAL/busy timeout,
- transport retry already present,
- watch loop survival already present,
- worker heartbeat.

### Phase 1: Routing Reliability

Priority: P0

- structured route object,
- routing regression JSON,
- check-routing script,
- route confidence threshold,
- special-route negative guards.

### Phase 2: Diagnosis And Recovery

Priority: P0

- `/diagnose`,
- diagnostic bundle,
- triageFailure structured output,
- recovery path uses triage before LLM,
- failure memory.

### Phase 3: Self-Test

Priority: P1

- `/selftest last`,
- replay latest request,
- classify + simulate,
- route mismatch report.

### Phase 4: Context And Artifact Reliability

Priority: P1

- DB artifact first,
- recursive outputs fallback,
- context-sensitive follow-up resolver,
- no stale old chart resend.

### Phase 5: Modularization

Priority: P2

- extract router,
- extract Telegram transport,
- extract control/diagnose,
- extract handlers,
- reduce entrypoint file.

### Phase 6: Performance And Memory

Priority: P2

- Node SQLite or persistent DB service benchmark,
- batch embedding reindex,
- optional semantic embedding model,
- reduce Python fork overhead.

## Final Implementation Standard

Every Hermes bug fix must include:

1. Original failed request.
2. Actual wrong route or failure type.
3. Evidence from DB/logs.
4. Reproduction command.
5. Patch.
6. Regression test.
7. `npm run check`.
8. Worker restart.
9. User-facing report.

If any of these are missing, the fix is not complete.

## Implementation Log

### 2026-05-22 Applied

The first stabilization batch has been implemented.

Completed:

- Added `.gitignore` protections for local credential/state files.
- Added Telegram token environment variable precedence:
  - `HERMES_BOT_TOKEN`
  - `TELEGRAM_BOT_TOKEN`
- Added OpenRouter key environment variable precedence:
  - `OPENROUTER_API_KEY`
  - `HERMES_OPENROUTER_API_KEY`
- Added runtime warnings when tokens/keys are loaded from plaintext files.
- Redacted a Telegram bot token that had been copied into `HERMES_SELF_DEBUGGING_AGENT_COMPREHENSIVE_REVIEW.md`.
- Added `scripts/check-secrets.mjs`.
- Added routing regression cases in `tests/routing_cases.json`.
- Added `scripts/check-routing-cases.mjs`.
- Updated `npm run check` to include:
  - syntax check,
  - mojibake check,
  - secret scan,
  - routing regression tests,
  - DB init,
  - watchdog retry test.
- Updated `bot_db_helper.py` SQLite connection:
  - WAL mode,
  - busy timeout,
  - normal synchronous mode,
  - foreign keys on.
- Added worker heartbeat file:
  - `outputs/worker-heartbeat.json`
- Added `/diagnose` command.
- Added `/selftest last` command.
- Added regression coverage for:
  - long architecture request not routing to Flow,
  - long architecture request not routing to chart annotation,
  - long planning request not routing to status,
  - explicit Google Flow still routing to Flow,
  - status still routing to status,
  - chart annotation follow-up,
  - latest image resend,
  - AI news summary,
  - KRX YTD chart workflow.
- Fixed `--test-classify` so it reflects control command routing, not only work-task routing.
- Restarted the live Telegram worker after verification.

Verification:

```powershell
npm.cmd run check
```

Result:

- Mojibake check passed.
- Secret scan passed.
- Routing cases passed: 11/11.
- DB init passed.
- Watchdog retry test passed.
- Worker restarted.
- Heartbeat generated.

### 2026-05-22 Continued

Completed:

- Disabled plaintext credential warnings by default because this installation intentionally keeps using the existing bot token from local config.
- Kept an opt-in warning mode:
  - `HERMES_WARN_PLAINTEXT_SECRETS=true`
- Extended `/diagnose` with deterministic triage:
  - worker crash/stale heartbeat,
  - intent misroute,
  - Telegram transport failure,
  - tool timeout,
  - mojibake,
  - handler bug,
  - queue/busy state.
- `/diagnose` now reports:
  - failure type,
  - confidence,
  - likely root cause,
  - recommended action,
  - concrete evidence.
- Fixed `/selftest last` so the replay uses the same authorized chat identity in no-send simulation mode.
- Re-ran the full verification suite.
- Restarted the live Telegram worker again after verification.

Verification:

```powershell
npm.cmd run check
```

Result:

- Mojibake check passed.
- Secret scan passed.
- Routing cases passed: 11/11.
- DB init passed.
- Watchdog retry test passed.
- Worker restarted with no plaintext warning in stderr.

Known remaining work:

- Split `telegram-flow-news-bot.mjs` into routing, queue, diagnostics, Telegram transport, memory, and task-handler modules.
- Add richer `/selftest` scenarios that replay multi-turn conversations and verify artifact delivery, not just route/task selection.

### 2026-05-22 Semantic Memory Applied

Completed:

- Fixed the local semantic embedding path used by Hermes memory retrieval.
- Added Korean-aware token and n-gram features for local hash embeddings.
- Added `scripts/check-embeddings.mjs`.
- Added embedding smoke testing to `npm run check`.
- Rebuilt the existing embedding index:
  - memories: 38
  - messages: 163
  - artifacts: 57

Verification:

```powershell
node .\scripts\check-embeddings.mjs
npm.cmd run check
python .\bot_db_helper.py reindex-embeddings
```

Result:

- Semantic memory smoke test passed.
- Full check suite passed.
- Existing memory/message/artifact embeddings were rebuilt.

Known remaining work:

- Replace local hash embeddings with provider embeddings later if a paid/stable embedding API is explicitly configured.
- Extend `/selftest` to verify multi-turn memory retrieval and artifact delivery end to end.
- Split `telegram-flow-news-bot.mjs` into smaller modules so routing, diagnostics, memory, and task handlers stop interfering with each other.

### 2026-05-22 Memory Search Applied

Completed:

- Added semantic search behavior to `/memory <query>`.
- Added semantic transcript search behavior to `/context <query>`.
- Added `scripts/check-memory-context.mjs`.
- Added `scripts/check-control-commands-not-memory.mjs`.
- Updated `npm run check` so memory context injection and command-memory pollution are tested.
- Prevented slash commands such as `/memory`, `/context`, `/diagnose`, and `/selftest` from being saved as durable long-term memories.
- Removed one existing polluted `/memory ...` long-term memory row from the local DB.

Verification:

```powershell
npm.cmd run check
```

Result:

- Full check suite passed.
- Semantic memory smoke test passed.
- Long-term memory context injection test passed.
- Control-command memory pollution test passed.

### 2026-05-22 Automatic Failure Diagnosis Applied

Completed:

- Added automatic deterministic failure reports for unrecovered task failures.
- Generic Codex failures now mark the job as failed and store the error instead of looking like successful jobs.
- Failure messages now include:
  - failure type,
  - confidence,
  - likely root cause,
  - recommended next action,
  - evidence,
  - original error.
- Added `scripts/check-auto-failure-report.mjs`.
- Updated `npm run check` to verify automatic failure reporting.

Verification:

```powershell
node .\scripts\check-auto-failure-report.mjs
npm.cmd run check
```

Result:

- Auto failure report smoke test passed.
- Full check suite passed.

### 2026-05-22 Strategy Gate Enforcement Applied

Completed:

- Strengthened the generic-task strategy gate from prompt-only guidance into constrained execution mode.
- Broad/slow scans are now constrained before Codex execution:
  - maximum first-attempt tool calls: 3,
  - maximum first-attempt runtime: about 90 seconds,
  - probe-first strategy required.
- The user-facing progress message is updated when a task enters constrained mode.
- Added `scripts/check-strategy-gate.mjs`.
- Updated `npm run check` to verify that broad market scans are constrained.

Verification:

```powershell
node .\scripts\check-strategy-gate.mjs
npm.cmd run check
```

Result:

- Strategy gate smoke test passed.
- Full check suite passed.

### 2026-05-22 Workflow Visibility Applied

Completed:

- Added Korean workflow labels for Codex/tool progress phases.
- `/status`, periodic progress edits, and job listings now show friendlier workflow text instead of raw Codex event phrases where possible.
- Shell commands are summarized by likely intent:
  - financial data collection,
  - Naver Finance lookup,
  - KRX chart generation,
  - Playwright browser automation,
  - FFmpeg video generation,
  - Python/PowerShell execution.
- Added `scripts/check-workflow-labels.mjs`.
- Updated `npm run check` to verify workflow label formatting.

Verification:

```powershell
node .\scripts\check-workflow-labels.mjs
npm.cmd run check
```

Result:

- Workflow label smoke test passed.
- Full check suite passed.

### 2026-05-22 Telegram Long Message Failure Fix

Completed:

- Fixed Telegram `Bad Request: message is too long` failures by making `sendMessage` automatically split long text.
- `sendLongMessage` now uses the same splitter and returns the last Telegram result.
- `editMessage` now truncates overlong progress edits with a clear note instead of risking Telegram 400 errors.
- Fixed generic task failure state preservation:
  - if a generic handler reports failure internally, `runTaskWithRecovery` no longer overwrites it as `completed`.
  - failed reported jobs log `task_failed_reported` instead of `task_completed`.
- `/diagnose` now treats failure-like phases such as `Generic request failed; reporting error` as failures even if an older bad row still says `completed`.
- Added `scripts/check-telegram-long-message.mjs`.
- Updated `npm run check` to verify Telegram long-message splitting.

Verification:

```powershell
node .\scripts\check-telegram-long-message.mjs
npm.cmd run check
```

Result:

- Long message splitting smoke test passed.
- Full check suite passed.

### 2026-05-22 Numbered Option Context Fix

Completed:

- Fixed short numbered replies such as `1번`, `2번 새로작성`, and `3번으로...` so they resolve against the previous Hermes numbered-choice question.
- The resolved prompt now explicitly tells Codex:
  - which previous question/options were asked,
  - which option the user selected,
  - not to ask the same question again,
  - to continue the concrete implementation step.
- Standalone numeric choices are no longer hijacked as Naver chart choices by default.
- Added `scripts/check-option-choice-context.mjs`.
- Updated `npm run check` to verify numbered-option context resolution.

Verification:

```powershell
node .\telegram-flow-news-bot.mjs --test-option-choice --choice "1번"
node .\scripts\check-option-choice-context.mjs
npm.cmd run check
```

Result:

- `1번` correctly resolved to `USDT 선물(Linear) 중심` from the previous Hermes question.
- Full check suite passed.

## Key Takeaway

The comprehensive review is mostly valid. The most urgent additions to the previous plan are:

- security cleanup,
- routing regression test automation,
- `/diagnose`,
- failure triage before LLM recovery,
- SQLite WAL/busy timeout,
- heartbeat,
- and replacing silent error swallowing.

The biggest architectural warning is also valid: continuing to add features to the single large bot file will keep creating new accidental interactions. Hermes should now shift from "add more handlers" to "stabilize the agent engine."
