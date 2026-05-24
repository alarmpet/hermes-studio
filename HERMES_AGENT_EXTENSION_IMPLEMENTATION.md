# Hermes Agent Extension Implementation

Date: 2026-05-21

## Reviewed Documents

- `C:\Users\amd\.gemini\antigravity\brain\e6d3cd9f-35dc-4ee0-b0a1-4bb9d448d485\implementation_plan.md`
- `C:\Users\amd\.gemini\antigravity\brain\e6d3cd9f-35dc-4ee0-b0a1-4bb9d448d485\task.md`
- `C:\Users\amd\.gemini\antigravity\brain\e6d3cd9f-35dc-4ee0-b0a1-4bb9d448d485\walkthrough.md`

The files are partly mojibake when read from the current shell, but the actionable architecture was clear:

- Avoid native Node SQLite packages on Windows.
- Use a Python stdlib `sqlite3` helper.
- Persist session memory and task failures.
- Feed recent failures back into the Codex prompt.
- Record recovery outcomes.

## Accepted Design Decisions

1. Python SQLite helper instead of `sqlite3` or `better-sqlite3` Node packages.
   - Reason: avoids Windows native build/toolchain failures.

2. Keep JSON state as a compatibility fallback.
   - Reason: existing bot code already uses `telegram-flow-state.json`; DB should improve resilience without breaking old paths.

3. Add failure memory to Codex prompt.
   - Reason: prevents repeated answers like "image sending is unsupported" when local `sendPhoto` exists.

4. Use deterministic recovery handlers first.
   - Reason: for Telegram file/image/chart sending, hard-coded local recovery is safer than asking an LLM to invent a path.

## Implemented

### New File

- `C:\Users\amd\hermes\bot_db_helper.py`

Commands:

- `init`
- `get-session <chat_id>`
- `set-session <chat_id> <json_data>`
- `log-failure <task_name> <chat_id> <message_id> <error_msg> [recovered]`
- `get-recent-failures <limit>`
- `mark-recovered <chat_id> <message_id> [note]`
- `log-event <event_type> <task_name> <chat_id> <message_id> [json_data]`

SQLite database:

- `C:\Users\amd\hermes\bot_data.db`

Tables:

- `session_memory`
- `task_failures`
- `task_events`

### Modified File

- `C:\Users\amd\hermes\telegram-flow-news-bot.mjs`

Added:

- `runDbHelper()`
- `initDb()`
- `readSessionFromDb()`
- `writeSessionToDb()`
- `logFailureToDb()`
- `getRecentFailuresFromDb()`
- `markRecoveredInDb()`
- `logTaskEventToDb()`
- Codex prompt injection of recent failure memory
- DB-backed chat news memory, with JSON fallback
- DB-backed task event/failure logging
- recovery marking after successful local recovery

## Verification

Passed:

- `python .\bot_db_helper.py init`
- Node-to-Python DB bridge via `spawnSync`
- `node --check .\telegram-flow-news-bot.mjs`
- `node .\telegram-flow-news-bot.mjs --dry-run`
- Worker restart

Current worker:

- `telegram-flow-news-bot.mjs --watch`

## Remaining Hardening Ideas

- Replace all old mojibake Korean literals in `telegram-flow-news-bot.mjs` with Unicode-safe strings.
- Add a `sendDocument` helper for non-image files.
- Add a task queue so multiple Telegram requests do not get rejected while one job is busy.
- Add a watchdog that restarts stuck Codex/Playwright child processes.
- Add a `/memory` or `/failures` admin command to inspect recent failure memory from Telegram.
